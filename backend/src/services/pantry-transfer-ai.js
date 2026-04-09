/**
 * ============================================
 * KI-gestützter Vorrats-Transfer
 * ============================================
 *
 * Intelligenter Transfer von Einkaufslistenartikeln in den Vorratsschrank.
 * Die KI übernimmt:
 * - Namens-Normalisierung ("Bio-Vollmilch 3.5%" → "Vollmilch")
 * - Kategorie-Zuweisung (statt immer "Sonstiges")
 * - Matching mit existierenden Vorrats-Items (Fuzzy/Semantic)
 * - Einheiten-Konversion wenn nötig
 */

import db, { householdWhereClause } from '../config/database.js';
import { getAIProvider } from './ai/provider.js';
import { getSetting } from '../config/settings.js';

/**
 * Gibt den AI-Provider für den Vorrats-Transfer zurück.
 * Über das Admin-Setting 'ai_pantry_transfer_instant' steuerbar.
 */
function getTransferAI() {
  const useInstant = getSetting('ai_pantry_transfer_instant', 'true') === 'true';
  const provider = getAIProvider(useInstant ? { simple: true } : {});
  console.log(`📦 Pantry-Transfer AI: ${provider.name} [Modus: ${useInstant ? 'Instant' : 'Thinking'}]`);
  return provider;
}

/**
 * KI-gestützter Transfer eines Einkaufslisten-Items in den Vorratsschrank.
 *
 * @param {object} params
 * @param {number} params.userId
 * @param {number|null} params.householdId
 * @param {string} params.ingredientName - Name des Artikels aus der Einkaufsliste
 * @param {number} params.amount - Menge
 * @param {string} params.unit - Einheit
 * @returns {Promise<{
 *   normalized_name: string,
 *   amount: number,
 *   unit: string,
 *   category: string,
 *   merge_with_pantry_id: number|null,
 *   reasoning: string,
 *   errors: string[]
 * }>}
 */
export async function aiPantryTransfer({ userId, householdId, ingredientName, amount, unit }, progress = null) {
  const errors = [];

  // 1. Existierende Vorrats-Items laden
  progress?.step(0); // Vorratsdaten laden
  const pWhere = householdWhereClause(userId, householdId);
  const pantryItems = db.prepare(
    `SELECT id, ingredient_name, amount, unit, category
     FROM pantry WHERE (${pWhere.clause}) AND (amount > 0 OR is_permanent = 1)`
  ).all(...pWhere.params);

  // 2. Vorhandene Kategorien laden (für konsistente Zuordnung)
  const existingCategories = db.prepare(
    `SELECT DISTINCT category FROM pantry WHERE (${pWhere.clause}) ORDER BY category`
  ).all(...pWhere.params).map(c => c.category).filter(Boolean);

  // 3. Alias-Tabelle laden
  const aliasWhere = householdWhereClause(userId, householdId);
  const aliasRows = db.prepare(
    `SELECT alias_name, canonical_name FROM ingredient_aliases WHERE ${aliasWhere.clause}`
  ).all(...aliasWhere.params);

  // 4. Prompt bauen
  const pantryList = pantryItems.length > 0
    ? pantryItems
        .map(p => `[ID:${p.id}] "${p.ingredient_name}" — ${p.amount} ${p.unit || 'Stk'} (${p.category || 'Sonstiges'})`)
        .join('\n')
    : 'Vorratsschrank ist leer.';

  const categoryList = existingCategories.length > 0
    ? existingCategories.join(', ')
    : 'Noch keine Kategorien vorhanden.';

  const aliasList = aliasRows.length > 0
    ? aliasRows.map(a => `${a.alias_name} = ${a.canonical_name}`).join(', ')
    : 'Keine Aliase konfiguriert.';

  const prompt = `Du bist ein Küchenassistent. Ein Artikel von der Einkaufsliste soll in den Vorratsschrank übertragen werden.

## Artikel aus der Einkaufsliste:
Name: "${ingredientName}"
Menge: ${amount} ${unit}

## Bereits im Vorratsschrank:
${pantryList}

## Vorhandene Kategorien im Vorratsschrank:
${categoryList}

## Bekannte Zutat-Aliase:
${aliasList}

## Aufgabe

Analysiere den Artikel und entscheide:

1. **Name normalisieren**: Entferne Markenbezeichnungen, Prozentangaben, Packungsgrößen aus dem Namen.
   - "Bio-Vollmilch 3.5%" → "Vollmilch"
   - "Barilla Penne Rigate 500g" → "Penne Rigate"
   - "Stückige Tomaten 400g Dose" → "Stückige Tomaten"
   - "Ja! Weizenmehl Type 405" → "Weizenmehl Type 405"
   - Bei einfachen Namen ohne Zusätze: unverändert lassen ("Butter" → "Butter")

2. **Existierendes Vorrats-Item matchen**: Gibt es ein bestehendes Item im Vorratsschrank, das semantisch dasselbe meint?
   - "Penne Rigate" matcht "Penne" (gleiche Pasta)
   - "Stückige Tomaten" matcht "Tomaten (stückig)" (selbe Zutat, andere Schreibweise)
   - "Vollmilch" matcht "Milch" (generisch genug)
   - NICHT matchen: "Tomatenmark" und "Tomaten" (verschiedene Produkte!)
   - NICHT matchen: "Sahne" und "Saure Sahne" (verschiedene Produkte!)
   - Berücksichtige auch die konfigurierten Aliase
   - Bei einem Match: verwende den BESTEHENDEN Namen des Vorrats-Items (nicht den normalisierten)

3. **Kategorie zuweisen**: Wähle die passende Kategorie.
   - Bevorzuge eine der existierenden Kategorien
   - Nur wenn keine passt, verwende eine sinnvolle deutsche Kategorie aus: Obst & Gemüse, Milchprodukte, Fleisch & Fisch, Backzutaten, Gewürze & Kräuter, Konserven & Gläser, Getränke, Tiefkühl, Öle & Essig, Nudeln & Reis, Brot & Gebäck, Sonstiges

4. **Einheiten-Kompatibilität**: Wenn ein Match gefunden wird, prüfe ob die Einheiten kompatibel sind.
   - g und kg: kompatibel (umrechnen)
   - ml und l: kompatibel (umrechnen)
   - g und ml bei flüssigen Lebensmitteln: oft kompatibel (≈ gleich)
   - Stk und g: INKOMPATIBEL (nicht automatisch umrechnen)
   - Wenn die Einheiten kompatibel sind, gib die Menge in der Einheit des bestehenden Items an
   - Wenn inkompatibel: setze merge_with_pantry_id auf null (neues Item anlegen)

## Antwort-Format (JSON)

Antworte ausschließlich mit einem JSON-Objekt:

{
  "normalized_name": "Bereinigter Name (oder bestehender Vorrats-Name bei Match)",
  "amount": ${amount},
  "unit": "${unit}",
  "category": "Passende Kategorie",
  "merge_with_pantry_id": null,
  "reasoning": "Kurze Erklärung der Entscheidung"
}

- merge_with_pantry_id: ID des bestehenden Vorrats-Items [ID:X] zum Zusammenführen, oder null wenn neues Item
- Wenn merge: amount und unit in der Einheit des bestehenden Items (umgerechnet wenn nötig)
- normalized_name: Bei merge der bestehende Name, sonst der bereinigte neue Name`;

  try {
    progress?.step(1); // KI-Zuordnung
    const ai = getTransferAI();
    const result = await ai.chatJSON(prompt, {
      temperature: 0.1,
      maxTokens: 1024,
    });

    if (!result || !result.normalized_name) {
      errors.push('KI-Antwort enthielt keinen gültigen normalisierten Namen');
      return {
        normalized_name: ingredientName,
        amount,
        unit,
        category: 'Sonstiges',
        merge_with_pantry_id: null,
        reasoning: null,
        errors,
      };
    }

    // Validierung: Wenn merge_with_pantry_id gesetzt, muss das Item existieren
    progress?.step(2); // Transfer durchführen
    if (result.merge_with_pantry_id) {
      const pantryItem = pantryItems.find(p => p.id === result.merge_with_pantry_id);
      if (!pantryItem) {
        errors.push(`Ungültige Pantry-ID ${result.merge_with_pantry_id} — neues Item wird angelegt`);
        result.merge_with_pantry_id = null;
      }
    }

    // Sicherstellen, dass amount eine valide Zahl ist
    const finalAmount = (typeof result.amount === 'number' && result.amount > 0)
      ? result.amount
      : amount;

    console.log(`📦 AI Pantry-Transfer: "${ingredientName}" → "${result.normalized_name}" (Kategorie: ${result.category}, Merge: ${result.merge_with_pantry_id || 'nein'})`);

    return {
      normalized_name: result.normalized_name || ingredientName,
      amount: finalAmount,
      unit: result.unit || unit,
      category: result.category || 'Sonstiges',
      merge_with_pantry_id: result.merge_with_pantry_id || null,
      reasoning: result.reasoning || null,
      errors,
    };

  } catch (err) {
    console.error('❌ AI Pantry-Transfer Fehler:', err.message);
    errors.push(`KI-Fehler: ${err.message}`);
    return {
      normalized_name: ingredientName,
      amount,
      unit,
      category: 'Sonstiges',
      merge_with_pantry_id: null,
      reasoning: null,
      errors,
    };
  }
}
