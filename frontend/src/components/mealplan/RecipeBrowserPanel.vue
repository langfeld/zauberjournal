<!--
  ============================================
  RecipeBrowserPanel - Rezept-Browser für Split-View
  ============================================
  Seitliches Panel im Wochenplaner zum Durchsuchen und
  per Drag & Drop Zuweisen von Rezepten.
-->
<template>
  <Transition name="panel-slide">
    <aside
      v-if="visible"
      class="flex flex-col bg-white dark:bg-stone-900 border-l border-stone-200 dark:border-stone-800 w-80 h-full shrink-0 overflow-hidden"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-stone-200 dark:border-stone-800">
        <h3 class="flex items-center gap-2 font-semibold text-stone-800 dark:text-stone-100 text-sm">
          <BookOpen class="w-4 h-4 text-primary-500" />
          Rezepte
        </h3>
        <button
          @click="$emit('close')"
          class="p-1 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
          title="Panel schließen"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Filter -->
      <div class="px-3 py-2 space-y-2 border-b border-stone-100 dark:border-stone-800">
        <!-- Suche -->
        <div class="relative">
          <Search class="top-1/2 left-2.5 absolute w-3.5 h-3.5 text-stone-400 -translate-y-1/2" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Rezept suchen..."
            class="bg-stone-50 dark:bg-stone-800 py-1.5 pr-3 pl-8 border border-stone-200 focus:border-primary-400 dark:border-stone-700 rounded-lg outline-none w-full text-xs"
          />
        </div>
        <!-- Kategorie -->
        <select
          v-model="selectedCategory"
          class="bg-stone-50 dark:bg-stone-800 px-2.5 py-1.5 border border-stone-200 dark:border-stone-700 rounded-lg outline-none w-full text-stone-700 dark:text-stone-300 text-xs"
        >
          <option value="">Alle Kategorien</option>
          <option v-for="cat in recipesStore.visibleCategories" :key="cat.id" :value="cat.name">
            {{ cat.icon }} {{ cat.name }}
          </option>
        </select>
      </div>

      <!-- Rezept-Liste -->
      <div class="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1.5">
        <!-- Ladeindikator -->
        <div v-if="loading" class="flex justify-center py-8">
          <div class="w-6 h-6 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
        </div>

        <!-- Keine Ergebnisse -->
        <div v-else-if="!panelRecipes.length" class="py-8 text-center text-stone-400 dark:text-stone-500 text-xs">
          <ChefHat class="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Keine Rezepte gefunden</p>
        </div>

        <!-- Rezept-Mini-Karten -->
        <div
          v-for="recipe in panelRecipes"
          :key="recipe.id"
          class="group flex gap-2.5 bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 border border-stone-200 dark:border-stone-700 hover:border-primary-300 dark:hover:border-primary-600 rounded-lg p-1.5 cursor-grab active:cursor-grabbing transition-all"
          draggable="true"
          @dragstart="onDragStart($event, recipe)"
          @dragend="onDragEnd($event)"
        >
          <!-- Thumbnail -->
          <div class="w-14 h-14 rounded-md overflow-hidden bg-stone-200 dark:bg-stone-700 shrink-0">
            <img
              v-if="recipe.image_url"
              :src="recipe.image_url"
              :alt="recipe.title"
              class="w-full h-full object-cover"
            />
            <div v-else class="flex items-center justify-center w-full h-full text-xl opacity-40">
              🍽️
            </div>
          </div>

          <!-- Info -->
          <div class="flex flex-col justify-center min-w-0 flex-1">
            <span class="font-medium text-stone-800 dark:text-stone-100 text-xs leading-tight truncate">
              {{ recipe.title }}
            </span>
            <div class="flex items-center gap-2 mt-0.5 text-stone-400 dark:text-stone-500 text-[10px]">
              <span v-if="recipe.total_time" class="flex items-center gap-0.5">
                <Clock class="w-2.5 h-2.5" />
                {{ recipe.total_time }}'
              </span>
              <span v-if="recipe.servings" class="flex items-center gap-0.5">
                <Users class="w-2.5 h-2.5" />
                {{ recipe.servings }}
              </span>
            </div>
            <div v-if="recipe.category_names" class="flex flex-wrap gap-0.5 mt-1">
              <span
                v-for="cat in recipe.category_names.split(',').slice(0, 2)"
                :key="cat"
                class="bg-stone-200 dark:bg-stone-600 px-1.5 py-px rounded text-stone-500 dark:text-stone-300 text-[9px] truncate max-w-[80px]"
              >
                {{ cat.trim() }}
              </span>
            </div>
          </div>

          <!-- Drag-Griff -->
          <div class="flex items-center pr-0.5 text-stone-300 dark:text-stone-600 group-hover:text-stone-400 dark:group-hover:text-stone-500 transition-colors">
            <GripVertical class="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      <!-- Footer: Anzahl -->
      <div class="px-3 py-2 border-t border-stone-100 dark:border-stone-800 text-center text-stone-400 dark:text-stone-500 text-[10px]">
        {{ panelRecipes.length }} Rezept{{ panelRecipes.length !== 1 ? 'e' : '' }}
        <span v-if="searchQuery || selectedCategory"> (gefiltert)</span>
      </div>
    </aside>
  </Transition>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import { BookOpen, X, Search, ChefHat, Clock, Users, GripVertical } from 'lucide-vue-next';
import { useRecipesStore } from '@/stores/recipes.js';
import { useApi } from '@/composables/useApi.js';

const props = defineProps({
  visible: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'recipe-drag-start', 'recipe-drag-end']);

const recipesStore = useRecipesStore();
const api = useApi();

// ─── Lokaler State (unabhängig vom globalen Store-Filter) ───
const searchQuery = ref('');
const selectedCategory = ref('');
const panelRecipes = ref([]);
const loading = ref(false);
let fetchTimer = null;

// ─── Rezepte laden (eigener API-Call, unabhängig vom Store) ───
async function fetchPanelRecipes() {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    if (searchQuery.value) params.set('search', searchQuery.value);
    if (selectedCategory.value) params.set('category', selectedCategory.value);
    params.set('sort', 'title');
    params.set('order', 'asc');
    const data = await api.get(`/recipes?${params}`);
    panelRecipes.value = data.recipes || [];
  } catch {
    // Bei Fehler: persistierte Rezepte aus dem Store als Fallback
    panelRecipes.value = recipesStore.recipes || [];
  } finally {
    loading.value = false;
  }
}

// Debounced-Fetch bei Filter-Änderung
function debouncedFetch() {
  clearTimeout(fetchTimer);
  fetchTimer = setTimeout(fetchPanelRecipes, 300);
}

watch(searchQuery, debouncedFetch);
watch(selectedCategory, fetchPanelRecipes);

// Beim Öffnen laden
watch(() => props.visible, (v) => {
  if (v && !panelRecipes.value.length) fetchPanelRecipes();
});

onMounted(() => {
  // Kategorien laden falls nötig
  if (!recipesStore.visibleCategories.length) {
    recipesStore.fetchCategories();
  }
  if (props.visible) fetchPanelRecipes();
});

// ─── Drag & Drop ───
function onDragStart(event, recipe) {
  const data = {
    recipeId: recipe.id,
    recipeTitle: recipe.title,
    source: 'recipe-browser',
  };
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('application/json', JSON.stringify(data));
  event.dataTransfer.setData('text/plain', recipe.id.toString());
  if (event.target) event.target.style.opacity = '0.5';
  emit('recipe-drag-start', data);
}

function onDragEnd(event) {
  if (event?.target) event.target.style.opacity = '';
  emit('recipe-drag-end');
}
</script>

<style scoped>
/* Panel-Slide Transition */
.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}
.panel-slide-enter-from,
.panel-slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
