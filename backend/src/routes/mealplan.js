/**
 * ============================================
 * Wochenplan-Routen
 * ============================================
 * Algorithmische Wochenplanung mit optionalem KI-Reasoning,
 * Rezepttausch-Vorschlägen und Drag-&-Drop-Unterstützung.
 */

import db from '../config/database.js';
import { householdWhereClause, getMealTimeCategories, getCategoryForUser } from '../config/database.js';
import { generateWeekPlan, generateReasoning, saveMealPlan, getMealPlan, getMealPlanById, getEntriesByDateRange, getSuggestions, addDays, formatDateLocal } from '../services/meal-planner.js';
import { getWeekStart, getDayOfWeek, scaleIngredient, convertToBaseUnit, normalizeUnit, unitsCompatible, comparePantryAmount } from '../utils/helpers.js';
import { broadcastToHousehold } from './household-events.js';
import { getSetting } from '../config/settings.js';
import { aiPantryDeduction, undoAIPantryDeduction } from '../services/pantry-deduction-ai.js';
import { createAIProgress } from '../utils/ai-progress.js';

/**
 * Baut einen kurzen Grund-Text für Haushalt-Vorschläge.
 */
function buildSuggestionReason(recipe) {
  const reasons = [];
  if (recipe.is_favorite) reasons.push('Favorit');
  if (recipe.avg_rating >= 4) reasons.push(`Bewertung: ${Number(recipe.avg_rating).toFixed(1)}★`);
  if (!recipe.last_cooked) {
    reasons.push('Noch nie gekocht');
  } else {
    const days = Math.floor((Date.now() - new Date(recipe.last_cooked).getTime()) / 86_400_000);
    if (days >= 30) reasons.push(`Seit ${days} Tagen nicht gekocht`);
    else if (days >= 14) reasons.push(`Seit ${days} Tagen nicht gekocht`);
  }
  if (recipe.cook_count > 0 && recipe.cook_count <= 2) {
    reasons.push(`Erst ${recipe.cook_count}× gekocht`);
  }
  if (recipe.total_time && recipe.total_time <= 30) {
    reasons.push('Unter 30 Minuten');
  }
  return reasons.slice(0, 2).join(' · ') || 'Rezeptvorschlag';
}

/**
 * Regelbasierter Vorratsabzug (Original-Logik).
 * Wird als Fallback verwendet wenn KI-Deduktion deaktiviert ist oder fehlschlägt.
 */
function fallbackPantryDeduction(entry, userId, householdId, newState) {
  const ingredients = db.prepare('SELECT * FROM ingredients WHERE recipe_id = ?').all(entry.recipe_id);
  let pantryUpdated = 0;

  for (const ing of ingredients) {
    if (ing.is_optional) continue;

    const scaledAmount = ing.amount
      ? scaleIngredient(ing.amount, entry.original_servings, entry.servings)
      : null;

    if (!scaledAmount || scaledAmount <= 0) continue;

    const pantryHhWhere = householdWhereClause(userId, householdId);
    const pantryItem = db.prepare(
      `SELECT * FROM pantry WHERE (${pantryHhWhere.clause}) AND LOWER(ingredient_name) = LOWER(?)`
    ).get(...pantryHhWhere.params, ing.name);

    if (!pantryItem) continue;
    if (pantryItem.is_permanent) continue;

    const result = comparePantryAmount(
      ing.name, scaledAmount, ing.unit, pantryItem.amount, pantryItem.unit
    );
    if (!result.compatible) continue;

    const pantryNormalized = convertToBaseUnit(pantryItem.amount, pantryItem.unit);

    if (newState === 1) {
      const newAmount = Math.max(0, pantryNormalized.amount - result.pantryBaseDeduction);
      db.prepare('UPDATE pantry SET amount = ?, unit = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(newAmount, pantryNormalized.unit, pantryItem.id);
      pantryUpdated++;
    } else {
      const newAmount = pantryNormalized.amount + result.pantryBaseDeduction;
      db.prepare('UPDATE pantry SET amount = ?, unit = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(newAmount, pantryNormalized.unit, pantryItem.id);
      pantryUpdated++;
    }
  }

  return pantryUpdated;
}

export default async function mealplanRoutes(fastify) {
  fastify.addHook('onRequest', fastify.resolveHousehold);

  // ─────────────────────────────────────────────
  // POST /generate – Plan generieren (Datumsbereiche)
  // ─────────────────────────────────────────────
  fastify.post('/generate', {
    schema: {
      description: 'Essensplan generieren (Algorithmus + optionales KI-Reasoning). Unterstützt beliebige Datumsbereiche.',
      tags: ['Wochenplan'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          personCount: { type: 'integer', minimum: 1, maximum: 20, default: 4 },
          categoryIds: {
            type: 'array',
            items: { type: 'integer' },
            description: 'IDs der Tageszeit-Kategorien für die Planung (is_meal_time=1)',
          },
          startDate: { type: 'string', format: 'date', description: 'Startdatum YYYY-MM-DD (bevorzugt)' },
          endDate: { type: 'string', format: 'date', description: 'Enddatum YYYY-MM-DD (bevorzugt)' },
          weekStart: { type: 'string', format: 'date', description: 'LEGACY: Wochenstart (Montag). Wird zu startDate/endDate konvertiert.' },
          excludeRecipeIds: { type: 'array', items: { type: 'integer' } },
          collectionIds: {
            type: 'array',
            items: { type: 'integer' },
            default: [],
            description: 'Nur Rezepte aus diesen Sammlungen berücksichtigen (leer = alle)',
          },
          deduplicateCollections: {
            type: 'boolean',
            default: true,
            description: 'Rezepte in mehreren Sammlungen nur einmal berücksichtigen',
          },
          enableAiReasoning: {
            type: 'boolean',
            default: false,
            description: 'KI-Begründung zum generierten Plan erstellen',
          },
          activeDays: {
            type: 'array',
            items: { type: 'integer', minimum: 0, maximum: 6 },
            default: [0, 1, 2, 3, 4, 5, 6],
            description: 'LEGACY: Für welche Wochentage Gerichte generiert werden (0=Mo...6=So)',
          },
          calorieTarget: {
            type: 'integer',
            minimum: 800,
            maximum: 5000,
            description: 'Kalorien-Tagesziel pro Person (kcal). Wenn gesetzt, wird die Planung kalorienoptimiert.',
          },
          calorieDistribution: {
            type: 'object',
            additionalProperties: { type: 'number', minimum: 5, maximum: 60 },
            description: 'Prozentuale Verteilung des Tagesziels auf Kategorien (Keys = category_id als String, Werte = Prozent, Summe ~100%)',
          },
          calorieStrictness: {
            type: 'string',
            enum: ['soft', 'moderate', 'strict'],
            default: 'moderate',
            description: 'Wie streng das Kalorien-Ziel verfolgt wird',
          },
          householdOnly: {
            type: 'boolean',
            default: false,
            description: 'Nur Haushalt-Rezepte verwenden (keine privaten). Erfordert aktiven Haushalt.',
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const userId = request.user.id;
      const householdId = request.householdId;

      // --- Datumsbereiche bestimmen (neu oder Legacy) ---
      let startDate, endDate;
      if (request.body?.startDate && request.body?.endDate) {
        // Neuer Modus: explizite Datumsbereiche
        startDate = request.body.startDate;
        endDate = request.body.endDate;
        // Validierung: endDate >= startDate
        if (endDate < startDate) {
          return reply.status(400).send({ error: 'Enddatum muss nach oder am Startdatum liegen.' });
        }
        // Maximale Planungsdauer: 28 Tage
        const dayCount = Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
        if (dayCount > 28) {
          return reply.status(400).send({ error: `Maximale Planungsdauer ist 28 Tage (angefragt: ${dayCount}).` });
        }
      } else {
        // Legacy-Modus: weekStart → startDate/endDate ableiten
        startDate = request.body?.weekStart || getWeekStart();
        endDate = addDays(startDate, 6);
      }

      // Tageszeit-Kategorien auflösen
      const allMealTimeCategories = getMealTimeCategories(userId, householdId);
      let categories;
      if (request.body?.categoryIds?.length) {
        // Nur die angegebenen Kategorien (Reihenfolge aus allMealTimeCategories beibehalten)
        const requestedIds = new Set(request.body.categoryIds);
        categories = allMealTimeCategories.filter(c => requestedIds.has(c.id));
        if (categories.length === 0) {
          return reply.status(400).send({ error: 'Keine gültigen Tageszeit-Kategorien gefunden' });
        }
      } else {
        // Default: alle Tageszeit-Kategorien außer die letzte (Snack-Equivalent)
        categories = allMealTimeCategories.length > 1
          ? allMealTimeCategories.slice(0, -1)
          : allMealTimeCategories;
      }

      const options = {
        ...request.body,
        startDate,
        endDate,
        householdId,
        mealCategories: categories,
      };

      // --- Overlap-Handling: bestehende Entries für den Zeitraum löschen ---
      const hhWhere = householdWhereClause(userId, householdId, 'mp');
      db.prepare(`
        DELETE FROM meal_plan_entries WHERE id IN (
          SELECT mpe.id FROM meal_plan_entries mpe
          JOIN meal_plans mp ON mpe.meal_plan_id = mp.id
          WHERE (${hhWhere.clause}) AND mpe.plan_date BETWEEN ? AND ?
        )
      `).run(...hhWhere.params, startDate, endDate);

      // Verwaiste Pläne aufräumen (Pläne ohne Entries)
      db.prepare(`
        DELETE FROM meal_plans WHERE id IN (
          SELECT mp.id FROM meal_plans mp
          LEFT JOIN meal_plan_entries mpe ON mp.id = mpe.meal_plan_id
          WHERE (${hhWhere.clause}) AND mpe.id IS NULL
        )
      `).run(...hhWhere.params);

      const planData = await generateWeekPlan(userId, options);
      const planId = saveMealPlan(userId, startDate, endDate, planData, householdId);

      // Gespeicherten Plan mit vollständigen Entries zurückgeben
      // (getMealPlan sucht per week_start = startDate, da saveMealPlan week_start = startDate setzt)
      const savedPlan = getMealPlan(userId, startDate, householdId);

      // KI-Reasoning async im Hintergrund starten (blockiert Antwort nicht)
      if (options.enableAiReasoning) {
        generateReasoning(planData.plan).then(({ reasoning, reasoningSource }) => {
          db.prepare('UPDATE meal_plans SET reasoning = ? WHERE id = ?').run(reasoning, planId);
          console.log(`📝 Reasoning für Plan ${planId} gespeichert (${reasoningSource})`);
        }).catch(err => {
          console.warn('⚠️ Hintergrund-Reasoning fehlgeschlagen:', err.message);
        });
      }

      broadcastToHousehold(householdId, 'mealplan:generated', { start_date: startDate, end_date: endDate, week_start: startDate }, userId);
      return {
        planId,
        plan: savedPlan,
        startDate,
        endDate,
        nutritionEstimatedCount: planData.nutritionEstimatedCount || 0,
        message: 'Plan erfolgreich generiert!',
      };
    } catch (error) {
      return reply.status(400).send({ error: error.message });
    }
  });

  // ─────────────────────────────────────────────
  // GET /reasoning/:planId – KI-Reasoning abrufen
  // ─────────────────────────────────────────────
  fastify.get('/reasoning/:planId', {
    schema: {
      description: 'KI-Reasoning für einen Plan abrufen (Polling)',
      tags: ['Wochenplan'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { planId: { type: 'integer' } },
        required: ['planId'],
      },
    },
  }, async (request) => {
    const hhWhere = householdWhereClause(request.user.id, request.householdId, 'mp');
    const plan = db.prepare(
      `SELECT mp.reasoning FROM meal_plans mp WHERE mp.id = ? AND (${hhWhere.clause})`
    ).get(request.params.planId, ...hhWhere.params);
    if (!plan) return { reasoning: null, status: 'not_found' };
    if (!plan.reasoning) return { reasoning: null, status: 'pending' };
    return { reasoning: plan.reasoning, status: 'ready', reasoningSource: 'ai' };
  });

  // ─────────────────────────────────────────────
  // GET / – Wochenplan abrufen (per planId, Datumsbereich oder weekStart)
  // ─────────────────────────────────────────────
  fastify.get('/', {
    schema: {
      description: 'Wochenplan abrufen per planId, Datumsbereich oder weekStart (Legacy)',
      tags: ['Wochenplan'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          planId: { type: 'integer', description: 'Plan-ID direkt laden' },
          startDate: { type: 'string', format: 'date', description: 'Startdatum (inklusiv)' },
          endDate: { type: 'string', format: 'date', description: 'Enddatum (inklusiv)' },
          weekStart: { type: 'string', format: 'date', description: 'Legacy: Wochenstart' },
        },
      },
    },
  }, async (request) => {
    const { planId, startDate, endDate, weekStart } = request.query;
    const userId = request.user.id;
    const householdId = request.householdId;

    // Modus 1: Plan per ID laden
    if (planId) {
      const plan = getMealPlanById(userId, planId, householdId);
      return { plan: plan || null };
    }

    // Modus 2: Entries per Datumsbereich laden (plan-übergreifend)
    if (startDate && endDate) {
      const result = getEntriesByDateRange(userId, startDate, endDate, householdId);
      return { entries: result.entries, plans: result.plans, startDate, endDate };
    }

    // Modus 3: Legacy per weekStart
    const ws = weekStart || getWeekStart();
    const plan = getMealPlan(userId, ws, householdId);
    return { plan: plan || null };
  });

  // ─────────────────────────────────────────────
  // GET /plans – Alle Pläne mit Metadaten (für Plan-Dropdown)
  // ─────────────────────────────────────────────
  fastify.get('/plans', {
    schema: {
      description: 'Alle Pläne mit Metadaten (id, start_date, end_date, meal_count)',
      tags: ['Wochenplan'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, async (request) => {
    const userId = request.user.id;
    const householdId = request.householdId;
    const limit = request.query.limit || 20;
    const hhWhere = householdWhereClause(userId, householdId, 'mp');

    const plans = db.prepare(`
      SELECT mp.id, mp.week_start, mp.start_date, mp.end_date, mp.is_locked, mp.created_at, mp.color,
             COUNT(DISTINCT mpe.id) as meal_count,
             MAX(CASE WHEN sl.id IS NOT NULL THEN 1 ELSE 0 END) as has_shopping_list
      FROM meal_plans mp
      LEFT JOIN meal_plan_entries mpe ON mp.id = mpe.meal_plan_id
      LEFT JOIN shopping_lists sl ON sl.meal_plan_id = mp.id
      WHERE (${hhWhere.clause})
      GROUP BY mp.id
      HAVING meal_count > 0
      ORDER BY COALESCE(mp.start_date, mp.week_start) DESC
      LIMIT ?
    `).all(...hhWhere.params, limit);

    return { plans };
  });

  // ─────────────────────────────────────────────
  // GET /history – Plan-Historie
  // ─────────────────────────────────────────────
  fastify.get('/history', {
    schema: { description: 'Wochenplan-Historie', tags: ['Wochenplan'], security: [{ bearerAuth: [] }] },
  }, async (request) => {
    const hhWhere = householdWhereClause(request.user.id, request.householdId, 'mp');
    const plans = db.prepare(`
      SELECT mp.*, COUNT(mpe.id) as meal_count
      FROM meal_plans mp
      LEFT JOIN meal_plan_entries mpe ON mp.id = mpe.meal_plan_id
      WHERE (${hhWhere.clause})
      GROUP BY mp.id
      ORDER BY COALESCE(mp.start_date, mp.week_start) DESC
      LIMIT 20
    `).all(...hhWhere.params);
    return { plans };
  });

  // ─────────────────────────────────────────────
  // GET /available-weeks – Wochen mit Plänen + Rezept-Thumbnails
  // ─────────────────────────────────────────────
  fastify.get('/available-weeks', {
    schema: { description: 'Verfügbare Wochen mit Plänen und Rezept-Vorschau', tags: ['Wochenplan'], security: [{ bearerAuth: [] }] },
  }, async (request) => {
    const hhWhere = householdWhereClause(request.user.id, request.householdId, 'mp');
    const plans = db.prepare(`
      SELECT mp.id, mp.week_start, mp.start_date, mp.end_date, mp.is_locked, mp.color, COUNT(mpe.id) as meal_count
      FROM meal_plans mp
      LEFT JOIN meal_plan_entries mpe ON mp.id = mpe.meal_plan_id
      WHERE (${hhWhere.clause})
      GROUP BY mp.id
      HAVING meal_count > 0
      ORDER BY COALESCE(mp.start_date, mp.week_start) DESC
    `).all(...hhWhere.params);

    // Alle Rezepte für diese Pläne in einem Query laden
    if (plans.length === 0) return { weeks: [] };

    const planIds = plans.map(p => p.id);
    const placeholders = planIds.map(() => '?').join(',');
    const recipes = db.prepare(`
      SELECT DISTINCT mpe.meal_plan_id, r.id as recipe_id, r.title, r.image_url
      FROM meal_plan_entries mpe
      JOIN recipes r ON mpe.recipe_id = r.id
      WHERE mpe.meal_plan_id IN (${placeholders})
    `).all(...planIds);

    // Prüfen welche Pläne bereits eine Einkaufsliste haben
    const slWhere = householdWhereClause(request.user.id, request.householdId, 'sl');
    const listsForPlans = db.prepare(`
      SELECT meal_plan_id FROM shopping_lists sl
      WHERE (${slWhere.clause}) AND meal_plan_id IN (${placeholders})
    `).all(...slWhere.params, ...planIds);
    const planIdsWithList = new Set(listsForPlans.map(l => l.meal_plan_id));

    // Rezepte pro Plan gruppieren (dedupliziert)
    const recipesByPlan = {};
    for (const r of recipes) {
      if (!recipesByPlan[r.meal_plan_id]) recipesByPlan[r.meal_plan_id] = [];
      const existing = recipesByPlan[r.meal_plan_id].find(x => x.recipe_id === r.recipe_id);
      if (!existing) {
        recipesByPlan[r.meal_plan_id].push({ recipe_id: r.recipe_id, title: r.title, image_url: r.image_url });
      }
    }

    const weeks = plans.map(p => ({
      id: p.id,
      week_start: p.week_start,
      start_date: p.start_date || p.week_start,
      end_date: p.end_date || addDays(p.week_start, 6),
      is_locked: !!p.is_locked,
      color: p.color,
      meal_count: p.meal_count,
      has_shopping_list: planIdsWithList.has(p.id),
      recipes: recipesByPlan[p.id] || [],
    }));

    return { weeks };
  });

  // ─────────────────────────────────────────────
  // POST /:planId/duplicate – Plan auf eine andere Woche kopieren
  // ─────────────────────────────────────────────
  fastify.post('/:planId/duplicate', {
    schema: {
      description: 'Wochenplan auf einen anderen Zeitraum kopieren',
      tags: ['Wochenplan'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { planId: { type: 'integer' } },
        required: ['planId'],
      },
      body: {
        type: 'object',
        required: ['targetWeekStart'],
        properties: {
          targetWeekStart: { type: 'string', format: 'date', description: 'Zielwoche (Montag als YYYY-MM-DD) oder Startdatum' },
        },
      },
    },
  }, async (request, reply) => {
    const { planId } = request.params;
    const { targetWeekStart } = request.body;
    const userId = request.user.id;
    const householdId = request.householdId;
    const hhWhere = householdWhereClause(userId, householdId, 'mp');

    // Quellplan prüfen (mit start_date/end_date laden)
    const sourcePlan = db.prepare(`SELECT mp.id, mp.start_date, mp.end_date, mp.week_start FROM meal_plans mp WHERE mp.id = ? AND (${hhWhere.clause})`).get(planId, ...hhWhere.params);
    if (!sourcePlan) return reply.status(404).send({ error: 'Quellplan nicht gefunden' });

    // Quell-Einträge laden
    const sourceEntries = db.prepare('SELECT * FROM meal_plan_entries WHERE meal_plan_id = ?').all(sourcePlan.id);

    // Tage-Offset berechnen: Differenz zwischen Quell-Startdatum und Ziel-Startdatum
    const sourceStart = sourcePlan.start_date || sourcePlan.week_start;
    const daysDiff = Math.round((new Date(targetWeekStart + 'T12:00:00') - new Date(sourceStart + 'T12:00:00')) / 86400000);
    const targetEndDate = sourcePlan.end_date ? addDays(sourcePlan.end_date, daysDiff) : addDays(targetWeekStart, 6);

    // Bestehenden Plan für die Zielwoche löschen (falls vorhanden)
    const existing = db.prepare(`SELECT mp.id FROM meal_plans mp WHERE (${hhWhere.clause}) AND mp.week_start = ?`).get(...hhWhere.params, targetWeekStart);
    if (existing) {
      db.prepare('DELETE FROM meal_plans WHERE id = ?').run(existing.id);
    }

    // Neuen Plan erstellen und Einträge kopieren
    const transaction = db.transaction(() => {
      const { lastInsertRowid } = db.prepare(
        'INSERT INTO meal_plans (user_id, week_start, start_date, end_date, household_id) VALUES (?, ?, ?, ?, ?)'
      ).run(userId, targetWeekStart, targetWeekStart, targetEndDate, householdId || null);
      const newPlanId = Number(lastInsertRowid);

      const insertEntry = db.prepare(
        'INSERT INTO meal_plan_entries (meal_plan_id, recipe_id, day_of_week, plan_date, meal_type, category_id, servings) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      for (const entry of sourceEntries) {
        // plan_date verschieben: altes Datum + daysDiff, oder aus day_of_week + targetWeekStart berechnen
        const newPlanDate = entry.plan_date
          ? addDays(entry.plan_date, daysDiff)
          : addDays(targetWeekStart, entry.day_of_week);
        insertEntry.run(newPlanId, entry.recipe_id, entry.day_of_week, newPlanDate, entry.meal_type, entry.category_id, entry.servings);
      }

      return newPlanId;
    });

    const newPlanId = transaction();
    const savedPlan = getMealPlanById(userId, newPlanId, householdId);

    return {
      message: `Plan mit ${sourceEntries.length} Einträgen auf ${targetWeekStart} kopiert!`,
      planId: newPlanId,
      plan: savedPlan,
    };
  });

  // ─────────────────────────────────────────────
  // GET /last-week-recipes – Rezepte der letzten realen Kalenderwoche
  // ─────────────────────────────────────────────
  fastify.get('/last-week-recipes', {
    schema: {
      description: 'Rezepte der letzten realen Kalenderwoche (dedupliziert)',
      tags: ['Wochenplan'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    // Letzte reale Kalenderwoche = aktuelle Woche minus 7 Tage
    const now = new Date();
    const currentWeekStart = getWeekStart();
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() - 7);
    const lastWeekStart = d.toISOString().slice(0, 10);

    const plan = getMealPlan(request.user.id, lastWeekStart, request.householdId);
    if (!plan) return { recipes: [], weekStart: lastWeekStart };

    // Deduplizierte Rezept-Liste (ein Rezept kann in mehreren Slots sein)
    const seen = new Set();
    const recipes = [];
    for (const entry of plan.entries) {
      if (seen.has(entry.recipe_id)) continue;
      seen.add(entry.recipe_id);
      recipes.push({
        id: entry.recipe_id,
        title: entry.recipe_title,
        image_url: entry.image_url,
        total_time: entry.total_time,
        difficulty: entry.difficulty,
        is_favorite: entry.is_favorite,
        calories: entry.calories,
        category_names: entry.category_names,
      });
    }

    return { recipes, weekStart: lastWeekStart };
  });

  // ─────────────────────────────────────────────
  // GET /past-week-recipes – Rezepte einer vergangenen Woche (per Offset)
  // ─────────────────────────────────────────────
  fastify.get('/past-week-recipes', {
    schema: {
      description: 'Rezepte einer vergangenen Kalenderwoche (per weekStart oder offset)',
      tags: ['Wochenplan'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          offset: { type: 'integer', minimum: 1, maximum: 52, default: 1 },
          weekStart: { type: 'string', format: 'date', description: 'Wochenstart direkt als YYYY-MM-DD (alternative zu offset)' },
        },
      },
    },
  }, async (request) => {
    let weekStart;
    let d;

    if (request.query.weekStart) {
      // Direkte Angabe des Wochenstarts (für Navigation ohne leere Wochen)
      weekStart = request.query.weekStart;
      d = new Date(weekStart + 'T00:00:00');
    } else {
      const offset = request.query.offset || 1;
      // Wochenstart berechnen: offset Wochen vor der aktuellen Woche
      const currentWeekStart = getWeekStart();
      d = new Date(currentWeekStart);
      d.setDate(d.getDate() - (offset * 7));
      weekStart = d.toISOString().slice(0, 10);
    }

    // KW berechnen (ISO 8601)
    const thursday = new Date(d);
    thursday.setDate(thursday.getDate() + 3 - ((thursday.getDay() + 6) % 7));
    const yearStart = new Date(thursday.getFullYear(), 0, 1);
    const weekNumber = Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7);

    const plan = getMealPlan(request.user.id, weekStart, request.householdId);
    if (!plan) return { recipes: [], weekStart, weekNumber, hasPlan: false };

    // Deduplizierte Rezept-Liste
    const seen = new Set();
    const recipes = [];
    for (const entry of plan.entries) {
      if (seen.has(entry.recipe_id)) continue;
      seen.add(entry.recipe_id);
      recipes.push({
        id: entry.recipe_id,
        title: entry.recipe_title,
        image_url: entry.image_url,
        total_time: entry.total_time,
        difficulty: entry.difficulty,
        is_favorite: entry.is_favorite,
        calories: entry.calories,
        category_names: entry.category_names,
      });
    }

    return { recipes, weekStart, weekNumber, hasPlan: true };
  });

  // ─────────────────────────────────────────────
  // POST /add-recipe – Rezept manuell zum Planer hinzufügen
  // ─────────────────────────────────────────────
  fastify.post('/add-recipe', {
    schema: {
      description: 'Rezept manuell zum Wochenplan hinzufügen (erstellt Plan automatisch falls nötig)',
      tags: ['Wochenplan'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['recipe_id', 'day_of_week', 'category_id', 'week_start'],
        properties: {
          recipe_id: { type: 'integer' },
          day_of_week: { type: 'integer', minimum: 0, maximum: 6 },
          category_id: { type: 'integer', description: 'Tageszeit-Kategorie (is_meal_time=1)' },
          week_start: { type: 'string', format: 'date' },
          plan_date: { type: 'string', format: 'date', description: 'Konkretes Datum (bevorzugt)' },
          servings: { type: 'integer', minimum: 1 },
          start_date: { type: 'string', format: 'date', description: 'Plan-Startdatum (optional, für 1-Tages-Pläne)' },
          end_date: { type: 'string', format: 'date', description: 'Plan-Enddatum (optional, für 1-Tages-Pläne)' },
        },
      },
    },
  }, async (request, reply) => {
    const { recipe_id, day_of_week, category_id, week_start, plan_date, servings: requestedServings, start_date, end_date } = request.body;
    const userId = request.user.id;
    const householdId = request.householdId;
    const hhWhere = householdWhereClause(userId, householdId, 'r');

    // plan_date ableiten: explizit übergeben → nutzen, sonst aus week_start + day_of_week berechnen
    const effectivePlanDate = plan_date || addDays(week_start, day_of_week);

    // Kategorie prüfen (muss is_meal_time=1 sein und dem User/Haushalt gehören)
    const mealCat = getCategoryForUser(category_id, userId, householdId, true);
    if (!mealCat) return reply.status(400).send({ error: 'Ungültige Tageszeit-Kategorie' });

    // Rezept prüfen (muss dem User/Haushalt gehören)
    const recipe = db.prepare(`SELECT r.id, r.title, r.servings FROM recipes r WHERE r.id = ? AND (${hhWhere.clause})`).get(recipe_id, ...hhWhere.params);
    if (!recipe) return reply.status(404).send({ error: 'Rezept nicht gefunden' });

    // Portionen: Explizit übergeben → nutzen, sonst Standard-Portionen des Rezepts
    const servings = requestedServings || recipe.servings || 4;

    // Plan für die Woche suchen oder erstellen
    const mpWhere = householdWhereClause(userId, householdId, 'mp');
    let plan = db.prepare(`SELECT mp.id FROM meal_plans mp WHERE (${mpWhere.clause}) AND mp.week_start = ?`).get(...mpWhere.params, week_start);
    if (!plan) {
      // Neuen Plan mit optionalen start_date/end_date erstellen
      const planStartDate = start_date || week_start;
      const planEndDate = end_date || addDays(week_start, 6);
      const { lastInsertRowid } = db.prepare(
        'INSERT INTO meal_plans (user_id, week_start, start_date, end_date, household_id) VALUES (?, ?, ?, ?, ?)'
      ).run(userId, week_start, planStartDate, planEndDate, householdId || null);
      plan = { id: Number(lastInsertRowid) };
    }

    // Prüfen ob Slot bereits belegt → ersetzen statt blockieren
    let entryId;
    let replaced = false;
    // Bevorzugt per plan_date + category_id suchen, Fallback auf day_of_week + category_id
    const existing = effectivePlanDate
      ? db.prepare(
          'SELECT id FROM meal_plan_entries WHERE meal_plan_id = ? AND plan_date = ? AND category_id = ?'
        ).get(plan.id, effectivePlanDate, category_id)
      : db.prepare(
          'SELECT id FROM meal_plan_entries WHERE meal_plan_id = ? AND day_of_week = ? AND category_id = ? AND plan_date IS NULL'
        ).get(plan.id, day_of_week, category_id);

    if (existing) {
      // Bestehendes Rezept durch neues ersetzen
      db.prepare('UPDATE meal_plan_entries SET recipe_id = ?, servings = ?, plan_date = ?, is_cooked = 0 WHERE id = ?')
        .run(recipe_id, servings, effectivePlanDate, existing.id);
      entryId = existing.id;
      replaced = true;
    } else {
      // Neuen Eintrag erstellen
      const { lastInsertRowid } = db.prepare(
        'INSERT INTO meal_plan_entries (meal_plan_id, recipe_id, day_of_week, plan_date, meal_type, category_id, servings) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(plan.id, recipe_id, day_of_week, effectivePlanDate, mealCat.name, category_id, servings);
      entryId = Number(lastInsertRowid);
    }

    const entry = db.prepare(`
      SELECT mpe.*, mcat.name as category_name, mcat.icon as category_icon, mcat.color as category_color,
        r.title as recipe_title, r.image_url, r.total_time, r.difficulty,
        r.description as recipe_description, r.is_favorite, r.ai_generated, r.times_cooked,
        r.servings as original_servings, r.calories, r.protein, r.carbs, r.fat,
        GROUP_CONCAT(DISTINCT c.name) as category_names
      FROM meal_plan_entries mpe
      JOIN categories mcat ON mpe.category_id = mcat.id
      JOIN recipes r ON mpe.recipe_id = r.id
      LEFT JOIN recipe_categories rc ON r.id = rc.recipe_id
      LEFT JOIN categories c ON rc.category_id = c.id
      WHERE mpe.id = ?
      GROUP BY mpe.id
    `).get(entryId);

    const fullPlan = getMealPlan(userId, week_start, householdId);
    broadcastToHousehold(householdId, 'mealplan:updated', { week_start }, userId);
    return {
      message: replaced ? `„${recipe.title}" ersetzt das bisherige Rezept!` : `„${recipe.title}" zum Wochenplan hinzugefügt!`,
      replaced,
      entry,
      plan: fullPlan,
    };
  });

  // ─────────────────────────────────────────────
  // GET /suggestions – Rezeptvorschläge für Slot
  // ─────────────────────────────────────────────
  fastify.get('/suggestions', {
    schema: {
      description: 'Intelligente Rezeptvorschläge für einen Slot',
      tags: ['Wochenplan'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          dayIdx: { type: 'integer', minimum: 0, maximum: 6 },
          categoryId: { type: 'integer', description: 'Tageszeit-Kategorie ID' },
          excludeRecipeIds: { type: 'string' },
          planId: { type: 'integer' },
          limit: { type: 'integer', minimum: 1, maximum: 20, default: 8 },
          search: { type: 'string', maxLength: 100 },
        },
      },
    },
  }, async (request) => {
    const { dayIdx = 0, categoryId, limit = 8, planId, search } = request.query;
    const excludeRecipeIds = request.query.excludeRecipeIds
      ? request.query.excludeRecipeIds.split(',').map(Number).filter(Boolean)
      : [];

    // Kategorie auflösen für Keyword-Matching
    let categoryName = null;
    if (categoryId) {
      const cat = getCategoryForUser(categoryId, request.user.id, request.householdId, true);
      categoryName = cat?.name || null;
    }

    const suggestions = getSuggestions(request.user.id, { dayIdx, categoryId, categoryName, excludeRecipeIds, planId, limit, search, householdId: request.householdId });
    return { suggestions };
  });

  // ─────────────────────────────────────────────
  // GET /household-suggestions – Allgemeine Haushalt-Vorschläge
  // ─────────────────────────────────────────────
  fastify.get('/household-suggestions', {
    schema: {
      description: 'Allgemeine Rezeptvorschläge für den Haushalt (Favoriten, lange nicht gekocht, etc.)',
      tags: ['Wochenplan'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 24, default: 12 },
        },
      },
    },
  }, async (request) => {
    const limit = request.query.limit || 12;
    const userId = request.user.id;
    const householdId = request.householdId;

    const rWhere = householdWhereClause(userId, householdId, 'r');
    const recipes = db.prepare(`
      SELECT r.*,
        (SELECT COUNT(*) FROM cooking_history ch WHERE ch.recipe_id = r.id) as cook_count,
        (SELECT MAX(ch.cooked_at) FROM cooking_history ch WHERE ch.recipe_id = r.id) as last_cooked,
        (SELECT AVG(ch.rating) FROM cooking_history ch WHERE ch.recipe_id = r.id AND ch.rating IS NOT NULL) as avg_rating
      FROM recipes r
      WHERE (${rWhere.clause})
      ORDER BY
        r.is_favorite DESC,
        avg_rating DESC NULLS LAST,
        r.last_cooked_at ASC NULLS FIRST,
        r.times_cooked ASC
      LIMIT ?
    `).all(...rWhere.params, limit);

    return {
      suggestions: recipes.map(r => ({
        id: r.id,
        title: r.title,
        image_url: r.image_url,
        total_time: r.total_time,
        difficulty: r.difficulty,
        is_favorite: r.is_favorite,
        calories: r.calories,
        reason: buildSuggestionReason(r),
      })),
    };
  });

  // ─────────────────────────────────────────────
  // POST /:planId/entry – Neuen Eintrag hinzufügen
  // ─────────────────────────────────────────────
  fastify.post('/:planId/entry', {
    schema: {
      description: 'Neuen Eintrag zu einem Wochenplan hinzufügen',
      tags: ['Wochenplan'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['recipe_id', 'day_of_week', 'category_id'],
        properties: {
          recipe_id: { type: 'integer' },
          day_of_week: { type: 'integer', minimum: 0, maximum: 6 },
          category_id: { type: 'integer', description: 'Tageszeit-Kategorie (is_meal_time=1)' },
          plan_date: { type: 'string', format: 'date', description: 'Konkretes Datum (bevorzugt)' },
          servings: { type: 'integer', minimum: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { recipe_id, day_of_week, category_id, plan_date, servings: requestedServings } = request.body;
    const { planId } = request.params;
    const userId = request.user.id;
    const householdId = request.householdId;
    const hhWhere = householdWhereClause(userId, householdId);

    const plan = db.prepare(`SELECT id, week_start FROM meal_plans WHERE id = ? AND (${hhWhere.clause})`).get(planId, ...hhWhere.params);
    if (!plan) return reply.status(404).send({ error: 'Plan nicht gefunden' });

    // plan_date ableiten: explizit → nutzen, sonst aus week_start + day_of_week
    const effectivePlanDate = plan_date || (plan.week_start ? addDays(plan.week_start, day_of_week) : null);

    // Kategorie prüfen
    const mealCat = getCategoryForUser(category_id, userId, householdId, true);
    if (!mealCat) return reply.status(400).send({ error: 'Ungültige Tageszeit-Kategorie' });

    // Rezept-Ownership prüfen
    const recipe = db.prepare(`SELECT id, servings FROM recipes WHERE id = ? AND (${hhWhere.clause})`).get(recipe_id, ...hhWhere.params);
    if (!recipe) return reply.status(404).send({ error: 'Rezept nicht gefunden' });

    // Portionen: Explizit übergeben → nutzen, sonst Standard-Portionen des Rezepts
    const servings = requestedServings || recipe.servings || 4;

    // Prüfen ob Slot schon belegt ist
    const existing = effectivePlanDate
      ? db.prepare(
          'SELECT id FROM meal_plan_entries WHERE meal_plan_id = ? AND plan_date = ? AND category_id = ? '
        ).get(planId, effectivePlanDate, category_id)
      : db.prepare(
          'SELECT id FROM meal_plan_entries WHERE meal_plan_id = ? AND day_of_week = ? AND category_id = ?'
        ).get(planId, day_of_week, category_id);
    if (existing) return reply.status(409).send({ error: 'Dieser Slot ist bereits belegt' });

    const { lastInsertRowid } = db.prepare(
      'INSERT INTO meal_plan_entries (meal_plan_id, recipe_id, day_of_week, plan_date, meal_type, category_id, servings) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(planId, recipe_id, day_of_week, effectivePlanDate, mealCat.name, category_id, servings);

    const entry = db.prepare(`
      SELECT mpe.*, mcat.name as category_name, mcat.icon as category_icon, mcat.color as category_color,
        r.title as recipe_title, r.image_url, r.total_time, r.difficulty,
        r.description as recipe_description, r.is_favorite, r.ai_generated, r.times_cooked,
        r.servings as original_servings, r.calories, r.protein, r.carbs, r.fat,
        GROUP_CONCAT(DISTINCT c.name) as category_names
      FROM meal_plan_entries mpe
      JOIN categories mcat ON mpe.category_id = mcat.id
      JOIN recipes r ON mpe.recipe_id = r.id
      LEFT JOIN recipe_categories rc ON r.id = rc.recipe_id
      LEFT JOIN categories c ON rc.category_id = c.id
      WHERE mpe.id = ?
      GROUP BY mpe.id
    `).get(lastInsertRowid);

    broadcastToHousehold(householdId, 'mealplan:updated', {}, userId);
    return { message: 'Eintrag hinzugefügt!', entry };
  });

  // ─────────────────────────────────────────────
  // PUT /:planId/entry/:entryId – Eintrag ändern
  // ─────────────────────────────────────────────
  fastify.put('/:planId/entry/:entryId', {
    schema: {
      description: 'Wochenplan-Eintrag ändern (Rezept tauschen, Slot ändern)',
      tags: ['Wochenplan'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          recipe_id: { type: 'integer' },
          day_of_week: { type: 'integer', minimum: 0, maximum: 6 },
          category_id: { type: 'integer', description: 'Tageszeit-Kategorie (is_meal_time=1)' },
          plan_date: { type: 'string', format: 'date', description: 'Konkretes Datum' },
          servings: { type: 'integer', minimum: 1, maximum: 100 },
        },
      },
    },
  }, async (request, reply) => {
    const { recipe_id, servings, day_of_week, category_id, plan_date } = request.body;
    const userId = request.user.id;
    const hhWhere = householdWhereClause(userId, request.householdId);

    // Kategorie prüfen, falls geändert
    let catName = null;
    if (category_id) {
      const mealCat = getCategoryForUser(category_id, userId, request.householdId, true);
      if (!mealCat) return reply.status(400).send({ error: 'Ungültige Tageszeit-Kategorie' });
      catName = mealCat.name;
    }

    // Rezept-Ownership prüfen, falls recipe_id geändert wird
    if (recipe_id) {
      const recipe = db.prepare(`SELECT id FROM recipes WHERE id = ? AND (${hhWhere.clause})`).get(recipe_id, ...hhWhere.params);
      if (!recipe) return reply.status(404).send({ error: 'Rezept nicht gefunden' });
    }

    const result = db.prepare(`
      UPDATE meal_plan_entries
      SET recipe_id = COALESCE(?, recipe_id),
          servings = COALESCE(?, servings),
          day_of_week = COALESCE(?, day_of_week),
          category_id = COALESCE(?, category_id),
          meal_type = COALESCE(?, meal_type),
          plan_date = COALESCE(?, plan_date)
      WHERE id = ? AND meal_plan_id IN (SELECT id FROM meal_plans WHERE (${hhWhere.clause}))
    `).run(recipe_id, servings, day_of_week, category_id, catName, plan_date, request.params.entryId, ...hhWhere.params);

    if (result.changes === 0) return reply.status(404).send({ error: 'Eintrag nicht gefunden' });

    const entry = db.prepare(`
      SELECT mpe.*, mcat.name as category_name, mcat.icon as category_icon, mcat.color as category_color,
        r.title as recipe_title, r.image_url, r.total_time, r.difficulty,
        r.description as recipe_description, r.is_favorite, r.ai_generated, r.times_cooked,
        r.servings as original_servings, r.calories, r.protein, r.carbs, r.fat,
        GROUP_CONCAT(DISTINCT c.name) as category_names
      FROM meal_plan_entries mpe
      JOIN categories mcat ON mpe.category_id = mcat.id
      JOIN recipes r ON mpe.recipe_id = r.id
      LEFT JOIN recipe_categories rc ON r.id = rc.recipe_id
      LEFT JOIN categories c ON rc.category_id = c.id
      WHERE mpe.id = ?
      GROUP BY mpe.id
    `).get(request.params.entryId);

    broadcastToHousehold(request.householdId, 'mealplan:updated', {}, userId);
    return { message: 'Eintrag aktualisiert!', entry };
  });

  // ─────────────────────────────────────────────
  // POST /:planId/entry/:entryId/move – Drag&Drop
  // ─────────────────────────────────────────────
  fastify.post('/:planId/entry/:entryId/move', {
    schema: {
      description: 'Eintrag in anderen Slot verschieben (Drag & Drop)',
      tags: ['Wochenplan'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['day_of_week', 'category_id'],
        properties: {
          day_of_week: { type: 'integer', minimum: 0, maximum: 6 },
          category_id: { type: 'integer', description: 'Ziel-Tageszeit-Kategorie' },
          plan_date: { type: 'string', format: 'date', description: 'Ziel-Datum' },
        },
      },
    },
  }, async (request, reply) => {
    const { day_of_week, category_id, plan_date } = request.body;
    const { planId, entryId } = request.params;
    const userId = request.user.id;
    const hhWhere = householdWhereClause(userId, request.householdId);

    const plan = db.prepare(`SELECT id FROM meal_plans WHERE id = ? AND (${hhWhere.clause})`).get(planId, ...hhWhere.params);
    if (!plan) return reply.status(404).send({ error: 'Plan nicht gefunden' });

    // Kategorie prüfen
    const mealCat = getCategoryForUser(category_id, userId, request.householdId, true);
    if (!mealCat) return reply.status(400).send({ error: 'Ungültige Tageszeit-Kategorie' });

    // Prüfen ob Zielslot bereits belegt → tauschen
    const existingTarget = plan_date
      ? db.prepare(
          'SELECT id FROM meal_plan_entries WHERE meal_plan_id = ? AND plan_date = ? AND category_id = ? AND id != ?'
        ).get(planId, plan_date, category_id, entryId)
      : db.prepare(
          'SELECT id FROM meal_plan_entries WHERE meal_plan_id = ? AND day_of_week = ? AND category_id = ? AND id != ?'
        ).get(planId, day_of_week, category_id, entryId);

    if (existingTarget) {
      const source = db.prepare('SELECT day_of_week, category_id, plan_date FROM meal_plan_entries WHERE id = ? AND meal_plan_id = ?').get(entryId, planId);
      if (!source) return reply.status(404).send({ error: 'Eintrag nicht gefunden' });
      db.prepare('UPDATE meal_plan_entries SET day_of_week = ?, category_id = ?, plan_date = ? WHERE id = ? AND meal_plan_id = ?')
        .run(source.day_of_week, source.category_id, source.plan_date, existingTarget.id, planId);
    }

    const moveResult = db.prepare('UPDATE meal_plan_entries SET day_of_week = ?, category_id = ?, meal_type = ?, plan_date = COALESCE(?, plan_date) WHERE id = ? AND meal_plan_id = ?')
      .run(day_of_week, category_id, mealCat.name, plan_date, entryId, planId);
    if (moveResult.changes === 0) return reply.status(404).send({ error: 'Eintrag nicht gefunden' });

    const updatedPlan = getMealPlanById(userId, Number(planId), request.householdId);
    const weekStart = updatedPlan?.week_start;
    broadcastToHousehold(request.householdId, 'mealplan:updated', { week_start: weekStart }, userId);
    return { message: 'Eintrag verschoben!', plan: updatedPlan };
  });

  // ─────────────────────────────────────────────
  // POST /:planId/entry/:entryId/cooked – Toggle (idempotent für Offline-Sync)
  // ─────────────────────────────────────────────
  fastify.post('/:planId/entry/:entryId/cooked', {
    schema: {
      description: 'Gekocht-Status togglen + Vorräte anpassen (idempotent)',
      tags: ['Wochenplan'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const userId = request.user.id;
    const hhWhere = householdWhereClause(userId, request.householdId, 'mp');
    const entry = db.prepare(`
      SELECT mpe.*, mp.week_start, mp.start_date, mp.end_date, r.servings as original_servings FROM meal_plan_entries mpe
      JOIN meal_plans mp ON mpe.meal_plan_id = mp.id
      JOIN recipes r ON mpe.recipe_id = r.id
      WHERE mpe.id = ? AND (${hhWhere.clause})
    `).get(request.params.entryId, ...hhWhere.params);

    if (!entry) return { error: 'Eintrag nicht gefunden' };

    // Idempotenter Modus: expliziter Zielwert, oder Legacy-Toggle
    const body = request.body || {};
    const requestedState = typeof body.is_cooked === 'number' ? body.is_cooked : undefined;
    const newState = requestedState !== undefined ? requestedState : (entry.is_cooked ? 0 : 1);

    // Idempotenz-Prüfung: Wenn Status bereits dem Zielwert entspricht, nichts tun
    if (entry.is_cooked === newState) {
      return { is_cooked: newState, idempotent: true };
    }

    // ── Tausch-Logik: Rezept von anderem Tag auf heute verschieben ──
    let swapped = false;
    if (newState === 1) {
      const now = new Date();
      const todayDate = formatDateLocal(now);

      // Nur tauschen wenn der Eintrag nicht schon heute ist
      // UND heute innerhalb des Plan-Zeitraums liegt
      if (entry.plan_date !== todayDate && entry.start_date <= todayDate && entry.end_date >= todayDate) {
        const todayDayOfWeek = getDayOfWeek(todayDate);

        // Prüfen ob heute im gleichen Slot (category_id) ein Rezept liegt
        const todayEntry = db.prepare(
          'SELECT id, day_of_week, plan_date FROM meal_plan_entries WHERE meal_plan_id = ? AND plan_date = ? AND category_id = ? AND id != ?'
        ).get(entry.meal_plan_id, todayDate, entry.category_id, entry.id);

        if (entry.plan_date < todayDate) {
          // Eintrag war in der Vergangenheit → auf heute holen
          let canSwap = true;
          if (todayEntry) {
            // Heute ist belegt → suche naechsten freien zukuenftigen Tag im selben Plan/Slot
            const occupiedDates = db.prepare(
              'SELECT plan_date FROM meal_plan_entries WHERE meal_plan_id = ? AND category_id = ? AND plan_date > ?'
            ).all(entry.meal_plan_id, entry.category_id, todayDate).map(r => r.plan_date);

            let freeDate = null;
            let checkDate = new Date(todayDate + 'T12:00:00');
            checkDate.setDate(checkDate.getDate() + 1);
            while (freeDate === null && formatDateLocal(checkDate) <= entry.end_date) {
              const checkDateStr = formatDateLocal(checkDate);
              if (!occupiedDates.includes(checkDateStr)) {
                freeDate = checkDateStr;
              } else {
                checkDate.setDate(checkDate.getDate() + 1);
              }
            }

            if (freeDate) {
              // Heutigen Eintrag auf freien Tag verschieben
              const freeDayOfWeek = getDayOfWeek(freeDate);
              db.prepare('UPDATE meal_plan_entries SET day_of_week = ?, plan_date = ? WHERE id = ?')
                .run(freeDayOfWeek, freeDate, todayEntry.id);
            } else {
              // Kein freier Tag gefunden → kein Swap (Option C)
              canSwap = false;
            }
          }

          if (canSwap) {
            // Markierten Eintrag auf heute verschieben
            db.prepare('UPDATE meal_plan_entries SET day_of_week = ?, plan_date = ? WHERE id = ?')
              .run(todayDayOfWeek, todayDate, entry.id);
            swapped = true;
          }
        } else {
          // Eintrag ist in der Zukunft → direkter Swap mit heutigem Eintrag
          if (todayEntry) {
            const entryDayOfWeek = getDayOfWeek(entry.plan_date);
            // Heutigen Eintrag auf den urspruenglichen Tag verschieben
            db.prepare('UPDATE meal_plan_entries SET day_of_week = ?, plan_date = ? WHERE id = ?')
              .run(entryDayOfWeek, entry.plan_date, todayEntry.id);
          }
          // Markierten Eintrag auf heute verschieben
          db.prepare('UPDATE meal_plan_entries SET day_of_week = ?, plan_date = ? WHERE id = ?')
            .run(todayDayOfWeek, todayDate, entry.id);
          swapped = true;
        }
      }
    }

    db.prepare('UPDATE meal_plan_entries SET is_cooked = ? WHERE id = ?').run(newState, entry.id);

    // Kochhistorie + Rezept-Statistiken
    if (newState === 1) {
      db.prepare('INSERT INTO cooking_history (user_id, recipe_id, servings) VALUES (?, ?, ?)').run(
        userId, entry.recipe_id, entry.servings
      );
      db.prepare('UPDATE recipes SET times_cooked = times_cooked + 1, last_cooked_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(entry.recipe_id);
    }

    // ── Vorräte anpassen ──
    const useAIDeduction = getSetting('ai_pantry_deduction', 'false') === 'true';
    let pantryUpdated = 0;
    let aiDeductionResult = null;

    if (useAIDeduction) {
      // ── KI-gestützter Vorratsabzug ──
      if (newState === 1) {
        // Rezepttitel laden
        const recipe = db.prepare('SELECT title FROM recipes WHERE id = ?').get(entry.recipe_id);
        const progress = createAIProgress(request.householdId, userId, 'pantry-deduction', 'Vorräte abziehen', [
          'Rezeptdaten laden',
          'KI-Berechnung',
          'Vorräte aktualisieren',
        ]);
        progress.start();
        try {
          aiDeductionResult = await aiPantryDeduction({
            userId,
            householdId: request.householdId,
            entryId: entry.id,
            recipeId: entry.recipe_id,
            recipeTitle: recipe?.title || 'Unbekanntes Rezept',
            originalServings: entry.original_servings,
            plannedServings: entry.servings,
          }, progress);
          pantryUpdated = aiDeductionResult.deductions.length;
          progress.complete();
          if (aiDeductionResult.errors.length > 0) {
            console.warn('⚠️ AI Pantry-Deduction Warnungen:', aiDeductionResult.errors);
          }
        } catch (err) {
          progress.error(err.message);
          console.error('❌ AI Pantry-Deduction Fehler, Fallback auf regelbasiert:', err.message);
          // Fallback auf regelbasierte Deduktion
          pantryUpdated = fallbackPantryDeduction(entry, userId, request.householdId, 1);
        }
      } else {
        // Rückgängig: Gespeicherte AI-Deduktionen rückgängig machen
        const undoResult = undoAIPantryDeduction(entry.id);
        pantryUpdated = undoResult.restored;
        if (undoResult.errors.length > 0) {
          console.warn('⚠️ AI Pantry-Undo Warnungen:', undoResult.errors);
        }
      }
    } else {
      // ── Regelbasierter Vorratsabzug (Original-Logik) ──
      pantryUpdated = fallbackPantryDeduction(entry, userId, request.householdId, newState);
    }

    // Bei Tausch: kompletten Plan zurückgeben, damit Frontend Positionen aktualisieren kann
    if (swapped) {
      const updatedPlan = getMealPlanById(userId, entry.meal_plan_id, request.householdId);
      return {
        message: 'Als gekocht markiert und auf heute verschoben!',
        is_cooked: newState,
        pantryUpdated,
        aiDeduction: aiDeductionResult ? {
          deductions: aiDeductionResult.deductions,
          errors: aiDeductionResult.errors,
        } : undefined,
        swapped: true,
        plan: updatedPlan,
      };
    }

    return {
      message: newState ? 'Als gekocht markiert!' : 'Markierung entfernt',
      is_cooked: newState,
      pantryUpdated,
      aiDeduction: aiDeductionResult ? {
        deductions: aiDeductionResult.deductions,
        errors: aiDeductionResult.errors,
      } : undefined,
      swapped: false,
    };
  });

  // ─────────────────────────────────────────────
  // POST /:planId/lock – Woche fixieren/freigeben
  // ─────────────────────────────────────────────
  fastify.post('/:planId/lock', {
    schema: {
      description: 'Wochenplan fixieren oder Fixierung aufheben',
      tags: ['Wochenplan'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { planId } = request.params;
    const userId = request.user.id;
    const hhWhere = householdWhereClause(userId, request.householdId);

    const plan = db.prepare(`SELECT id, is_locked FROM meal_plans WHERE id = ? AND (${hhWhere.clause})`).get(planId, ...hhWhere.params);
    if (!plan) return reply.status(404).send({ error: 'Plan nicht gefunden' });

    const newState = plan.is_locked ? 0 : 1;
    db.prepare('UPDATE meal_plans SET is_locked = ? WHERE id = ?').run(newState, planId);

    return {
      message: newState ? 'Wochenplan fixiert 🔒' : 'Fixierung aufgehoben 🔓',
      is_locked: newState,
    };
  });

  // ─────────────────────────────────────────────
  // PUT /:id – Plan bearbeiten (Start-/End-Datum)
  // ─────────────────────────────────────────────
  fastify.put('/:id', {
    schema: {
      description: 'Wochenplan bearbeiten (Start-/End-Datum)',
      tags: ['Wochenplan'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          startDate: { type: 'string', format: 'date', description: 'Startdatum YYYY-MM-DD' },
          endDate: { type: 'string', format: 'date', description: 'Enddatum YYYY-MM-DD' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { startDate, endDate } = request.body;
    const userId = request.user.id;
    const hhWhere = householdWhereClause(userId, request.householdId);

    const plan = db.prepare(`SELECT id, is_locked FROM meal_plans WHERE id = ? AND (${hhWhere.clause})`).get(id, ...hhWhere.params);
    if (!plan) return reply.status(404).send({ error: 'Plan nicht gefunden' });
    if (plan.is_locked) return reply.status(409).send({ error: 'Fixierter Wochenplan kann nicht bearbeitet werden. Bitte zuerst die Fixierung aufheben.' });

    if (!startDate || !endDate) {
      return reply.status(400).send({ error: 'Start- und End-Datum sind erforderlich' });
    }
    if (endDate < startDate) {
      return reply.status(400).send({ error: 'End-Datum muss nach dem Start-Datum liegen' });
    }

    db.prepare('UPDATE meal_plans SET start_date = ?, end_date = ? WHERE id = ?').run(startDate, endDate, id);
    broadcastToHousehold(request.householdId, 'mealplan:updated', {}, request.user.id);

    return { message: 'Plan aktualisiert', start_date: startDate, end_date: endDate };
  });

  // ─────────────────────────────────────────────
  // DELETE /:planId/entry/:entryId – Einzeleintrag
  // ─────────────────────────────────────────────
  fastify.delete('/:planId/entry/:entryId', {
    schema: { description: 'Einzelnen Eintrag entfernen', tags: ['Wochenplan'], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const hhWhere = householdWhereClause(request.user.id, request.householdId);
    const result = db.prepare(`
      DELETE FROM meal_plan_entries
      WHERE id = ? AND meal_plan_id IN (SELECT id FROM meal_plans WHERE id = ? AND (${hhWhere.clause}))
    `).run(request.params.entryId, request.params.planId, ...hhWhere.params);
    if (result.changes === 0) return reply.status(404).send({ error: 'Eintrag nicht gefunden' });
    broadcastToHousehold(request.householdId, 'mealplan:updated', {}, request.user.id);
    return { message: 'Eintrag entfernt' };
  });

  // ─────────────────────────────────────────────
  // DELETE /:id – Gesamten Plan löschen
  // ─────────────────────────────────────────────
  fastify.delete('/:id', {
    schema: { description: 'Wochenplan löschen', tags: ['Wochenplan'], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const hhWhere = householdWhereClause(request.user.id, request.householdId);
    const plan = db.prepare(`SELECT id, is_locked FROM meal_plans WHERE id = ? AND (${hhWhere.clause})`).get(request.params.id, ...hhWhere.params);
    if (!plan) return reply.status(404).send({ error: 'Plan nicht gefunden' });
    if (plan.is_locked) return reply.status(409).send({ error: 'Fixierter Wochenplan kann nicht gelöscht werden. Bitte zuerst die Fixierung aufheben.' });
    db.prepare('DELETE FROM meal_plans WHERE id = ?').run(plan.id);
    broadcastToHousehold(request.householdId, 'mealplan:updated', {}, request.user.id);
    return { message: 'Wochenplan gelöscht' };
  });

  // ─────────────────────────────────────────────
  // GET /export – Wochenpläne exportieren
  // ─────────────────────────────────────────────
  fastify.get('/export', {
    schema: {
      description: 'Eigene Wochenpläne als JSON exportieren',
      tags: ['Wochenplan'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const userId = request.user.id;
    const hhWhere = householdWhereClause(userId, request.householdId, 'mp');

    const plans = db.prepare(`
      SELECT mp.*, u.username as owner
      FROM meal_plans mp
      JOIN users u ON mp.user_id = u.id
      WHERE (${hhWhere.clause})
      ORDER BY mp.week_start DESC
    `).all(...hhWhere.params);

    const entries = db.prepare(`
      SELECT mpe.*, r.title as recipe_title, mcat.name as category_name
      FROM meal_plan_entries mpe
      JOIN meal_plans mp ON mpe.meal_plan_id = mp.id
      LEFT JOIN recipes r ON mpe.recipe_id = r.id
      LEFT JOIN categories mcat ON mpe.category_id = mcat.id
      WHERE (${hhWhere.clause})
      ORDER BY mpe.meal_plan_id, mpe.day_of_week, mcat.sort_order
    `).all(...hhWhere.params);

    // Entries den Plans zuordnen
    const plansWithEntries = plans.map(plan => ({
      week_start: plan.week_start,
      start_date: plan.start_date || null,
      end_date: plan.end_date || null,
      created_at: plan.created_at,
      owner: plan.owner,
      entries: entries
        .filter(e => e.meal_plan_id === plan.id)
        .map(e => ({
          recipe_title: e.recipe_title,
          recipe_id: e.recipe_id,
          day_of_week: e.day_of_week,
          plan_date: e.plan_date || null,
          meal_type: e.meal_type,
          category_name: e.category_name,
          servings: e.servings,
          is_cooked: e.is_cooked,
        })),
    }));

    const exportData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      source: 'Zauberjournal',
      type: 'meal_plans',
      plan_count: plansWithEntries.length,
      plans: plansWithEntries,
    };

    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="wochenplaene-export-${new Date().toISOString().split('T')[0]}.json"`);
    return exportData;
  });

  // ─────────────────────────────────────────────
  // POST /import – Wochenpläne importieren
  // ─────────────────────────────────────────────
  fastify.post('/import', {
    schema: {
      description: 'Wochenpläne aus JSON importieren',
      tags: ['Wochenplan'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const userId = request.user.id;
    let importData;

    const contentType = request.headers['content-type'] || '';
    if (contentType.includes('multipart')) {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          const buffer = await part.toBuffer();
          try {
            importData = JSON.parse(buffer.toString('utf-8'));
          } catch {
            return reply.status(400).send({ error: 'Ungültiges JSON-Format.' });
          }
        }
      }
    } else {
      importData = request.body;
    }

    if (!importData?.plans || !Array.isArray(importData.plans)) {
      return reply.status(400).send({ error: 'Ungültiges Export-Format. Erwartet: { plans: [...] }' });
    }

    if (importData.plans.length === 0) {
      return reply.status(400).send({ error: 'Keine Wochenpläne zum Importieren gefunden.' });
    }

    if (importData.plans.length > 200) {
      return reply.status(400).send({ error: 'Maximal 200 Pläne pro Import erlaubt.' });
    }

    let imported = 0;
    let skipped = 0;
    let entriesImported = 0;
    let entriesSkipped = 0;

    const householdId = request.householdId;
    const hhWhere = householdWhereClause(userId, householdId);

    const insertPlan = db.prepare(
      'INSERT INTO meal_plans (user_id, week_start, start_date, end_date, household_id) VALUES (?, ?, ?, ?, ?)'
    );
    const insertEntry = db.prepare(
      'INSERT INTO meal_plan_entries (meal_plan_id, recipe_id, day_of_week, plan_date, meal_type, category_id, servings, is_cooked) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const findRecipe = db.prepare(
      `SELECT id FROM recipes WHERE (${hhWhere.clause}) AND LOWER(title) = LOWER(?)`
    );
    const findRecipeById = db.prepare(
      `SELECT id FROM recipes WHERE (${hhWhere.clause}) AND id = ?`
    );
    const existingPlan = db.prepare(
      `SELECT id FROM meal_plans WHERE (${hhWhere.clause}) AND week_start = ?`
    );

    // Tageszeit-Kategorien des Users laden für Mapping
    const userMealCategories = getMealTimeCategories(userId, householdId);
    // Mapping: alte meal_type-Strings → category_id
    const MEAL_TYPE_TO_NAME = {
      fruehstueck: 'Frühstück', breakfast: 'Frühstück',
      mittag: 'Mittagessen', lunch: 'Mittagessen',
      abendessen: 'Abendessen', dinner: 'Abendessen',
      snack: 'Snack',
    };

    function resolveCategoryId(entry) {
      // 1. Direkte category_name aus Export
      if (entry.category_name) {
        const cat = userMealCategories.find(c => c.name.toLowerCase() === entry.category_name.toLowerCase());
        if (cat) return cat;
      }
      // 2. Alte meal_type-Strings → Kategorie-Name
      if (entry.meal_type) {
        const name = MEAL_TYPE_TO_NAME[entry.meal_type];
        if (name) {
          const cat = userMealCategories.find(c => c.name.toLowerCase() === name.toLowerCase());
          if (cat) return cat;
        }
      }
      // 3. Fallback: erste Tageszeit-Kategorie (oder Mittagessen-equivalent)
      return userMealCategories.find(c => c.name.toLowerCase().includes('mittag'))
        || userMealCategories[0]
        || null;
    }

    const transaction = db.transaction(() => {
      for (const plan of importData.plans) {
        if (!plan.week_start || !/^\d{4}-\d{2}-\d{2}$/.test(plan.week_start)) { skipped++; continue; }

        // Prüfen ob Plan für diese Woche bereits existiert
        const existing = existingPlan.get(...hhWhere.params, plan.week_start);
        if (existing) { skipped++; continue; }

        // start_date/end_date validieren (optionale Felder aus neuem Export-Format)
        const startDate = plan.start_date && /^\d{4}-\d{2}-\d{2}$/.test(plan.start_date) ? plan.start_date : null;
        const endDate = plan.end_date && /^\d{4}-\d{2}-\d{2}$/.test(plan.end_date) ? plan.end_date : null;

        const { lastInsertRowid } = insertPlan.run(userId, plan.week_start, startDate, endDate, householdId || null);
        const planId = Number(lastInsertRowid);
        imported++;

        if (plan.entries?.length) {
          const entries = plan.entries.slice(0, 50); // Max 50 Einträge pro Plan
          for (const entry of entries) {
            // Rezept per Titel finden (bevorzugt, da ID aus fremdem System stammt)
            let recipeId = null;
            if (entry.recipe_title) {
              const recipe = findRecipe.get(...hhWhere.params, entry.recipe_title);
              if (recipe) recipeId = recipe.id;
            }
            // Fallback: recipe_id aus Export verwenden, aber nur wenn sie in der DB existiert
            if (!recipeId && entry.recipe_id) {
              const recipe = findRecipeById.get(...hhWhere.params, entry.recipe_id);
              if (recipe) recipeId = recipe.id;
            }
            if (!recipeId) { entriesSkipped++; continue; }

            const dayOfWeek = Math.min(Math.max(parseInt(entry.day_of_week) || 0, 0), 6);
            const servings = Math.min(Math.max(parseInt(entry.servings) || 2, 1), 100);
            // plan_date aus neuem Export-Format (optional)
            const planDate = entry.plan_date && /^\d{4}-\d{2}-\d{2}$/.test(entry.plan_date) ? entry.plan_date : null;

            // Kategorie auflösen
            const cat = resolveCategoryId(entry);
            if (!cat) { entriesSkipped++; continue; }

            insertEntry.run(
              planId,
              recipeId,
              dayOfWeek,
              planDate,
              cat.name,
              cat.id,
              servings,
              entry.is_cooked ? 1 : 0
            );
            entriesImported++;
          }
        }
      }
    });

    transaction();

    const entriesSkippedNote = entriesSkipped > 0
      ? ` (${entriesSkipped} ${entriesSkipped === 1 ? 'Rezept' : 'Rezepte'} nicht gefunden und übersprungen)`
      : '';

    return {
      message: `${imported} Pläne importiert, ${entriesImported} Einträge${entriesSkippedNote}, ${skipped} Pläne übersprungen.`,
      imported,
      entries_imported: entriesImported,
      entries_skipped: entriesSkipped,
      skipped,
    };
  });
}
