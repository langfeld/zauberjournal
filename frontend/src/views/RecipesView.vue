<!--
  ============================================
  RecipesView - Rezeptübersicht
  ============================================
  Zeigt alle Rezepte mit Filtern, Suche und Import-Optionen.
-->
<template>
  <div class="space-y-6 mx-auto max-w-7xl animate-fade-in">
    <!-- Header mit Aktionen -->
    <div class="flex sm:flex-row flex-col sm:items-center gap-4">
      <div class="flex-1">
        <h2 class="font-display font-bold text-stone-800 dark:text-stone-100 text-2xl">
          Rezepte
        </h2>
        <p class="text-stone-500 text-sm">{{ recipesStore.totalRecipes }} Rezepte in deiner Sammlung</p>
      </div>
      <div class="flex flex-wrap gap-2 w-full sm:w-auto">
        <!-- Sammlungen verwalten -->
        <button
          @click="showCollectionManager = true"
          class="flex items-center gap-2 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 px-3 py-2 border border-stone-200 dark:border-stone-700 rounded-lg font-medium text-stone-700 dark:text-stone-300 text-sm transition-colors"
        >
          <FolderOpen class="w-4 h-4" />
          <span class="hidden sm:inline">Sammlungen</span>
        </button>
        <!-- Auswahl-Modus (nur Admin) -->
        <button
          v-if="authStore.isAdmin"
          @click="toggleSelectMode"
          :class="[
            'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
            selectMode
              ? 'bg-violet-50 dark:bg-violet-900/20 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300'
              : 'bg-stone-100 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
          ]"
        >
          <CheckSquare v-if="selectMode" class="w-4 h-4" />
          <Square v-else class="w-4 h-4" />
          <span class="hidden sm:inline">{{ selectMode ? 'Abbrechen' : 'Auswählen' }}</span>
        </button>
        <!-- KI-Import Button -->
        <button
          @click="showPhotoImport = true"
          class="flex sm:flex-initial flex-1 justify-center items-center gap-2 px-4 py-2 rounded-lg font-medium text-white text-sm transition-colors bg-accent-600 hover:bg-accent-700"
        >
          <Sparkles class="w-4 h-4" />
          <span>KI-Import</span>
        </button>
        <!-- Neues Rezept -->
        <router-link
          to="/recipes/new"
          class="flex justify-center items-center gap-2 bg-primary-600 hover:bg-primary-700 px-4 py-2 rounded-lg w-full sm:w-auto font-medium text-white text-sm transition-colors"
        >
          <Plus class="w-4 h-4" />
          Neues Rezept
        </router-link>
      </div>
    </div>

    <!-- Filter-Leiste -->
    <div class="space-y-3 bg-white dark:bg-stone-900 p-4 border border-stone-200 dark:border-stone-800 rounded-xl">
      <!-- Suche -->
      <div class="relative">
        <Search class="top-1/2 left-3 absolute w-4 h-4 text-stone-400 -translate-y-1/2" />
        <input
          v-model="recipesStore.filters.search"
          @input="debouncedFetch"
          type="text"
          placeholder="Rezept suchen..."
          class="bg-stone-50 dark:bg-stone-800 py-2 pr-4 pl-9 border border-stone-200 focus:border-primary-400 dark:border-stone-700 rounded-lg outline-none w-full text-sm"
        />
      </div>

      <!-- Filter & Anzeige -->
      <div class="gap-2 grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center">
        <!-- Kategorie-Filter -->
        <select
          v-model="recipesStore.filters.category"
          @change="recipesStore.fetchRecipes()"
          class="bg-stone-50 dark:bg-stone-800 px-3 py-2 border border-stone-200 dark:border-stone-700 rounded-lg outline-none text-stone-700 dark:text-stone-300 text-sm"
        >
          <option value="">Alle Kategorien</option>
          <option v-for="cat in recipesStore.visibleCategories" :key="cat.id" :value="cat.name">
            {{ cat.icon }} {{ cat.name }}
          </option>
        </select>

        <!-- Sammlungs-Filter -->
        <select
          v-model="selectedCollectionFilter"
          @change="applyCollectionFilter"
          class="bg-stone-50 dark:bg-stone-800 px-3 py-2 border border-stone-200 dark:border-stone-700 rounded-lg outline-none text-stone-700 dark:text-stone-300 text-sm"
        >
          <option value="">Alle Sammlungen</option>
          <option v-for="col in collectionsStore.collections" :key="col.id" :value="col.id">
            {{ col.icon }} {{ col.name }} ({{ col.recipe_count ?? 0 }})
          </option>
        </select>

        <!-- Schwierigkeit -->
        <select
          v-model="recipesStore.filters.difficulty"
          @change="recipesStore.fetchRecipes()"
          class="bg-stone-50 dark:bg-stone-800 px-3 py-2 border border-stone-200 dark:border-stone-700 rounded-lg outline-none text-stone-700 dark:text-stone-300 text-sm"
        >
          <option value="">Alle Schwierigkeiten</option>
          <option value="leicht">Leicht</option>
          <option value="mittel">Mittel</option>
          <option value="schwer">Schwer</option>
        </select>

        <!-- Gruppierung -->
        <select
          v-if="recipesStore.mealTimeCategories.length"
          v-model="groupingMode"
          class="bg-stone-50 dark:bg-stone-800 px-3 py-2 border border-stone-200 dark:border-stone-700 rounded-lg outline-none text-stone-700 dark:text-stone-300 text-sm"
        >
          <option value="">Keine Gruppierung</option>
          <option value="meal-time-multi">Tageszeit (Mehrfach)</option>
          <option value="meal-time-single">Tageszeit (Einfach)</option>
        </select>

        <!-- Divider -->
        <div class="hidden sm:block w-px h-6 bg-stone-200 dark:bg-stone-700" aria-hidden="true" />

        <!-- Favoriten-Toggle -->
        <button
          @click="toggleFavoriteFilter"
          :class="[
            'flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors',
            recipesStore.filters.favorite
              ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300'
              : 'bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-500 hover:text-stone-700 dark:hover:text-stone-300',
          ]"
        >
          <Star class="w-4 h-4" :class="{ 'fill-amber-400': recipesStore.filters.favorite }" />
          Favoriten
        </button>

        <!-- Haushalt-Filter -->
        <button
          v-if="householdStore.isInHousehold"
          @click="toggleHouseholdFilter"
          :class="[
            'flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors',
            recipesStore.filters.householdOnly
              ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300'
              : 'bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-500 hover:text-stone-700 dark:hover:text-stone-300',
          ]"
        >
          <Home class="w-4 h-4" />
          Haushalt
        </button>
      </div>
    </div>

    <!-- Rezept-Grid (flach, ohne Gruppierung) -->
    <div v-if="!groupByMealTime && recipesStore.recipes.length" class="gap-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <div
        v-for="recipe in recipesStore.recipes"
        :key="recipe.id"
        class="relative"
        :class="{ 'cursor-pointer': selectMode }"
        @click="selectMode ? toggleSelect(recipe.id) : null"
      >
        <!-- Auswahl-Checkbox Overlay -->
        <div
          v-if="selectMode"
          class="top-3 left-3 z-10 absolute"
        >
          <div
            :class="[
              'w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all shadow-sm',
              selectedIds.has(recipe.id)
                ? 'bg-violet-500 border-violet-500 text-white'
                : 'bg-white/90 dark:bg-stone-800/90 border-stone-300 dark:border-stone-600'
            ]"
          >
            <Check v-if="selectedIds.has(recipe.id)" class="w-4 h-4" />
          </div>
        </div>
        <!-- Auswahl-Ring -->
        <div v-if="selectMode && selectedIds.has(recipe.id)" class="z-5 absolute inset-0 rounded-xl ring-2 ring-violet-500 ring-offset-2 dark:ring-offset-stone-950 pointer-events-none" />
        <RecipeCard
          :recipe="recipe"
          :class="{ 'pointer-events-none': selectMode }"
          @toggle-favorite="recipesStore.toggleFavorite(recipe.id)"
        />
      </div>
    </div>

    <!-- Rezept-Grid (nach Tageszeit gruppiert) -->
    <div v-if="groupByMealTime && recipesStore.recipes.length" class="space-y-8">
      <template v-for="group in groupedRecipes" :key="group.name">
        <section v-if="group.recipes.length">
          <!-- Gruppen-Header -->
          <button
            @click="toggleGroupCollapsed(group.name)"
            class="flex items-center gap-3 mb-4 w-full text-left group/header"
          >
            <span class="text-xl leading-none">{{ group.icon }}</span>
            <h3 class="font-display font-semibold text-stone-800 dark:text-stone-100 text-lg">
              {{ group.name }}
            </h3>
            <span class="bg-stone-100 dark:bg-stone-800 px-2 py-0.5 rounded-full text-stone-500 dark:text-stone-400 text-xs font-medium">
              {{ group.recipes.length }}
            </span>
            <div class="flex-1 border-b border-stone-200 dark:border-stone-700" />
            <ChevronDown
              class="w-5 h-5 text-stone-400 group-hover/header:text-stone-600 dark:group-hover/header:text-stone-300 transition-transform duration-200"
              :class="{ '-rotate-90': collapsedGroups.has(group.name) }"
            />
          </button>

          <!-- Gruppen-Grid -->
          <div
            v-if="!collapsedGroups.has(group.name)"
            class="gap-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            <div
              v-for="(recipe, idx) in group.recipes"
              :key="`${group.name}-${recipe.id}-${idx}`"
              class="relative flex flex-col"
              :class="{ 'cursor-pointer': selectMode }"
              @click="selectMode ? toggleSelect(recipe.id) : null"
            >
              <!-- Auswahl-Checkbox Overlay -->
              <div
                v-if="selectMode"
                class="top-3 left-3 z-10 absolute"
              >
                <div
                  :class="[
                    'w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all shadow-sm',
                    selectedIds.has(recipe.id)
                      ? 'bg-violet-500 border-violet-500 text-white'
                      : 'bg-white/90 dark:bg-stone-800/90 border-stone-300 dark:border-stone-600'
                  ]"
                >
                  <Check v-if="selectedIds.has(recipe.id)" class="w-4 h-4" />
                </div>
              </div>
              <!-- Auswahl-Ring -->
              <div v-if="selectMode && selectedIds.has(recipe.id)" class="z-5 absolute inset-0 rounded-xl ring-2 ring-violet-500 ring-offset-2 dark:ring-offset-stone-950 pointer-events-none" />
              <RecipeCard
                :recipe="recipe"
                class="flex-1"
                :class="{ 'pointer-events-none': selectMode }"
                @toggle-favorite="recipesStore.toggleFavorite(recipe.id)"
              />
              <!-- Badge: andere Tageszeiten -->
              <div
                v-if="recipe.otherMealTimes && recipe.otherMealTimes.length"
                class="px-2 py-1 text-stone-400 dark:text-stone-500 text-xs italic"
              >
                auch: {{ recipe.otherMealTimes.join(', ') }}
              </div>
            </div>
          </div>
        </section>
      </template>
    </div>

    <!-- Floating Aktionsleiste bei Auswahl -->
    <Teleport to="body">
      <Transition name="slide-up">
        <div
          v-if="selectMode && selectedIds.size > 0"
          class="right-0 bottom-0 left-0 z-40 fixed flex flex-wrap justify-center items-center gap-2 sm:gap-4 bg-white/95 dark:bg-stone-900/95 shadow-[0_-4px_24px_rgba(0,0,0,0.12)] backdrop-blur-sm px-3 sm:px-6 py-3 sm:py-4 border-stone-200 dark:border-stone-700 border-t"
        >
          <div class="flex items-center gap-1.5 text-stone-600 dark:text-stone-300 text-sm">
            <CheckSquare class="w-4 h-4" />
            <span class="font-medium">{{ selectedIds.size }}</span>
            <span class="hidden sm:inline">ausgewählt</span>
          </div>
          <button
            @click="selectAll"
            class="hover:bg-stone-100 dark:hover:bg-stone-800 px-2.5 sm:px-3 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-stone-600 dark:text-stone-300 text-sm transition-colors"
          >
            Alle ({{ recipesStore.recipes.length }})
          </button>
          <button
            @click="showBatchAddToCollection = true"
            class="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 px-3 sm:px-4 py-1.5 rounded-lg font-medium text-white text-sm transition-colors"
          >
            <FolderPlus class="w-4 h-4" />
            Zu Sammlung
          </button>
          <button
            v-if="selectedCollectionFilter"
            @click="showBatchRemoveFromCollection = true"
            class="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 px-3 sm:px-4 py-1.5 rounded-lg font-medium text-white text-sm transition-colors"
          >
            <FolderMinus class="w-4 h-4" />
            Aus Sammlung
          </button>
          <button
            @click="showBatchDeleteConfirm = true"
            class="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 px-3 sm:px-4 py-1.5 rounded-lg font-medium text-white text-sm transition-colors"
          >
            <Trash2 class="w-4 h-4" />
            Löschen
          </button>
        </div>
      </Transition>
    </Teleport>

    <!-- Bestätigungs-Dialog für Batch-Löschen -->
    <ConfirmDialog
      v-model="showBatchDeleteConfirm"
      variant="danger"
      :title="`${selectedIds.size} Rezept${selectedIds.size !== 1 ? 'e' : ''} löschen?`"
      :message="`${selectedIds.size} Rezept${selectedIds.size !== 1 ? 'e' : ''} werden unwiderruflich gelöscht, inklusive aller Bilder, Zutaten und Kochschritte.`"
      confirm-text="Endgültig löschen"
      cancel-text="Abbrechen"
      :loading="batchDeleting"
      @confirm="executeBatchDelete"
    />

    <!-- Bestätigungs-Dialog für Batch-Entfernen aus Sammlung -->
    <ConfirmDialog
      v-model="showBatchRemoveFromCollection"
      variant="warning"
      :title="`${selectedIds.size} Rezept${selectedIds.size !== 1 ? 'e' : ''} aus Sammlung entfernen?`"
      :message="`${selectedIds.size} Rezept${selectedIds.size !== 1 ? 'e werden' : ' wird'} aus der Sammlung entfernt. Die Rezepte selbst bleiben erhalten.`"
      confirm-text="Aus Sammlung entfernen"
      cancel-text="Abbrechen"
      :loading="batchRemoving"
      @confirm="executeBatchRemoveFromCollection"
    />

    <!-- Leerer Zustand -->
    <div v-if="!recipesStore.recipes.length && !recipesStore.loading" class="py-16 text-center">
      <BookOpen class="mx-auto mb-4 w-16 h-16 text-stone-300 dark:text-stone-600" />
      <h3 class="mb-2 font-medium text-stone-600 dark:text-stone-400 text-lg">
        Noch keine Rezepte
      </h3>
      <p class="mx-auto mb-6 max-w-md text-stone-500 text-sm">
        Erstelle dein erstes Rezept oder importiere eines per Foto. Die KI hilft dir dabei!
      </p>
    </div>

    <!-- Laden -->
    <div v-if="recipesStore.loading" class="flex justify-center py-12">
      <div class="border-2 border-primary-200 border-t-primary-600 rounded-full w-8 h-8 animate-spin" />
    </div>

    <!-- Foto-Import Modal -->
    <RecipeImportModal
      v-if="showPhotoImport"
      @close="showPhotoImport = false"
      @imported="handleImported"
    />

    <!-- Sammlungen-Manager Modal -->
    <CollectionManager v-model="showCollectionManager" />

    <!-- Batch: Rezepte zu Sammlung hinzufügen -->
    <BatchAddToCollection
      v-model="showBatchAddToCollection"
      :recipe-ids="[...selectedIds]"
      @added="onBatchAddedToCollection"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { useRecipesStore } from '@/stores/recipes.js';
import { useAuthStore } from '@/stores/auth.js';
import { useCollectionsStore } from '@/stores/collections.js';
import { useHouseholdStore } from '@/stores/household.js';
import { Search, Sparkles, Plus, Star, BookOpen, CheckSquare, Square, Check, Trash2, FolderOpen, FolderPlus, FolderMinus, Home, ChevronDown } from 'lucide-vue-next';
import RecipeCard from '@/components/recipes/RecipeCard.vue';
import RecipeImportModal from '@/components/recipes/RecipeImportModal.vue';
import CollectionManager from '@/components/collections/CollectionManager.vue';
import BatchAddToCollection from '@/components/collections/BatchAddToCollection.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import { useNotification } from '@/composables/useNotification.js';

const recipesStore = useRecipesStore();
const authStore = useAuthStore();
const collectionsStore = useCollectionsStore();
const householdStore = useHouseholdStore();
const { showSuccess, showError } = useNotification();
const showPhotoImport = ref(false);
const showCollectionManager = ref(false);
const selectedCollectionFilter = ref('');

// Mehrfachauswahl (Admin)
const selectMode = ref(false);
const selectedIds = ref(new Set());
const showBatchDeleteConfirm = ref(false);
const showBatchAddToCollection = ref(false);
const showBatchRemoveFromCollection = ref(false);
const batchDeleting = ref(false);
const batchRemoving = ref(false);

// Tageszeit-Gruppierung
const groupingMode = ref(''); // '', 'meal-time-multi', 'meal-time-single'
const groupByMealTime = computed(() => groupingMode.value.startsWith('meal-time'));
const showDuplicates = computed(() => groupingMode.value === 'meal-time-multi');
const collapsedGroups = ref(new Set());

/**
 * Gruppierte Rezepte nach Tageszeit-Kategorien.
 * Gibt ein Array von Gruppen zurück: { name, icon, color, recipes[] }
 * Jedes Rezept hat ein zusätzliches `otherMealTimes`-Feld mit den anderen Tageszeiten.
 */
const groupedRecipes = computed(() => {
  if (!groupByMealTime.value) return [];

  const mealTimeNames = recipesStore.mealTimeCategoryNames;
  const mealTimeCats = recipesStore.mealTimeCategories;

  // Gruppen in der Reihenfolge der sort_order anlegen
  const groups = mealTimeCats.map(cat => ({
    name: cat.name,
    icon: cat.icon,
    color: cat.color,
    recipes: [],
  }));
  // "Sonstige" für Rezepte ohne Tageszeit-Kategorie
  groups.push({ name: 'Sonstige', icon: '🍽️', color: '#94a3b8', recipes: [] });

  for (const recipe of recipesStore.recipes) {
    const catNames = recipe.category_names
      ? recipe.category_names.split(',').map(n => n.trim())
      : [];

    const matchingMealTimes = catNames.filter(n => mealTimeNames.has(n));

    if (matchingMealTimes.length === 0) {
      // Keine Tageszeit → "Sonstige"
      groups[groups.length - 1].recipes.push({ ...recipe, otherMealTimes: [] });
    } else if (showDuplicates.value) {
      // Mehrfach-Modus: Rezept in jede passende Gruppe
      for (const mt of matchingMealTimes) {
        const group = groups.find(g => g.name === mt);
        if (group) {
          group.recipes.push({
            ...recipe,
            otherMealTimes: matchingMealTimes.filter(n => n !== mt),
          });
        }
      }
    } else {
      // Einfach-Modus: nur in die erste passende Gruppe (nach sort_order der Kategorie)
      const firstMatch = mealTimeCats.find(c => matchingMealTimes.includes(c.name));
      if (firstMatch) {
        const group = groups.find(g => g.name === firstMatch.name);
        if (group) {
          group.recipes.push({
            ...recipe,
            otherMealTimes: matchingMealTimes.filter(n => n !== firstMatch.name),
          });
        }
      }
    }
  }

  return groups;
});

function toggleGroupCollapsed(name) {
  const s = new Set(collapsedGroups.value);
  if (s.has(name)) s.delete(name);
  else s.add(name);
  collapsedGroups.value = s;
}

// Debounced Suche (300ms Verzögerung)
let searchTimeout;
function debouncedFetch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    recipesStore.fetchRecipes();
  }, 300);
}

function toggleFavoriteFilter() {
  recipesStore.filters.favorite = recipesStore.filters.favorite ? null : true;
  recipesStore.fetchRecipes();
}

function toggleHouseholdFilter() {
  recipesStore.filters.householdOnly = recipesStore.filters.householdOnly ? null : true;
  recipesStore.fetchRecipes();
}

function applyCollectionFilter() {
  recipesStore.filters.collectionId = selectedCollectionFilter.value || '';
  recipesStore.fetchRecipes();
}

function handleImported(data) {
  showPhotoImport.value = false;
  showSuccess('Rezept erfolgreich importiert!');
}

// Auswahl-Modus
function toggleSelectMode() {
  selectMode.value = !selectMode.value;
  selectedIds.value = new Set();
}

function toggleSelect(id) {
  const s = new Set(selectedIds.value);
  if (s.has(id)) {
    s.delete(id);
  } else {
    s.add(id);
  }
  selectedIds.value = s;
}

function selectAll() {
  selectedIds.value = new Set(recipesStore.recipes.map(r => r.id));
}

function onBatchAddedToCollection() {
  showBatchAddToCollection.value = false;
  selectMode.value = false;
  selectedIds.value = new Set();
}

async function executeBatchRemoveFromCollection() {
  batchRemoving.value = true;
  try {
    const ids = [...selectedIds.value];
    const result = await collectionsStore.removeRecipes(Number(selectedCollectionFilter.value), ids);
    showSuccess(result.message);
    showBatchRemoveFromCollection.value = false;
    selectMode.value = false;
    selectedIds.value = new Set();
    recipesStore.fetchRecipes();
  } catch {
    showError('Entfernen fehlgeschlagen.');
  } finally {
    batchRemoving.value = false;
  }
}

async function executeBatchDelete() {
  batchDeleting.value = true;
  try {
    const ids = [...selectedIds.value];
    const result = await recipesStore.deleteRecipesBatch(ids);
    showSuccess(`${result.deletedCount} Rezept${result.deletedCount !== 1 ? 'e' : ''} gelöscht! 🗑️`);
    showBatchDeleteConfirm.value = false;
    selectMode.value = false;
    selectedIds.value = new Set();
  } catch {
    showError('Löschen fehlgeschlagen.');
  } finally {
    batchDeleting.value = false;
  }
}

// Scroll-Position speichern wenn man zu einem Rezept navigiert
onBeforeRouteLeave((to) => {
  if (to.path.match(/^\/recipes\/\d+$/)) {
    const main = document.querySelector('main');
    if (main) {
      sessionStorage.setItem('recipesScrollPosition', String(main.scrollTop));
    }
  } else {
    // Bei Navigation woandershin: gespeicherte Position verwerfen
    sessionStorage.removeItem('recipesScrollPosition');
  }
});

onMounted(async () => {
  recipesStore.fetchRecipes();
  recipesStore.fetchCategories();
  collectionsStore.fetchCollections();

  // Scroll-Position wiederherstellen (z.B. nach Browser-Zurück von Rezept-Detail)
  const savedPosition = sessionStorage.getItem('recipesScrollPosition');
  if (savedPosition) {
    sessionStorage.removeItem('recipesScrollPosition');
    await nextTick();
    const main = document.querySelector('main');
    if (main) {
      main.scrollTo({ top: parseInt(savedPosition, 10) });
    }
  }
});
</script>
