/**
 * ============================================
 * Backup-Routen – Komplett-Export/Import
 * ============================================
 * Erlaubt Benutzern, ALLE eigenen Daten in einer
 * einzigen JSON-Datei zu exportieren und importieren.
 *
 * Sicherheitsmaßnahmen:
 * - IDs aus dem Import werden NIE übernommen
 * - user_id wird immer vom JWT-Token genommen
 * - Strenge Validierung aller Datentypen und Limits
 * - Import in einer Transaction (all-or-nothing)
 * - Rezept-Referenzen via Titel-Matching (nicht per ID)
 * - Maximale Größenlimits pro Datentyp
 */

import db, { householdWhereClause, getMealTimeCategories } from '../config/database.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import sharp from 'sharp';
import { config } from '../config/env.js';
import { safePath, generateId } from '../utils/helpers.js';

// ── Sicherheits-Limits ──
const LIMITS = {
  recipes: 500,
  collections: 200,
  pantry: 2000,
  mealPlans: 200,
  shoppingLists: 500,
  recipeBlocks: 500,
  ingredientAliases: 5000,
  blockedIngredients: 5000,
  maxCategoriesPerRecipe: 20,
  maxIngredientsPerRecipe: 200,
  maxStepsPerRecipe: 100,
  maxStringLength: 10000,
};

/**
 * Strings sicher kürzen und trimmen
 */
function sanitize(val, maxLen = LIMITS.maxStringLength) {
  if (typeof val !== 'string') return typeof val === 'number' ? val : '';
  return val.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim().slice(0, maxLen);
}

export default async function backupRoutes(fastify) {
  fastify.addHook('onRequest', fastify.resolveHousehold);

  // ============================================
  // GET /api/backup/export
  // Kompletter Export aller eigenen Daten
  // ============================================
  fastify.get('/export', {
    schema: {
      description: 'Kompletter Export aller eigenen Daten als JSON',
      tags: ['Backup'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          include_images: { type: 'boolean', default: false },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.id;
    const householdId = request.householdId;
    const hhWhere = householdWhereClause(userId, householdId);
    const includeImages = request.query.include_images === true || request.query.include_images === 'true';

    // ── Rezepte ──
    const recipes = db.prepare(`SELECT * FROM recipes WHERE (${hhWhere.clause})`).all(...hhWhere.params);
    const exportedRecipes = [];

    for (const recipe of recipes) {
      const categories = db.prepare(`
        SELECT c.name, c.icon, c.color, c.is_meal_time, c.sort_order FROM categories c
        JOIN recipe_categories rc ON c.id = rc.category_id
        WHERE rc.recipe_id = ?
      `).all(recipe.id);

      const ingredients = db.prepare(
        'SELECT name, amount, unit, group_name, sort_order, is_optional, notes FROM ingredients WHERE recipe_id = ? ORDER BY group_name, sort_order'
      ).all(recipe.id);

      const steps = db.prepare(
        'SELECT step_number, title, instruction, duration_minutes FROM cooking_steps WHERE recipe_id = ? ORDER BY step_number'
      ).all(recipe.id);

      const recipeExport = {
        title: recipe.title,
        description: recipe.description,
        servings: recipe.servings,
        prep_time: recipe.prep_time,
        cook_time: recipe.cook_time,
        total_time: recipe.total_time,
        difficulty: recipe.difficulty,
        source_url: recipe.source_url,
        is_favorite: recipe.is_favorite,
        notes: recipe.notes,
        ai_generated: recipe.ai_generated,
        times_cooked: recipe.times_cooked,
        last_cooked_at: recipe.last_cooked_at,
        created_at: recipe.created_at,
        updated_at: recipe.updated_at,
        household_id: recipe.household_id || null,
        calories: recipe.calories,
        protein: recipe.protein,
        carbs: recipe.carbs,
        fat: recipe.fat,
        nutrition_note: recipe.nutrition_note,
        nutrition_details: recipe.nutrition_details,
        categories,
        ingredients,
        steps,
      };

      if (includeImages && recipe.image_url) {
        try {
          const relPath = recipe.image_url.replace('/api/uploads/', '');
          const imgPath = safePath(config.upload.path, relPath);
          if (imgPath && existsSync(imgPath)) {
            recipeExport.image_base64 = readFileSync(imgPath).toString('base64');
            recipeExport.image_mime = 'image/webp';
          }
        } catch { /* Bild nicht verfügbar */ }
      }

      exportedRecipes.push(recipeExport);
    }

    // ── Sammlungen ──
    const collections = db.prepare(
      `SELECT * FROM collections WHERE (${hhWhere.clause}) ORDER BY sort_order ASC, name ASC`
    ).all(...hhWhere.params);

    const exportedCollections = collections.map(col => {
      const recipeTitles = db.prepare(`
        SELECT r.title FROM recipes r
        JOIN recipe_collections rc ON r.id = rc.recipe_id
        WHERE rc.collection_id = ?
        ORDER BY rc.added_at DESC
      `).all(col.id).map(r => r.title);

      return {
        name: col.name,
        icon: col.icon,
        color: col.color,
        sort_order: col.sort_order,
        recipe_titles: recipeTitles,
      };
    });

    // ── Vorratsschrank ──
    const pantryItems = db.prepare(
      `SELECT ingredient_name, amount, unit, category, expiry_date, notes, is_permanent FROM pantry WHERE (${hhWhere.clause}) ORDER BY category, ingredient_name`
    ).all(...hhWhere.params);

    // ── Wochenpläne ──
    const mealPlans = db.prepare(`SELECT * FROM meal_plans WHERE (${hhWhere.clause})`).all(...hhWhere.params);
    const exportedMealPlans = mealPlans.map(plan => {
      const entries = db.prepare(`
        SELECT mpe.day_of_week, mpe.meal_type, mpe.category_id, mpe.plan_date, mpe.servings, mpe.is_cooked,
               r.title as recipe_title, c.name as category_name
        FROM meal_plan_entries mpe
        LEFT JOIN recipes r ON mpe.recipe_id = r.id
        LEFT JOIN categories c ON mpe.category_id = c.id
        WHERE mpe.meal_plan_id = ?
      `).all(plan.id);

      return {
        week_start: plan.week_start,
        start_date: plan.start_date || null,
        end_date: plan.end_date || null,
        created_at: plan.created_at,
        entries: entries.map(e => ({
          day_of_week: e.day_of_week,
          plan_date: e.plan_date || null,
          category_name: e.category_name || e.meal_type,
          servings: e.servings,
          is_cooked: e.is_cooked,
          recipe_title: e.recipe_title,
          // backward-compat: keep meal_type for older importers
          meal_type: e.meal_type,
        })),
      };
    });

    // ── Einkaufslisten ──
    const shoppingLists = db.prepare(`SELECT * FROM shopping_lists WHERE (${hhWhere.clause})`).all(...hhWhere.params);
    const exportedShoppingLists = shoppingLists.map(list => {
      const items = db.prepare(`
        SELECT sli.ingredient_name, sli.amount, sli.unit, sli.is_checked,
               r.title as recipe_title,
               sli.rewe_product_name, sli.rewe_price
        FROM shopping_list_items sli
        LEFT JOIN recipes r ON sli.recipe_id = r.id
        WHERE sli.shopping_list_id = ?
      `).all(list.id);

      return {
        name: list.name,
        is_active: list.is_active,
        created_at: list.created_at,
        items,
      };
    });

    // ── Kategorien (standalone, damit is_meal_time/sort_order erhalten bleiben) ──
    const allCategories = db.prepare(
      `SELECT name, icon, color, is_meal_time, sort_order FROM categories WHERE (${hhWhere.clause}) ORDER BY sort_order, name`
    ).all(...hhWhere.params);

    // ── Rezept-Sperren ──
    const hhRb = householdWhereClause(userId, householdId, 'rb');
    const recipeBlocks = db.prepare(`
      SELECT rb.blocked_until, rb.reason, rb.created_at, r.title as recipe_title
      FROM recipe_blocks rb
      JOIN recipes r ON rb.recipe_id = r.id
      WHERE (${hhRb.clause})
    `).all(...hhRb.params);

    // ── Zutaten-Einstellungen ──
    const ingredientAliases = db.prepare(
      `SELECT canonical_name, alias_name FROM ingredient_aliases WHERE (${hhWhere.clause})`
    ).all(...hhWhere.params);

    const blockedIngredients = db.prepare(
      `SELECT ingredient_name FROM blocked_ingredients WHERE (${hhWhere.clause})`
    ).all(...hhWhere.params).map(b => b.ingredient_name);

    // ── Haushalt-Info ──
    let householdInfo = null;
    if (householdId) {
      const hh = db.prepare('SELECT id, name FROM households WHERE id = ?').get(householdId);
      if (hh) householdInfo = { id: hh.id, name: hh.name };
    }

    // ── Export zusammenstellen ──
    const exportData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      source: 'Zauberjournal',
      type: 'full_backup',
      household: householdInfo,
      summary: {
        recipes: exportedRecipes.length,
        collections: exportedCollections.length,
        categories: allCategories.length,
        pantry_items: pantryItems.length,
        meal_plans: exportedMealPlans.length,
        shopping_lists: exportedShoppingLists.length,
        recipe_blocks: recipeBlocks.length,
        ingredient_aliases: ingredientAliases.length,
        blocked_ingredients: blockedIngredients.length,
      },
      data: {
        recipes: exportedRecipes,
        collections: exportedCollections,
        categories: allCategories,
        pantry: pantryItems,
        meal_plans: exportedMealPlans,
        shopping_lists: exportedShoppingLists,
        recipe_blocks: recipeBlocks,
        ingredient_aliases: ingredientAliases,
        blocked_ingredients: blockedIngredients,
      },
    };

    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="zauberjournal-backup-${new Date().toISOString().split('T')[0]}.json"`);
    return exportData;
  });

  // ============================================
  // POST /api/backup/import
  // Kompletter Import aller eigenen Daten
  // ============================================
  fastify.post('/import', {
    schema: {
      description: 'Kompletter Import aller Daten aus einer Backup-JSON-Datei',
      tags: ['Backup'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const userId = request.user.id;
    const householdId = request.householdId;
    let importData;

    // ── Parse Input ──
    if (request.isMultipart()) {
      const fileData = await request.file();
      if (!fileData) return reply.status(400).send({ error: 'Keine Datei hochgeladen.' });
      const buffer = await fileData.toBuffer();
      const text = buffer.toString('utf-8').replace(/^\uFEFF/, '').trim();
      try {
        importData = JSON.parse(text);
      } catch {
        return reply.status(400).send({ error: 'Ungültiges JSON-Format.' });
      }
    } else {
      importData = request.body;
    }

    // ── Globale Validierung ──
    if (!importData || typeof importData !== 'object') {
      return reply.status(400).send({ error: 'Ungültiges Backup-Format.' });
    }
    if (importData.source !== 'Zauberjournal') {
      return reply.status(400).send({ error: 'Ungültige Quelle — nur Zauberjournal-Backups werden akzeptiert.' });
    }
    if (importData.type !== 'full_backup') {
      return reply.status(400).send({ error: 'Ungültiger Typ — erwartet "full_backup".' });
    }

    const data = importData.data;
    if (!data || typeof data !== 'object') {
      return reply.status(400).send({ error: 'Keine "data"-Sektion im Backup gefunden.' });
    }

    // ── Limits prüfen ──
    const recipes = Array.isArray(data.recipes) ? data.recipes.slice(0, LIMITS.recipes) : [];
    const standaloneCategories = Array.isArray(data.categories) ? data.categories.slice(0, 200) : [];
    const collections = Array.isArray(data.collections) ? data.collections.slice(0, LIMITS.collections) : [];
    const pantry = Array.isArray(data.pantry) ? data.pantry.slice(0, LIMITS.pantry) : [];
    const mealPlans = Array.isArray(data.meal_plans) ? data.meal_plans.slice(0, LIMITS.mealPlans) : [];
    const shoppingLists = Array.isArray(data.shopping_lists) ? data.shopping_lists.slice(0, LIMITS.shoppingLists) : [];
    const recipeBlocks = Array.isArray(data.recipe_blocks) ? data.recipe_blocks.slice(0, LIMITS.recipeBlocks) : [];
    const ingredientAliases = Array.isArray(data.ingredient_aliases) ? data.ingredient_aliases.slice(0, LIMITS.ingredientAliases) : [];
    const blockedIngredients = Array.isArray(data.blocked_ingredients) ? data.blocked_ingredients.slice(0, LIMITS.blockedIngredients) : [];

    const result = {
      recipes: { imported: 0, skipped: 0, errors: [] },
      categories: { imported: 0, skipped: 0 },
      collections: { imported: 0, updated: 0, skipped: 0, recipes_linked: 0 },
      pantry: { imported: 0, updated: 0, skipped: 0 },
      meal_plans: { imported: 0, skipped: 0, entries_imported: 0 },
      shopping_lists: { imported: 0, items_imported: 0 },
      recipe_blocks: { imported: 0, updated: 0, skipped: 0 },
      ingredient_aliases: { imported: 0, updated: 0, skipped: 0 },
      blocked_ingredients: { imported: 0, skipped: 0 },
    };

    // ── Bilder, die nach der Transaction verarbeitet werden ──
    const pendingImages = [];

    // ── Household-Scope ──
    const hhWhere = householdWhereClause(userId, householdId);

    // ── Kategorie-Cache (um Duplikate zu vermeiden) ──
    const catMap = new Map();
    const existingCats = db.prepare(`SELECT id, name FROM categories WHERE (${hhWhere.clause})`).all(...hhWhere.params);
    for (const c of existingCats) catMap.set(c.name.toLowerCase(), c.id);

    function getOrCreateCategory(cat) {
      const key = cat.name.toLowerCase();
      if (catMap.has(key)) return catMap.get(key);
      const res = db.prepare(
        'INSERT INTO categories (user_id, name, icon, color, is_meal_time, sort_order, household_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(userId, cat.name, cat.icon || '📁', cat.color || '#6366f1', cat.is_meal_time ? 1 : 0, parseInt(cat.sort_order) || 0, householdId || null);
      catMap.set(key, res.lastInsertRowid);
      return res.lastInsertRowid;
    }

    // Map: Rezepttitel (lowercase) → neue ID (nach Import)
    const importedRecipeMap = new Map();
    // Auch bestehende Rezepte für Referenzierung
    const existingRecipes = db.prepare(`SELECT id, title FROM recipes WHERE (${hhWhere.clause})`).all(...hhWhere.params);
    for (const r of existingRecipes) importedRecipeMap.set(r.title.toLowerCase(), r.id);

    // ═══════════════════════════════════════════
    // TRANSACTION: Alles oder Nichts
    // ═══════════════════════════════════════════
    const transaction = db.transaction(() => {

      // ── 0. Standalone-Kategorien (damit is_meal_time/sort_order erhalten bleiben) ──
      for (const cat of standaloneCategories) {
        if (!cat.name || typeof cat.name !== 'string') {
          result.categories.skipped++;
          continue;
        }
        getOrCreateCategory(cat);
        result.categories.imported++;
      }

      // ── 1. Rezepte ──
      for (const recipe of recipes) {
        if (!recipe.title || typeof recipe.title !== 'string') {
          result.recipes.skipped++;
          continue;
        }

        const title = sanitize(recipe.title, 200);

        // Duplikat-Check per Titel
        const existingRecipe = db.prepare(
          `SELECT id FROM recipes WHERE (${hhWhere.clause}) AND LOWER(title) = LOWER(?)`
        ).get(...hhWhere.params, title);
        if (existingRecipe) {
          importedRecipeMap.set(title.toLowerCase(), existingRecipe.id);
          result.recipes.skipped++;
          continue;
        }

        const VALID_DIFFICULTIES = new Set(['easy','medium','hard','einfach','mittel','schwer']);

        const recipeResult = db.prepare(`
          INSERT INTO recipes (user_id, title, description, servings, prep_time, cook_time, total_time, difficulty, source_url, is_favorite, notes, ai_generated, times_cooked, last_cooked_at, household_id, created_by_user_id, calories, protein, carbs, fat, nutrition_note, nutrition_details)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          userId,
          title,
          sanitize(recipe.description || '', 5000),
          Math.min(Math.max(1, parseInt(recipe.servings) || 4), 100),
          Math.min(parseInt(recipe.prep_time) || 0, 10080),
          Math.min(parseInt(recipe.cook_time) || 0, 10080),
          Math.min(parseInt(recipe.total_time) || 0, 10080),
          VALID_DIFFICULTIES.has(recipe.difficulty) ? recipe.difficulty : 'mittel',
          sanitize(recipe.source_url || '', 2000),
          recipe.is_favorite ? 1 : 0,
          sanitize(recipe.notes || '', 5000),
          recipe.ai_generated ? 1 : 0,
          Math.min(parseInt(recipe.times_cooked) || 0, 99999),
          recipe.last_cooked_at || null,
          householdId || null,
          userId,
          parseFloat(recipe.calories) || null,
          parseFloat(recipe.protein) || null,
          parseFloat(recipe.carbs) || null,
          parseFloat(recipe.fat) || null,
          sanitize(recipe.nutrition_note || '', 1000),
          typeof recipe.nutrition_details === 'string' ? sanitize(recipe.nutrition_details, 10000) : (recipe.nutrition_details ? JSON.stringify(recipe.nutrition_details) : null),
        );

        const newRecipeId = recipeResult.lastInsertRowid;
        importedRecipeMap.set(title.toLowerCase(), newRecipeId);

        // Kategorien
        if (Array.isArray(recipe.categories)) {
          for (const cat of recipe.categories.slice(0, LIMITS.maxCategoriesPerRecipe)) {
            if (!cat.name) continue;
            const catId = getOrCreateCategory(cat);
            db.prepare('INSERT OR IGNORE INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(newRecipeId, catId);
          }
        }

        // Zutaten
        if (Array.isArray(recipe.ingredients)) {
          for (const ing of recipe.ingredients.slice(0, LIMITS.maxIngredientsPerRecipe)) {
            if (!ing.name) continue;
            db.prepare(
              'INSERT INTO ingredients (recipe_id, name, amount, unit, group_name, sort_order, is_optional, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            ).run(
              newRecipeId,
              sanitize(ing.name, 200),
              parseFloat(ing.amount) || null,
              sanitize(ing.unit || '', 50),
              sanitize(ing.group_name || '', 100),
              parseInt(ing.sort_order) || 0,
              ing.is_optional ? 1 : 0,
              sanitize(ing.notes || '', 500),
            );
          }
        }

        // Kochschritte
        if (Array.isArray(recipe.steps)) {
          for (const step of recipe.steps.slice(0, LIMITS.maxStepsPerRecipe)) {
            if (!step.instruction) continue;
            db.prepare(
              'INSERT INTO cooking_steps (recipe_id, step_number, title, instruction, duration_minutes) VALUES (?, ?, ?, ?, ?)'
            ).run(
              newRecipeId,
              parseInt(step.step_number) || 0,
              sanitize(step.title || '', 200),
              sanitize(step.instruction, 5000),
              parseInt(step.duration_minutes) || null,
            );
          }
        }

        // Bild vormerken (wird nach Transaction verarbeitet)
        if (recipe.image_base64 && recipe.image_mime && typeof recipe.image_base64 === 'string' && recipe.image_base64.length < 14 * 1024 * 1024) {
          pendingImages.push({ recipeId: newRecipeId, base64: recipe.image_base64, mime: recipe.image_mime });
        }

        result.recipes.imported++;
      }

      // ── 2. Sammlungen ──
      for (const col of collections) {
        if (!col.name || typeof col.name !== 'string') {
          result.collections.skipped++;
          continue;
        }

        const name = sanitize(col.name, 100);
        const icon = sanitize(col.icon || '📁', 10);
        const color = /^#[0-9a-fA-F]{6}$/.test(col.color) ? col.color : '#6366f1';
        const sortOrder = typeof col.sort_order === 'number' ? Math.min(Math.max(Math.floor(col.sort_order), 0), 9999) : 0;

        const existing = db.prepare(
          `SELECT id FROM collections WHERE (${hhWhere.clause}) AND name = ? COLLATE NOCASE`
        ).get(...hhWhere.params, name);

        let collectionId;
        if (existing) {
          db.prepare(
            'UPDATE collections SET icon = ?, color = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).run(icon, color, sortOrder, existing.id);
          collectionId = existing.id;
          result.collections.updated++;
        } else {
          const res = db.prepare(
            'INSERT INTO collections (user_id, name, icon, color, sort_order, household_id) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(userId, name, icon, color, sortOrder, householdId || null);
          collectionId = res.lastInsertRowid;
          result.collections.imported++;
        }

        // Rezepte verknüpfen per Titel
        if (Array.isArray(col.recipe_titles)) {
          for (const title of col.recipe_titles.slice(0, 200)) {
            if (typeof title !== 'string') continue;
            const recipeId = importedRecipeMap.get(title.toLowerCase());
            if (recipeId) {
              const res = db.prepare(
                'INSERT OR IGNORE INTO recipe_collections (recipe_id, collection_id) VALUES (?, ?)'
              ).run(recipeId, collectionId);
              if (res.changes > 0) result.collections.recipes_linked++;
            }
          }
        }
      }

      // ── 3. Vorratsschrank ──
      for (const item of pantry) {
        if (!item.ingredient_name || typeof item.ingredient_name !== 'string') {
          result.pantry.skipped++;
          continue;
        }

        const name = sanitize(item.ingredient_name, 200);
        const existingItem = db.prepare(
          `SELECT id, amount FROM pantry WHERE (${hhWhere.clause}) AND LOWER(ingredient_name) = LOWER(?)`
        ).get(...hhWhere.params, name);

        if (existingItem) {
          db.prepare('UPDATE pantry SET amount = amount + ? WHERE id = ?').run(
            Math.min(Math.max(parseFloat(item.amount) || 1, 0), 99999),
            existingItem.id,
          );
          result.pantry.updated++;
        } else {
          const expiryDate = (item.expiry_date && /^\d{4}-\d{2}-\d{2}$/.test(item.expiry_date)) ? item.expiry_date : null;
          db.prepare(
            'INSERT INTO pantry (user_id, ingredient_name, amount, unit, category, expiry_date, notes, is_permanent, household_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(
            userId, name,
            Math.min(Math.max(parseFloat(item.amount) || 1, 0), 99999),
            sanitize(item.unit || 'Stk', 50),
            sanitize(item.category || 'Sonstiges', 100),
            expiryDate,
            sanitize(item.notes || '', 500),
            item.is_permanent ? 1 : 0,
            householdId || null,
          );
          result.pantry.imported++;
        }
      }

      // ── 4. Wochenpläne ──
      // Meal-time Kategorien des Users für Auflösung
      const userMealCategories = getMealTimeCategories(userId);
      // Map alte meal_type Strings → category_id (backward-compat)
      const mealTypeAliasMap = {
        fruehstueck: 'Frühstück', mittag: 'Mittagessen', abendessen: 'Abendessen', snack: 'Snack',
        breakfast: 'Frühstück', lunch: 'Mittagessen', dinner: 'Abendessen',
      };

      function resolveCategoryId(entry) {
        // 1. Direkte category_name aus neuem Export
        if (entry.category_name) {
          const cat = userMealCategories.find(c => c.name.toLowerCase() === entry.category_name.toLowerCase());
          if (cat) return cat.id;
        }
        // 2. Alte meal_type Strings → Alias → Kategorie
        if (entry.meal_type && mealTypeAliasMap[entry.meal_type]) {
          const alias = mealTypeAliasMap[entry.meal_type];
          const cat = userMealCategories.find(c => c.name.toLowerCase() === alias.toLowerCase());
          if (cat) return cat.id;
        }
        // 3. Fallback: erste meal-time Kategorie
        return userMealCategories[0]?.id || null;
      }

      for (const plan of mealPlans) {
        if (!plan.week_start || !/^\d{4}-\d{2}-\d{2}$/.test(plan.week_start)) {
          result.meal_plans.skipped++;
          continue;
        }

        // Duplikat-Check
        const existingPlan = db.prepare(
          `SELECT id FROM meal_plans WHERE (${hhWhere.clause}) AND week_start = ?`
        ).get(...hhWhere.params, plan.week_start);
        if (existingPlan) {
          result.meal_plans.skipped++;
          continue;
        }

        // start_date/end_date validieren (optionale Felder aus neuem Export-Format)
        const startDate = plan.start_date && /^\d{4}-\d{2}-\d{2}$/.test(plan.start_date) ? plan.start_date : null;
        const endDate = plan.end_date && /^\d{4}-\d{2}-\d{2}$/.test(plan.end_date) ? plan.end_date : null;

        const planResult = db.prepare(
          'INSERT INTO meal_plans (user_id, week_start, start_date, end_date, household_id) VALUES (?, ?, ?, ?, ?)'
        ).run(userId, plan.week_start, startDate, endDate, householdId || null);
        const newPlanId = planResult.lastInsertRowid;
        result.meal_plans.imported++;

        if (Array.isArray(plan.entries)) {
          for (const entry of plan.entries.slice(0, 50)) {
            // Rezept per Titel finden
            let recipeId = null;
            if (entry.recipe_title) {
              recipeId = importedRecipeMap.get(entry.recipe_title.toLowerCase()) || null;
            }
            if (!recipeId && entry.recipe_id) {
              // Fallback: direkte ID wenn vorhanden und dem User gehört
              const check = db.prepare(`SELECT id FROM recipes WHERE id = ? AND (${hhWhere.clause})`).get(entry.recipe_id, ...hhWhere.params);
              if (check) recipeId = check.id;
            }
            if (!recipeId) continue;

            const categoryId = resolveCategoryId(entry);
            // backward-compat: meal_type als denormalisiertes Feld mitschreiben
            const mealType = entry.meal_type || entry.category_name || 'mittag';
            // plan_date aus neuem Export-Format (optional)
            const planDate = entry.plan_date && /^\d{4}-\d{2}-\d{2}$/.test(entry.plan_date) ? entry.plan_date : null;

            db.prepare(
              'INSERT INTO meal_plan_entries (meal_plan_id, recipe_id, day_of_week, plan_date, meal_type, category_id, servings, is_cooked) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            ).run(
              newPlanId, recipeId,
              Math.min(Math.max(parseInt(entry.day_of_week) || 0, 0), 6),
              planDate,
              mealType,
              categoryId,
              Math.min(Math.max(parseInt(entry.servings) || 2, 1), 100),
              entry.is_cooked ? 1 : 0,
            );
            result.meal_plans.entries_imported++;
          }
        }
      }

      // ── 5. Einkaufslisten (immer als inaktiv importieren) ──
      for (const list of shoppingLists) {
        const listResult = db.prepare(
          'INSERT INTO shopping_lists (user_id, name, is_active, household_id) VALUES (?, ?, 0, ?)'
        ).run(userId, sanitize(list.name || 'Import', 200), householdId || null);
        const newListId = listResult.lastInsertRowid;
        result.shopping_lists.imported++;

        if (Array.isArray(list.items)) {
          for (const item of list.items.slice(0, 500)) {
            if (!item.ingredient_name) continue;

            let recipeId = null;
            if (item.recipe_title) {
              recipeId = importedRecipeMap.get(item.recipe_title.toLowerCase()) || null;
            }

            db.prepare(
              'INSERT INTO shopping_list_items (shopping_list_id, ingredient_name, amount, unit, is_checked, recipe_id) VALUES (?, ?, ?, ?, ?, ?)'
            ).run(
              newListId,
              sanitize(item.ingredient_name, 200),
              parseFloat(item.amount) || 1,
              sanitize(item.unit || '', 50),
              item.is_checked ? 1 : 0,
              recipeId,
            );
            result.shopping_lists.items_imported++;
          }
        }
      }

      // ── 6. Rezept-Sperren ──
      for (const block of recipeBlocks) {
        if (!block.recipe_title) {
          result.recipe_blocks.skipped++;
          continue;
        }

        const recipeId = importedRecipeMap.get(block.recipe_title.toLowerCase());
        if (!recipeId) {
          result.recipe_blocks.skipped++;
          continue;
        }

        const existingBlock = db.prepare(
          `SELECT id FROM recipe_blocks WHERE (${hhWhere.clause}) AND recipe_id = ?`
        ).get(...hhWhere.params, recipeId);

        if (existingBlock) {
          db.prepare(
            'UPDATE recipe_blocks SET blocked_until = ?, reason = ? WHERE id = ?'
          ).run(block.blocked_until || null, sanitize(block.reason || '', 500), existingBlock.id);
          result.recipe_blocks.updated++;
        } else {
          db.prepare(
            'INSERT INTO recipe_blocks (user_id, household_id, recipe_id, blocked_until, reason) VALUES (?, ?, ?, ?, ?)'
          ).run(userId, householdId || null, recipeId, block.blocked_until || null, sanitize(block.reason || '', 500));
          result.recipe_blocks.imported++;
        }
      }

      // ── 7. Zutaten-Aliase ──
      for (const alias of ingredientAliases) {
        if (!alias.canonical_name || !alias.alias_name) {
          result.ingredient_aliases.skipped++;
          continue;
        }

        const existing = db.prepare(
          `SELECT id FROM ingredient_aliases WHERE (${hhWhere.clause}) AND alias_name = ? COLLATE NOCASE`
        ).get(...hhWhere.params, alias.alias_name);

        if (existing) {
          db.prepare('UPDATE ingredient_aliases SET canonical_name = ? WHERE id = ?').run(
            sanitize(alias.canonical_name, 200), existing.id,
          );
          result.ingredient_aliases.updated++;
        } else {
          db.prepare(
            'INSERT INTO ingredient_aliases (user_id, household_id, canonical_name, alias_name) VALUES (?, ?, ?, ?)'
          ).run(userId, householdId || null, sanitize(alias.canonical_name, 200), sanitize(alias.alias_name, 200));
          result.ingredient_aliases.imported++;
        }
      }

      // ── 8. Geblockte Zutaten ──
      for (const name of blockedIngredients) {
        if (typeof name !== 'string' || !name.trim()) {
          result.blocked_ingredients.skipped++;
          continue;
        }

        const res = db.prepare(
          'INSERT OR IGNORE INTO blocked_ingredients (user_id, household_id, ingredient_name) VALUES (?, ?, ?)'
        ).run(userId, householdId || null, sanitize(name, 200));

        if (res.changes > 0) {
          result.blocked_ingredients.imported++;
        } else {
          result.blocked_ingredients.skipped++;
        }
      }
    });

    // Transaction ausführen
    transaction();

    // ── Bilder asynchron verarbeiten (außerhalb der Transaction) ──
    if (pendingImages.length > 0) {
      const uploadsDir = resolve(config.upload.path, 'recipes');
      if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

      for (const { recipeId, base64 } of pendingImages) {
        try {
          const imgBuffer = Buffer.from(base64, 'base64');
          const filename = `${generateId()}.webp`;
          const filePath = join(uploadsDir, filename);
          const processed = await sharp(imgBuffer)
            .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 82 })
            .toBuffer();
          writeFileSync(filePath, processed);
          db.prepare('UPDATE recipes SET image_url = ? WHERE id = ?').run(`/api/uploads/recipes/${filename}`, recipeId);
        } catch { /* Bild-Verarbeitung fehlgeschlagen */ }
      }
    }

    // ── Zusammenfassung ──
    const totalImported = Object.values(result).reduce((sum, r) => sum + (r.imported || 0), 0);
    const totalSkipped = Object.values(result).reduce((sum, r) => sum + (r.skipped || 0), 0);

    return {
      message: `Backup-Import abgeschlossen: ${totalImported} Einträge importiert, ${totalSkipped} übersprungen.`,
      details: result,
    };
  });
}
