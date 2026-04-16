<!--
  ============================================
  RecipeBrowserPanel - Rezept-Browser für Split-View
  ============================================
  Seitliches Panel im Wochenplaner zum Durchsuchen und
  per Drag & Drop Zuweisen von Rezepten.
  - Breite per Drag-Handle verstellbar
  - Responsive Grid mit Rezeptkarten
-->
<template>
    <div
      class="relative shrink-0 h-full overflow-hidden"
      :style="wrapperStyle"
    >
      <!-- Resize-Handle (linker Rand, nur sichtbar wenn offen) -->
      <div
        v-if="visible"
        class="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 group hover:bg-primary-400/30 active:bg-primary-400/50 transition-colors"
        @mousedown.prevent="startResize"
      >
        <div class="absolute left-0.5 top-1/2 -translate-y-1/2 w-0.5 h-8 rounded-full bg-stone-300 dark:bg-stone-600 group-hover:bg-primary-400 group-active:bg-primary-500 transition-colors" />
      </div>

      <aside
        class="flex flex-col bg-white dark:bg-stone-900 border-l border-stone-200 dark:border-stone-800 h-full overflow-hidden"
        :style="asideStyle"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-stone-200 dark:border-stone-800 shrink-0">
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
        <div class="px-3 py-2 space-y-2 border-b border-stone-100 dark:border-stone-800 shrink-0">
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

        <!-- Rezept-Grid -->
        <div class="flex-1 overflow-y-auto scrollbar-thin p-3 min-h-0">
          <!-- Ladeindikator -->
          <div v-if="loading" class="flex justify-center py-8">
            <div class="w-6 h-6 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
          </div>

          <!-- Keine Ergebnisse -->
          <div v-else-if="!panelRecipes.length" class="py-8 text-center text-stone-400 dark:text-stone-500 text-xs">
            <ChefHat class="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Keine Rezepte gefunden</p>
          </div>

          <!-- Rezept-Karten Grid (responsive: 1 Spalte bei schmal, mehr bei breit) -->
          <div
            v-else
            class="grid gap-3"
            :style="{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }"
          >
            <div
              v-for="recipe in panelRecipes"
              :key="recipe.id"
              class="group flex flex-col bg-white dark:bg-stone-800 hover:shadow-md border border-stone-200 dark:border-stone-700 hover:border-primary-300 dark:hover:border-primary-600 rounded-xl overflow-hidden cursor-grab active:cursor-grabbing transition-all"
              draggable="true"
              @dragstart="onDragStart($event, recipe)"
              @dragend="onDragEnd($event)"
            >
              <!-- Bild -->
              <div class="relative bg-stone-100 dark:bg-stone-700 aspect-4/3 overflow-hidden">
                <img
                  v-if="recipe.image_url"
                  :src="recipe.image_url"
                  :alt="recipe.title"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div v-else class="flex items-center justify-center w-full h-full text-3xl opacity-40">
                  🍽️
                </div>
                <!-- Schwierigkeit -->
                <span
                  v-if="recipe.difficulty"
                  :class="[
                    'absolute bottom-1.5 left-1.5 px-1.5 py-0.5 text-[10px] font-medium rounded-full',
                    difficultyClasses[recipe.difficulty] || difficultyClasses.mittel,
                  ]"
                >
                  {{ recipe.difficulty }}
                </span>
              </div>

              <!-- Info -->
              <div class="flex flex-col flex-1 p-2.5">
                <h4 class="font-semibold text-stone-800 dark:text-stone-100 text-xs leading-tight line-clamp-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                  {{ recipe.title }}
                </h4>
                <!-- Meta -->
                <div class="flex items-center gap-2 mt-1.5 text-stone-400 dark:text-stone-500 text-[10px]">
                  <span v-if="recipe.total_time" class="flex items-center gap-0.5">
                    <Clock class="w-2.5 h-2.5" />
                    {{ recipe.total_time }}'
                  </span>
                  <span v-if="recipe.servings" class="flex items-center gap-0.5">
                    <Users class="w-2.5 h-2.5" />
                    {{ recipe.servings }}
                  </span>
                  <span v-if="recipe.calories" class="flex items-center gap-0.5 text-orange-500 dark:text-orange-400">
                    <Flame class="w-2.5 h-2.5" />
                    {{ Math.round(recipe.calories) }}
                  </span>
                </div>
                <!-- Kategorien -->
                <div v-if="recipe.category_names" class="flex flex-wrap gap-0.5 mt-1.5">
                  <span
                    v-for="cat in recipe.category_names.split(',').slice(0, 2)"
                    :key="cat"
                    class="bg-stone-100 dark:bg-stone-700 px-1.5 py-px rounded-full text-stone-500 dark:text-stone-400 text-[9px] truncate max-w-[80px]"
                  >
                    {{ cat.trim() }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer: Anzahl -->
        <div class="px-3 py-2 border-t border-stone-100 dark:border-stone-800 text-center text-stone-400 dark:text-stone-500 text-[10px] shrink-0">
          {{ panelRecipes.length }} Rezept{{ panelRecipes.length !== 1 ? 'e' : '' }}
          <span v-if="searchQuery || selectedCategory"> (gefiltert)</span>
        </div>
      </aside>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { BookOpen, X, Search, ChefHat, Clock, Users, Flame } from 'lucide-vue-next';
import { useRecipesStore } from '@/stores/recipes.js';
import { useApi } from '@/composables/useApi.js';

const props = defineProps({
  visible: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'recipe-drag-start', 'recipe-drag-end']);

const recipesStore = useRecipesStore();
const api = useApi();

// ─── Panel-Breite (resizable, persistiert) ───
const MIN_WIDTH = 280;
const MAX_WIDTH = 900;
const DEFAULT_WIDTH = 340;
const WIDTH_STORAGE_KEY = 'mealplan-recipe-browser-width';

const panelWidth = ref((() => {
  try {
    const saved = parseInt(localStorage.getItem(WIDTH_STORAGE_KEY));
    return (saved >= MIN_WIDTH && saved <= MAX_WIDTH) ? saved : DEFAULT_WIDTH;
  } catch { return DEFAULT_WIDTH; }
})());

// Responsive Grid-Spalten basierend auf Panel-Breite
const gridCols = computed(() => {
  const w = panelWidth.value;
  // Innenbreite = panelWidth - Padding (2*12px) - Scrollbar (~8px) ≈ panelWidth - 32
  const inner = w - 32;
  if (inner >= 600) return 3;
  if (inner >= 380) return 2;
  return 1;
});

// ─── Resize-Logik ───
let resizing = false;
let startX = 0;
let startWidth = 0;

function startResize(event) {
  resizing = true;
  startX = event.clientX;
  startWidth = panelWidth.value;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  document.addEventListener('mousemove', onResizeMove);
  document.addEventListener('mouseup', stopResize);
}

function onResizeMove(event) {
  if (!resizing) return;
  // Panel ist rechts → nach links ziehen = breiter
  const delta = startX - event.clientX;
  const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
  panelWidth.value = newWidth;
}

function stopResize() {
  resizing = false;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  document.removeEventListener('mousemove', onResizeMove);
  document.removeEventListener('mouseup', stopResize);
  // Breite persistieren
  try { localStorage.setItem(WIDTH_STORAGE_KEY, panelWidth.value.toString()); } catch {}
}

onBeforeUnmount(() => {
  // Cleanup falls noch aktiv
  document.removeEventListener('mousemove', onResizeMove);
  document.removeEventListener('mouseup', stopResize);
});

// ─── Schwierigkeitsgrad-Farben ───
const difficultyClasses = {
  leicht: 'bg-green-100 dark:bg-green-900/60 text-green-700 dark:text-green-300',
  mittel: 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300',
  schwer: 'bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300',
};

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

// ─── Panel-Transition (reine CSS-Transitions via Computed Styles) ───
// Öffnen: Breite + Inhalt gleiten gleichzeitig rein (0.3s)
// Schließen: Inhalt gleitet erst raus (0.2s), dann schrumpft die Breite (0.2s, 0.2s Delay)
const wrapperStyle = computed(() => ({
  width: props.visible ? panelWidth.value + 'px' : '0px',
  transition: props.visible
    ? 'width 0.3s ease-out'
    : 'width 0.2s ease-in 0.2s',
}));

const asideStyle = computed(() => ({
  width: panelWidth.value + 'px',
  transform: props.visible ? 'translateX(0)' : 'translateX(100%)',
  transition: props.visible
    ? 'transform 0.3s ease-out'
    : 'transform 0.2s ease-in',
}));
</script>
