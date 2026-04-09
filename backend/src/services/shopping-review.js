/**
 * ============================================
 * Einkaufslisten-Review Service (KI)
 * ============================================
 *
 * Prüft eine generierte Einkaufsliste mittels KI auf:
 * - Fehlende Zutaten (im Rezept, aber nicht auf der Liste)
 * - Mengen-Logik (Stück vs. Packung)
 * - Pantry-Überdeckung (Vorrat deckt Zutat bereits ab)
 * - Plausibilität (ungewöhnlich hohe/niedrige Mengen)
 * - Duplikate / Synonyme
 * - REWE-Zuordnungs-Fehler (falsches Produkt zugeordnet)
 * - Fehlende REWE-Zuordnungen
 */

import db, { householdWhereClause } from '../config/database.js';
import { getAIProvider } from './ai/provider.js';
import { getSetting } from '../config/settings.js';
import { normalizeUnit, scaleIngredient } from '../utils/helpers.js';

/**
 * Gibt den AI-Provider für den Shopping-Review zurück.
 * Über das Admin-Setting 'ai_shopping_review_instant' steuerbar.
 */
function getReviewAI() {
  const useInstant = getSetting('ai_shopping_review_instant', 'false') === 'true';
  const provider = getAIProvider(useInstant ? { simple: true } : {});
  console.log(`🔍 Shopping-Review AI: ${provider.name} [Modus: ${useInstant ? 'Instant' : 'Thinking'}]`);
  return provider;
}

/**
 * Führt einen KI-gestützten Review der aktuellen Einkaufsliste durch.
 *
 * @param {number} userId
 * @param {number|null} householdId
 * @param {number} listId - ID der Einkaufsliste
 * @returns {Promise<{ issues: Array, autoResolved: Array }>}
 */
export async function reviewShoppingList(userId, householdId, listId) {
  // --- 1. Daten laden ---

  // Einkaufslisten-Items
  const listItems = db.prepare(
    'SELECT * FROM shopping_list_items WHERE shopping_list_id = ? AND is_checked = 0'
  ).all(listId);

  if (listItems.length === 0) {
    return { issues: [], autoResolved: [] };
  }

  // Einkaufsliste (für meal_plan_id)
  const list = db.prepare('SELECT * FROM shopping_lists WHERE id = ?').get(listId);
  if (!list) {
    return { issues: [], autoResolved: [] };
  }

  // Pantry-Bestand
  const pantryWhere = householdWhereClause(userId, householdId);
  const pantryItems = db.prepare(
    `SELECT * FROM pantry WHERE (${pantryWhere.clause}) AND (amount > 0 OR is_permanent = 1)`
  ).all(...pantryWhere.params);

  // Wochenplan-Rezepte mit Zutaten (wenn mit Wochenplan verknüpft)
  // Dabei werden vergangene Tage gefiltert, wenn sie beim Erstellen der Liste auch übersprungen wurden
  let recipesWithIngredients = [];
  let skippedDayInfo = null;
  if (list.meal_plan_id) {
    let entries = db.prepare(`
      SELECT DISTINCT mpe.recipe_id, r.title, r.servings, mpe.servings as planned_servings, mpe.day_of_week
      FROM meal_plan_entries mpe
      JOIN recipes r ON mpe.recipe_id = r.id
      WHERE mpe.meal_plan_id = ?
    `).all(list.meal_plan_id);

    // Vergangene Tage herausfiltern (gleiche Logik wie in generateShoppingList)
    const plan = db.prepare('SELECT week_start FROM meal_plans WHERE id = ?').get(list.meal_plan_id);
    if (plan?.week_start) {
      const weekStart = new Date(plan.week_start + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffMs = today.getTime() - weekStart.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays > 0 && diffDays <= 6) {
        const beforeCount = entries.length;
        entries = entries.filter(e => e.day_of_week >= diffDays);
        skippedDayInfo = { skippedDays: diffDays, skippedEntries: beforeCount - entries.length };
        console.log(`📅 KI-Review: ${skippedDayInfo.skippedEntries} Einträge von ${diffDays} vergangenen Tagen übersprungen`);
      }
    }

    for (const entry of entries) {
      const ingredients = db.prepare(
        'SELECT name, amount, unit, is_optional FROM ingredients WHERE recipe_id = ?'
      ).all(entry.recipe_id);
      recipesWithIngredients.push({
        id: entry.recipe_id,
        title: entry.title,
        servings: entry.servings,
        planned_servings: entry.planned_servings,
        ingredients,
      });
    }
  }

  // Alias-Tabelle
  const aliasWhere = householdWhereClause(userId, householdId);
  const aliasRows = db.prepare(
    `SELECT alias_name, canonical_name FROM ingredient_aliases WHERE ${aliasWhere.clause}`
  ).all(...aliasWhere.params);

  // Geblockte Zutaten
  const blockedWhere = householdWhereClause(userId, householdId);
  const blockedRows = db.prepare(
    `SELECT ingredient_name FROM blocked_ingredients WHERE ${blockedWhere.clause}`
  ).all(...blockedWhere.params);

  // User-Settings laden (für Auto-Merge/Auto-Adjust)
  const userSettingsRows = db.prepare(
    "SELECT key, value FROM user_settings WHERE user_id = ? AND key IN ('shopping_auto_ai_merge', 'shopping_auto_ai_adjust')"
  ).all(userId);
  const userSettings = {};
  for (const row of userSettingsRows) {
    userSettings[row.key] = row.value;
  }

  // --- 2. Kontext für KI aufbauen ---

  // Alias-Lookup aufbauen: alias_name (lowercase) → canonical_name, canonical_name (lowercase) → canonical_name
  const aliasLookup = new Map();
  for (const a of aliasRows) {
    aliasLookup.set(a.alias_name.toLowerCase(), a.canonical_name);
    aliasLookup.set(a.canonical_name.toLowerCase(), a.canonical_name);
  }
  /** Gibt den kanonischen Namen zurück, falls ein Alias existiert */
  function resolveAlias(name) {
    return aliasLookup.get(name.toLowerCase()) || name;
  }

  const shoppingContext = listItems.map(item => {
    // recipe_ids aus JSON-Spalte parsen (enthält IDs aller Rezepte die zu diesem Item beigetragen haben)
    let recipeIds = [];
    try {
      recipeIds = item.recipe_ids ? JSON.parse(item.recipe_ids) : [];
    } catch { /* ignore parse errors */ }
    return {
      id: item.id,
      name: item.ingredient_name,
      amount: item.amount,
      unit: item.unit || '',
      recipe_ids: recipeIds,
      rewe_product: item.rewe_product_id ? {
        name: item.rewe_product_name,
        package_size: item.rewe_package_size,
        matched_by: item.rewe_matched_by,
      } : null,
      source: item.source || 'recipe',
      pantry_deducted: item.pantry_deducted || 0,
    };
  });

  const pantryContext = pantryItems.map(p => ({
    name: p.ingredient_name,
    amount: p.amount,
    unit: normalizeUnit(p.unit) || '',
    is_permanent: !!p.is_permanent,
  }));

  const recipesContext = recipesWithIngredients.map(r => ({
    id: r.id,
    title: r.title,
    servings: r.servings,
    planned_servings: r.planned_servings,
    ingredients: r.ingredients.map(i => {
      const canonical = resolveAlias(i.name);
      return {
        name: i.name,
        // Kanonischer Name (= Name in der Einkaufsliste) hinzufügen, wenn abweichend
        ...(canonical !== i.name ? { canonical_name: canonical } : {}),
        amount: i.amount,
        unit: i.unit || '',
        is_optional: !!i.is_optional,
      };
    }),
  }));

  const aliasContext = aliasRows.map(a => `${a.alias_name} → ${a.canonical_name}`);
  const blockedContext = blockedRows.map(b => b.ingredient_name);

  // --- Vorberechnung: Zutaten die NICHT auf der Einkaufsliste stehen, weil der Vorrat sie abdeckt ---
  const shoppingNamesLower = new Set(listItems.map(li => resolveAlias(li.ingredient_name).toLowerCase()));
  const pantryCoveredItems = [];
  const seenPantryCovered = new Set();
  for (const recipe of recipesWithIngredients) {
    for (const ing of recipe.ingredients) {
      if (ing.is_optional) continue;
      const canonical = resolveAlias(ing.name).toLowerCase();
      if (blockedContext.some(b => b.toLowerCase() === canonical)) continue;
      if (shoppingNamesLower.has(canonical)) continue; // Ist auf der Einkaufsliste
      // Prüfen ob Vorrat diese Zutat hat
      const inPantry = pantryItems.some(p => {
        const pantryCanonical = resolveAlias(p.ingredient_name).toLowerCase();
        return pantryCanonical === canonical && (p.amount > 0 || p.is_permanent);
      });
      if (inPantry) {
        const key = `${canonical}::${recipe.id}`;
        if (!seenPantryCovered.has(key)) {
          seenPantryCovered.add(key);
          pantryCoveredItems.push({
            ingredient: ing.name,
            recipe: recipe.title,
            recipe_id: recipe.id,
            reason: 'Vorrat deckt den Bedarf vollständig ab – daher nicht auf der Einkaufsliste',
          });
        }
      }
    }
  }

  // Prüfen ob REWE-Abgleich durchgeführt wurde (mindestens ein Item hat rewe_product_id)
  const hasReweMatching = listItems.some(i => i.rewe_product_id);

  // --- 3. KI-Review aufrufen ---
  const ai = getReviewAI();

  const prompt = `Du bist ein intelligenter Einkaufslisten-Prüfer für eine Koch-App. Analysiere die Einkaufsliste und finde Probleme.

## Einkaufsliste
${JSON.stringify(shoppingContext, null, 2)}
HINWEIS: Das Feld "recipe_ids" zeigt welche Rezepte zu diesem Einkaufslisteneintrag beigetragen haben. Wenn mehrere recipe_ids vorhanden sind, ist die Menge die SUMME aus mehreren Rezepten – das ist KEIN Fehler!
WICHTIG: Die Mengen in der Einkaufsliste sind bereits auf die planned_servings der Rezepte SKALIERT! Wenn ein Rezept für 2 Portionen gespeichert ist (servings=2) aber für 8 Portionen geplant wurde (planned_servings=8), dann ist die Menge in der Einkaufsliste bereits mit Faktor 4 multipliziert. Das ist KORREKT und KEIN Plausibilitätsfehler!

## Vorratsschrank (aktueller Bestand)
${JSON.stringify(pantryContext, null, 2)}

## Rezepte aus dem Wochenplan (für die diese Einkaufsliste generiert wurde)
${JSON.stringify(recipesContext, null, 2)}

## Durch Vorrat abgedeckte Zutaten (NICHT auf der Einkaufsliste, weil Vorrat ausreicht)
${pantryCoveredItems.length > 0 ? JSON.stringify(pantryCoveredItems, null, 2) : 'Keine'}
Diese Zutaten wurden beim Erstellen der Einkaufsliste bereits geprüft und vom Vorrat abgedeckt. Sie fehlen NICHT – sie werden bewusst nicht eingekauft. Melde diese NIEMALS als missing_ingredient!

## Zutaten-Aliase (bekannte Zusammenfassungen)
${aliasContext.length > 0 ? aliasContext.join('\n') : 'Keine'}
Wenn bei Rezeptzutaten ein "canonical_name" angegeben ist, wurde der Alias bereits aufgelöst – die Zutat steht unter dem canonical_name in der Einkaufsliste.

## Geblockte Zutaten (bewusst ausgeschlossen)
${blockedContext.length > 0 ? blockedContext.join(', ') : 'Keine'}

## Wichtige Grundregel: Semantische Zutatenerkennung

Beim Vergleich von Zutatennamen MUSST du semantisch denken, nicht wörtlich. Zutaten sind GLEICH wenn sie das gleiche Lebensmittel bezeichnen, auch bei:
- Anderer Wortreihenfolge: "Zwiebel rot" = "Rote Zwiebel", "Paprika gelb" = "Gelbe Paprika"
- Singular/Plural: "Tomate" = "Tomaten", "Kartoffel" = "Kartoffeln"
- Adjektiv-Variation: "Frühlingszwiebel" = "Frühlingszwiebeln" = "Lauchzwiebel"
- Abkürzungen/Varianten: "Champignons" = "Pilze (Champignon)", "Sahne" = "Schlagsahne"
- Bekannte Aliase (siehe oben): Diese sind definitiv identisch

Melde eine Zutat NIEMALS als fehlend wenn sie unter einem anderen (aber semantisch gleichen) Namen bereits in der Einkaufsliste oder im Vorratsschrank steht.

## Prüfaufgaben

Prüfe die Einkaufsliste auf folgende Probleme und antworte als JSON:

1. **missing_ingredient**: Zutaten die in den Rezepten vorkommen, aber NICHT in der Einkaufsliste UND NICHT im Vorratsschrank UND NICHT in der Liste "Durch Vorrat abgedeckte Zutaten" sind (und nicht geblockt/optional). Nutze die semantische Zutatenerkennung (siehe oben) – prüfe ob die Zutat unter einem anderen Namen bereits vorhanden ist, bevor du sie als fehlend meldest. Gib die fehlende Zutat mit Menge und Rezeptname an.
   KRITISCH: Prüfe VOR dem Melden einer fehlenden Zutat IMMER:
   a) Steht sie (ggf. unter anderem Namen) auf der Einkaufsliste?
   b) Steht sie in der Liste "Durch Vorrat abgedeckte Zutaten"?
   c) Hat der Vorratsschrank genug davon?
   Wenn EINE dieser Bedingungen zutrifft, ist die Zutat NICHT fehlend!

2. **quantity_logic**: Mengen-Logik-Fehler. Typisches Beispiel: Im Rezept steht "4 Tortillas" (= 4 Stück einzeln), aber in der Einkaufsliste steht "4" ohne Kontext → das könnte als "4 Packungen" interpretiert werden. Prüfe ob Stückzahlen als Verpackungseinheiten fehlinterpretiert werden könnten. Berücksichtige besonders Produkte die typischerweise in Mehrstück-Packungen verkauft werden (Tortillas, Burger-Buns, Aufbackbrötchen etc.).

3. **pantry_covered**: Zutaten die im Vorratsschrank ausreichend vorhanden sind, aber trotzdem auf der Einkaufsliste stehen. Beachte intelligente Einheiten-Erkennung:
   - 1 Knolle Knoblauch ≈ 10 Zehen → reicht für bis zu 10 Zehen
   - 1 kg Mehl reicht für "200g Mehl"
   - Permanente Vorräte (is_permanent=true) decken immer ab
   Gib einen confidence-Wert (0.0-1.0) an wie sicher du bist.

4. **plausibility**: Ungewöhnlich hohe oder niedrige Mengen die auf einen Fehler hindeuten (z.B. 500g Salz für ein Rezept, 0.01 kg Fleisch).
   WICHTIG: Prüfe IMMER das Feld "recipe_ids" des Einkaufslisteneintrags! Wenn mehrere recipe_ids vorhanden sind, ist die Menge die SUMME aus diesen Rezepten. Teile die Gesamtmenge durch die Anzahl der Rezepte um die Menge pro Rezept zu berechnen. Melde KEINEN Plausibilitätsfehler wenn die Menge pro Rezept plausibel ist.
   KRITISCH: Beachte die planned_servings! Die Mengen in der Einkaufsliste sind bereits auf die planned_servings skaliert. Beispiel: Rezept hat 200g Feta für servings=2. Wenn planned_servings=8, dann stehen 800g Feta in der Einkaufsliste. Das ist KORREKT (200g × 8/2 = 800g). Berechne die Menge PRO PORTION: 800g ÷ 8 = 100g pro Portion – völlig normal. Schlage NIEMALS vor, eine korrekt skalierte Menge zu reduzieren!

5. **duplicate**: Zutaten die TATSÄCHLICH als ZWEI ODER MEHR separate Zeilen in der Einkaufsliste vorkommen und zusammengeführt werden sollten. Nutze die semantische Zutatenerkennung: "Zwiebel rot" und "Rote Zwiebel" als zwei Zeilen = Duplikat. "Tomate" und "Tomaten" als zwei Zeilen = Duplikat.
   KRITISCH: Wenn eine Zutat nur EINMAL in der Liste steht, ist sie KEIN Duplikat – auch wenn sie aus mehreren Rezepten stammt. Zähle die tatsächlichen Zeilen in der Einkaufsliste! Gib NIEMALS ein Issue für korrekt aggregierte Einzelzeilen aus.
   Bei duplicate-Issues MUSST du zusätzlich angeben:
   - "mergeTargetId": Die ID des Items das BEHALTEN werden soll (das "Ziel")
   - "mergedAmount": Die SUMME beider Mengen. Mengen werden IMMER addiert, niemals absorbiert! Jede Zeile in der Einkaufsliste stammt aus einem Rezept und wird gebraucht.
   - "mergedUnit": Die Einheit der zusammengeführten Menge
   - "mergedName": Der beste Name für die zusammengeführte Zutat
   WICHTIG: itemId ist das Quell-Item (wird ENTFERNT), mergeTargetId ist das Ziel-Item (wird BEHALTEN und aktualisiert).
   KRITISCH Mengenberechnung: Mengen werden IMMER ADDIERT! Beide Einträge stammen aus verschiedenen Rezepten, daher wird die Gesamtmenge gebraucht.
   - Gleiche Einheiten: 200g + 300g → 500g. 1 Pkg + 1 Pkg → 2 Pkg.
   - Verschiedene Einheiten: Wandle in eine gemeinsame Einheit um und addiere. Nutze typische Packungsgrößen zur Umrechnung.
     Beispiel: 1 Pkg Halloumi (≈ 200g) + 200g Halloumi → Gesamtbedarf 400g → 2 Pkg.
     Beispiel: 500ml Milch + 1 Liter Milch → 1.5 Liter.
   - NIEMALS darf eine Menge die andere "abdecken" oder "absorbieren"! 1 Pkg + 200g ≠ 1 Pkg!${hasReweMatching ? `

6. **rewe_mismatch**: REWE-Produkte die nicht zur Zutat passen. Beispiel: "Bohnen" zugeordnet zu "Bohnenaufstrich" ist falsch. Prüfe ob der REWE-Produktname (rewe_product.name) das richtige Produkt für die Zutat ist.
   WICHTIG bei REWE-Mengenvergleich:
   - Die REWE-Bestellmenge (Stückzahl) wird SEPARAT vom Benutzer verwaltet. Melde NIEMALS einen Mengen-Mismatch wenn das Produkt grundsätzlich das richtige Lebensmittel ist! Es ist NICHT deine Aufgabe zu prüfen ob genug bestellt wird.
   - ml und g sind bei Konserven/Dosen/Flüssigkeiten praktisch austauschbar (400g Dose ≈ 400ml). Melde KEINEN Fehler nur wegen ml vs g Unterschied.
   - Beispiel: 800ml stückige Tomaten + REWE-Produkt "400g Dose stückige Tomaten" = KORREKT. Produkt ist richtig, Menge regelt der User über die Stückzahl. KEIN rewe_mismatch!
   - Beispiel: 1kg Mehl + REWE-Produkt "500g Mehl" = KORREKT. Produkt ist richtig, User bestellt 2. KEIN rewe_mismatch!
   - NUR melden wenn das Produkt INHALTLICH falsch ist (z.B. "Bohnen" → "Bohnenaufstrich", "frische Chilis" → "getrocknete Chili-Mischung").

7. **rewe_missing**: Zutaten ohne REWE-Produktzuordnung (rewe_product ist null), die aber als Rezept-Zutat relevant wären (source="recipe"). Manuelle Items (source="manual") ignorieren.` : ''}

## Antwortformat

Antworte ausschließlich als JSON-Objekt:
{
  "issues": [
    {
      "itemId": 42,
      "ingredientName": "Knoblauch",
      "type": "pantry_covered",
      "severity": "medium",
      "confidence": 0.95,
      "message": "1 Knolle Knoblauch im Vorrat deckt die benötigte 1 Zehe ab",
      "suggestion": "remove",
      "suggestedAmount": null,
      "suggestedUnit": null,
      "recipeTitle": null,
      "recipeId": null
    }
  ]
}

Regeln:
- itemId: Die ID des betroffenen Einkaufslisten-Items (null bei missing_ingredient, da es noch nicht existiert)
- type: Einer der oben genannten Typen
- severity: "high" (sollte behoben werden), "medium" (prüfen empfohlen), "low" (Info)
- confidence: 0.0-1.0 (nur relevant bei pantry_covered)
- suggestion: "remove" (entfernen), "adjust" (Menge anpassen), "add" (hinzufügen), "review" (manuell prüfen), "merge" (zusammenführen, MUSS mergeTargetId + mergedAmount + mergedUnit + mergedName enthalten)
- recipeId: Die numerische ID des betroffenen Rezepts (NUR IDs aus der Rezeptliste oben verwenden!). IMMER angeben wenn sich das Issue auf ein bestimmtes Rezept bezieht (z.B. missing_ingredient, quantity_logic). Null wenn kein bestimmtes Rezept betroffen.
- recipeTitle: Der Titel des betroffenen Rezepts. IMMER zusammen mit recipeId angeben.${hasReweMatching ? '\n- severity für rewe_missing und rewe_mismatch immer "high"' : ''}
- Nenne Rezepte NICHT im message-Text. Verwende AUSSCHLIESSLICH die Felder recipeId und recipeTitle für Rezept-Referenzen. Der message-Text beschreibt nur das Problem.
- Keine Issues für geblockte oder als optional markierte Zutaten
- Keine Issues für permanente Vorräte die korrekt abgezogen wurden
- KRITISCH: Gib NUR echte Probleme aus. NIEMALS Bestätigungen, Statusmeldungen oder Erklärungen warum etwas KORREKT ist. Wenn etwas in Ordnung ist, einfach NICHT in die Issues aufnehmen.
- KEIN Issue ausgeben für korrekt aggregierte Einzelzeilen, auch wenn die Menge aus mehreren Rezepten summiert wurde.
- Leeres Array wenn alles in Ordnung ist
- WICHTIG: Nutze IMMER die semantische Zutatenerkennung. Melde NIEMALS eine Zutat als fehlend die unter einem anderen aber gleichbedeutenden Namen bereits in der Liste steht (z.B. "Zwiebel rot" deckt "Rote Zwiebel" ab, "Paprika gelb" deckt "Gelbe Paprika" ab, etc.)
- WICHTIG: Die Einkaufsliste wurde möglicherweise ohne vergangene Wochentage generiert. Prüfe nur Rezepte die in der obigen Rezeptliste aufgeführt sind.${skippedDayInfo ? `\n- HINWEIS: ${skippedDayInfo.skippedDays} vergangene Tage wurden beim Erstellen übersprungen. Die Rezepte dieser Tage sind NICHT in der obigen Rezeptliste enthalten und dürfen NICHT als fehlend gemeldet werden.` : ''}`;

  try {
    const result = await ai.chatJSON(prompt, { temperature: 0.2, maxTokens: 4096 });

    if (!result || !Array.isArray(result.issues)) {
      console.warn('⚠️ KI-Review: Unerwartetes Format:', result);
      return { issues: [], autoResolved: [] };
    }

    // --- 4. Normalisierung & Auto-Resolve ---
    const autoResolved = [];
    const manualIssues = [];

    // Gültige Recipe-IDs sammeln (für Validierung)
    const validRecipeIds = new Set(recipesWithIngredients.map(r => r.id));

    for (const rawIssue of result.issues) {
      // Validierung des Issue-Formats
      if (!rawIssue.type || !rawIssue.message) continue;

      // Falsche "Bestätigungs-Issues" herausfiltern (KI bestätigt Korrektheit statt Probleme zu melden)
      const msgLower = rawIssue.message.toLowerCase();
      if (msgLower.includes('kein duplikat') || msgLower.includes('korrekt aggregiert') ||
          msgLower.includes('ist korrekt') || msgLower.includes('kein problem') ||
          msgLower.includes('passt zusammen') || msgLower.includes('alles in ordnung')) {
        console.log(`🔍 KI-Review: Bestätigungs-Issue gefiltert: "${rawIssue.message.substring(0, 80)}"`);
        continue;
      }

      // Normalisierung: itemId → item_id, ingredientName → ingredient
      const issue = {
        ...rawIssue,
        item_id: rawIssue.itemId || rawIssue.item_id || null,
        ingredient: rawIssue.ingredientName || rawIssue.ingredient || null,
        recipe_id: rawIssue.recipeId || rawIssue.recipe_id || null,
        recipe_title: rawIssue.recipeTitle || rawIssue.recipe_title || null,
        merge_target_id: rawIssue.mergeTargetId || rawIssue.merge_target_id || null,
        merged_amount: rawIssue.mergedAmount ?? rawIssue.merged_amount ?? null,
        merged_unit: rawIssue.mergedUnit || rawIssue.merged_unit || null,
        merged_name: rawIssue.mergedName || rawIssue.merged_name || null,
      };
      // Normalisierung: suggestion String → Objekt { action, label }
      if (typeof issue.suggestion === 'string') {
        const action = issue.suggestion;
        const labels = {
          remove: 'Entfernen', adjust: 'Menge anpassen', add: 'Hinzufügen',
          review: 'Prüfen', merge: 'Zusammenführen', check: 'Abhaken',
        };
        issue.suggestion = {
          action,
          label: labels[action] || action,
          amount: issue.suggestedAmount || null,
          unit: issue.suggestedUnit || null,
          ingredient_name: issue.ingredientName || issue.ingredient || null,
        };
      }
      // Entferne camelCase-Felder die wir normalisiert haben
      delete issue.itemId;
      delete issue.ingredientName;
      delete issue.suggestedAmount;
      delete issue.suggestedUnit;
      delete issue.recipeId;
      delete issue.recipeTitle;
      delete issue.mergeTargetId;
      delete issue.mergedAmount;
      delete issue.mergedUnit;
      delete issue.mergedName;

      // Recipe-ID validieren (muss in unserer Rezeptliste existieren)
      if (issue.recipe_id && !validRecipeIds.has(issue.recipe_id)) {
        console.log(`🔍 KI-Review: Ungültige recipe_id ${issue.recipe_id} gefiltert`);
        issue.recipe_id = null;
        issue.recipe_title = null;
      }

      // Merge-Issue validieren: mergeTargetId muss ein existierendes Item sein
      if (issue.suggestion?.action === 'merge') {
        const validItemIds = new Set(listItems.map(i => i.id));
        // item_id und merge_target_id dürfen nicht identisch sein
        if (issue.item_id && issue.merge_target_id && issue.item_id === issue.merge_target_id) {
          console.log(`🔍 KI-Review: merge item_id === merge_target_id (${issue.item_id}) – Issue übersprungen`);
          continue;
        }
        if (issue.merge_target_id && !validItemIds.has(issue.merge_target_id)) {
          console.log(`🔍 KI-Review: Ungültige merge_target_id ${issue.merge_target_id} gefiltert`);
          issue.merge_target_id = null;
        }
        if (issue.item_id && !validItemIds.has(issue.item_id)) {
          console.log(`🔍 KI-Review: Ungültige item_id ${issue.item_id} in merge-Issue gefiltert`);
          continue; // Ganzes Issue überspringen wenn Source-Item nicht existiert
        }
      }

      // Duplicate-Issue validieren: Prüfe ob tatsächlich 2+ Zeilen für diese Zutat existieren
      if (issue.type === 'duplicate') {
        const ingredientLower = (issue.ingredient || '').toLowerCase();
        const matchingItems = listItems.filter(i =>
          (i.ingredient_name || '').toLowerCase() === ingredientLower
        );
        if (matchingItems.length < 2) {
          // Kein echter Duplikat — die Zutat kommt nur einmal vor
          console.log(`🔍 KI-Review: Falsches Duplikat gefiltert – "${issue.ingredient}" kommt nur ${matchingItems.length}x vor`);
          continue;
        }
      }

      // --- User-Settings für Auto-Resolve laden ---
      const autoMerge = userSettings.shopping_auto_ai_merge === '1' || userSettings.shopping_auto_ai_merge === 'true';
      const autoAdjust = userSettings.shopping_auto_ai_adjust === '1' || userSettings.shopping_auto_ai_adjust === 'true';

      // Auto-Resolve: pantry_covered mit hoher Konfidenz → Item als erledigt markieren
      if (issue.type === 'pantry_covered' && issue.confidence >= 0.9 && issue.suggestion?.action === 'remove' && issue.item_id) {
        db.prepare(
          'UPDATE shopping_list_items SET is_checked = 1 WHERE id = ? AND shopping_list_id = ?'
        ).run(issue.item_id, listId);
        autoResolved.push({ ...issue, autoResolved: true });
      // Auto-Resolve: Duplikate automatisch zusammenführen
      } else if (autoMerge && issue.type === 'duplicate' && issue.suggestion?.action === 'merge' && issue.item_id && issue.merge_target_id && issue.merged_amount != null) {
        try {
          // Ziel-Item aktualisieren
          db.prepare(
            'UPDATE shopping_list_items SET amount = ?, unit = ?, ingredient_name = COALESCE(?, ingredient_name) WHERE id = ? AND shopping_list_id = ?'
          ).run(issue.merged_amount, issue.merged_unit || null, issue.merged_name || null, issue.merge_target_id, listId);
          // Quell-Item löschen
          db.prepare(
            'DELETE FROM shopping_list_items WHERE id = ? AND shopping_list_id = ?'
          ).run(issue.item_id, listId);
          console.log(`🔍 KI-Review: Auto-Merge ${issue.item_id} → ${issue.merge_target_id} (${issue.merged_amount} ${issue.merged_unit})`);
          autoResolved.push({ ...issue, autoResolved: true });
        } catch (mergeErr) {
          console.warn('⚠️ Auto-Merge fehlgeschlagen:', mergeErr.message);
          manualIssues.push(issue);
        }
      // Auto-Resolve: Mengen automatisch anpassen
      } else if (autoAdjust && issue.suggestion?.action === 'adjust' && issue.item_id && issue.suggestion.amount != null) {
        // Server-seitige Schutzlogik: Berechne die erwartete Mindestmenge basierend auf
        // den Rezept-Zutaten × planned_servings. Verhindere, dass Auto-Adjust Mengen
        // unter die skalierte Rezeptmenge reduziert (KI-Halluzination bei Portionsskalierung).
        const targetItem = listItems.find(i => i.id === issue.item_id);
        let expectedMinAmount = 0;
        if (targetItem) {
          const ingredientLower = resolveAlias(targetItem.ingredient_name).toLowerCase();
          for (const recipe of recipesWithIngredients) {
            for (const ing of recipe.ingredients) {
              const ingCanonical = resolveAlias(ing.name).toLowerCase();
              if (ingCanonical === ingredientLower && ing.amount) {
                expectedMinAmount += scaleIngredient(ing.amount, recipe.servings, recipe.planned_servings);
              }
            }
          }
        }
        if (expectedMinAmount > 0 && issue.suggestion.amount < expectedMinAmount * 0.9) {
          console.log(`🔍 KI-Review: Auto-Adjust blockiert – KI schlug ${issue.suggestion.amount} vor, aber Rezepte erwarten mindestens ${expectedMinAmount} für "${targetItem?.ingredient_name}"`);
          manualIssues.push(issue);
        } else {
          try {
            db.prepare(
              'UPDATE shopping_list_items SET amount = ?, unit = COALESCE(?, unit) WHERE id = ? AND shopping_list_id = ?'
            ).run(issue.suggestion.amount, issue.suggestion.unit || null, issue.item_id, listId);
            console.log(`🔍 KI-Review: Auto-Adjust Item ${issue.item_id} → ${issue.suggestion.amount} ${issue.suggestion.unit || ''}`);
            autoResolved.push({ ...issue, autoResolved: true });
          } catch (adjustErr) {
            console.warn('⚠️ Auto-Adjust fehlgeschlagen:', adjustErr.message);
            manualIssues.push(issue);
          }
        }
      } else {
        manualIssues.push(issue);
      }
    }

    // Review-Ergebnis in der Liste speichern (für persistente Anzeige)
    db.prepare(
      'UPDATE shopping_lists SET ai_review_issues = ? WHERE id = ?'
    ).run(JSON.stringify(manualIssues), listId);

    console.log(`🔍 KI-Review: ${manualIssues.length} Issues, ${autoResolved.length} auto-resolved`);

    return { issues: manualIssues, autoResolved };
  } catch (err) {
    console.error('❌ KI-Review fehlgeschlagen:', err.message);
    return { issues: [], autoResolved: [], error: err.message };
  }
}
