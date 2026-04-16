/**
 * ============================================
 * Wochenplan-Service (Hybrid: Algorithmus + optionales KI-Reasoning)
 * ============================================
 *
 * Generiert intelligente Wochenpläne mit einem Score-basierten Algorithmus:
 * - Rezeptrotation (länger nicht gekocht → bevorzugt)
 * - Favoritenbonus
 * - Kategorie-Abwechslung (nicht 2× gleiche Kategorie hintereinander)
 * - Schwierigkeitsgrad passend zum Wochentag (einfach unter der Woche)
 * - Zutaten-Überlappung (Einkaufsoptimierung)
 * - Vorräte im Vorratsschrank berücksichtigen
 *
 * Optional: KI generiert eine kurze Begründung zum Plan.
 */

import db, { householdWhereClause, getMealTimeCategories } from '../config/database.js';
import { getWeekStart, convertToBaseUnit, scaleIngredient, unitsCompatible } from '../utils/helpers.js';
import { estimateNutrition } from './recipe-parser.js';

const DAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

/**
 * Formatiert ein Date-Objekt als YYYY-MM-DD (lokale Zeitzone, kein UTC-Shift).
 */
export function formatDateLocal(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Addiert Tage zu einem Datumsstring (YYYY-MM-DD).
 * @param {string} dateStr - Datum als YYYY-MM-DD
 * @param {number} days - Anzahl Tage (positiv oder negativ)
 * @returns {string} - Neues Datum als YYYY-MM-DD
 */
export function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00'); // Mittag um DST-Probleme zu vermeiden
  d.setDate(d.getDate() + days);
  return formatDateLocal(d);
}

/**
 * Erzeugt ein Array aller Daten von startDate bis endDate (inklusiv).
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {Array<{plan_date: string, day_of_week: number, day_name: string}>}
 */
export function getDateRange(startDate, endDate) {
  const dates = [];
  const start = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const isoStr = formatDateLocal(d);
    const jsDay = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1; // 0=Mon, ..., 6=Sun (ISO)
    dates.push({
      plan_date: isoStr,
      day_of_week: dayOfWeek,
      day_name: DAY_NAMES[dayOfWeek],
    });
  }
  return dates;
}

/**
 * Berechnet die "ungebundenen" Vorräte eines Benutzers.
 * Zieht die Zutaten aller ungekochten Rezepte der aktuellen Woche ab
 * und gibt nur die Restnamen zurück (lowercase Set).
 *
 * Vereinfacht: Nur noch Basis-Einheiten-Kompatibilität (kg↔g, l↔ml).
 * Komplexe zutat-spezifische Umrechnungen (z.B. 1 Zwiebel = 80g) sind nicht
 * mehr nötig, da natürliche Einheiten durchgängig verwendet werden.
 */
function getUnassignedPantryNames(userId, householdId) {
  const pWhere = householdWhereClause(userId, householdId);
  const pantryItems = db.prepare(
    `SELECT ingredient_name, amount, unit, is_permanent FROM pantry WHERE (${pWhere.clause}) AND amount > 0`
  ).all(...pWhere.params);

  if (!pantryItems.length) return new Set();

  // Alias-Map laden
  const aWhere = householdWhereClause(userId, householdId);
  const aliasRows = db.prepare(
    `SELECT alias_name, canonical_name FROM ingredient_aliases WHERE (${aWhere.clause})`
  ).all(...aWhere.params);
  const aliasMap = new Map();
  for (const r of aliasRows) aliasMap.set(r.alias_name.toLowerCase(), r.canonical_name.toLowerCase());
  const resolveAlias = (name) => aliasMap.get(name.toLowerCase()) || name.toLowerCase();

  // Pantry-Pool aufbauen (Basiseinheiten)
  const pool = {};
  for (const item of pantryItems) {
    const key = resolveAlias(item.ingredient_name);
    const base = convertToBaseUnit(item.amount, item.unit);
    pool[key] = {
      remaining: item.is_permanent ? Infinity : base.amount,
      base_unit: base.unit,
      is_permanent: !!item.is_permanent,
    };
  }

  // Aktuelle Woche: ungekochte Rezepte finden
  const weekStart = getWeekStart(new Date());
  const mpWhere = householdWhereClause(userId, householdId);
  const plan = db.prepare(
    `SELECT id FROM meal_plans WHERE (${mpWhere.clause}) AND week_start = ?`
  ).get(...mpWhere.params, weekStart);

  if (plan) {
    const entries = db.prepare(`
      SELECT mpe.recipe_id, mpe.servings as planned_servings, r.servings as original_servings
      FROM meal_plan_entries mpe
      JOIN recipes r ON r.id = mpe.recipe_id
      WHERE mpe.meal_plan_id = ? AND mpe.is_cooked = 0
    `).all(plan.id);

    // Alle Zutaten der ungekochten Rezepte laden
    const recipeIds = [...new Set(entries.map(e => e.recipe_id))];
    if (recipeIds.length) {
      const placeholders = recipeIds.map(() => '?').join(',');
      const allIngredients = db.prepare(
        `SELECT recipe_id, name, amount, unit FROM ingredients WHERE recipe_id IN (${placeholders}) AND is_optional = 0`
      ).all(...recipeIds);

      // Index: recipe_id → ingredients[]
      const ingByRecipe = {};
      for (const ing of allIngredients) {
        if (!ingByRecipe[ing.recipe_id]) ingByRecipe[ing.recipe_id] = [];
        ingByRecipe[ing.recipe_id].push(ing);
      }

      // Zutaten vom Pool abziehen
      for (const entry of entries) {
        const ings = ingByRecipe[entry.recipe_id] || [];
        for (const ing of ings) {
          const key = resolveAlias(ing.name);
          const p = pool[key];
          if (!p || p.is_permanent) continue;
          const base = convertToBaseUnit(
            scaleIngredient(ing.amount, entry.original_servings, entry.planned_servings) || 0,
            ing.unit
          );
          // Einfache Einheiten-Kompatibilität: nur identische Einheiten oder kg↔g / l↔ml
          if (unitsCompatible(base.unit, p.base_unit).compatible) {
            p.remaining = Math.max(0, p.remaining - base.amount);
          }
          // Bei inkompatiblen Einheiten (z.B. "2 Stück" vs "200g"): nicht abziehen.
          // Das ist gewollt – bei natürlichen Einheiten haben Rezepte und Vorräte
          // in der Regel die gleiche Einheit.
        }
      }
    }
  }

  // Nur Items mit Restmenge > 0 zurückgeben
  const result = new Set();
  for (const [key, p] of Object.entries(pool)) {
    if (p.remaining > 0) result.add(key);
  }
  return result;
}

// ============================================
// Kategorie-basiertes Keyword-Matching
// ============================================

/**
 * Keywords pro Mahlzeit-Kategorie-Typ (lowercase).
 * Werden per Heuristik dem Kategorie-Namen zugeordnet.
 */
const CATEGORY_KEYWORD_SETS = {
  breakfast: ['frühstück', 'breakfast', 'brunch', 'morgen', 'müsli', 'smoothie', 'porridge', 'oatmeal'],
  lunch:     ['mittagessen', 'mittag', 'lunch', 'hauptgericht', 'hauptspeise', 'main'],
  dinner:    ['abendessen', 'abend', 'dinner', 'hauptgericht', 'hauptspeise', 'main'],
  snack:     ['snack', 'dessert', 'nachtisch', 'kuchen', 'gebäck', 'süß', 'vorspeise', 'beilage', 'kleinigkeit', 'appetizer'],
};

/**
 * Title-Keywords als Fallback, wenn ein Rezept gar keine Kategorie hat.
 */
const TITLE_HINT_SETS = {
  breakfast: ['müsli', 'granola', 'porridge', 'smoothie', 'pancake', 'pfannkuchen', 'brötchen', 'toast', 'omelette', 'rührei', 'frühstück'],
  snack:     ['kuchen', 'muffin', 'cookie', 'riegel', 'salat', 'dip', 'hummus', 'bruschetta', 'nachos'],
};

/**
 * Ermittelt den Keyword-Set-Typ einer Kategorie anhand ihres Namens.
 * Gibt 'breakfast' | 'lunch' | 'dinner' | 'snack' | null zurück.
 */
function getCategoryType(categoryName) {
  const name = (categoryName || '').toLowerCase();
  if (name.includes('frühstück') || name.includes('breakfast') || name.includes('morgen') || name.includes('brunch'))
    return 'breakfast';
  if (name.includes('mittag') || name.includes('lunch'))
    return 'lunch';
  if (name.includes('abend') || name.includes('dinner'))
    return 'dinner';
  if (name.includes('snack') || name.includes('dessert') || name.includes('nachtisch') || name.includes('gebäck'))
    return 'snack';
  return null; // Unbekannter Typ
}

/**
 * Prüft, ob ein Rezept zu einer bestimmten Kategorie passt.
 * Gibt zurück: 'match' | 'neutral' | 'mismatch'
 * @param {object} recipe - Rezept mit categories-String
 * @param {string} categoryName - Name der Tageszeit-Kategorie
 */
function categoryFitness(recipe, categoryName) {
  const catType = getCategoryType(categoryName);
  if (!catType) return 'neutral'; // Unbekannter Kategorietyp → alles erlaubt

  const cats = (recipe.categories || '').split(',').map(c => c.trim().toLowerCase()).filter(Boolean);

  // Rezept hat Kategorien → prüfen ob eine zum Kategorie-Typ passt
  if (cats.length > 0) {
    const targetKeywords = CATEGORY_KEYWORD_SETS[catType] || [];
    const hasMatch = cats.some(cat => targetKeywords.some(kw => cat.includes(kw)));
    if (hasMatch) return 'match';

    // Prüfen ob Rezept explizit zu einem ANDEREN Typ gehört
    const otherTypes = Object.entries(CATEGORY_KEYWORD_SETS).filter(([key]) => key !== catType);
    const belongsToOther = otherTypes.some(([, keywords]) =>
      cats.some(cat => keywords.some(kw => cat.includes(kw)))
    );
    if (belongsToOther) return 'mismatch';

    return 'neutral'; // Kategorie vorhanden, passt zu keinem spezifischen Typ
  }

  // Kein Kategorie → Title als Fallback prüfen
  const titleLower = (recipe.title || '').toLowerCase();
  const titleHints = TITLE_HINT_SETS[catType];
  if (titleHints && titleHints.some(hint => titleLower.includes(hint))) return 'match';

  // Frühstück/Snack ohne passende Kategorie oder Title-Hint → eher unpassend
  if (catType === 'breakfast' || catType === 'snack') return 'mismatch';

  // Mittag/Abendessen: Rezepte ohne Kategorie gelten als mögliche Hauptgerichte
  return 'neutral';
}

/**
 * Harter Filter: Gibt nur Rezepte zurück, die zur Kategorie passen.
 * 'mismatch'-Rezepte werden komplett ausgeschlossen.
 */
function filterByCategory(recipes, categoryName) {
  return recipes.filter(r => categoryFitness(r, categoryName) !== 'mismatch');
}

// ============================================
// Scoring-System
// ============================================

/**
 * Bewertet ein Rezept für einen bestimmten Slot im Wochenplan.
 * Höherer Score = besser geeignet.
 */
function scoreRecipe(recipe, context) {
  let score = 100;

  // Mahlzeit-Typ-Passung wird VOR dem Scoring per Filter erledigt (siehe filterByCategory).
  // Im Score gibt es nur noch einen kleinen Bonus für perfekte Matches.
  const fitness = categoryFitness(recipe, context.categoryName || 'Mittagessen');
  if (fitness === 'match') score += 30; // Bonus für perfekte Kategorie-Passung

  // 1. Rotation: lange nicht gekocht = höherer Score (max +60)
  if (recipe.last_cooked) {
    const daysSince = Math.floor((Date.now() - new Date(recipe.last_cooked).getTime()) / 86_400_000);
    score += Math.min(daysSince, 60);
  } else {
    score += 60; // Nie gekocht → maximaler Rotationsbonus
  }

  // 2. Selten gekocht (max +20)
  if (recipe.cook_count === 0) {
    score += 20;
  } else if (recipe.cook_count <= 2) {
    score += 10;
  }

  // 3. Favoriten bevorzugen
  if (recipe.is_favorite) score += 25;

  // 4. Gute Bewertung
  if (recipe.avg_rating >= 4) score += 15;
  else if (recipe.avg_rating >= 3) score += 5;

  // 5. Duplikat-Vermeidung: schon diese Woche gewählt → praktisch ausschließen
  if (context.usedRecipeIds.has(recipe.id)) score -= 500;

  // 6. Kategorie-Abwechslung: gleiche Kategorie wie Vortag → Malus
  if (context.previousMealCategory) {
    const cats = (recipe.categories || '').split(',').map(c => c.trim().toLowerCase());
    if (cats.some(c => c === context.previousMealCategory.toLowerCase())) {
      score -= 30;
    }
  }

  // 7. Schwierigkeit vs. Wochentag
  const isWeekend = context.dayIdx >= 5; // Sa=5, So=6
  if (recipe.difficulty === 'schwer') {
    score += isWeekend ? 20 : -25;
  } else if (recipe.difficulty === 'einfach') {
    score += isWeekend ? -5 : 10;
  }

  // 8. Zeitaufwand: unter der Woche kürzere Rezepte bevorzugen
  if (!isWeekend && recipe.total_time > 60) score -= 15;
  if (!isWeekend && recipe.total_time <= 30) score += 10;

  // 9. Zutaten-Überlappung mit bereits gewählten Rezepten (Einkaufsoptimierung)
  if (context.usedIngredients.size > 0) {
    const overlap = recipe.ingredientNames.filter(n => context.usedIngredients.has(n)).length;
    score += overlap * 5;
  }

  // 10. Vorräte nutzen
  for (const name of recipe.ingredientNames) {
    if (context.pantrySet.has(name)) score += 8;
  }

  // 11. Kalorien-Passung (nur wenn calorieTarget gesetzt)
  if (context.calorieTarget && context.calorieSlotTarget) {
    const slotTarget = context.calorieSlotTarget;
    if (recipe.calories != null && recipe.calories > 0) {
      const deviationPct = Math.abs(recipe.calories - slotTarget) / slotTarget;

      // Strictness-Parameter
      const strictnessConfig = {
        soft:     { maxBonus: 15, tolerance: 0.20, nullPoint: 0.50 },
        moderate: { maxBonus: 25, tolerance: 0.15, nullPoint: 0.40 },
        strict:   { maxBonus: 40, tolerance: 0.10, nullPoint: 0.30 },
      };
      const cfg = strictnessConfig[context.calorieStrictness] || strictnessConfig.moderate;

      if (deviationPct <= cfg.tolerance) {
        // Innerhalb Toleranz → voller Bonus
        score += cfg.maxBonus;
      } else if (deviationPct < cfg.nullPoint) {
        // Linear abfallend bis 0
        const ratio = 1 - (deviationPct - cfg.tolerance) / (cfg.nullPoint - cfg.tolerance);
        score += Math.round(cfg.maxBonus * ratio);
      }
      // Über nullPoint hinaus → kein Bonus (0)
    }
    // Rezepte ohne Kaloriendaten → neutral (0 Bonus, kein Malus)
  }

  return Math.max(score, 1); // Mindestens 1
}

/**
 * Gewichtete Zufallsauswahl: Rezepte mit höherem Score werden wahrscheinlicher gewählt.
 */
function weightedRandomPick(recipes, context) {
  let eligible = recipes;

  // Bei striktem Kalorien-Modus: Rezepte mit >50% Abweichung ausschließen
  if (context.calorieTarget && context.calorieSlotTarget && context.calorieStrictness === 'strict') {
    const slotTarget = context.calorieSlotTarget;
    eligible = recipes.filter(r => {
      if (r.calories == null || r.calories <= 0) return true; // Ohne Daten → nicht ausschließen
      const deviationPct = Math.abs(r.calories - slotTarget) / slotTarget;
      return deviationPct <= 0.50;
    });
    // Fallback: wenn alle rausfliegen, wieder alle nehmen
    if (eligible.length === 0) eligible = recipes;
  }

  const scored = eligible.map(r => ({ recipe: r, score: scoreRecipe(r, context) }));
  scored.sort((a, b) => b.score - a.score);

  const totalWeight = scored.reduce((sum, s) => sum + s.score, 0);
  let random = Math.random() * totalWeight;

  for (const s of scored) {
    random -= s.score;
    if (random <= 0) return s;
  }
  return scored[scored.length - 1];
}

// ============================================
// Vorschläge (für Rezepttausch)
// ============================================

/**
 * Liefert bewertete Rezeptvorschläge für einen bestimmten Slot.
 */
export function getSuggestions(userId, { dayIdx = 0, categoryId = null, categoryName = null, excludeRecipeIds = [], planId = null, limit = 8, search = null, householdId = null } = {}) {
  const isSearch = search && search.trim().length > 0;
  const searchTerm = isSearch ? `%${search.trim().toLowerCase()}%` : null;
  const effectiveCategoryName = categoryName || 'Mittagessen';

  const rWhere = householdWhereClause(userId, householdId, 'r');
  const recipes = db.prepare(`
    SELECT r.*, GROUP_CONCAT(DISTINCT c.name) as category_names,
      (SELECT COUNT(*) FROM cooking_history ch WHERE ch.recipe_id = r.id) as cook_count,
      (SELECT MAX(ch.cooked_at) FROM cooking_history ch WHERE ch.recipe_id = r.id) as last_cooked,
      (SELECT AVG(ch.rating) FROM cooking_history ch WHERE ch.recipe_id = r.id AND ch.rating IS NOT NULL) as avg_rating
    FROM recipes r
    LEFT JOIN recipe_categories rc ON r.id = rc.recipe_id
    LEFT JOIN categories c ON rc.category_id = c.id
    WHERE (${rWhere.clause})
    GROUP BY r.id
  `).all(...rWhere.params);

  const pantrySet = getUnassignedPantryNames(userId, householdId);
  const excludeSet = new Set(excludeRecipeIds);

  // Gesperrte Rezepte laden und ausschließen
  const rbWhere = householdWhereClause(userId, householdId);
  const blockedIds = db.prepare(
    `SELECT recipe_id FROM recipe_blocks WHERE (${rbWhere.clause}) AND blocked_until >= date('now')`
  ).all(...rbWhere.params).map(b => b.recipe_id);
  blockedIds.forEach(id => excludeSet.add(id));

  // Zutaten aller Rezepte im aktuellen Plan sammeln (für Einkaufsüberlappung)
  let planIngredients = null;
  if (planId) {
    const planRecipeIds = db.prepare(
      'SELECT DISTINCT recipe_id FROM meal_plan_entries WHERE meal_plan_id = ?'
    ).all(planId).map(r => r.recipe_id);
    if (planRecipeIds.length > 0) {
      const placeholders = planRecipeIds.map(() => '?').join(',');
      const ings = db.prepare(
        `SELECT DISTINCT LOWER(name) as name FROM ingredients WHERE recipe_id IN (${placeholders})`
      ).all(...planRecipeIds);
      planIngredients = new Set(ings.map(i => i.name));
    }
  }

  const scored = recipes
    .filter(r => !excludeSet.has(r.id))
    .filter(r => !isSearch || r.title.toLowerCase().includes(searchTerm.replace(/%/g, '')))
    .map(r => {
      const ingredients = db.prepare('SELECT name FROM ingredients WHERE recipe_id = ?').all(r.id);
      return { ...r, categories: r.category_names || '', ingredientNames: ingredients.map(i => i.name.toLowerCase()) };
    })
    .filter(r => isSearch || categoryFitness(r, effectiveCategoryName) !== 'mismatch') // Harter Filter nur ohne Suche!
    .map(recipe => {
      const context = { dayIdx, categoryName: effectiveCategoryName, usedRecipeIds: new Set(), usedIngredients: new Set(), pantrySet, previousMealCategory: null };
      const score = scoreRecipe(recipe, context);

      // ── Detaillierte Hinweise sammeln ──
      const hints = [];

      // Mahlzeit-Typ-Passung
      if (categoryFitness(recipe, effectiveCategoryName) === 'match') {
        hints.push({ icon: '✅', text: 'Passt zum Slot' });
      }

      // Vorrats-Check
      const pantryMatches = recipe.ingredientNames.filter(n => pantrySet.has(n));
      if (pantryMatches.length > 0) {
        hints.push({
          icon: '🗄️',
          text: `${pantryMatches.length} Zutat${pantryMatches.length > 1 ? 'en' : ''} im Vorrat`,
        });
      }

      // Zutaten-Überlappung mit aktuell genutzten Rezepten des Plans
      if (planIngredients && planIngredients.size > 0) {
        const overlap = recipe.ingredientNames.filter(n => planIngredients.has(n));
        if (overlap.length > 0) {
          hints.push({
            icon: '🛒',
            text: `${overlap.length} von ${recipe.ingredientNames.length} Zutaten bei anderen Plan-Rezepten`,
          });
        }
      }

      // Kochhistorie
      if (!recipe.last_cooked) {
        hints.push({ icon: '🆕', text: 'Noch nie gekocht' });
      } else {
        const daysSince = Math.floor((Date.now() - new Date(recipe.last_cooked).getTime()) / 86_400_000);
        if (daysSince >= 30) {
          hints.push({ icon: '📅', text: `Seit ${daysSince} Tagen nicht gekocht` });
        } else if (daysSince >= 14) {
          hints.push({ icon: '📅', text: `Seit ${daysSince} Tagen nicht gekocht` });
        }
      }

      if (recipe.cook_count > 0 && recipe.cook_count <= 2) {
        hints.push({ icon: '🔍', text: `Erst ${recipe.cook_count}× gekocht` });
      }

      // Favorit
      if (recipe.is_favorite) {
        hints.push({ icon: '⭐', text: 'Favorit' });
      }

      // Bewertung
      if (recipe.avg_rating >= 4) {
        hints.push({ icon: '👍', text: `Bewertung: ${Number(recipe.avg_rating).toFixed(1)} ★` });
      }

      // Schwierigkeit passend zum Tag
      const isWeekend = dayIdx >= 5;
      if (recipe.difficulty === 'einfach' && !isWeekend) {
        hints.push({ icon: '⚡', text: 'Schnell & einfach unter der Woche' });
      }
      if (recipe.total_time && recipe.total_time <= 30 && !isWeekend) {
        hints.push({ icon: '⏱️', text: 'Unter 30 Minuten' });
      }

      // Fallback: mindestens ein Hint
      if (hints.length === 0) {
        hints.push({ icon: '🍽️', text: 'Gute Abwechslung' });
      }

      return {
        id: recipe.id,
        title: recipe.title,
        image_url: recipe.image_url,
        total_time: recipe.total_time,
        difficulty: recipe.difficulty,
        is_favorite: recipe.is_favorite,
        score,
        hints,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}

// ============================================
// Nährwert-Schätzung für Rezepte ohne Daten
// ============================================

/**
 * Default-Verteilung der Kalorien auf Mahlzeiten-Slots (%)
 * Keyed by position (0=erste Mahlzeit, 1=zweite, etc.)
 */
const DEFAULT_CALORIE_SHARES = [25, 35, 30, 10];

/**
 * Baut eine Kalorien-Verteilung für die gegebenen Kategorien.
 * Nutzt explizite Distribution wenn vorhanden, sonst positionsbasierte Defaults.
 * @param {Array} categories - Tageszeit-Kategorien [{id, name, ...}]
 * @param {Object|null} explicitDistribution - { "categoryId": percent, ... } oder null
 * @returns {Object} - { categoryId: percent, ... }
 */
function buildCalorieDistribution(categories, explicitDistribution) {
  const dist = {};
  for (let i = 0; i < categories.length; i++) {
    const catId = String(categories[i].id);
    if (explicitDistribution && explicitDistribution[catId] != null) {
      dist[categories[i].id] = explicitDistribution[catId];
    } else {
      dist[categories[i].id] = DEFAULT_CALORIE_SHARES[i] ?? Math.round(100 / categories.length);
    }
  }
  return dist;
}

/**
 * Stellt sicher, dass alle Rezepte Nährwertdaten haben.
 * Fehlende Werte werden per KI geschätzt und in der DB gespeichert (Cache).
 * @param {Array} recipes - Rezept-Objekte (mit id, servings)
 * @returns {Promise<number>} - Anzahl neu geschätzter Rezepte
 */
async function ensureNutritionData(recipes) {
  const missing = recipes.filter(r => r.calories == null);
  if (missing.length === 0) return 0;

  console.log(`\uD83D\uDD25 ${missing.length} Rezepte ohne Kalorien-Daten – starte KI-Schätzung...`);

  const CONCURRENCY = 5;
  let estimated = 0;

  // Zutaten für alle fehlenden Rezepte laden
  const updateStmt = db.prepare(
    'UPDATE recipes SET calories = ?, protein = ?, carbs = ?, fat = ?, nutrition_note = ? WHERE id = ?'
  );

  // Batch mit Concurrency-Limit verarbeiten
  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    const batch = missing.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (recipe) => {
      try {
        const ingredients = db.prepare(
          'SELECT name, amount, unit FROM ingredients WHERE recipe_id = ?'
        ).all(recipe.id);

        if (ingredients.length === 0) return;

        const nutrition = await estimateNutrition(ingredients, recipe.servings || 4);
        if (nutrition && nutrition.calories) {
          // In DB cachen
          updateStmt.run(
            nutrition.calories,
            nutrition.protein || null,
            nutrition.carbs || null,
            nutrition.fat || null,
            nutrition.note || 'Automatisch geschätzt bei Wochenplan-Generierung',
            recipe.id
          );
          // Rezept-Objekt aktualisieren (für sofortige Nutzung im Scoring)
          recipe.calories = nutrition.calories;
          recipe.protein = nutrition.protein || null;
          recipe.carbs = nutrition.carbs || null;
          recipe.fat = nutrition.fat || null;
          estimated++;
        }
      } catch (err) {
        console.warn(`\u26A0\uFE0F Nährwert-Schätzung für Rezept #${recipe.id} ("${recipe.title}") fehlgeschlagen:`, err.message);
      }
    });
    await Promise.all(promises);
  }

  console.log(`\u2705 ${estimated} von ${missing.length} Rezepten mit Nährwerten ergänzt`);
  return estimated;
}

// ============================================
// Plan-Generierung
// ============================================

/**
 * Generiert einen Essensplan per Scoring-Algorithmus.
 * Unterstützt beliebige Datumsbereiche (nicht nur Mo-So).
 * @param {number} userId - Benutzer-ID
 * @param {object} options - Konfiguration
 * @returns {Promise<object>} - { plan, nutritionEstimatedCount }
 */
export async function generateWeekPlan(userId, options = {}) {
  const {
    personCount = 4,
    mealCategories = null,     // Array von Kategorie-Objekten [{id, name, icon, color, sort_order}]
    excludeRecipeIds = [],
    collectionIds = [],       // Nur Rezepte aus diesen Sammlungen
    deduplicateCollections = true, // Rezepte in mehreren Sammlungen nur einmal zählen
    enableAiReasoning = false,    // KI-Begründung generieren?
    startDate = null,             // NEU: Startdatum YYYY-MM-DD (null = Legacy-Modus)
    endDate = null,               // NEU: Enddatum YYYY-MM-DD (null = Legacy-Modus)
    activeDays = [0, 1, 2, 3, 4, 5, 6], // LEGACY: Für welche Wochentage (0=Mo...6=So)
    calorieTarget = null,         // kcal/Tag pro Person (null = deaktiviert)
    calorieDistribution = null,   // { categoryId: percent, ... } in %
    calorieStrictness = 'moderate', // 'soft' | 'moderate' | 'strict'
    householdId = null,
    householdOnly = false,        // Nur Haushalt-Rezepte (keine privaten)
  } = options;

  // Tageszeit-Kategorien: aus Parameter oder aus DB laden
  const categories = mealCategories || getMealTimeCategories(userId, householdId);
  if (categories.length === 0) {
    throw new Error('Keine Tageszeit-Kategorien definiert. Bitte in den Einstellungen mindestens eine Kategorie als Tageszeit markieren.');
  }

  // --- 1. Alle Rezepte des Benutzers laden (ggf. gefiltert nach Sammlungen) ---

  // Gesperrte Rezepte laden
  const rbWhere = householdWhereClause(userId, householdId);
  const blockedRecipeIds = db.prepare(
    `SELECT recipe_id FROM recipe_blocks WHERE (${rbWhere.clause}) AND blocked_until >= date('now')`
  ).all(...rbWhere.params).map(b => b.recipe_id);
  const allExcludeIds = [...new Set([...excludeRecipeIds, ...blockedRecipeIds])];

  // Haushalt-Only-Filter: nur Rezepte mit household_id = householdId (keine privaten)
  let householdOnlyFilter = '';
  if (householdOnly && householdId) {
    householdOnlyFilter = `AND r.household_id = ${parseInt(householdId)}`;
  }

  let collectionFilter = '';
  if (collectionIds.length > 0) {
    if (deduplicateCollections) {
      // Rezept nur einmal, auch wenn in mehreren gewählten Sammlungen
      collectionFilter = `AND r.id IN (
        SELECT DISTINCT rcol.recipe_id FROM recipe_collections rcol
        WHERE rcol.collection_id IN (${collectionIds.join(',')})
      )`;
    } else {
      collectionFilter = `AND r.id IN (
        SELECT rcol.recipe_id FROM recipe_collections rcol
        WHERE rcol.collection_id IN (${collectionIds.join(',')})
      )`;
    }
  }

  const rWhere = householdWhereClause(userId, householdId, 'r');
  const recipes = db.prepare(`
    SELECT
      r.*,
      GROUP_CONCAT(DISTINCT c.name) as category_names,
      (SELECT COUNT(*) FROM cooking_history ch WHERE ch.recipe_id = r.id) as cook_count,
      (SELECT MAX(ch.cooked_at) FROM cooking_history ch WHERE ch.recipe_id = r.id) as last_cooked,
      (SELECT AVG(ch.rating) FROM cooking_history ch WHERE ch.recipe_id = r.id AND ch.rating IS NOT NULL) as avg_rating
    FROM recipes r
    LEFT JOIN recipe_categories rc ON r.id = rc.recipe_id
    LEFT JOIN categories c ON rc.category_id = c.id
    WHERE (${rWhere.clause})
    ${allExcludeIds.length ? `AND r.id NOT IN (${allExcludeIds.join(',')})` : ''}
    ${householdOnlyFilter}
    ${collectionFilter}
    GROUP BY r.id
    ORDER BY r.last_cooked_at ASC NULLS FIRST, r.times_cooked ASC
  `).all(...rWhere.params);

  if (recipes.length < 3) {
    throw new Error(
      `Mindestens 3 Rezepte werden für eine Wochenplanung benötigt. Aktuell: ${recipes.length} Rezepte.`
    );
  }

  // --- 2. Zutaten pro Rezept laden ---
  const recipeData = recipes.map(recipe => {
    const ingredients = db.prepare(
      'SELECT name FROM ingredients WHERE recipe_id = ?'
    ).all(recipe.id);

    return {
      ...recipe,
      categories: recipe.category_names || '',
      ingredientNames: ingredients.map(i => i.name.toLowerCase()),
    };
  });

  // --- 2b. Kalorien-Daten sicherstellen (bei aktivem Kalorien-Ziel) ---
  let nutritionEstimatedCount = 0;
  if (calorieTarget) {
    nutritionEstimatedCount = await ensureNutritionData(recipeData);
  }

  // Effektive Kalorien-Verteilung berechnen
  const effectiveDistribution = buildCalorieDistribution(categories, calorieDistribution);

  // --- 3. Vorräte laden (nur ungebundene, nach Abzug der aktuellen Woche) ---
  const pantrySet = getUnassignedPantryNames(userId, householdId);

  // --- 4. Algorithmische Planung ---
  const plan = [];
  const usedRecipeIds = new Set();
  const usedIngredients = new Set();
  const reasons = [];

  // Tracking: letzte Kategorie pro Tageszeit-Kategorie (für Abwechslung)
  const lastCategoryByMeal = {};

   // Pro Tageszeit-Kategorie: passende Rezepte vorab filtern
  const recipesPerCategory = {};
  for (const cat of categories) {
    recipesPerCategory[cat.id] = filterByCategory(recipeData, cat.name);
  }

  // --- Planungsdaten bestimmen ---
  let planDates;
  if (startDate && endDate) {
    // Neuer Modus: alle Daten im Bereich werden geplant
    planDates = getDateRange(startDate, endDate);
  } else {
    // Legacy-Modus: weekStart + activeDays (0=Mo...6=So)
    const ws = options.weekStart || getWeekStart();
    const allDates = getDateRange(ws, addDays(ws, 6));
    const activeDaySet = new Set(activeDays);
    planDates = allDates.map(d => ({
      ...d,
      active: activeDaySet.has(d.day_of_week),
    }));
  }

  for (const planDate of planDates) {
    const dayIdx = planDate.day_of_week;

    // Tag überspringen wenn nicht aktiv (nur Legacy-Modus)
    if (planDate.active === false) {
      plan.push({
        plan_date: planDate.plan_date,
        day_of_week: dayIdx,
        day: dayIdx, // Legacy-Compat
        day_name: planDate.day_name,
        meals: [],
      });
      continue;
    }

    const dayMeals = [];

    for (const cat of categories) {
      // Nur aus passenden Rezepten wählen
      const eligible = recipesPerCategory[cat.id];
      if (eligible.length === 0) continue; // Keine passenden Rezepte → Slot leer lassen

      const context = {
        dayIdx,
        categoryName: cat.name,
        usedRecipeIds,
        usedIngredients,
        pantrySet,
        previousMealCategory: lastCategoryByMeal[cat.id] || null,
        // Kalorien-Kontext (null wenn nicht aktiv)
        calorieTarget: calorieTarget || null,
        calorieSlotTarget: calorieTarget ? calorieTarget * (effectiveDistribution[cat.id] || 25) / 100 : null,
        calorieStrictness: calorieTarget ? calorieStrictness : null,
      };

      const pick = weightedRandomPick(eligible, context);
      const recipe = pick.recipe;

      // Gewähltes Rezept tracken
      usedRecipeIds.add(recipe.id);
      recipe.ingredientNames.forEach(n => usedIngredients.add(n));
      const firstCat = (recipe.categories || '').split(',')[0]?.trim() || '';
      lastCategoryByMeal[cat.id] = firstCat;

      dayMeals.push({
        category_id: cat.id,
        meal_type: cat.name,
        recipe_id: recipe.id,
        recipe_title: recipe.title,
        servings: personCount,
      });

      // Grund sammeln
      if (pick.score >= 180) {
        reasons.push(`\u201E${recipe.title}\u201C (${planDate.day_name}): lange nicht gekocht`);
      } else if (recipe.is_favorite) {
        reasons.push(`\u201E${recipe.title}\u201C (${planDate.day_name}): Favorit`);
      }
    }

    plan.push({
      plan_date: planDate.plan_date,
      day_of_week: dayIdx,
      day: dayIdx, // Legacy-Compat
      day_name: planDate.day_name,
      meals: dayMeals,
    });
  }

  // Reasoning wird separat generiert (async, nicht blockierend)
  return { plan, nutritionEstimatedCount };
}

/**
 * Generiert KI-Reasoning für einen bestehenden Plan (async).
 * Gibt { reasoning, reasoningSource } zurück.
 */
export async function generateReasoning(plan) {
  let reasoning = null;
  let reasoningSource = null;

  // Zuerst KI versuchen
  try {
    const { getAIProvider } = await import('./ai/provider.js');
    const ai = getAIProvider({ simple: true });
    if (ai?.apiKey) {
      const titles = plan.flatMap(d =>
        (d.meals || d.entries?.filter(e => e.day_of_week === d.day) || [])
          .map(m => `${d.day_name || ''} ${m.meal_type}: ${m.recipe_title}`)
      ).join('\n');
      console.log('🤖 KI-Reasoning wird angefragt...');
      const aiReasoning = await ai.chat(
        `Antworte kurz und direkt in 2-3 Sätzen auf Deutsch. Erkläre warum dieser Wochenplan ausgewogen ist:\n${titles}`,
        { maxTokens: 2048 }
      );
      if (aiReasoning && aiReasoning.length > 10) {
        reasoning = aiReasoning.trim();
        reasoningSource = 'ai';
        console.log('✅ KI-Reasoning erhalten');
      } else {
        console.warn('⚠️ KI-Antwort zu kurz oder leer, Fallback auf Algorithmus');
      }
    } else {
      console.warn('⚠️ KI-Provider hat keinen API-Key, Fallback auf Algorithmus');
    }
  } catch (err) {
    console.warn('⚠️ KI-Reasoning fehlgeschlagen, Fallback auf Algorithmus:', err.message);
  }

  // Algorithmischer Fallback
  if (!reasoning) {
    const allMeals = plan.flatMap(d => d.meals || []);
    const totalMeals = allMeals.length;
    const uniqueRecipes = new Set(allMeals.map(m => m.recipe_id)).size;
    reasoning = `Plan: ${totalMeals} Mahlzeiten aus ${uniqueRecipes} verschiedenen Rezepten.`;
    reasoningSource = 'algorithm';
  }

  return { reasoning, reasoningSource };
}

// ============================================
// Speichern & Laden
// ============================================

/**
 * Speichert einen generierten Plan in der Datenbank.
 * Schreibt sowohl neue Spalten (start_date, end_date, plan_date) als auch Legacy-Spalten (week_start, day_of_week).
 * @param {number} userId
 * @param {string} startDate - YYYY-MM-DD (wird auch als Legacy week_start gespeichert)
 * @param {string} endDate - YYYY-MM-DD
 * @param {object} planData - { plan: [...], reasoning?: string }
 * @param {number|null} householdId
 * @returns {number} planId
 */
export function saveMealPlan(userId, startDate, endDate, planData, householdId) {
  const plan = planData.plan;
  if (!Array.isArray(plan) || plan.length === 0) {
    throw new Error('Kein gültiger Plan zum Speichern vorhanden.');
  }

  const insertPlan = db.prepare(
    'INSERT INTO meal_plans (user_id, week_start, start_date, end_date, reasoning, household_id) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertEntry = db.prepare(
    'INSERT INTO meal_plan_entries (meal_plan_id, recipe_id, day_of_week, plan_date, meal_type, category_id, servings) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const transaction = db.transaction(() => {
    // Legacy week_start = startDate (für Abwärtskompatibilität)
    const { lastInsertRowid: planId } = insertPlan.run(
      userId, startDate, startDate, endDate, planData.reasoning || null, householdId || null
    );

    for (const day of plan) {
      const dayOfWeek = day.day_of_week ?? day.day ?? plan.indexOf(day);
      const planDate = day.plan_date || null;
      const meals = Array.isArray(day.meals) ? day.meals : [];
      for (const meal of meals) {
        if (!meal.recipe_id) continue;
        insertEntry.run(planId, meal.recipe_id, dayOfWeek, planDate, meal.meal_type, meal.category_id, meal.servings || 4);
      }
    }

    return planId;
  });

  return transaction();
}

/**
 * Lädt einen Plan mit allen Details.
 * Unterstützt Lookup per week_start (Legacy) oder per Plan-ID.
 */
export function getMealPlan(userId, weekStart, householdId) {
  const hw = householdWhereClause(userId, householdId);
  const plan = db.prepare(
    `SELECT id, user_id, week_start, start_date, end_date, created_at, reasoning, is_locked
     FROM meal_plans WHERE (${hw.clause}) AND week_start = ?`
  ).get(...hw.params, weekStart);

  if (!plan) return null;

  const entries = db.prepare(`
    SELECT
      mpe.*,
      mcat.name as category_name,
      mcat.icon as category_icon,
      mcat.color as category_color,
      mcat.sort_order as category_sort_order,
      r.title as recipe_title,
      r.image_url,
      r.total_time,
      r.difficulty,
      r.description as recipe_description,
      r.is_favorite,
      r.ai_generated,
      r.times_cooked,
      r.servings as original_servings,
      r.calories,
      r.protein,
      r.carbs,
      r.fat,
      GROUP_CONCAT(DISTINCT c.name) as category_names
    FROM meal_plan_entries mpe
    LEFT JOIN categories mcat ON mpe.category_id = mcat.id
    JOIN recipes r ON mpe.recipe_id = r.id
    LEFT JOIN recipe_categories rc ON r.id = rc.recipe_id
    LEFT JOIN categories c ON rc.category_id = c.id
    WHERE mpe.meal_plan_id = ?
    GROUP BY mpe.id
    ORDER BY COALESCE(mpe.plan_date, mpe.day_of_week), mcat.sort_order, mpe.category_id
  `).all(plan.id);

  return { ...plan, entries };
}

/**
 * Lädt einen Plan per ID (statt week_start).
 * Für die neue Plan-Ansicht, wo per Dropdown ein Plan gewählt wird.
 */
export function getMealPlanById(userId, planId, householdId) {
  const hw = householdWhereClause(userId, householdId);
  const plan = db.prepare(
    `SELECT id, user_id, week_start, start_date, end_date, created_at, reasoning, is_locked
     FROM meal_plans WHERE (${hw.clause}) AND id = ?`
  ).get(...hw.params, planId);

  if (!plan) return null;

  const entries = db.prepare(`
    SELECT
      mpe.*,
      mcat.name as category_name,
      mcat.icon as category_icon,
      mcat.color as category_color,
      mcat.sort_order as category_sort_order,
      r.title as recipe_title,
      r.image_url,
      r.total_time,
      r.difficulty,
      r.description as recipe_description,
      r.is_favorite,
      r.ai_generated,
      r.times_cooked,
      r.servings as original_servings,
      r.calories,
      r.protein,
      r.carbs,
      r.fat,
      GROUP_CONCAT(DISTINCT c.name) as category_names
    FROM meal_plan_entries mpe
    LEFT JOIN categories mcat ON mpe.category_id = mcat.id
    JOIN recipes r ON mpe.recipe_id = r.id
    LEFT JOIN recipe_categories rc ON r.id = rc.recipe_id
    LEFT JOIN categories c ON rc.category_id = c.id
    WHERE mpe.meal_plan_id = ?
    GROUP BY mpe.id
    ORDER BY COALESCE(mpe.plan_date, mpe.day_of_week), mcat.sort_order, mpe.category_id
  `).all(plan.id);

  return { ...plan, entries };
}

/**
 * Lädt alle Entries in einem Datumsbereich (plan-übergreifend).
 * Für die Wochen-Ansicht, wo z.B. Mo-So angezeigt wird, egal welchen Plänen die Entries gehören.
 * @param {number} userId
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @param {number|null} householdId
 * @returns {{ entries: Array, plans: Array<{id, start_date, end_date}> }}
 */
export function getEntriesByDateRange(userId, startDate, endDate, householdId) {
  const hw = householdWhereClause(userId, householdId, 'mp');
  const entries = db.prepare(`
    SELECT
      mpe.*,
      mp.start_date as plan_start_date,
      mp.end_date as plan_end_date,
      mcat.name as category_name,
      mcat.icon as category_icon,
      mcat.color as category_color,
      mcat.sort_order as category_sort_order,
      r.title as recipe_title,
      r.image_url,
      r.total_time,
      r.difficulty,
      r.description as recipe_description,
      r.is_favorite,
      r.ai_generated,
      r.times_cooked,
      r.servings as original_servings,
      r.calories,
      r.protein,
      r.carbs,
      r.fat,
      GROUP_CONCAT(DISTINCT c.name) as category_names
    FROM meal_plan_entries mpe
    JOIN meal_plans mp ON mpe.meal_plan_id = mp.id
    LEFT JOIN categories mcat ON mpe.category_id = mcat.id
    JOIN recipes r ON mpe.recipe_id = r.id
    LEFT JOIN recipe_categories rc ON r.id = rc.recipe_id
    LEFT JOIN categories c ON rc.category_id = c.id
    WHERE (${hw.clause}) AND mpe.plan_date BETWEEN ? AND ?
    GROUP BY mpe.id
    ORDER BY mpe.plan_date, mcat.sort_order, mpe.category_id
  `).all(...hw.params, startDate, endDate);

  // Betroffene Pläne für Metadaten
  const plans = db.prepare(`
    SELECT DISTINCT mp.id, mp.start_date, mp.end_date, mp.week_start, mp.is_locked
    FROM meal_plans mp
    JOIN meal_plan_entries mpe ON mp.id = mpe.meal_plan_id
    WHERE (${hw.clause}) AND mpe.plan_date BETWEEN ? AND ?
  `).all(...hw.params, startDate, endDate);

  return { entries, plans };
}
