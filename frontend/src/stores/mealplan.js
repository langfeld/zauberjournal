/**
 * ============================================
 * MealPlan Store - Wochenplan-Verwaltung
 * ============================================
 * Pinia Store mit Wochen-Navigation, Generierung,
 * Rezepttausch, Drag & Drop und Gekocht-Status.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useApi, apiRaw } from '@/composables/useApi.js';
import { offlineQueue } from '@/services/offlineQueue.js';

export const useMealPlanStore = defineStore('mealplan', () => {
  const currentPlan = ref(null);
  const plans = ref([]); // Liste aller Pläne (für Plan-Ansicht Dropdown)
  const reasoning = ref(null);
  const reasoningSource = ref(null); // 'ai' | 'algorithm' | null
  const reasoningLoading = ref(false); // Lädt KI-Reasoning im Hintergrund?
  const planHistory = ref([]);
  const availableWeeks = ref([]);
  const lastWeekRecipes = ref([]); // Rezepte der letzten realen Kalenderwoche
  const pastWeekRecipes = ref([]); // Rezepte einer vergangenen Woche (Slider)
  const pastWeekOffset = ref(1); // Offset für vergangene Wochen (1 = letzte Woche)
  const pastWeekNumber = ref(null); // KW-Nummer der geladenen vergangenen Woche
  const pastWeekHasPlan = ref(false); // Hat diese vergangene Woche einen Plan?
  const pastWeekIndex = ref(0); // Index in pastWeeksList (für Skip-Navigation)
  const loading = ref(false);
  const generating = ref(false);
  const lastFetched = ref(null); // Timestamp des letzten Fetches

  const api = useApi();

  /** Wochenplan generieren */
  async function generatePlan(options = {}) {
    generating.value = true;
    reasoning.value = null;
    reasoningSource.value = null;
    try {
      const data = await api.post('/mealplan/generate', options);
      currentPlan.value = data.plan;
      return data;
    } finally {
      generating.value = false;
    }
  }

  /** KI-Reasoning für einen Plan per Polling abrufen */
  async function pollReasoning(planId, { maxAttempts = 20, interval = 2000 } = {}) {
    reasoningLoading.value = true;
    reasoning.value = null;
    reasoningSource.value = null;
    try {
      for (let i = 0; i < maxAttempts; i++) {
        const data = await api.get(`/mealplan/reasoning/${planId}`);
        if (data.status === 'ready') {
          reasoning.value = data.reasoning;
          reasoningSource.value = data.reasoningSource || 'ai';
          return data;
        }
        // Noch nicht fertig → warten und nochmal
        await new Promise(r => setTimeout(r, interval));
      }
      // Timeout → kein Reasoning
      console.warn('KI-Reasoning Timeout nach', maxAttempts, 'Versuchen');
    } finally {
      reasoningLoading.value = false;
    }
  }

  /** Wochenplan für bestimmte Woche laden */
  async function fetchCurrentPlan(weekStart) {
    loading.value = true;
    try {
      const params = weekStart ? `?weekStart=${weekStart}` : '';
      const data = await api.get(`/mealplan${params}`);
      currentPlan.value = data.plan;
      lastFetched.value = Date.now();
      // Gespeichertes Reasoning aus der DB wiederherstellen
      if (data.plan?.reasoning) {
        reasoning.value = data.plan.reasoning;
        reasoningSource.value = 'ai';
      } else {
        reasoning.value = null;
        reasoningSource.value = null;
      }
      return data;
    } catch (err) {
      // Bei Netzwerkfehler: gecachte Daten behalten
      if (!navigator.onLine && currentPlan.value) {
        return { plan: currentPlan.value };
      }
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /** Rezepte der letzten realen Kalenderwoche laden */
  async function fetchLastWeekRecipes() {
    try {
      const data = await api.get('/mealplan/last-week-recipes');
      lastWeekRecipes.value = data.recipes || [];
      return data;
    } catch {
      // silent – nicht kritisch
    }
  }

  /** Rezepte einer vergangenen Woche per weekStart laden */
  async function fetchPastWeekRecipes(weekStart) {
    try {
      const data = await api.get(`/mealplan/past-week-recipes?weekStart=${weekStart}`);
      pastWeekRecipes.value = data.recipes || [];
      pastWeekNumber.value = data.weekNumber || null;
      pastWeekHasPlan.value = data.hasPlan || false;
      return data;
    } catch {
      pastWeekRecipes.value = [];
      pastWeekNumber.value = null;
      pastWeekHasPlan.value = false;
    }
  }

  /** Vergangene Wochen mit Plänen (≥2 Wochen zurück), sortiert DESC */
  const pastWeeksList = computed(() => {
    const now = new Date();
    // Montag der aktuellen Woche berechnen
    const dayOfWeek = now.getDay(); // 0=So, 1=Mo, ...
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const currentMonday = new Date(now);
    currentMonday.setHours(0, 0, 0, 0);
    currentMonday.setDate(currentMonday.getDate() - diff);
    // Grenze: alles vor letzter Woche (≥2 Wochen zurück)
    const cutoff = new Date(currentMonday);
    cutoff.setDate(cutoff.getDate() - 7); // letzte Woche noch ausschließen
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    return (availableWeeks.value || [])
      .filter(w => w.week_start < cutoffStr)
      .sort((a, b) => b.week_start.localeCompare(a.week_start));
  });

  /** Plan-Historie laden */
  async function fetchHistory() {
    const data = await api.get('/mealplan/history');
    planHistory.value = data.plans;
    return data;
  }

  /** Rezeptvorschläge für einen Slot */
  async function fetchSuggestions({ dayIdx, categoryId, excludeRecipeIds = [], planId = null, search = null }) {
    const params = new URLSearchParams({ dayIdx, limit: 8 });
    if (categoryId) params.set('categoryId', categoryId);
    if (excludeRecipeIds.length) params.set('excludeRecipeIds', excludeRecipeIds.join(','));
    if (planId) params.set('planId', planId);
    if (search) params.set('search', search);
    const data = await api.get(`/mealplan/suggestions?${params}`);
    return data.suggestions;
  }

  /** Eintrag als gekocht togglen (offline-fähig) */
  async function markCooked(planId, entryId) {
    // Optimistic UI sofort
    let entry = null;
    if (currentPlan.value?.entries) {
      entry = currentPlan.value.entries.find(e => e.id === entryId);
    }
    const newState = entry?.is_cooked ? 0 : 1;
    if (entry) entry.is_cooked = newState;

    try {
      const data = await apiRaw(`/mealplan/${planId}/entry/${entryId}/cooked`, { method: 'POST', body: { is_cooked: newState } });
      // Bei Tausch: kompletten Plan übernehmen (Positionen haben sich geändert)
      if (data.swapped && data.plan && currentPlan.value) {
        currentPlan.value = data.plan;
      } else if (currentPlan.value?.entries) {
        const e = currentPlan.value.entries.find(e => e.id === entryId);
        if (e) e.is_cooked = data.is_cooked;
      }
      return data;
    } catch (err) {
      if (offlineQueue.isOfflineError(err)) {
        await offlineQueue.enqueue({
          type: 'mealplan:markCooked',
          payload: { planId, entryId, is_cooked: newState },
          storeName: 'mealplan',
        });
        return { is_cooked: newState }; // Optimistic UI bleibt
      }
      // Anderer Fehler: Rollback
      if (entry) entry.is_cooked = newState ? 0 : 1;
      throw err;
    }
  }

  /** Portionen eines Eintrags ändern (offline-fähig) */
  async function updateServings(planId, entryId, servings) {
    // Optimistic UI
    let oldServings = null;
    if (currentPlan.value?.entries) {
      const entry = currentPlan.value.entries.find(e => e.id === entryId);
      if (entry) {
        oldServings = entry.servings;
        entry.servings = servings;
      }
    }

    try {
      const data = await apiRaw(`/mealplan/${planId}/entry/${entryId}`, { method: 'PUT', body: { servings } });
      if (currentPlan.value?.entries && data.entry) {
        const idx = currentPlan.value.entries.findIndex(e => e.id === entryId);
        if (idx !== -1) currentPlan.value.entries[idx] = data.entry;
      }
      return data;
    } catch (err) {
      if (offlineQueue.isOfflineError(err)) {
        await offlineQueue.enqueue({
          type: 'mealplan:updateServings',
          payload: { planId, entryId, servings },
          storeName: 'mealplan',
        });
        return { entry: { id: entryId, servings } };
      }
      // Rollback
      if (oldServings !== null && currentPlan.value?.entries) {
        const entry = currentPlan.value.entries.find(e => e.id === entryId);
        if (entry) entry.servings = oldServings;
      }
      throw err;
    }
  }

  /** Rezept eines Eintrags tauschen */
  async function swapRecipe(planId, entryId, newRecipeId) {
    const data = await api.put(`/mealplan/${planId}/entry/${entryId}`, { recipe_id: newRecipeId });
    // Lokalen Entry aktualisieren
    if (currentPlan.value?.entries && data.entry) {
      const idx = currentPlan.value.entries.findIndex(e => e.id === entryId);
      if (idx !== -1) currentPlan.value.entries[idx] = data.entry;
    }
    return data;
  }

  /** Neuen Eintrag in einem leeren Slot hinzufügen */
  async function addEntry(planId, recipeId, dayOfWeek, categoryId, servings, planDate) {
    const body = { recipe_id: recipeId, day_of_week: dayOfWeek, category_id: categoryId, servings };
    if (planDate) body.plan_date = planDate;
    const data = await api.post(`/mealplan/${planId}/entry`, body);
    if (currentPlan.value?.entries && data.entry) {
      currentPlan.value.entries.push(data.entry);
    }
    return data;
  }

  /** Rezept manuell zum Wochenplan hinzufügen (erstellt Plan automatisch) */
  async function addRecipeToPlan(recipeId, dayOfWeek, categoryId, weekStart, servings) {
    const data = await api.post('/mealplan/add-recipe', {
      recipe_id: recipeId,
      day_of_week: dayOfWeek,
      category_id: categoryId,
      week_start: weekStart,
      servings,
    });
    // Wenn der aktuelle Plan betroffen ist, aktualisieren
    if (data.plan && currentPlan.value?.week_start === weekStart) {
      currentPlan.value = data.plan;
    }
    return data;
  }

  /** Eintrag per Drag & Drop verschieben */
  async function moveEntry(planId, entryId, dayOfWeek, categoryId, planDate) {
    const body = { day_of_week: dayOfWeek, category_id: categoryId };
    if (planDate) body.plan_date = planDate;
    const data = await api.post(`/mealplan/${planId}/entry/${entryId}/move`, body);
    if (data.plan) currentPlan.value = data.plan;
    return data;
  }

  /** Einzelnen Eintrag entfernen */
  async function removeEntry(planId, entryId) {
    await api.del(`/mealplan/${planId}/entry/${entryId}`);
    if (currentPlan.value?.entries) {
      currentPlan.value.entries = currentPlan.value.entries.filter(e => e.id !== entryId);
    }
  }

  /** Gesamten Plan löschen */
  async function deletePlan(planId) {
    await api.del(`/mealplan/${planId}`);
    currentPlan.value = null;
  }

  /** Wochenplan fixieren/freigeben */
  async function toggleLock(planId) {
    const data = await api.post(`/mealplan/${planId}/lock`);
    if (currentPlan.value && currentPlan.value.id === planId) {
      currentPlan.value.is_locked = data.is_locked;
    }
    // availableWeeks synchronisieren (für ShoppingView-Dropdown)
    const weekEntry = availableWeeks.value.find(w => w.id === planId);
    if (weekEntry) weekEntry.is_locked = data.is_locked;
    // planHistory synchronisieren (für LoadPlanDialog)
    const historyEntry = planHistory.value.find(p => p.id === planId);
    if (historyEntry) historyEntry.is_locked = data.is_locked;
    return data;
  }

  /** Verfügbare Wochen mit Plänen + Rezept-Vorschau laden */
  async function fetchAvailableWeeks() {
    const data = await api.get('/mealplan/available-weeks');
    availableWeeks.value = data.weeks;
    return data;
  }

  /** Alle Pläne mit Metadaten laden (für Plan-Ansicht Dropdown) */
  async function fetchPlans() {
    const data = await api.get('/mealplan/plans');
    plans.value = data.plans || [];
    return data;
  }

  /** Plan per ID laden und als currentPlan setzen */
  async function fetchPlanById(planId) {
    loading.value = true;
    try {
      const data = await api.get(`/mealplan?planId=${planId}`);
      currentPlan.value = data.plan;
      lastFetched.value = Date.now();
      if (data.plan?.reasoning) {
        reasoning.value = data.plan.reasoning;
        reasoningSource.value = 'ai';
      } else {
        reasoning.value = null;
        reasoningSource.value = null;
      }
      return data;
    } catch (err) {
      if (!navigator.onLine && currentPlan.value) {
        return { plan: currentPlan.value };
      }
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /** Plan auf eine andere Woche duplizieren */
  async function duplicatePlan(sourcePlanId, targetWeekStart) {
    const data = await api.post(`/mealplan/${sourcePlanId}/duplicate`, { targetWeekStart });
    // Wenn Zielwoche = aktuell angezeigte Woche, Plan aktualisieren
    if (data.plan) {
      currentPlan.value = data.plan;
    }
    return data;
  }

  return {
    currentPlan, plans, reasoning, reasoningSource, reasoningLoading, planHistory, availableWeeks, lastWeekRecipes, loading, generating, lastFetched,
    pastWeekRecipes, pastWeekOffset, pastWeekNumber, pastWeekHasPlan, pastWeekIndex, pastWeeksList,
    generatePlan, pollReasoning, fetchCurrentPlan, fetchPlanById, fetchPlans, fetchHistory, fetchAvailableWeeks, fetchLastWeekRecipes, fetchPastWeekRecipes,
    fetchSuggestions, markCooked, updateServings, swapRecipe, addEntry, addRecipeToPlan, moveEntry, removeEntry, deletePlan,
    toggleLock, duplicatePlan,
  };
}, {
  persist: {
    pick: ['currentPlan', 'availableWeeks', 'planHistory', 'lastFetched', 'lastWeekRecipes'],
  },
});
