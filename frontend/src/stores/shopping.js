/**
 * ============================================
 * Shopping Store - Einkaufsliste
 * ============================================
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useApi, apiRaw } from '@/composables/useApi.js';
import { useAuthStore } from '@/stores/auth.js';
import { offlineQueue } from '@/services/offlineQueue.js';

export const useShoppingStore = defineStore('shopping', () => {
  const currentList = ref(null);
  const items = ref([]);
  const reweMatches = ref([]);
  const loading = ref(false);
  const listHistory = ref([]);
  const lastFetched = ref(null); // Timestamp des letzten Fetches

  // Vorratscheck
  const pantryCheck = ref(null);
  const pantryCheckLoading = ref(false);

  // KI-Review
  const aiReviewIssues = ref([]);
  const aiReviewAutoResolved = ref([]);
  const aiReviewLoading = ref(false);
  const aiReviewDismissed = ref(false); // Guard: verhindert Re-Loading nach Dismiss

  // User-Settings (serverseitig)
  const userSettings = ref({});
  const userSettingsLoaded = ref(false);

  // REWE-Matching Fortschritt
  const reweProgress = ref(null); // null = kein Matching aktiv

  const api = useApi();

  // Kombinierte aktive Liste (für Template-Zugriff via shoppingStore.activeList)
  const activeList = computed(() => {
    if (!currentList.value) return null;
    return { ...currentList.value, items: items.value };
  });

  // Anzahl der noch offenen Items
  const openItemsCount = computed(() => items.value.filter(i => !i.is_checked).length);
  // Geschätzter Gesamtpreis (REWE) – Preis × Anzahl Packungen
  const estimatedTotal = computed(() =>
    items.value.reduce((sum, i) => {
      const price = i.rewe_price || 0;
      const qty = i.rewe_product?.quantity || 1;
      return sum + (price * qty);
    }, 0)
  );
  // Items mit REWE-Produktzuordnung (für "Bei REWE bestellen")
  const reweLinkedItems = computed(() =>
    items.value.filter(i => i.rewe_product?.url && !i.is_checked)
  );

  /** Einkaufsliste aus Wochenplan generieren (per mealPlanId oder startDate/endDate) */
  async function generateList(mealPlanId, { name, excludePastDays = true, mode = 'replace', startDate, endDate } = {}) {
    loading.value = true;
    aiReviewDismissed.value = false; // Guard zurücksetzen bei neuer Liste
    try {
      const body = { name, excludePastDays, mode };
      if (startDate && endDate) {
        body.startDate = startDate;
        body.endDate = endDate;
      } else {
        body.mealPlanId = mealPlanId;
      }
      const data = await api.post('/shopping/generate', body);
      await fetchActiveList();
      // Vorratscheck zurücksetzen (wird beim nächsten Aufklappen neu geladen)
      pantryCheck.value = null;
      // AI-Review Ergebnisse übernehmen (wenn Auto-Review aktiv war)
      if (data.aiReview) {
        aiReviewIssues.value = data.aiReview.issues || [];
        aiReviewAutoResolved.value = data.aiReview.autoResolved || [];
      }
      return data;
    } finally {
      loading.value = false;
    }
  }

  /** Aktive Einkaufsliste laden (mit Stale-While-Revalidate) */
  async function fetchActiveList({ background = false } = {}) {
    try {
      const data = await api.get('/shopping/list');
      currentList.value = data.list;
      items.value = data.items || [];
      lastFetched.value = Date.now();
      // AI-Review Issues aus der Liste laden (falls vorhanden)
      if (data.list?.ai_review_issues && !aiReviewDismissed.value) {
        try {
          aiReviewIssues.value = JSON.parse(data.list.ai_review_issues);
        } catch { aiReviewIssues.value = []; }
      } else if (!aiReviewDismissed.value) {
        aiReviewIssues.value = [];
      }
      return data;
    } catch (err) {
      // Bei Netzwerkfehler: gecachte Daten behalten
      if (background && currentList.value) {
        console.warn('[Shopping] Hintergrund-Refresh fehlgeschlagen, verwende Cache');
        return { list: currentList.value, items: items.value };
      }
      if (!navigator.onLine && currentList.value) {
        return { list: currentList.value, items: items.value };
      }
      throw err;
    }
  }

  /** Alle Einkaufslisten (Verlauf) laden */
  async function fetchListHistory() {
    const data = await api.get('/shopping/lists');
    listHistory.value = data.lists || [];
    return data;
  }

  /** Bestimmte Einkaufsliste laden (auch inaktive) */
  async function loadList(listId) {
    const data = await api.get(`/shopping/lists/${listId}`);
    currentList.value = data.list;
    items.value = data.items || [];
    return data;
  }

  /** Einkaufsliste (wieder) aktivieren */
  async function reactivateList(listId) {
    await api.put(`/shopping/lists/${listId}/activate`);
    await fetchActiveList();
  }

  /** Item abhaken (offline-fähig) */
  async function toggleItem(itemId) {
    // Temp-Items (offline erstellt) → nur lokal toggeln, kein Server-Call
    if (typeof itemId === 'string' && itemId.startsWith('temp-')) {
      const item = items.value.find(i => i.id === itemId);
      if (item) item.is_checked = item.is_checked ? 0 : 1;
      return;
    }

    // Optimistic UI sofort
    const item = items.value.find(i => i.id === itemId);
    if (!item) return;
    const newState = item.is_checked ? 0 : 1;
    item.is_checked = newState;

    try {
      await apiRaw(`/shopping/item/${itemId}/check`, { method: 'PUT', body: { is_checked: newState } });
    } catch (err) {
      // Bei Netzwerkfehler: in Offline-Queue schieben
      if (offlineQueue.isOfflineError(err)) {
        await offlineQueue.enqueue({
          type: 'shopping:toggleItem',
          payload: { itemId, is_checked: newState },
          storeName: 'shopping',
        });
        return; // Kein Fehler – Optimistic UI bleibt
      }
      // Anderer Fehler: Optimistic UI zurückrollen
      item.is_checked = newState ? 0 : 1;
      throw err;
    }
  }

  /** REWE-Produkte matchen (mit SSE-Fortschritt) */
  async function matchWithRewe(listId) {
    const authStore = useAuthStore();
    const id = listId || currentList.value?.id;
    if (!id) throw new Error('Keine aktive Einkaufsliste');
    loading.value = true;
    reweProgress.value = { current: 0, total: 0, itemName: '', matchedCount: 0, matched: false, productName: null, price: null };

    try {
      const response = await fetch('/api/rewe/match-shopping-list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authStore.token}`,
        },
        body: JSON.stringify({ listId: id }),
      });

      if (!response.ok) {
        throw new Error(`REWE-Matching fehlgeschlagen (${response.status})`);
      }

      // SSE-Stream lesen
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let doneData = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE-Events parsen (Format: "data: {...}\n\n")
        const events = buffer.split('\n\n');
        buffer = events.pop() || ''; // Letztes (unvollständiges) Element behalten

        for (const event of events) {
          const line = event.trim();
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'progress') {
              reweProgress.value = { ...data };
            } else if (data.type === 'done') {
              doneData = data;
            }
          } catch { /* ungültige JSON-Zeile ignorieren */ }
        }
      }

      // Liste neu laden, damit die in der DB gespeicherten REWE-Preise angezeigt werden
      await fetchActiveList();
      return doneData || {};
    } finally {
      loading.value = false;
      // Progress nach kurzem Delay ausblenden (damit man das Ergebnis noch sieht)
      setTimeout(() => { reweProgress.value = null; }, 1500);
    }
  }

  /** Einkauf abschließen – abgehakte Items in den Vorratsschrank */
  async function completePurchase({ includeAll = false } = {}) {
    if (!currentList.value?.id) throw new Error('Keine aktive Einkaufsliste');
    const data = await api.post(`/shopping/${currentList.value.id}/complete`, { includeAll });
    // Liste zurücksetzen
    currentList.value = null;
    items.value = [];
    return data;
  }

  /** Manuell ein Item zur Einkaufsliste hinzufügen (offline-fähig) */
  async function addItem({ ingredient_name, amount, unit }) {
    try {
      const data = await apiRaw('/shopping/item/add', { method: 'POST', body: { ingredient_name, amount, unit } });
      items.value.push(data);
      if (!currentList.value) {
        await fetchActiveList();
      }
      return data;
    } catch (err) {
      if (offlineQueue.isOfflineError(err)) {
        // Optimistic: lokales Placeholder-Item erstellen
        const tempItem = {
          id: `temp-${Date.now()}`,
          ingredient_name,
          amount: amount || null,
          unit: unit || null,
          is_checked: 0,
          recipe_ids: '[]',
          source: 'manual',
          _offline: true,
        };
        items.value.push(tempItem);
        await offlineQueue.enqueue({
          type: 'shopping:addItem',
          payload: { ingredient_name, amount, unit, tempId: tempItem.id },
          storeName: 'shopping',
        });
        return tempItem;
      }
      throw err;
    }
  }

  /** Item von der Einkaufsliste löschen (offline-fähig) */
  async function deleteItem(itemId) {
    // Optimistic UI sofort
    const removedItem = items.value.find(i => i.id === itemId);
    items.value = items.value.filter(i => i.id !== itemId);

    // AI-Issues bereinigen die dieses Item referenzieren (verhindert verwaiste Hinweise)
    aiReviewIssues.value = aiReviewIssues.value.filter(i => i.item_id !== itemId);

    // Temp-Items (offline erstellt) brauchen keinen Server-Call
    if (typeof itemId === 'string' && itemId.startsWith('temp-')) {
      return;
    }

    try {
      await apiRaw(`/shopping/item/${itemId}`, { method: 'DELETE' });
      if (pantryCheck.value) {
        fetchPantryCheck();
      }
    } catch (err) {
      if (offlineQueue.isOfflineError(err)) {
        await offlineQueue.enqueue({
          type: 'shopping:deleteItem',
          payload: { itemId },
          storeName: 'shopping',
        });
        return; // Optimistic UI bleibt
      }
      // Anderer Fehler: Item wiederherstellen
      if (removedItem) items.value.push(removedItem);
      throw err;
    }
  }

  /** Menge/Einheit/Name eines Items aktualisieren */
  async function updateItem(itemId, { amount, unit, ingredient_name } = {}) {
    const body = {};
    if (amount !== undefined) body.amount = amount;
    if (unit !== undefined) body.unit = unit;
    if (ingredient_name !== undefined) body.ingredient_name = ingredient_name;

    const data = await api.put(`/shopping/item/${itemId}`, body);

    // Lokales Item sofort aktualisieren
    const item = items.value.find(i => i.id === itemId);
    if (item && data.item) {
      item.amount = data.item.amount;
      item.unit = data.item.unit;
      item.ingredient_name = data.item.ingredient_name;
    }

    return data;
  }

  /** Vorratscheck laden (welche Vorräte sollten für den Wochenplan vorhanden sein?) */
  async function fetchPantryCheck() {
    pantryCheckLoading.value = true;
    try {
      const data = await api.get('/shopping/pantry-check');
      pantryCheck.value = data;
      return data;
    } finally {
      pantryCheckLoading.value = false;
    }
  }

  /** Zutat aus Vorratscheck zur Einkaufsliste verschieben */
  async function moveFromPantryToList({ ingredient_name, amount, unit, pantry_item_id }) {
    const data = await api.post('/shopping/pantry-check/move-to-list', {
      ingredient_name, amount, unit, pantry_item_id,
    });
    // Neues Item direkt in die lokale Liste einfügen
    if (data.item) {
      items.value.push(data.item);
    }
    return data;
  }

  /** Item in den Vorratsschrank verschieben */
  async function moveToPantry(itemId) {
    const data = await api.post(`/shopping/item/${itemId}/to-pantry`, {});
    items.value = items.value.filter(i => i.id !== itemId);
    // Vorratscheck aktualisieren (Vorrat hat sich geändert)
    if (pantryCheck.value) {
      fetchPantryCheck();
    }
    return data;
  }

  // ============================================
  // KI-Review
  // ============================================

  /** User-Settings vom Server laden */
  async function fetchUserSettings() {
    try {
      const data = await api.get('/user-settings');
      userSettings.value = data.settings || {};
      userSettingsLoaded.value = true;
    } catch {
      userSettings.value = {};
    }
    return userSettings.value;
  }

  /** Einzelnes User-Setting speichern */
  async function saveUserSetting(key, value) {
    await api.put(`/user-settings/${key}`, { value });
    userSettings.value = { ...userSettings.value, [key]: value };
  }

  /** KI-Review manuell starten */
  async function fetchAIReview() {
    if (!currentList.value?.id) return;
    aiReviewLoading.value = true;
    aiReviewDismissed.value = false; // Guard zurücksetzen bei neuem Review
    try {
      const data = await api.post('/shopping/ai-review', { listId: currentList.value.id });
      aiReviewIssues.value = data.issues || [];
      aiReviewAutoResolved.value = data.autoResolved || [];
      // Prüfen ob auto-resolved Aktionen Items verändert haben (merge/adjust/remove)
      const hasAutoChanges = aiReviewAutoResolved.value.length > 0;
      if (hasAutoChanges) {
        // Liste neu laden um gelöschte/gemergte/angepasste Items zu synchronisieren
        await fetchActiveList();
      } else {
        // Nur lokale Updates für pantry_covered (abhaken)
        for (const resolved of aiReviewAutoResolved.value) {
          if (resolved.item_id) {
            const item = items.value.find(i => i.id === resolved.item_id);
            if (item) item.is_checked = 1;
          }
        }
      }
      return data;
    } finally {
      aiReviewLoading.value = false;
    }
  }

  /** Einzelnes AI-Issue verwerfen (lokal) */
  function dismissIssue(issueIndex) {
    aiReviewIssues.value = aiReviewIssues.value.filter((_, i) => i !== issueIndex);
  }

  /** Alle AI-Issues verwerfen und serverseitig löschen */
  async function dismissAllIssues() {
    // Sofort lokal clearen (Optimistic UI)
    aiReviewIssues.value = [];
    aiReviewAutoResolved.value = [];
    aiReviewDismissed.value = true;
    // Server-Cleanup fire-and-forget
    if (currentList.value?.id) {
      api.del(`/shopping/ai-review?listId=${currentList.value.id}`).catch(() => {});
    }
  }

  /** Vorschlag eines AI-Issues anwenden */
  async function applyIssueSuggestion(issue, issueIndex) {
    // Issue sofort entfernen (Optimistic UI) – verhindert Stale-Index-Probleme
    // wenn deleteItem() das Array ebenfalls modifiziert
    dismissIssue(issueIndex);

    try {
      const action = issue.suggestion?.action;
      const itemId = issue.item_id;

      if (action === 'remove' && itemId) {
        await deleteItem(itemId);
      } else if (action === 'check' && itemId) {
        const item = items.value.find(i => i.id === itemId);
        if (item && !item.is_checked) {
          await toggleItem(itemId);
        }
      } else if (action === 'add') {
        await addItem({
          ingredient_name: issue.suggestion.ingredient_name || issue.ingredient,
          amount: issue.suggestion.amount || null,
          unit: issue.suggestion.unit || null,
        });
      } else if (action === 'update_amount' && itemId) {
        const item = items.value.find(i => i.id === itemId);
        if (item) {
          await deleteItem(itemId);
          await addItem({
            ingredient_name: item.ingredient_name,
            amount: issue.suggestion.amount,
            unit: issue.suggestion.unit || item.unit,
          });
        }
      } else if (action === 'adjust' && itemId) {
        // Menge anpassen
        const item = items.value.find(i => i.id === itemId);
        if (item && issue.suggestion.amount != null) {
          await deleteItem(itemId);
          await addItem({
            ingredient_name: item.ingredient_name,
            amount: issue.suggestion.amount,
            unit: issue.suggestion.unit || item.unit,
          });
        }
      } else if (action === 'merge' && itemId) {
        // KI-gestütztes Zusammenführen: Ziel-Item aktualisieren und Quell-Item löschen
        const targetId = issue.merge_target_id;
        const sourceItem = items.value.find(i => i.id === itemId);

        if (targetId && issue.merged_amount != null) {
          // Neues Format: KI hat Merge-Details geliefert
          await updateItem(targetId, {
            amount: issue.merged_amount,
            unit: issue.merged_unit || null,
            ingredient_name: issue.merged_name || null,
          });
        } else if (sourceItem) {
          // Fallback: Duplikat über Zutatennamen suchen und Mengen addieren
          const ingredientLower = (issue.ingredient || sourceItem.ingredient_name || '').toLowerCase();
          const target = items.value.find(i =>
            i.id !== itemId &&
            (i.ingredient_name || '').toLowerCase() === ingredientLower
          );
          if (target) {
            const sameUnit = (target.unit || '') === (sourceItem.unit || '');
            const newAmount = sameUnit
              ? (parseFloat(target.amount) || 0) + (parseFloat(sourceItem.amount) || 0)
              : target.amount; // Verschiedene Einheiten → Ziel-Menge behalten
            await updateItem(target.id, {
              amount: newAmount || target.amount,
              unit: target.unit || sourceItem.unit || null,
            });
          }
        }
        // Quell-Item entfernen (deleteItem bereinigt auch zugehörige AI-Issues)
        if (sourceItem) {
          await deleteItem(itemId);
        }
      } else if (action === 'review') {
        // "Prüfen" → nur den Hinweis verwerfen, User soll selbst schauen
      }
      // Issue wurde bereits am Anfang entfernt (Optimistic UI)
    } catch (err) {
      console.error('[Shopping] Fehler beim Anwenden des KI-Vorschlags:', err);
      throw err;
    }
  }

  /** REWE-Produkte für eine Zutat suchen (für Produkt-Picker) */
  async function searchReweProducts(query) {
    return await api.get(`/rewe/search-ingredient?q=${encodeURIComponent(query)}`);
  }

  /** REWE-Produkt für ein Item manuell setzen/ändern (speichert auch Präferenz) */
  async function setReweProduct(itemId, product) {
    const data = await api.put(`/shopping/item/${itemId}/rewe-product`, {
      productId: product.id,
      productName: product.name,
      price: product.price,
      packageSize: product.packageSize,
      imageUrl: product.imageUrl || null,
    });
    // Lokales Item sofort aktualisieren
    const item = items.value.find(i => i.id === itemId);
    if (item) {
      item.rewe_product_id = product.id;
      item.rewe_product_name = product.name;
      item.rewe_price = product.price;
      item.rewe_package_size = product.packageSize;
      item.rewe_image_url = product.imageUrl || null;
      item.rewe_product = data.rewe_product; // enthält jetzt auch quantity + imageUrl
    }
    return data;
  }

  /** REWE-Packungsanzahl manuell ändern */
  async function updateReweQuantity(itemId, quantity) {
    const data = await api.put(`/shopping/item/${itemId}/rewe-quantity`, { quantity });
    const item = items.value.find(i => i.id === itemId);
    if (item && item.rewe_product) {
      item.rewe_product.quantity = data.quantity;
      item.rewe_quantity = data.quantity;
    }
    return data;
  }

  /** Gespeicherte REWE Produkt-Präferenzen laden */
  async function fetchPreferences() {
    return await api.get('/rewe/preferences');
  }

  /** Alle Favoriten für eine bestimmte Zutat laden (Multi-Favoriten) */
  async function fetchPreferencesByIngredient(ingredientName) {
    return await api.get(`/rewe/preferences/${encodeURIComponent(ingredientName.toLowerCase().trim())}`);
  }

  /** Neuen Favoriten für eine Zutat hinzufügen */
  async function addPreference(ingredientName, product) {
    return await api.post('/rewe/preferences', {
      ingredient_name: ingredientName,
      rewe_product_id: product.id,
      rewe_product_name: product.name,
      rewe_price: product.price,
      rewe_package_size: product.packageSize || null,
      rewe_image_url: product.imageUrl || null,
    });
  }

  /** Einzelne Produkt-Präferenz löschen */
  async function deletePreference(prefId) {
    return await api.del(`/rewe/preferences/${prefId}`);
  }

  /** Einzelne Produkt-Präferenz aktualisieren (bevorzugtes Produkt ändern) */
  async function updatePreference(prefId, product) {
    return await api.put(`/rewe/preferences/${prefId}`, {
      rewe_product_id: product.id,
      rewe_product_name: product.name,
      rewe_price: product.price,
      rewe_package_size: product.packageSize || null,
      rewe_image_url: product.imageUrl || null,
    });
  }

  /** Reihenfolge eines Favoriten ändern */
  async function reorderPreference(prefId, sortOrder) {
    return await api.put(`/rewe/preferences/${prefId}/reorder`, { sort_order: sortOrder });
  }

  /** Alle Produkt-Präferenzen löschen */
  async function clearAllPreferences() {
    return await api.del('/rewe/preferences');
  }

  // ============================================
  // Bring! Integration
  // ============================================

  const bringStatus = ref(null);       // { connected, email, list } oder null
  const bringLists = ref([]);          // Verfügbare Bring!-Listen
  const bringSending = ref(false);     // Wird gerade gesendet?
  const bringImporting = ref(false);   // Wird gerade importiert?

  /** Bring!-Status laden */
  async function fetchBringStatus() {
    try {
      bringStatus.value = await api.get('/bring/status');
    } catch {
      bringStatus.value = { connected: false };
    }
    return bringStatus.value;
  }

  /** Bring!-Account verbinden */
  async function connectBring(email, password, listUuid, listName) {
    const data = await api.post('/bring/connect', { email, password, listUuid, listName });
    bringStatus.value = { connected: true, email, list: data.list };
    bringLists.value = data.availableLists || [];
    return data;
  }

  /** Bring!-Listen laden */
  async function fetchBringLists() {
    const data = await api.get('/bring/lists');
    bringLists.value = data.lists || [];
    return data;
  }

  /** Standard-Liste ändern */
  async function setBringList(listUuid, listName) {
    await api.put('/bring/list', { listUuid, listName });
    if (bringStatus.value) {
      bringStatus.value.list = { uuid: listUuid, name: listName };
    }
  }

  /** Einkaufsliste an Bring! senden */
  async function sendToBring(listUuid) {
    bringSending.value = true;
    try {
      return await api.post('/bring/send', { listUuid });
    } finally {
      bringSending.value = false;
    }
  }

  /** Bring!-Verbindung trennen */
  async function disconnectBring() {
    await api.del('/bring/disconnect');
    bringStatus.value = { connected: false };
    bringLists.value = [];
  }

  /** Artikel aus Bring! importieren */
  async function importFromBring(listUuid) {
    bringImporting.value = true;
    try {
      const data = await api.post('/bring/import', { listUuid });
      // Importierte Items in die lokale Liste einfügen
      if (data.items && data.items.length > 0) {
        items.value.push(...data.items);
      }
      return data;
    } finally {
      bringImporting.value = false;
    }
  }

  // ============================================
  // REWE Warenkorb-Script (Bookmarklet)
  // ============================================

  /** REWE-Warenkorb-Script abrufen */
  async function getReweCartScript() {
    return await api.get('/rewe/cart-script');
  }

  /** REWE Userscript-Install-URL generieren */
  function getReweUserscriptUrl() {
    const authStore = useAuthStore();
    const baseUrl = window.location.origin;
    return `${baseUrl}/api/rewe/userscript.user.js?token=${encodeURIComponent(authStore.token)}`;
  }

  /** API-Key abrufen */
  async function getApiKey() {
    return await api.get('/auth/api-key');
  }

  /** API-Key generieren */
  async function generateApiKey() {
    return await api.post('/auth/api-key');
  }

  /** API-Key widerrufen */
  async function revokeApiKey() {
    return await api.del('/auth/api-key');
  }

  return {
    currentList, items, activeList, reweMatches, loading, reweProgress, listHistory, lastFetched,
    openItemsCount, estimatedTotal, reweLinkedItems,
    // Vorratscheck
    pantryCheck, pantryCheckLoading,
    // KI-Review
    aiReviewIssues, aiReviewAutoResolved, aiReviewLoading, userSettings, userSettingsLoaded,
    generateList, fetchActiveList, fetchListHistory, loadList, reactivateList, toggleItem, matchWithRewe, completePurchase, addItem, deleteItem, updateItem, moveToPantry,
    fetchPantryCheck, moveFromPantryToList,
    fetchAIReview, dismissIssue, dismissAllIssues, applyIssueSuggestion, fetchUserSettings, saveUserSetting,
    searchReweProducts, setReweProduct, updateReweQuantity, fetchPreferences, fetchPreferencesByIngredient, addPreference, deletePreference, updatePreference, reorderPreference, clearAllPreferences,
    // Bring!
    bringStatus, bringLists, bringSending, bringImporting,
    fetchBringStatus, connectBring, fetchBringLists, setBringList, sendToBring, disconnectBring, importFromBring,
    // REWE Script
    getReweCartScript,
    getReweUserscriptUrl,
    // API-Key
    getApiKey, generateApiKey, revokeApiKey,
  };
}, {
  persist: {
    pick: ['currentList', 'items', 'listHistory', 'lastFetched'],
  },
});
