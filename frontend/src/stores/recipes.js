/**
 * ============================================
 * Recipes Store - Rezeptverwaltung
 * ============================================
 * CRUD-Operationen, Foto-Import und Filterung von Rezepten.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useApi } from '@/composables/useApi.js';
import { useAuthStore } from '@/stores/auth.js';

export const useRecipesStore = defineStore('recipes', () => {
  // --- State ---
  const recipes = ref([]);
  const currentRecipe = ref(null);
  const categories = ref([]);
  const loading = ref(false);
  const filters = ref({
    search: '',
    category: '',
    favorite: null,
    difficulty: '',
    collectionId: '',
    householdOnly: null,
    sort: 'created_at',
    order: 'desc',
  });

  // --- Getters ---
  const totalRecipes = computed(() => recipes.value.length);
  const favoriteRecipes = computed(() => recipes.value.filter(r => r.is_favorite));
  const recentRecipes = computed(() =>
    [...recipes.value]
      .sort((a, b) => {
        if (!a.last_cooked_at && !b.last_cooked_at) return 0;
        if (!a.last_cooked_at) return 1;
        if (!b.last_cooked_at) return -1;
        return new Date(b.last_cooked_at) - new Date(a.last_cooked_at);
      })
      .slice(0, 5)
  );

  /**
   * Deduplizierte Kategorien (für Anzeige in Rezept-Views, Filtern, Planer).
   * Im Haushalt-Kontext können mehrere Mitglieder gleichnamige Kategorien haben.
   * Hier werden sie nach Name zusammengeführt (eigene bevorzugt, recipe_count addiert).
   * SettingsView nutzt stattdessen `categories` direkt für die volle Verwaltung.
   */
  const authStore = useAuthStore();

  const visibleCategories = computed(() => {
    const all = categories.value;
    if (!all.length) return all;
    // Prüfen ob Haushalt-Kontext relevant (gibt es categories mit household_id?)
    const hasHousehold = all.some(c => c.household_id);
    if (!hasHousehold) return all;

    const currentUserId = authStore.user?.id;
    const deduped = new Map();
    for (const cat of all) {
      const key = cat.name.toLowerCase().trim();
      if (!deduped.has(key)) {
        deduped.set(key, { ...cat });
      } else {
        const existing = deduped.get(key);
        existing.recipe_count = (existing.recipe_count || 0) + (cat.recipe_count || 0);
        // Eigene Kategorie bevorzugen (wie Backend getMealTimeCategories)
        if (cat.user_id === currentUserId && existing.user_id !== currentUserId) {
          deduped.set(key, { ...cat, recipe_count: existing.recipe_count });
        }
      }
    }
    return [...deduped.values()];
  });

  /** Nur Kategorien mit is_meal_time-Flag (sortiert nach sort_order, dedupliziert) */
  const mealTimeCategories = computed(() =>
    visibleCategories.value.filter(c => c.is_meal_time).sort((a, b) => a.sort_order - b.sort_order)
  );
  /** Namen der Tageszeit-Kategorien als Set (für schnellen Lookup) */
  const mealTimeCategoryNames = computed(() =>
    new Set(mealTimeCategories.value.map(c => c.name))
  );

  // --- Actions ---
  const api = useApi();

  /** Alle Rezepte laden (mit Filtern) – offline: persistierte Daten behalten */
  async function fetchRecipes() {
    loading.value = true;
    try {
      const params = new URLSearchParams();
      if (filters.value.search) params.set('search', filters.value.search);
      if (filters.value.category) params.set('category', filters.value.category);
      if (filters.value.favorite !== null) params.set('favorite', filters.value.favorite);
      if (filters.value.difficulty) params.set('difficulty', filters.value.difficulty);
      if (filters.value.collectionId) params.set('collectionId', filters.value.collectionId);
      if (filters.value.householdOnly) params.set('householdOnly', 'true');
      params.set('sort', filters.value.sort);
      params.set('order', filters.value.order);

      const data = await api.get(`/recipes?${params}`);
      recipes.value = data.recipes;
      return data;
    } catch {
      // Offline: persistierte Daten behalten (kein Überschreiben mit leerem Array)
      return { recipes: recipes.value };
    } finally {
      loading.value = false;
    }
  }

  /** Einzelnes Rezept mit allen Details laden – offline: aus Cache suchen */
  async function fetchRecipe(id) {
    loading.value = true;
    try {
      const data = await api.get(`/recipes/${id}`);
      currentRecipe.value = data;
      return data;
    } catch {
      // Offline: Rezept aus persistierter Liste suchen
      const cached = recipes.value.find(r => r.id === Number(id));
      if (cached) {
        currentRecipe.value = cached;
        return cached;
      }
      // Kein Cache vorhanden → Fehler bleibt bestehen
      return null;
    } finally {
      loading.value = false;
    }
  }

  /** Rezept erstellen */
  async function createRecipe(recipeData) {
    const data = await api.post('/recipes', recipeData);
    await fetchRecipes(); // Liste aktualisieren
    return data;
  }

  /** Rezept aktualisieren */
  async function updateRecipe(id, recipeData) {
    const data = await api.put(`/recipes/${id}`, recipeData);
    await fetchRecipes();
    return data;
  }

  /** Rezept löschen */
  async function deleteRecipe(id) {
    await api.del(`/recipes/${id}`);
    recipes.value = recipes.value.filter(r => r.id !== id);
  }

  /** Mehrere Rezepte auf einmal löschen (Admin) */
  async function deleteRecipesBatch(ids) {
    const data = await api.post('/recipes/batch-delete', { ids });
    recipes.value = recipes.value.filter(r => !ids.includes(r.id));
    return data;
  }

  /** Rezept per Foto(s) importieren – unterstützt mehrere Seiten */
  async function importFromPhoto(files) {
    const formData = new FormData();
    // Unterstützt einzelne Datei oder Array von Dateien
    const fileList = Array.isArray(files) ? files : [files];
    for (const file of fileList) {
      formData.append('file', file);
    }
    try {
      const data = await api.upload('/recipes/import-photo', formData);
      await fetchRecipes();
      return data;
    } catch (err) {
      // Rezeptliste trotzdem aktualisieren — der Server hat das Rezept
      // möglicherweise gespeichert, obwohl die Antwort nicht ankam
      await fetchRecipes().catch(() => {});
      throw err;
    }
  }

  /** Rezept per Text importieren */
  async function importFromText(text) {
    try {
      const data = await api.post('/recipes/import-text', { text });
      await fetchRecipes();
      return data;
    } catch (err) {
      await fetchRecipes().catch(() => {});
      throw err;
    }
  }

  /** Rezept per URL importieren */
  async function importFromUrl(url) {
    try {
      const data = await api.post('/recipes/import-url', { url });
      await fetchRecipes();
      return data;
    } catch (err) {
      await fetchRecipes().catch(() => {});
      throw err;
    }
  }

  /** Favorit umschalten */
  async function toggleFavorite(id) {
    const data = await api.post(`/recipes/${id}/favorite`);
    const recipe = recipes.value.find(r => r.id === id);
    if (recipe) recipe.is_favorite = data.is_favorite ? 1 : 0;
    return data;
  }

  /** Als gekocht markieren */
  async function markAsCooked(id, details = {}) {
    return await api.post(`/recipes/${id}/cooked`, details);
  }

  /** Kategorien laden – offline: persistierte Daten behalten */
  async function fetchCategories() {
    try {
      const data = await api.get('/categories');
      categories.value = data.categories;
      return data;
    } catch {
      return { categories: categories.value };
    }
  }

  /** Kategorie erstellen */
  async function createCategory(categoryData) {
    const data = await api.post('/categories', categoryData);
    await fetchCategories();
    return data;
  }

  /** Kategorie aktualisieren */
  async function updateCategory(id, categoryData) {
    const data = await api.put(`/categories/${id}`, categoryData);
    await fetchCategories();
    return data;
  }

  /** Kategorie löschen */
  async function deleteCategory(id) {
    const data = await api.del(`/categories/${id}`);
    await fetchCategories();
    return data;
  }

  /** Kategorien-Reihenfolge aktualisieren (Batch) */
  async function reorderCategories(order) {
    const data = await api.put('/categories/reorder', { order });
    await fetchCategories();
    return data;
  }

  /** Rezepte als JSON exportieren */
  async function exportRecipes(includeImages = false) {
    const authStore = useAuthStore();
    const params = includeImages ? '?include_images=true' : '';
    const response = await fetch(`/api/recipes/export${params}`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (!response.ok) throw new Error('Export fehlgeschlagen');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rezepte-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Rezepte aus JSON-Datei importieren */
  async function importRecipes(file) {
    const formData = new FormData();
    formData.append('file', file);
    const data = await api.upload('/recipes/import', formData);
    await fetchRecipes();
    return data;
  }

  /** Prüft ob ein Rezept in einem fixierten, ungekochten Wochenplan steht */
  async function checkRevisionConflicts(recipeId) {
    return await api.get(`/recipes/${recipeId}/revision-check`);
  }

  /** Rezept per KI überarbeiten (überschreiben oder als Kopie) */
  async function reviseRecipe(recipeId, instructions, mode) {
    const data = await api.post(`/recipes/${recipeId}/revise`, { instructions, mode });
    if (mode === 'overwrite' && data.recipe) {
      // Aktuelles Rezept im Store aktualisieren
      currentRecipe.value = data.recipe;
    }
    await fetchRecipes().catch(() => {});
    return data;
  }

  return {
    recipes, currentRecipe, categories, visibleCategories, loading, filters,
    totalRecipes, favoriteRecipes, recentRecipes,
    mealTimeCategories, mealTimeCategoryNames,
    fetchRecipes, fetchRecipe, createRecipe, updateRecipe, deleteRecipe, deleteRecipesBatch,
    importFromPhoto, importFromText, importFromUrl, toggleFavorite, markAsCooked,
    fetchCategories, createCategory, updateCategory, deleteCategory, reorderCategories,
    exportRecipes, importRecipes,
    checkRevisionConflicts, reviseRecipe,
  };
}, {
  persist: {
    pick: ['recipes', 'categories'],
  },
});
