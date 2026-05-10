/**
 * ============================================
 * Pantry Store - Vorratsschrank
 * ============================================
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useApi } from '@/composables/useApi.js';

export const usePantryStore = defineStore('pantry', () => {
  const items = ref([]);
  const categories = ref([]);
  const expiringCount = ref(0);
  const loading = ref(false);

  // Rezept-Ansicht
  const recipeViewData = ref(null);
  const recipeViewLoading = ref(false);
  const selectedWeekStart = ref(null);

  // Zutaten-Verfügbarkeit (für Rezept-Detailansicht)
  const ingredientAvailability = ref(new Map());

  const api = useApi();

  // Items nach Kategorie gruppiert
  const groupedItems = computed(() => {
    const groups = {};
    for (const item of items.value) {
      const cat = item.category || 'Sonstiges';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    return groups;
  });

  /** Vorräte laden */
  async function fetchItems(filter = {}) {
    loading.value = true;
    try {
      const params = new URLSearchParams();
      if (filter.category) params.set('category', filter.category);
      if (filter.expiring) params.set('expiring', 'true');
      const data = await api.get(`/pantry?${params}`);
      items.value = data.items;
      categories.value = data.categories;
      expiringCount.value = data.expiringCount;
      return data;
    } finally {
      loading.value = false;
    }
  }

  /** Vorrat hinzufügen */
  async function addItem(itemData) {
    const data = await api.post('/pantry', itemData);
    await fetchItems();
    invalidateRecipeView();
    return data;
  }

  /** Rezept-Ansicht invalidieren (falls geladen) – silent refresh ohne Loading-Spinner */
  function invalidateRecipeView() {
    if (recipeViewData.value) {
      fetchRecipeView(selectedWeekStart.value, { silent: true });
    }
  }

  /** Vorrat aktualisieren */
  async function updateItem(id, itemData) {
    const data = await api.put(`/pantry/${id}`, itemData);
    await fetchItems();
    invalidateRecipeView();
    return data;
  }

  /** Menge entnehmen */
  async function useAmount(id, amount) {
    const data = await api.post(`/pantry/${id}/use`, { amount });
    await fetchItems();
    invalidateRecipeView();
    return data;
  }

  /** Vorrat löschen (optimistisch) */
  async function removeItem(id) {
    // Optimistic UI: sofort aus lokaler Liste entfernen
    const removedItem = items.value.find(i => i.id === id);
    items.value = items.value.filter(i => i.id !== id);
    invalidateRecipeView();

    try {
      await api.del(`/pantry/${id}`);
    } catch (err) {
      // Fehler: Item wiederherstellen
      if (removedItem) items.value.push(removedItem);
      throw err;
    }
  }

  /** Mehrere Vorräte auf einmal löschen */
  async function deleteItemsBatch(ids) {
    const data = await api.post('/pantry/batch-delete', { ids });
    await fetchItems();
    invalidateRecipeView();
    return data;
  }

  /** Vorräte importieren (JSON oder CSV) */
  async function importItems(file) {
    const formData = new FormData();
    formData.append('file', file);
    const data = await api.upload('/pantry/import', formData);
    await fetchItems();
    invalidateRecipeView();
    return data;
  }

  /** Vorratsmengen für eine Liste von Zutaten prüfen (für Rezept-Detailansicht) */
  async function checkIngredients(ingredients) {
    try {
      const data = await api.post('/pantry/check', { ingredients });
      const availability = new Map();
      for (const ing of data.ingredients) {
        availability.set(ing.name.toLowerCase().trim(), {
          amount: ing.pantryAmount,
          unit: ing.pantryUnit,
          available: ing.available,
          isPermanent: ing.isPermanent,
        });
      }
      ingredientAvailability.value = availability;
      return data;
    } catch {
      ingredientAvailability.value = new Map();
    }
  }

  /** Zutaten-Verfügbarkeit zurücksetzen */
  function clearIngredientAvailability() {
    ingredientAvailability.value = new Map();
  }

  /** Rezept-Ansicht laden (gruppiert nach Wochenplan-Rezepten) */
  async function fetchRecipeView(weekStart = null, { silent = false } = {}) {
    if (!silent) recipeViewLoading.value = true;
    try {
      const params = new URLSearchParams();
      if (weekStart) params.set('weekStart', weekStart);
      const data = await api.get(`/pantry/recipe-view?${params}`);
      recipeViewData.value = data;
      selectedWeekStart.value = data.weekStart;

      // Auto-Jump: Wenn kein expliziter weekStart angefragt wurde,
      // keine Rezepte vorhanden sind und andere Wochen verfügbar sind,
      // automatisch zur nächsten verfügbaren Woche springen
      if (!weekStart && data.recipes.length === 0 && data.availableWeeks?.length > 0) {
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const sorted = [...data.availableWeeks].sort((a, b) => a.week_start.localeCompare(b.week_start));
        // Bevorzuge nächste zukünftige Woche, sonst letzte vergangene
        const futureWeek = sorted.find(w => w.week_start >= today);
        const target = futureWeek || sorted[sorted.length - 1];
        if (target && target.week_start !== data.weekStart) {
          return await fetchRecipeView(target.week_start, { silent });
        }
      }

      return data;
    } finally {
      if (!silent) recipeViewLoading.value = false;
    }
  }

  // Computed: Rezept-Gruppen
  const recipeGroups = computed(() => recipeViewData.value?.recipes || []);
  const unassignedItems = computed(() => recipeViewData.value?.unassigned || []);
  const availableWeeks = computed(() => recipeViewData.value?.availableWeeks || []);

  return {
    items, categories, expiringCount, loading, groupedItems,
    recipeViewData, recipeViewLoading, selectedWeekStart, recipeGroups, unassignedItems, availableWeeks,
    ingredientAvailability,
    fetchItems, addItem, updateItem, useAmount, removeItem, deleteItemsBatch, importItems,
    checkIngredients, clearIngredientAvailability,
    fetchRecipeView,
  };
});
