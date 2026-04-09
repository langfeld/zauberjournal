/**
 * ============================================
 * KI-gestützter Vorratsabzug
 * ============================================
 *
 * Ersetzt die regelbasierte Vorrats-Deduktion beim Kochen durch
 * einen KI-Aufruf, der intelligent:
 * - Zutaten-Namen matcht (auch bei unterschiedlicher Schreibweise)
 * - Einheiten-Umrechnungen vornimmt (Stück → g, ml ≈ g bei Konserven)
 * - Semantische Zuordnung macht ("Milch" → "Vollmilch" im Vorrat)
 *
 * Speichert Deduktions-Logs für Undo-Unterstützung (Rezept "entkocht").
 */

import db, { householdWhereClause } from '../config/database.js';
import { getAIProvider } from './ai/provider.js';
import { getSetting } from '../config/settings.js';
import { scaleIngredient, convertToBaseUnit } from '../utils/helpers.js';

/**
 * Gibt den AI-Provider für den Vorratsabzug zurück.
 * Über das Admin-Setting 'ai_pantry_deduction_instant' steuerbar.
 */
function getDeductionAI() {
  const useInstant = getSetting('ai_pantry_deduction_instant', 'true') === 'true';
  const provider = getAIProvider(useInstant ? { simple: true } : {});
  console.log(`🧮 Pantry-Deduction AI: ${provider.name} [Modus: ${useInstant ? 'Instant' : 'Thinking'}]`);
  return provider;
}

/**
 * Führt einen KI-gestützten Vorratsabzug für ein gekochtes Rezept durch.
 *
 * @param {object} params
 * @param {number} params.userId
 * @param {number|null} params.householdId
 * @param {number} params.entryId - Meal-Plan-Entry ID
 * @param {number} params.recipeId
 * @param {string} params.recipeTitle
 * @param {number} params.originalServings - Rezept-Originalportionen
 * @param {number} params.plannedServings - Geplante Portionen
 * @returns {Promise<{ deductions: Array, errors: string[] }>}
 */
export async function aiPantryDeduction({
  userId, householdId, entryId, recipeId, recipeTitle,
  originalServings, plannedServings,
}, progress = null) {
  const errors = [];
  const deductions = [];

  // 1. Rezept-Zutaten laden (nicht-optional)
  progress?.step(0); // Rezeptdaten laden
  const ingredients = db.prepare(
    'SELECT * FROM ingredients WHERE recipe_id = ? AND is_optional = 0'
  ).all(recipeId);

  if (ingredients.length === 0) {
    return { deductions: [], errors: [] };
  }

  // 2. Zutaten auf Portionen skalieren
  const scaledIngredients = ingredients
    .map(ing => {
      const scaledAmount = ing.amount
        ? scaleIngredient(ing.amount, originalServings, plannedServings)
        : null;
      return {
        name: ing.name,
        amount: scaledAmount,
        unit: ing.unit || '',
        group: ing.group_name || '',
      };
    })
    .filter(ing => ing.amount && ing.amount > 0);

  if (scaledIngredients.length === 0) {
    return { deductions: [], errors: [] };
  }

  // 3. Pantry-Items laden (nur nicht-permanent mit amount > 0)
  const pWhere = householdWhereClause(userId, householdId);
  const pantryItems = db.prepare(
    `SELECT id, ingredient_name, amount, unit, category
     FROM pantry WHERE (${pWhere.clause}) AND amount > 0 AND is_permanent = 0`
  ).all(...pWhere.params);

  if (pantryItems.length === 0) {
    return { deductions: [], errors: [] };
  }

  // 4. Alias-Tabelle laden
  const aliasWhere = householdWhereClause(userId, householdId);
  const aliasRows = db.prepare(
    `SELECT alias_name, canonical_name FROM ingredient_aliases WHERE ${aliasWhere.clause}`
  ).all(...aliasWhere.params);

  // 5. AI-Prompt zusammenbauen
  const ingredientsList = scaledIngredients
    .map(ing => `- ${ing.amount} ${ing.unit} ${ing.name}`.trim())
    .join('\n');

  const pantryList = pantryItems
    .map(p => `[ID:${p.id}] ${p.amount} ${p.unit || ''} ${p.ingredient_name} (${p.category || 'Sonstiges'})`.trim())
    .join('\n');

  const aliasList = aliasRows.length > 0
    ? aliasRows.map(a => `${a.alias_name} = ${a.canonical_name}`).join(', ')
    : 'Keine Aliase konfiguriert.';

  const prompt = `Du bist ein Küchenassistent. Ein Rezept wurde soeben gekocht und die verbrauchten Zutaten sollen vom Vorratsschrank abgezogen werden.

## Rezept: "${recipeTitle}" (${plannedServings} Portionen)

### Benötigte Zutaten (skaliert auf ${plannedServings} Portionen):
${ingredientsList}

### Verfügbare Vorräte:
${pantryList}

### Bekannte Zutat-Aliase:
${aliasList}

## Aufgabe

Ordne jede Rezept-Zutat dem passenden Vorrats-Item zu und berechne die abzuziehende Menge.

### Regeln:
1. **Name-Matching**: Matche Zutaten auch bei leicht unterschiedlicher Schreibweise. "Tomaten" passt zu "Stückige Tomaten", "Milch" passt zu "Vollmilch", "Zwiebel" passt zu "Zwiebeln".
2. **Einheiten-Umrechnung**: Rechne zwischen Einheiten um:
   - 1 kg = 1000 g
   - 1 L = 1000 ml
   - Für flüssige Lebensmittel in Konserven: ml ≈ g (z.B. 400ml Tomaten ≈ 400g)
   - Stück → g: Verwende Durchschnittswerte (z.B. 1 Zwiebel ≈ 150g, 1 Knoblauchzehe ≈ 5g, 1 Kartoffel ≈ 170g, 1 Ei ≈ 60g, 1 Tomate ≈ 130g)
   - EL (Esslöffel) ≈ 15ml/15g, TL (Teelöffel) ≈ 5ml/5g
   - Prise ≈ 0.5g, Bund ≈ 30-50g (je nach Kraut)
3. **Abzugsmenge**: Ziehe MAXIMAL so viel ab, wie im Vorrat vorhanden ist. Nie mehr!
4. **Kein Match**: Wenn keine passende Zutat im Vorrat ist, gib null für pantry_item_id zurück.
5. **Alias-Auflösung**: Beachte die konfigurierten Aliase bei der Zuordnung.
6. **Exakte Berechnung**: Die abzuziehende Menge muss in der EINHEIT DES VORRATS-ITEMS angegeben werden, nicht in der Rezept-Einheit.

## Antwort-Format (JSON)

Antworte ausschließlich mit einem JSON-Objekt:

{
  "deductions": [
    {
      "ingredient_name": "Name der Rezept-Zutat",
      "pantry_item_id": 123,
      "deduct_amount": 200,
      "deduct_unit": "g",
      "reasoning": "Kurze Erklärung der Zuordnung/Umrechnung"
    }
  ]
}

- pantry_item_id: ID des Vorrats-Items (aus [ID:X]) oder null wenn kein Match
- deduct_amount: Abzuziehende Menge IN DER EINHEIT DES VORRATS-ITEMS, nie mehr als verfügbar
- deduct_unit: Einheit des Vorrats-Items
- reasoning: Kurze Erklärung`;

  try {
    progress?.step(1); // KI-Berechnung
    const ai = getDeductionAI();
    const result = await ai.chatJSON(prompt, {
      temperature: 0.1,
      maxTokens: 2048,
    });

    if (!result || !Array.isArray(result.deductions)) {
      errors.push('KI-Antwort enthielt kein gültiges deductions-Array');
      return { deductions: [], errors };
    }

    // 6. Ergebnis validieren und anwenden
    progress?.step(2); // Vorräte aktualisieren
    const pantryMap = new Map(pantryItems.map(p => [p.id, p]));

    for (const d of result.deductions) {
      // Validierung
      if (!d.pantry_item_id || !d.deduct_amount || d.deduct_amount <= 0) {
        continue; // Kein Match oder ungültige Menge → überspringen
      }

      const pantryItem = pantryMap.get(d.pantry_item_id);
      if (!pantryItem) {
        errors.push(`Ungültige Pantry-ID ${d.pantry_item_id} für "${d.ingredient_name}"`);
        continue;
      }

      // Menge begrenzen auf das, was verfügbar ist
      const actualDeduction = Math.min(d.deduct_amount, pantryItem.amount);
      if (actualDeduction <= 0) continue;

      const newAmount = Math.round((pantryItem.amount - actualDeduction) * 100) / 100;

      // DB-Update
      db.prepare(
        'UPDATE pantry SET amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(Math.max(0, newAmount), pantryItem.id);

      // Deduktions-Log speichern (für Undo)
      db.prepare(`
        INSERT INTO pantry_deductions (meal_plan_entry_id, ingredient_name, pantry_item_id,
          deducted_amount, deducted_unit, original_pantry_amount, original_pantry_unit, ai_reasoning)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        entryId,
        d.ingredient_name,
        pantryItem.id,
        actualDeduction,
        d.deduct_unit || pantryItem.unit,
        pantryItem.amount,
        pantryItem.unit,
        d.reasoning || null,
      );

      // Verfügbare Menge im Map für nachfolgende Deduktionen aktualisieren
      pantryItem.amount = Math.max(0, newAmount);

      deductions.push({
        ingredient_name: d.ingredient_name,
        pantry_item_id: pantryItem.id,
        pantry_name: pantryItem.ingredient_name,
        deducted: actualDeduction,
        unit: d.deduct_unit || pantryItem.unit,
        remaining: Math.max(0, newAmount),
        reasoning: d.reasoning,
      });
    }

    console.log(`🧮 AI Pantry-Deduction für "${recipeTitle}": ${deductions.length} Abzüge`);
    return { deductions, errors };

  } catch (err) {
    console.error('❌ AI Pantry-Deduction Fehler:', err.message);
    errors.push(`KI-Fehler: ${err.message}`);
    return { deductions: [], errors };
  }
}

/**
 * Macht einen KI-gestützten Vorratsabzug rückgängig (Rezept "entkocht").
 * Verwendet die gespeicherten Deduktions-Logs.
 *
 * @param {number} entryId - Meal-Plan-Entry ID
 * @returns {{ restored: number, errors: string[] }}
 */
export function undoAIPantryDeduction(entryId) {
  const logs = db.prepare(
    'SELECT * FROM pantry_deductions WHERE meal_plan_entry_id = ?'
  ).all(entryId);

  let restored = 0;
  const errors = [];

  for (const log of logs) {
    try {
      const pantryItem = db.prepare('SELECT * FROM pantry WHERE id = ?').get(log.pantry_item_id);

      if (!pantryItem) {
        errors.push(`Vorrats-Item ${log.pantry_item_id} nicht mehr vorhanden`);
        continue;
      }

      // Menge zurückgeben
      const newAmount = Math.round((pantryItem.amount + log.deducted_amount) * 100) / 100;
      db.prepare(
        'UPDATE pantry SET amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(newAmount, pantryItem.id);

      restored++;
    } catch (err) {
      errors.push(`Fehler bei Rückgabe für ${log.ingredient_name}: ${err.message}`);
    }
  }

  // Logs löschen
  db.prepare('DELETE FROM pantry_deductions WHERE meal_plan_entry_id = ?').run(entryId);

  console.log(`🧮 AI Pantry-Deduction rückgängig für Entry ${entryId}: ${restored} Vorräte wiederhergestellt`);
  return { restored, errors };
}
