/**
 * ============================================
 * Pantry-Allokation Service
 * ============================================
 * Berechnet, welche Vorräte für die Rezepte eines Wochenplans
 * benötigt werden und welche "unassigned" (frei verfügbar) sind.
 *
 * Wird sowohl von der Pantry-Rezeptansicht als auch vom
 * Vorratscheck der Einkaufsliste verwendet.
 */

import db, { householdWhereClause } from '../config/database.js';
import { scaleIngredient, convertToBaseUnit, normalizeUnit, unitsCompatible } from '../utils/helpers.js';
import { estimateConversion } from '../utils/ingredient-weights.js';

/** Wochentag-Label (Montag = 0) */
const DAY_LABELS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

/**
 * Berechnet die Pantry-Allokation für einen Wochenplan.
 *
 * @param {number} userId - ID des Benutzers
 * @param {number} mealPlanId - ID des Wochenplans
 * @returns {{ recipes: Array, unassigned: Array }}
 */
export function calculatePantryAllocations(userId, mealPlanId, householdId) {
  // 1. Alle Pantry-Items laden
  const pWhere = householdWhereClause(userId, householdId);
  const pantryItems = db.prepare(
    `SELECT * FROM pantry WHERE (${pWhere.clause}) AND (amount > 0 OR is_permanent = 1) ORDER BY category, ingredient_name`
  ).all(...pWhere.params);

  // 2. Ungekochte Einträge laden (mit Rezept-Infos + Kategorie)
  const entries = db.prepare(`
    SELECT mpe.id as entry_id, mpe.recipe_id, mpe.day_of_week, mpe.meal_type,
           mpe.category_id, mpe.servings as planned_servings,
           r.title as recipe_title, r.image_url as recipe_image_url, r.servings as original_servings,
           mcat.name as category_name, mcat.icon as category_icon,
           mcat.color as category_color, mcat.sort_order as category_sort_order
    FROM meal_plan_entries mpe
    JOIN recipes r ON r.id = mpe.recipe_id
    LEFT JOIN categories mcat ON mcat.id = mpe.category_id
    WHERE mpe.meal_plan_id = ? AND mpe.is_cooked = 0
    ORDER BY mpe.day_of_week, COALESCE(mcat.sort_order, 999)
  `).all(mealPlanId);

  // 3. Zutaten für alle Rezepte laden
  const recipeIds = [...new Set(entries.map(e => e.recipe_id))];
  let allIngredients = [];
  if (recipeIds.length) {
    const placeholders = recipeIds.map(() => '?').join(',');
    allIngredients = db.prepare(
      `SELECT * FROM ingredients WHERE recipe_id IN (${placeholders}) AND is_optional = 0 ORDER BY recipe_id, group_name, sort_order`
    ).all(...recipeIds);
  }

  // Index: recipe_id → ingredients[]
  const ingredientsByRecipe = {};
  for (const ing of allIngredients) {
    if (!ingredientsByRecipe[ing.recipe_id]) ingredientsByRecipe[ing.recipe_id] = [];
    ingredientsByRecipe[ing.recipe_id].push(ing);
  }

  // 4. Alias-Tabelle laden: alias_name → canonical_name
  const aliasWhere = householdWhereClause(userId, householdId);
  const aliasRows = db.prepare(
    `SELECT alias_name, canonical_name FROM ingredient_aliases WHERE ${aliasWhere.clause}`
  ).all(...aliasWhere.params);
  const aliasMap = new Map();
  for (const row of aliasRows) {
    aliasMap.set(row.alias_name.toLowerCase(), row.canonical_name.toLowerCase());
  }

  /** Zutatname über Alias-Map auflösen */
  function resolveAlias(name) {
    return aliasMap.get(name.toLowerCase()) || name.toLowerCase();
  }

  // 5. Gesperrte Zutaten laden
  const blockedWhere = householdWhereClause(userId, householdId);
  const blockedRows = db.prepare(
    `SELECT ingredient_name FROM blocked_ingredients WHERE ${blockedWhere.clause}`
  ).all(...blockedWhere.params);
  const blockedSet = new Set(blockedRows.map(r => r.ingredient_name.toLowerCase()));

  /** Prüft ob eine Zutat (oder ihr Alias) gesperrt ist */
  function isBlocked(name) {
    const resolved = resolveAlias(name);
    return blockedSet.has(name.toLowerCase()) || blockedSet.has(resolved);
  }

  // 6. Verfügbaren Vorrat als Pool aufbauen (case-insensitive key → Pool-Objekt)
  const pantryPool = {};
  for (const item of pantryItems) {
    const key = resolveAlias(item.ingredient_name);
    const base = convertToBaseUnit(item.amount, item.unit);
    pantryPool[key] = {
      pantry_id: item.id,
      original_amount: item.amount,
      original_unit: item.unit,
      base_amount: item.is_permanent ? Infinity : base.amount,
      base_unit: base.unit,
      remaining: item.is_permanent ? Infinity : base.amount,
      is_permanent: item.is_permanent,
      category: item.category,
      expiry_date: item.expiry_date,
      notes: item.notes,
      ingredient_name: item.ingredient_name,
    };
  }

  // 7. Entries chronologisch durchlaufen, Zutaten allozieren
  const sortedEntries = entries.sort((a, b) => {
    if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
    return (a.category_sort_order ?? 999) - (b.category_sort_order ?? 999);
  });

  const recipeResults = [];

  for (const entry of sortedEntries) {
    const recipeIngredients = ingredientsByRecipe[entry.recipe_id] || [];
    const ingredientResults = [];

    for (const ing of recipeIngredients) {
      // Gesperrte Zutat?
      if (isBlocked(ing.name)) {
        ingredientResults.push({
          name: ing.name,
          needed_amount: scaleIngredient(ing.amount, entry.original_servings, entry.planned_servings) || 0,
          needed_unit: ing.unit || '',
          is_blocked: true,
          is_covered: false,
          is_partial: false,
          is_missing: false,
          is_permanent: false,
          unit_mismatch: false,
        });
        continue;
      }

      // Skalieren
      const scaledAmount = scaleIngredient(ing.amount, entry.original_servings, entry.planned_servings);
      // In Basiseinheit
      const base = convertToBaseUnit(scaledAmount || 0, ing.unit);
      let neededAmount = base.amount;
      const neededUnit = base.unit;

      // Pantry-Match suchen (mit Alias-Auflösung)
      const key = resolveAlias(ing.name);
      const pool = pantryPool[key];

      let covered = 0;
      let pantryId = null;
      let compatible = false;
      let unitMismatch = false;

      if (pool) {
        const compat = unitsCompatible(neededUnit, pool.base_unit);
        if (compat.compatible) {
          compatible = true;
          pantryId = pool.pantry_id;
          const available = pool.remaining;
          covered = Math.min(neededAmount, available);
          if (!pool.is_permanent) {
            pool.remaining = Math.max(0, pool.remaining - neededAmount);
          }
        } else {
          // Küchenstandard-Tabelle für Stück↔g, Zehe↔g etc.
          const estimate = estimateConversion(ing.name, neededUnit, pool.base_unit);
          if (estimate) {
            compatible = true;
            pantryId = pool.pantry_id;
            const neededInPoolUnit = neededAmount * estimate.factor;
            const availableInPoolUnit = pool.remaining;
            const coveredInPoolUnit = Math.min(neededInPoolUnit, availableInPoolUnit);
            // Zurück in Rezept-Einheit
            const ratio = neededInPoolUnit > 0 ? coveredInPoolUnit / neededInPoolUnit : 0;
            covered = neededAmount * ratio;
            if (!pool.is_permanent) {
              pool.remaining = Math.max(0, pool.remaining - neededInPoolUnit);
            }
          } else {
            unitMismatch = true;
            pantryId = pool.pantry_id;
          }
        }
      }

      ingredientResults.push({
        name: ing.name,
        needed_amount: scaledAmount || 0,
        needed_unit: ing.unit || '',
        needed_base_amount: neededAmount,
        needed_base_unit: neededUnit,
        covered_base_amount: covered,
        pantry_id: pantryId,
        is_covered: (compatible && covered >= neededAmount) || unitMismatch,
        is_partial: compatible && covered > 0 && covered < neededAmount,
        is_missing: (!compatible && !unitMismatch) || (compatible && covered === 0),
        is_permanent: pool?.is_permanent || false,
        unit_mismatch: unitMismatch,
        pantry_amount: unitMismatch ? pool?.original_amount : undefined,
        pantry_unit: unitMismatch ? pool?.original_unit : undefined,
      });
    }

    recipeResults.push({
      entry_id: entry.entry_id,
      recipe_id: entry.recipe_id,
      recipe_title: entry.recipe_title,
      recipe_image_url: entry.recipe_image_url,
      day_of_week: entry.day_of_week,
      day_label: DAY_LABELS[entry.day_of_week] || `Tag ${entry.day_of_week}`,
      category_id: entry.category_id,
      category_name: entry.category_name || entry.meal_type || 'Unbekannt',
      category_icon: entry.category_icon || '',
      category_color: entry.category_color || '',
      meal_type: entry.meal_type, // backward compat (denormalisiert)
      meal_type_label: entry.category_name || entry.meal_type || 'Unbekannt', // backward compat für shopping.js
      servings: entry.planned_servings,
      ingredients: ingredientResults,
    });
  }

  // 8. Unassigned: Pantry-Items mit Restmengen
  const unassigned = [];
  for (const item of pantryItems) {
    const key = resolveAlias(item.ingredient_name);
    const pool = pantryPool[key];
    if (!pool) continue;

    if (pool.is_permanent) {
      unassigned.push({ ...item, remaining_amount: item.amount });
    } else if (pool.remaining > 0) {
      const origBase = convertToBaseUnit(item.amount, item.unit);
      const ratio = origBase.amount > 0 ? pool.remaining / origBase.amount : 0;
      const remainingInOriginal = Math.round(item.amount * ratio * 100) / 100;
      if (remainingInOriginal > 0) {
        unassigned.push({ ...item, remaining_amount: remainingInOriginal });
      }
    }
  }

  return {
    recipes: recipeResults,
    unassigned,
    pantryPool,
    resolveAlias,
  };
}

export { DAY_LABELS };
