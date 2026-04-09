/**
 * ============================================
 * Einkaufslisten-Service
 * ============================================
 *
 * Generiert optimierte Einkaufslisten aus dem Wochenplan:
 * - Fasst gleiche Zutaten zusammen (identisch + KI-Aggregation)
 * - Rechnet Mengen um (Portionsanpassung)
 * - Zieht Vorratsschrank-Bestände ab
 * - Nutzt KI für intelligente Zusammenfassung verschiedener Einheiten
 */

import db, { householdWhereClause } from '../config/database.js';
import { normalizeUnit, scaleIngredient, convertToBaseUnit, unitsCompatible, comparePantryAmount } from '../utils/helpers.js';
import { parsePackageSize } from './rewe-api.js';
import { getAIProvider } from './ai/provider.js';
import { getSetting } from '../config/settings.js';

/**
 * KI-gestützte Aggregation der Einkaufsliste.
 * Fasst gleiche Zutaten mit verschiedenen Einheiten intelligent zusammen.
 * Fallback: nur identische Einheiten addieren.
 */
async function aiAggregateItems(itemsList) {
  // Schritt 1: Identische Zutaten+Einheiten einfach addieren
  const simpleMap = new Map();
  for (const item of itemsList) {
    const key = `${item.name.toLowerCase()}_${(item.unit || '').toLowerCase()}`;
    if (simpleMap.has(key)) {
      const existing = simpleMap.get(key);
      existing.amount = (existing.amount || 0) + (item.amount || 0);
      existing.recipes.push(...item.recipes);
      for (const id of item.recipeIds) {
        if (!existing.recipeIds.includes(id)) existing.recipeIds.push(id);
      }
    } else {
      simpleMap.set(key, { ...item, recipes: [...item.recipes], recipeIds: [...item.recipeIds] });
    }
  }

  const preAggregated = [...simpleMap.values()];

  // Prüfen ob überhaupt Zusammenfassung nötig (gleiche Zutat mit verschiedenen Einheiten?)
  const nameCount = new Map();
  for (const item of preAggregated) {
    const key = item.name.toLowerCase();
    nameCount.set(key, (nameCount.get(key) || 0) + 1);
  }
  const needsAI = [...nameCount.values()].some(c => c > 1);

  if (!needsAI) {
    return preAggregated; // Keine Duplikate → KI nicht nötig
  }

  // Schritt 2: KI zusammenfassen lassen
  try {
    const ai = getAIProvider({ simple: true });

    // Nur die duplizierten Zutaten an die KI schicken
    const duplicateNames = new Set([...nameCount.entries()].filter(([, c]) => c > 1).map(([n]) => n));
    const toMerge = preAggregated.filter(i => duplicateNames.has(i.name.toLowerCase()));
    const keepAsIs = preAggregated.filter(i => !duplicateNames.has(i.name.toLowerCase()));

    const prompt = `Fasse diese Einkaufslisten-Einträge zusammen. Gleiche Zutaten mit verschiedenen Einheiten sollen zu EINEM Eintrag werden.
Wähle die natürlichste Einkaufseinheit:
- Zählbare Zutaten (Zwiebel, Tomate, Paprika, Ei, Brötchen etc.) → Stückzahl (unit: "")
- Gewichtsware (Fleisch, Käse, Mehl etc.) → g oder kg
- Flüssigkeiten → ml oder l

Eingabe:
${JSON.stringify(toMerge.map(i => ({ name: i.name, amount: i.amount, unit: i.unit })), null, 2)}

Antworte als JSON-Array:
[{ "name": "Zutatename", "amount": 3, "unit": "" }]

Regeln:
- Jede Zutat nur EINMAL in der Ausgabe
- Mengen sinnvoll umrechnen (z.B. 150g Zwiebel ≈ 1-2 Zwiebeln → 2 Zwiebeln)
- Bei Unsicherheit lieber aufrunden
- name muss exakt einem der Eingabe-Namen entsprechen`;

    const merged = await ai.chatJSON(prompt, { temperature: 0.1, maxTokens: 2048 });

    if (!Array.isArray(merged)) {
      console.warn('⚠️ KI-Aggregation: Unerwartetes Format, nutze Fallback');
      return preAggregated;
    }

    // KI-Ergebnis mit Rezept-Referenzen anreichern
    const result = [...keepAsIs];
    for (const aiItem of merged) {
      // Alle Originaleinträge dieser Zutat finden
      const originals = toMerge.filter(i => i.name.toLowerCase() === aiItem.name.toLowerCase());
      const allRecipes = originals.flatMap(o => o.recipes);
      const allRecipeIds = [...new Set(originals.flatMap(o => o.recipeIds))];
      const isOptional = originals.every(o => o.isOptional);

      result.push({
        name: aiItem.name || originals[0]?.name,
        amount: aiItem.amount,
        unit: aiItem.unit || '',
        recipes: allRecipes,
        recipeIds: allRecipeIds,
        isOptional,
      });
    }

    console.log(`🤖 KI-Aggregation: ${preAggregated.length} → ${result.length} Einträge`);
    return result;
  } catch (err) {
    console.warn('⚠️ KI-Aggregation fehlgeschlagen, nutze einfache Zusammenfassung:', err.message);
    return preAggregated;
  }
}

/**
 * Prüft ob zwei Zutatennamen potentiell dasselbe Produkt beschreiben.
 * Einfache Heuristik für Vorfilterung (ohne AI):
 * - Stemming: Entfernt typische deutsche Endungen (Plural, Adjektive)
 * - Wort-Überlappung: Mindestens 1 signifikantes Wort muss übereinstimmen
 * - Bekannte Synonyme
 */
const INGREDIENT_SYNONYMS = new Map([
  ['sahne', 'schlagsahne'], ['schlagsahne', 'sahne'],
  ['frühlingszwiebel', 'lauchzwiebel'], ['lauchzwiebel', 'frühlingszwiebel'],
  ['möhre', 'karotte'], ['karotte', 'möhre'],
  ['möhren', 'karotten'], ['karotten', 'möhren'],
  ['porree', 'lauch'], ['lauch', 'porree'],
  ['champignon', 'pilz'], ['pilz', 'champignon'],
  ['champignons', 'pilze'], ['pilze', 'champignons'],
  ['joghurt', 'yoghurt'], ['yoghurt', 'joghurt'],
  ['paprikapulver', 'paprika edelsüß'],
]);

function stemGerman(word) {
  return word
    .replace(/en$/, '')    // Tomaten → Tomat, Zwiebeln → Zwiebel (nahe genug)
    .replace(/n$/, '')     // Kartoffeln → Kartoffel
    .replace(/e$/, '')     // Tomate → Tomat
    .replace(/er$/, '')    // roter → rot
    .replace(/es$/, '')    // rotes → rot
    .replace(/s$/, '');    // Eier → Eier (kein Effekt), allgemein Plural-s
}

function maybeSameIngredient(nameA, nameB) {
  const a = nameA.toLowerCase().trim();
  const b = nameB.toLowerCase().trim();
  if (a === b) return false; // Exakt gleich = bereits zusammengefasst in simpleMap

  // Synonym-Check
  if (INGREDIENT_SYNONYMS.get(a) === b) return true;

  // Stemming-Check: gleicher Stamm?
  const stemA = stemGerman(a);
  const stemB = stemGerman(b);
  if (stemA === stemB && stemA.length >= 3) return true;

  // Wort-Überlappung bei mehrwörtigen Namen
  const wordsA = a.split(/\s+/).map(stemGerman).filter(w => w.length >= 3);
  const wordsB = b.split(/\s+/).map(stemGerman).filter(w => w.length >= 3);
  if (wordsA.length > 0 && wordsB.length > 0) {
    // Mindestens ein signifikantes Wort muss übereinstimmen
    for (const wa of wordsA) {
      for (const wb of wordsB) {
        if (wa === wb) return true;
      }
    }
  }

  return false;
}

/**
 * KI-gestützte intelligente Deduplizierung.
 * Erkennt semantische Duplikate (Plural/Singular, Synonyme, umgestellte Wörter)
 * und führt sie zusammen. Ersetzt die Standard-Aggregation wenn aktiviert.
 *
 * Optimierung: Prüft vorab per Heuristik ob überhaupt Duplikat-Kandidaten existieren.
 * Wenn keine potentiellen Duplikate gefunden werden, wird die AI nicht aufgerufen
 * und stattdessen direkt die einfache Aggregation (aiAggregateItems) verwendet.
 */
async function aiSmartDeduplicateItems(itemsList) {
  // Schritt 1: Identische Zutaten+Einheiten einfach addieren (wie in aiAggregateItems)
  const simpleMap = new Map();
  for (const item of itemsList) {
    const key = `${item.name.toLowerCase()}_${(item.unit || '').toLowerCase()}`;
    if (simpleMap.has(key)) {
      const existing = simpleMap.get(key);
      existing.amount = (existing.amount || 0) + (item.amount || 0);
      existing.recipes.push(...item.recipes);
      for (const id of item.recipeIds) {
        if (!existing.recipeIds.includes(id)) existing.recipeIds.push(id);
      }
    } else {
      simpleMap.set(key, { ...item, recipes: [...item.recipes], recipeIds: [...item.recipeIds] });
    }
  }

  const preAggregated = [...simpleMap.values()];

  // Weniger als 2 Items → nichts zu deduplizieren
  if (preAggregated.length < 2) {
    return preAggregated;
  }

  // Schritt 2: Vorab-Heuristik – Gibt es überhaupt potentielle Duplikate?
  // Prüft per Stemming, Wort-Überlappung und Synonym-Tabelle ob AI nötig ist.
  let hasCandidates = false;
  const names = preAggregated.map(i => i.name);
  outer: for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if (maybeSameIngredient(names[i], names[j])) {
        console.log(`🧠 Smart-Dedup: Potentielles Duplikat erkannt: "${names[i]}" ↔ "${names[j]}" → KI wird aufgerufen`);
        hasCandidates = true;
        break outer;
      }
    }
  }

  if (!hasCandidates) {
    // Noch prüfen ob verschiedene Einheiten vorliegen (wie in aiAggregateItems)
    const nameCount = new Map();
    for (const item of preAggregated) {
      const key = item.name.toLowerCase();
      nameCount.set(key, (nameCount.get(key) || 0) + 1);
    }
    const needsUnitMerge = [...nameCount.values()].some(c => c > 1);

    if (!needsUnitMerge) {
      console.log(`🧠 Smart-Dedup: Keine Duplikat-Kandidaten erkannt → KI-Aufruf übersprungen (${preAggregated.length} Items)`);
      return preAggregated;
    }
  }

  // Schritt 3: KI zur semantischen Deduplizierung aufrufen
  try {
    const ai = getAIProvider({ simple: true });

    const prompt = `Du bist ein Experte für Einkaufslisten-Optimierung. Fasse diese Einkaufslisten-Einträge intelligent zusammen.

## Aufgabe
1. Erkenne semantisch identische Zutaten und führe sie zusammen:
   - Plural/Singular: "Tomate" = "Tomaten"
   - Wortreihenfolge: "rote Paprika" = "Paprika rot"
   - Synonyme: "Sahne" = "Schlagsahne" (wenn im Kochkontext gleich)
   - Schreibvarianten: "Frühlingszwiebel" = "Lauchzwiebel"
2. Zutaten mit verschiedenen Einheiten zu EINEM Eintrag zusammenfassen
3. Die natürlichste Einkaufseinheit wählen:
   - Zählbare Zutaten (Zwiebel, Tomate, Paprika, Ei) → Stückzahl (unit: "")
   - Gewichtsware (Fleisch, Käse, Mehl) → g oder kg
   - Flüssigkeiten → ml oder l

## Eingabe
${JSON.stringify(preAggregated.map(i => ({ name: i.name, amount: i.amount, unit: i.unit })), null, 2)}

## Antwortformat
Antworte als JSON-Array:
[{
  "name": "Tomate",
  "amount": 5,
  "unit": "",
  "mergedFrom": ["Tomate", "Tomaten"],
  "mergeReason": "Plural/Singular desselben Produkts"
}]

## Regeln
- Jede Zutat nur EINMAL in der Ausgabe
- "mergedFrom" enthält alle originalen Namen die zusammengeführt wurden (auch wenn es nur einer ist)
- "mergeReason" nur setzen wenn tatsächlich zusammengeführt wurde, sonst null
- Bei Unsicherheit ob zwei Zutaten wirklich dasselbe sind: NICHT zusammenführen
- Mengen sinnvoll umrechnen (z.B. 150g Zwiebel ≈ 1-2 Zwiebeln → 2 Zwiebeln)
- Bei Unsicherheit lieber aufrunden
- "name" muss exakt einem der Eingabe-Namen entsprechen (bevorzuge den gebräuchlicheren)
- Verschiedene Zutaten die ähnlich klingen NICHT zusammenführen (z.B. "Lauch" ≠ "Knoblauch")`;

    const merged = await ai.chatJSON(prompt, { temperature: 0.1, maxTokens: 4096 });

    if (!Array.isArray(merged)) {
      console.warn('⚠️ KI-Smart-Dedup: Unerwartetes Format, nutze Standard-Aggregation');
      return aiAggregateItems(itemsList);
    }

    // KI-Ergebnis mit Rezept-Referenzen und Metadaten anreichern
    const result = [];
    for (const aiItem of merged) {
      const mergedNames = (aiItem.mergedFrom || [aiItem.name]).map(n => n.toLowerCase());

      // Alle Originaleinträge finden die zusammengeführt wurden
      const originals = preAggregated.filter(i => mergedNames.includes(i.name.toLowerCase()));
      if (originals.length === 0) {
        // Fallback: Name direkt suchen
        const fallback = preAggregated.find(i => i.name.toLowerCase() === aiItem.name?.toLowerCase());
        if (fallback) originals.push(fallback);
      }

      const allRecipes = originals.flatMap(o => o.recipes);
      const allRecipeIds = [...new Set(originals.flatMap(o => o.recipeIds))];
      const isOptional = originals.length > 0 ? originals.every(o => o.isOptional) : false;

      // Dedup-Note generieren (nur wenn tatsächlich zusammengeführt)
      let dedupNote = null;
      if (aiItem.mergeReason && originals.length > 1) {
        const parts = originals.map(o => `${o.name} (${o.amount || '?'} ${o.unit || 'Stk'})`);
        dedupNote = `Zusammengeführt: ${parts.join(' + ')} — ${aiItem.mergeReason}`;
      }

      result.push({
        name: aiItem.name || originals[0]?.name || 'Unbekannt',
        amount: aiItem.amount,
        unit: aiItem.unit || '',
        recipes: allRecipes,
        recipeIds: allRecipeIds,
        isOptional,
        dedupNote,
      });
    }

    console.log(`🧠 KI-Smart-Dedup: ${preAggregated.length} → ${result.length} Einträge`);
    return result;
  } catch (err) {
    console.warn('⚠️ KI-Smart-Dedup fehlgeschlagen, nutze einfache Zusammenfassung (kein 2. AI-Call):', err.message);
    return preAggregated;
  }
}

/**
 * Generiert eine Einkaufsliste aus einem Wochenplan
 * @param {number} userId - Benutzer-ID
 * @param {number} mealPlanId - Wochenplan-ID
 * @returns {Promise<object>} - Einkaufsliste mit zusammengefassten Zutaten
 */
export async function generateShoppingList(userId, householdId, mealPlanId, options = {}, progress = null) {
  const { excludePastDays = false, smartDedup = false } = options;

  progress?.step(1); // Zutaten sammeln

  // --- 1. Alle Rezepte und Portionen aus dem Wochenplan laden ---
  const entries = db.prepare(`
    SELECT
      mpe.recipe_id,
      mpe.servings as planned_servings,
      mpe.day_of_week,
      r.servings as original_servings,
      r.title as recipe_title
    FROM meal_plan_entries mpe
    JOIN recipes r ON mpe.recipe_id = r.id
    WHERE mpe.meal_plan_id = ?
  `).all(mealPlanId);

  // Vergangene Tage herausfiltern (optional)
  let filteredEntries = entries;
  let skippedDays = 0;
  if (excludePastDays) {
    const plan = db.prepare('SELECT week_start FROM meal_plans WHERE id = ?').get(mealPlanId);
    if (plan?.week_start) {
      const weekStart = new Date(plan.week_start + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffMs = today.getTime() - weekStart.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays > 0 && diffDays <= 6) {
        const beforeCount = filteredEntries.length;
        filteredEntries = filteredEntries.filter(e => e.day_of_week >= diffDays);
        skippedDays = diffDays;
        console.log(`📅 ${beforeCount - filteredEntries.length} Einträge von ${skippedDays} vergangenen Tagen übersprungen`);
      }
    }
  }

  // --- 2. Zutaten sammeln und Mengen skalieren ---
  const rawItems = [];

  // Alias-Tabelle laden
  const aliasWhere = householdWhereClause(userId, householdId);
  const aliasRows = db.prepare(
    `SELECT alias_name, canonical_name FROM ingredient_aliases WHERE ${aliasWhere.clause}`
  ).all(...aliasWhere.params);
  const aliasMap = new Map();
  for (const row of aliasRows) {
    aliasMap.set(row.alias_name.toLowerCase(), row.canonical_name);
  }

  // Geblockte Zutaten laden
  const blockedWhere = householdWhereClause(userId, householdId);
  const blockedRows = db.prepare(
    `SELECT ingredient_name FROM blocked_ingredients WHERE ${blockedWhere.clause}`
  ).all(...blockedWhere.params);
  const blockedSet = new Set(blockedRows.map(r => r.ingredient_name.toLowerCase()));

  for (const entry of filteredEntries) {
    const ingredients = db.prepare(
      'SELECT * FROM ingredients WHERE recipe_id = ?'
    ).all(entry.recipe_id);

    for (const ing of ingredients) {
      const resolvedName = aliasMap.get(ing.name.toLowerCase()) || ing.name;

      if (blockedSet.has(resolvedName.toLowerCase())) continue;

      // Menge auf geplante Portionen skalieren
      const scaledAmount = ing.amount
        ? scaleIngredient(ing.amount, entry.original_servings, entry.planned_servings)
        : null;

      // Einheit normalisieren (Plural/Tippfehler bereinigen, natürliche Einheit beibehalten)
      const unit = normalizeUnit(ing.unit);

      rawItems.push({
        name: resolvedName,
        amount: scaledAmount,
        unit,
        recipes: [entry.recipe_title],
        recipeIds: [entry.recipe_id],
        isOptional: ing.is_optional,
      });
    }
  }

  // --- 2b. KI-gestützte Aggregation ---
  progress?.step(2); // KI-Aggregation
  // Smart-Dedup: Semantische Duplikaterkennung (ersetzt Standard-Aggregation wenn aktiviert)
  const aggregated = smartDedup
    ? await aiSmartDeduplicateItems(rawItems)
    : await aiAggregateItems(rawItems);

  // --- 3. Vorräte abziehen ---
  progress?.step(3); // Vorräte abziehen
  const pantryWhere = householdWhereClause(userId, householdId);
  const pantryItems = db.prepare(
    `SELECT * FROM pantry WHERE (${pantryWhere.clause}) AND (amount > 0 OR is_permanent = 1)`
  ).all(...pantryWhere.params);

  const adjustedItems = [];
  const needsAIEstimate = []; // Items wo statische Tabelle nicht hilft

  for (const item of aggregated) {
    let remainingAmount = item.amount;
    let pantryDeducted = 0;
    let pantryNote = null;

    // Pantry-Matches suchen (alle passenden Einträge – im Haushalt können mehrere User Vorräte haben)
    const matchingPantryItems = pantryItems.filter(p => {
      const pantryName = (aliasMap.get(p.ingredient_name.toLowerCase()) || p.ingredient_name).toLowerCase();
      const itemName = item.name.toLowerCase();
      return pantryName === itemName || p.ingredient_name.toLowerCase() === itemName;
    });

    if (matchingPantryItems.length > 0 && remainingAmount) {
      // Permanente Vorräte zuerst prüfen (Salz, Wasser etc.)
      const hasPermanent = matchingPantryItems.some(p => p.is_permanent);
      if (hasPermanent) {
        pantryDeducted = remainingAmount;
        remainingAmount = 0;
      } else {
        // Alle passenden Pantry-Einträge durchgehen und kumulativ abziehen
        let hasIncompatible = false;
        let lastIncompatiblePantry = null;

        for (const matchingPantry of matchingPantryItems) {
          if (remainingAmount <= 0) break;

          const result = comparePantryAmount(
            item.name,
            remainingAmount,
            normalizeUnit(item.unit),
            matchingPantry.amount,
            normalizeUnit(matchingPantry.unit),
          );

          if (result.compatible) {
            pantryDeducted += result.deduction;
            remainingAmount = result.remaining;
          } else {
            hasIncompatible = true;
            lastIncompatiblePantry = matchingPantry;
            pantryNote = result.pantryNote;
          }
        }

        // KI-Fallback nur wenn nach allen kompatiblen Abzügen noch Rest bleibt UND es inkompatible gab
        if (remainingAmount > 0 && hasIncompatible && lastIncompatiblePantry) {
          needsAIEstimate.push({
            index: adjustedItems.length,
            item,
            remainingAmount,
            pantry: lastIncompatiblePantry,
            recipeUnit: normalizeUnit(item.unit),
            pantryUnit: normalizeUnit(lastIncompatiblePantry.unit),
          });
        }
      }
    }

    adjustedItems.push({
      ...item,
      originalAmount: item.amount,
      amount: Math.max(0, remainingAmount || 0),
      pantryDeducted,
      pantryNote,
      needsToBuy: remainingAmount > 0,
    });
  }

  // --- 3b. KI-Fallback für unbekannte Einheiten-Konvertierungen ---
  if (needsAIEstimate.length > 0) {
    try {
      const ai = getAIProvider({ simple: true });
      const queries = needsAIEstimate.map(e => ({
        name: e.item.name,
        amount: e.remainingAmount,
        unit: e.recipeUnit || 'Stück',
        pantry_amount: e.pantry.amount,
        pantry_unit: e.pantryUnit || 'Stück',
      }));

      const prompt = `Schätze für diese Zutaten, wie viel Gramm ein Stück bzw. eine Einheit wiegt.

Zutaten:
${JSON.stringify(queries, null, 2)}

Antworte als JSON-Array. Für jede Zutat:
- "name": exakter Zutatname aus der Eingabe
- "piece_g": geschätztes Gewicht eines Stücks in Gramm (0 wenn nicht sinnvoll schätzbar)

Beispiel: [{ "name": "Avocado", "piece_g": 200 }]

Nur Standardgewichte. Bei Unsicherheit lieber 0 angeben.`;

      const estimates = await ai.chatJSON(prompt, { temperature: 0.1, maxTokens: 1024 });

      if (Array.isArray(estimates)) {
        for (const est of estimates) {
          if (!est.piece_g || est.piece_g <= 0) continue;
          const match = needsAIEstimate.find(e => e.item.name.toLowerCase() === est.name?.toLowerCase());
          if (!match) continue;

          const idx = match.index;
          const adjusted = adjustedItems[idx];
          if (!adjusted) continue;

          // Konvertierung Stück↔g mit KI-geschätztem Gewicht
          const recipeUnit = match.recipeUnit || '';
          const pantryUnit = match.pantryUnit || '';
          let factor = null;

          if (recipeUnit === '' && (pantryUnit === 'g' || pantryUnit === 'ml')) {
            factor = est.piece_g; // Stück → g
          } else if ((recipeUnit === 'g' || recipeUnit === 'ml') && pantryUnit === '') {
            factor = 1 / est.piece_g; // g → Stück
          }

          if (factor) {
            const neededBase = convertToBaseUnit(match.remainingAmount, recipeUnit);
            const pantryBase = convertToBaseUnit(match.pantry.amount, pantryUnit);
            const neededInPantryUnit = neededBase.amount * factor;
            const deductionInPantryUnit = Math.min(pantryBase.amount, neededInPantryUnit);
            const ratio = neededInPantryUnit > 0 ? deductionInPantryUnit / neededInPantryUnit : 0;
            const deduction = match.remainingAmount * ratio;
            let remaining = match.remainingAmount - deduction;
            if (remaining < 0.01) remaining = 0;

            adjusted.pantryDeducted = deduction;
            adjusted.amount = Math.max(0, remaining);
            adjusted.pantryNote = null;
            adjusted.needsToBuy = remaining > 0;
          }
        }
      }
    } catch (err) {
      console.warn('⚠️ KI-Fallback für Einheiten-Konvertierung fehlgeschlagen:', err.message);
      // Kein Abbruch – Items behalten ihre pantryNote als Hinweis
    }
  }

  return {
    items: adjustedItems.sort((a, b) => {
      if (a.needsToBuy !== b.needsToBuy) return a.needsToBuy ? -1 : 1;
      return a.name.localeCompare(b.name, 'de');
    }),
    totalItems: adjustedItems.length,
    itemsToBuy: adjustedItems.filter(i => i.needsToBuy).length,
    skippedDays,
  };
}

/**
 * Speichert die Einkaufsliste in der Datenbank
 */
export function saveShoppingList(userId, householdId, mealPlanId, items, name = 'Einkaufsliste') {
  const insertList = db.prepare(
    'INSERT INTO shopping_lists (user_id, meal_plan_id, name, household_id) VALUES (?, ?, ?, ?)'
  );
  const insertItem = db.prepare(`
    INSERT INTO shopping_list_items
    (shopping_list_id, ingredient_name, amount, unit, recipe_id, pantry_deducted, recipe_ids, pantry_note, dedup_note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Alte aktive Listen deaktivieren
  const deactWhere = householdWhereClause(userId, householdId);
  db.prepare(
    `UPDATE shopping_lists SET is_active = 0 WHERE (${deactWhere.clause}) AND is_active = 1`
  ).run(...deactWhere.params);

  const transaction = db.transaction(() => {
    const { lastInsertRowid: listId } = insertList.run(userId, mealPlanId, name, householdId || null);

    for (const item of items) {
      if (item.needsToBuy) {
        insertItem.run(
          listId, item.name, item.amount, item.unit, null,
          item.pantryDeducted, JSON.stringify(item.recipeIds || []),
          item.pantryNote || null, item.dedupNote || null
        );
      }
    }

    return listId;
  });

  return transaction();
}

/**
 * Verarbeitet den Einkauf: Gekaufte Items in den Vorratsschrank überführen.
 * Items werden in ihrer natürlichen Einheit in die Pantry übernommen.
 * Bei REWE-Produkten wird die tatsächlich gekaufte Menge verwendet.
 */
export function processPurchase(userId, householdId, listId, purchasedItems) {
  const upsertPantry = db.prepare(`
    INSERT INTO pantry (user_id, ingredient_name, amount, unit, category, household_id)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, ingredient_name) DO UPDATE SET
      amount = pantry.amount + excluded.amount,
      updated_at = CURRENT_TIMESTAMP
  `);

  const replacePantry = db.prepare(`
    INSERT INTO pantry (user_id, ingredient_name, amount, unit, category, household_id)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, ingredient_name) DO UPDATE SET
      amount = excluded.amount,
      unit = excluded.unit,
      updated_at = CURRENT_TIMESTAMP
  `);

  const pantryCheckWhere = householdWhereClause(userId, householdId);
  const getExistingPantry = db.prepare(
    `SELECT amount, unit FROM pantry WHERE (${pantryCheckWhere.clause}) AND ingredient_name = ?`
  );

  const transaction = db.transaction(() => {
    for (const item of purchasedItems) {
      let amount = item.amount;
      let unit = normalizeUnit(item.unit || '');

      // Wenn REWE-Produkt zugeordnet: tatsächlich gekaufte Menge berechnen
      if (item.rewe_package_size) {
        const parsed = parsePackageSize(item.rewe_package_size);
        if (parsed.amount && parsed.unit) {
          const reweQty = item.rewe_quantity || 1;
          amount = parsed.amount * reweQty;
          unit = parsed.unit;
        }
      }

      if (amount > 0) {
        const ingredientName = item.ingredient_name || item.name;
        const category = item.category || 'Sonstiges';
        const existing = getExistingPantry.get(...pantryCheckWhere.params, ingredientName);

        if (!existing) {
          upsertPantry.run(userId, ingredientName, amount, unit, category, householdId || null);
        } else {
          const existingUnit = normalizeUnit(existing.unit);
          if (existingUnit === unit || (!existingUnit && !unit)) {
            // Gleiche Einheit → addieren
            upsertPantry.run(userId, ingredientName, amount, unit, category, householdId || null);
          } else {
            // Unterschiedliche Einheiten → ersetzen mit neuerer Einheit
            replacePantry.run(userId, ingredientName, amount, unit, category, householdId || null);
          }
        }
      }
    }
  });

  transaction();
}
