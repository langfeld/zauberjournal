/**
 * ============================================
 * MealPlan Store - Kalender-basierte Wochenplan-Verwaltung
 * ============================================
 * Pinia Store mit Monats-Kalender, Generierung,
 * Rezepttausch, Drag & Drop und Gekocht-Status.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useApi, apiRaw } from '@/composables/useApi.js';
import { offlineQueue } from '@/services/offlineQueue.js';

export const useMealPlanStore = defineStore('mealplan', () => {
  const currentPlan = ref(null);
  const plans = ref([]);
  const reasoning = ref(null);
  const reasoningSource = ref(null);
  const reasoningLoading = ref(false);
  const planHistory = ref([]);
  const availableWeeks = ref([]);
  const lastWeekRecipes = ref([]);
  const pastWeekRecipes = ref([]);
  const pastWeekOffset = ref(1);
  const pastWeekNumber = ref(null);
  const pastWeekHasPlan = ref(false);
  const pastWeekIndex = ref(0);
  const householdSuggestions = ref([]);
  const loading = ref(false);
  const generating = ref(false);
  const lastFetched = ref(null);

  // ── Wochenansicht: plan-übergreifende Entries (Mo-So) ──
  const weekViewData = ref(null);

  // ── Kalender-Ansicht (neu) ──
  const calendarMonth = ref(new Date());
  const selectedDateRange = ref(null); // { startDate, endDate }
  const calendarData = ref(null); // { entries: [], plans: [] }
  const planColors = ref({}); // Map: planId -> color

  const api = useApi();

  /** Hilfsfunktion: Farbe eines Plans cachen */
  function cachePlanColor(planId, color) {
    if (planId && color) {
      planColors.value[planId] = color;
    }
  }

  /** Hilfsfunktion: Farben aus Plan-Array cachen */
  function cachePlanColors(planList) {
    for (const p of (planList || [])) {
      if (p.id && p.color) {
        planColors.value[p.id] = p.color;
      }
    }
  }

  /** Wochenplan generieren */
  async function generatePlan(options = {}) {
    generating.value = true;
    reasoning.value = null;
    reasoningSource.value = null;
    try {
      const data = await api.post('/mealplan/generate', options);
      currentPlan.value = data.plan;
      if (data.plan?.id && data.plan?.color) {
        cachePlanColor(data.plan.id, data.plan.color);
      }
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
        await new Promise(r => setTimeout(r, interval));
      }
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
      if (data.plan?.id && data.plan?.color) {
        cachePlanColor(data.plan.id, data.plan.color);
      }
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

  /** Alle Entries in einem Datumsbereich laden (plan-übergreifend) */
  async function fetchWeekEntries(startDate, endDate) {
    loading.value = true;
    try {
      const data = await api.get(`/mealplan?startDate=${startDate}&endDate=${endDate}`);
      weekViewData.value = data;
      currentPlan.value = {
        id: null,
        week_start: startDate,
        start_date: startDate,
        end_date: endDate,
        entries: data.entries || [],
        is_locked: false,
      };
      cachePlanColors(data.plans);
      lastFetched.value = Date.now();
      return data;
    } catch (err) {
      if (!navigator.onLine && weekViewData.value) {
        return weekViewData.value;
      }
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /** Alle Entries für einen ganzen Monat laden (für Kalender-Ansicht) */
  async function fetchMonthEntries(year, month) {
    loading.value = true;
    try {
      const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const endDateObj = new Date(year, month + 1, 0);
      const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(endDateObj.getDate()).padStart(2, '0')}`;

      const data = await api.get(`/mealplan?startDate=${startDate}&endDate=${endDate}`);
      calendarData.value = data;
      cachePlanColors(data.plans);
      lastFetched.value = Date.now();
      return data;
    } catch (err) {
      if (!navigator.onLine && calendarData.value) {
        return calendarData.value;
      }
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /** Kalendermonat setzen und Daten laden */
  async function setCalendarMonth(date) {
    calendarMonth.value = new Date(date);
    return fetchMonthEntries(date.getFullYear(), date.getMonth());
  }

  /** Zeitraum-Selektion für Generierung setzen */
  function setSelectedDateRange(startDate, endDate) {
    selectedDateRange.value = { startDate, endDate };
  }

  /** Zeitraum-Selektion zurücksetzen */
  function clearSelectedDateRange() {
    selectedDateRange.value = null;
  }

  /** Rezepte der letzten realen Kalenderwoche laden */
  async function fetchLastWeekRecipes() {
    try {
      const data = await api.get('/mealplan/last-week-recipes');
      lastWeekRecipes.value = data.recipes || [];
      return data;
    } catch {
      // silent
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

  /** Haushalt-Vorschläge laden */
  async function fetchHouseholdSuggestions(limit = 12) {
    try {
      const data = await api.get(`/mealplan/household-suggestions?limit=${limit}`);
      householdSuggestions.value = data.suggestions || [];
      return data;
    } catch {
      householdSuggestions.value = [];
    }
  }

  /** Vergangene Wochen mit Plänen (>=2 Wochen zurück), sortiert DESC */
  const pastWeeksList = computed(() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const currentMonday = new Date(now);
    currentMonday.setHours(0, 0, 0, 0);
    currentMonday.setDate(currentMonday.getDate() - diff);
    const cutoff = new Date(currentMonday);
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;

    return (availableWeeks.value || [])
      .filter(w => w.week_start < cutoffStr)
      .sort((a, b) => b.week_start.localeCompare(a.week_start));
  });

  /** Plan-Historie laden */
  async function fetchHistory() {
    const data = await api.get('/mealplan/history');
    planHistory.value = data.plans;
    cachePlanColors(data.plans);
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
    let entry = null;
    if (currentPlan.value?.entries) {
      entry = currentPlan.value.entries.find(e => e.id === entryId);
    }
    const newState = entry?.is_cooked ? 0 : 1;
    if (entry) entry.is_cooked = newState;

    try {
      const data = await apiRaw(`/mealplan/${planId}/entry/${entryId}/cooked`, { method: 'POST', body: { is_cooked: newState } });
      if (data.swapped && data.plan && currentPlan.value) {
        if (!currentPlan.value.id && weekViewData.value) {
          const { startDate, endDate } = weekViewData.value;
          await fetchWeekEntries(startDate, endDate);
        } else {
          currentPlan.value = data.plan;
        }
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
        return { is_cooked: newState };
      }
      if (entry) entry.is_cooked = newState ? 0 : 1;
      throw err;
    }
  }

  /** Portionen eines Eintrags ändern (offline-fähig) */
  async function updateServings(planId, entryId, servings) {
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
  async function addRecipeToPlan(recipeId, dayOfWeek, categoryId, weekStart, servings, planDate, startDate, endDate) {
    const body = {
      recipe_id: recipeId,
      day_of_week: dayOfWeek,
      category_id: categoryId,
      week_start: weekStart,
      servings,
    };
    if (planDate) body.plan_date = planDate;
    if (startDate) body.start_date = startDate;
    if (endDate) body.end_date = endDate;
    const data = await api.post('/mealplan/add-recipe', body);
    if (data.plan && currentPlan.value?.week_start === weekStart) {
      currentPlan.value = data.plan;
    }
    if (data.plan?.id && data.plan?.color) {
      cachePlanColor(data.plan.id, data.plan.color);
    }
    return data;
  }

  /** Eintrag per Drag & Drop verschieben */
  async function moveEntry(planId, entryId, dayOfWeek, categoryId, planDate) {
    const body = { day_of_week: dayOfWeek, category_id: categoryId };
    if (planDate) body.plan_date = planDate;
    const data = await api.post(`/mealplan/${planId}/entry/${entryId}/move`, body);
    if (data.plan) {
      if (!currentPlan.value?.id && currentPlan.value?.entries) {
        const entry = currentPlan.value.entries.find(e => e.id === entryId);
        if (entry) {
          entry.day_of_week = dayOfWeek;
          entry.category_id = categoryId;
          if (planDate) entry.plan_date = planDate;
        }
      } else {
        currentPlan.value = data.plan;
      }
    }
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

  /** Plan bearbeiten (Start-/End-Datum) */
  async function updatePlan(planId, { startDate, endDate }) {
    const data = await api.put(`/mealplan/${planId}`, { startDate, endDate });
    if (currentPlan.value && currentPlan.value.id === planId) {
      currentPlan.value.start_date = startDate;
      currentPlan.value.end_date = endDate;
    }
    const weekEntry = availableWeeks.value.find(w => w.id === planId);
    if (weekEntry) {
      weekEntry.start_date = startDate;
      weekEntry.end_date = endDate;
    }
    const historyEntry = planHistory.value.find(p => p.id === planId);
    if (historyEntry) {
      historyEntry.start_date = startDate;
      historyEntry.end_date = endDate;
    }
    return data;
  }

  /** Wochenplan fixieren/freigeben */
  async function toggleLock(planId) {
    const data = await api.post(`/mealplan/${planId}/lock`);
    if (currentPlan.value && currentPlan.value.id === planId) {
      currentPlan.value.is_locked = data.is_locked;
    }
    const weekEntry = availableWeeks.value.find(w => w.id === planId);
    if (weekEntry) weekEntry.is_locked = data.is_locked;
    const historyEntry = planHistory.value.find(p => p.id === planId);
    if (historyEntry) historyEntry.is_locked = data.is_locked;
    // Auch in calendarData aktualisieren (falls der Plan gerade im Kalender sichtbar ist)
    if (calendarData.value?.plans) {
      const calPlan = calendarData.value.plans.find(p => p.id === planId);
      if (calPlan) calPlan.is_locked = data.is_locked;
    }
    return data;
  }

  /** Verfügbare Wochen mit Plänen + Rezept-Vorschau laden */
  async function fetchAvailableWeeks() {
    const data = await api.get('/mealplan/available-weeks');
    availableWeeks.value = data.weeks;
    cachePlanColors(data.weeks);
    return data;
  }

  /** Alle Pläne mit Metadaten laden */
  async function fetchPlans() {
    const data = await api.get('/mealplan/plans');
    plans.value = data.plans || [];
    cachePlanColors(data.plans);
    return data;
  }

  /** Plan per ID laden und als currentPlan setzen */
  async function fetchPlanById(planId) {
    loading.value = true;
    try {
      const data = await api.get(`/mealplan?planId=${planId}`);
      currentPlan.value = data.plan;
      if (data.plan?.id && data.plan?.color) {
        cachePlanColor(data.plan.id, data.plan.color);
      }
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
    if (data.plan) {
      currentPlan.value = data.plan;
      if (data.plan?.id && data.plan?.color) {
        cachePlanColor(data.plan.id, data.plan.color);
      }
    }
    return data;
  }

  return {
    currentPlan, plans, reasoning, reasoningSource, reasoningLoading, planHistory, availableWeeks, lastWeekRecipes, loading, generating, lastFetched,
    pastWeekRecipes, pastWeekOffset, pastWeekNumber, pastWeekHasPlan, pastWeekIndex, pastWeeksList, householdSuggestions,
    weekViewData,
    calendarMonth, selectedDateRange, calendarData, planColors,
    generatePlan, pollReasoning, fetchCurrentPlan, fetchPlanById, fetchPlans, fetchHistory, fetchAvailableWeeks, fetchLastWeekRecipes, fetchPastWeekRecipes,
    fetchHouseholdSuggestions,
    fetchWeekEntries, fetchMonthEntries, setCalendarMonth, setSelectedDateRange, clearSelectedDateRange,
    fetchSuggestions, markCooked, updateServings, swapRecipe, addEntry, addRecipeToPlan, moveEntry, removeEntry, deletePlan,
    toggleLock, duplicatePlan, updatePlan,
  };
}, {
  persist: {
    pick: ['currentPlan', 'availableWeeks', 'planHistory', 'lastFetched', 'lastWeekRecipes', 'planColors'],
  },
});
