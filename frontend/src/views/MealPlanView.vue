<!--
  ============================================
  MealPlanView – Kalender-basierter Wochenplaner
  ============================================
  Neue Kalender-Ansicht mit rollenden Plänen, Farbcodierung
  und intuitiver Zeitraum-Selektion.
-->
<template>
  <div class="flex absolute inset-0">
    <!-- Hauptbereich -->
    <div class="flex-1 overflow-y-auto p-4 lg:p-6 min-w-0">
      <div class="space-y-6 mx-auto max-w-7xl animate-fade-in">

        <!-- Header -->
        <div class="flex sm:flex-row flex-col justify-between items-start sm:items-center gap-4">
          <div>
            <h1 class="font-display font-bold text-stone-800 dark:text-stone-100 text-2xl">🗓️ Wochenplaner</h1>
            <p class="text-stone-500 dark:text-stone-400 text-sm">
              Klicke auf einen leeren Tag, um einen Plan zu erstellen.
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button @click="showRecipeBrowser = !showRecipeBrowser"
              :class="['hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-colors',
                showRecipeBrowser
                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900'
                  : 'hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 dark:text-stone-400']"
              title="Rezepte-Browser ein-/ausblenden">
              <BookOpen class="w-4 h-4" />
              <span class="hidden sm:inline">Rezepte</span>
            </button>
          </div>
        </div>

        <!-- KI-Reasoning -->
        <Transition name="fade">
          <div v-if="store.reasoningLoading && !store.reasoning" key="reasoning-loading"
               class="relative bg-linear-to-r from-primary-50 dark:from-primary-950/50 to-transparent px-4 py-3 border border-primary-200 dark:border-primary-800 rounded-xl">
            <div class="flex items-start gap-3">
              <div class="flex justify-center items-center bg-primary-100 dark:bg-primary-900 rounded-lg w-8 h-8 shrink-0">
                <div class="border-2 border-primary-200 border-t-primary-600 rounded-full w-4 h-4 animate-spin" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-medium text-primary-800 dark:text-primary-200 text-xs uppercase tracking-wide">KI-Begründung wird geladen…</p>
              </div>
            </div>
          </div>
          <div v-else-if="store.reasoning" key="reasoning-ready" class="relative bg-linear-to-r from-primary-50 dark:from-primary-950/50 to-transparent border border-primary-200 dark:border-primary-800 px-4 py-3 rounded-xl">
            <div class="flex items-start gap-3">
              <Sparkles class="w-4 h-4 text-primary-600 dark:text-primary-400 shrink-0 mt-0.5" />
              <div class="flex-1 min-w-0">
                <p class="text-stone-700 dark:text-stone-300 text-sm leading-relaxed">{{ store.reasoning }}</p>
              </div>
              <button @click="store.reasoning = null" class="hover:bg-stone-100 dark:hover:bg-stone-800 p-1 rounded-lg transition-colors shrink-0">
                <X class="w-4 h-4 text-stone-400" />
              </button>
            </div>
          </div>
        </Transition>

        <!-- Rezeptvorschläge (einklappbar, im Inhalt) -->
        <SuggestionBox
          :last-week-recipes="store.lastWeekRecipes"
          :household-suggestions="store.householdSuggestions"
          :past-week-recipes="store.pastWeekRecipes"
          :past-week-index="store.pastWeekIndex"
          :past-week-number="store.pastWeekNumber"
          :past-week-has-plan="store.pastWeekHasPlan"
          :past-weeks-list="store.pastWeeksList"
          :show-household-tab="householdStore.isInHousehold"
          :current-plan="store.currentPlan"
          :is-locked="false"
          :week-days="[]"
          :meal-types="mealTypes"
          @suggestion-drag-start="onSuggestionDragStart"
          @suggestion-drag-end="onSuggestionDragEnd"
          @past-week-change="onPastWeekChange"
          @assign-recipe="onAssignRecipe"
        />

        <!-- Kalender -->
        <CalendarGrid
          :year="calendarYear"
          :month="calendarMonth"
          :entries="store.calendarData?.entries || []"
          :plans="store.calendarData?.plans || []"
          :selected-range="store.selectedDateRange"
          @update:year="calendarYear = $event"
          @update:month="calendarMonth = $event"
          @day-click="onDayClick"
          @plan-click="onPlanClick"
          @entry-click="onEntryClick"
          @dragover-day="onDragOverDay"
          @drop-day="onDropDay"
          @hover-date="onHoverDate"
        />

        <!-- Laden -->
        <div v-if="store.loading || store.generating" class="flex flex-col items-center gap-3 py-16">
          <div class="border-2 border-primary-200 border-t-primary-600 rounded-full w-10 h-10 animate-spin" />
          <p class="text-stone-500 text-sm">{{ store.generating ? 'Plan wird generiert…' : 'Lade Kalender…' }}</p>
        </div>
      </div>
    </div>

    <!-- Rezept-Browser (rechts) -->
    <RecipeBrowserPanel
      v-if="showRecipeBrowser"
      :visible="showRecipeBrowser"
      @close="showRecipeBrowser = false"
      @recipe-drag-start="onRecipeDragStart"
      @recipe-drag-end="onRecipeDragEnd"
    />

  <!-- Floating Action Button für Generierung -->
  <Transition name="fab">
    <div v-if="store.selectedDateRange && !store.generating" class="z-40 fixed bottom-6 right-6">
      <button @click="openGenerateDialog"
        class="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 shadow-lg hover:shadow-xl px-5 py-3 rounded-full font-medium text-white text-sm transition-all">
        <Sparkles class="w-4 h-4" />
        <span>{{ generateButtonText }}</span>
        <button @click.stop="clearRangeSelection" class="ml-1 hover:bg-primary-500 p-1 rounded-full transition-colors">
          <X class="w-3.5 h-3.5" />
        </button>
      </button>
    </div>
  </Transition>

  <!-- Day Detail Drawer -->
  <DayDetailDrawer
    :is-open="showDayDrawer"
    :date-str="selectedDay?.dateStr || ''"
    :entries="selectedDayEntries"
    :plans="selectedDayPlans"
    :is-mobile="isMobile"
    @close="showDayDrawer = false"
    @entry-click="goToRecipe"
    @swap="openSwapDialog"
    @remove="removeEntry"
    @toggle-cooked="toggleCooked"
    @update-servings="openServingsPopup"
    @plan-click="onDayDrawerPlanClick"
  />

  <!-- Plan Detail Modal -->
  <PlanDetailModal
    :is-open="showPlanModal"
    :plan="selectedPlan"
    :entries="selectedPlanEntries"
    @close="showPlanModal = false"
    @entry-click="goToRecipe"
    @swap="openSwapDialog"
    @toggle-cooked="toggleCooked"
    @update-servings="openServingsPopup"
    @toggle-lock="toggleLockPlan"
    @duplicate="duplicatePlan"
    @shopping-list="createShoppingList"
    @remove="removeEntry"
    @add-entry="onAddEntryToPlan"
    @delete="confirmDeletePlan"
    @edit="showPlanEditModal = true"
  />

  <!-- Plan Edit Modal -->
  <PlanEditModal
    :is-open="showPlanEditModal"
    :plan="selectedPlan"
    @close="showPlanEditModal = false"
    @save="doEditPlan"
  />

  <!-- Generate Dialog -->
  <GenerateDialog
    :is-open="showGenerateDialog"
    :generating="store.generating"
    :initial-range="store.selectedDateRange"
    :meal-categories="mealTypes"
    :collections="collectionsStore.collections"
    :is-in-household="householdStore.isInHousehold"
    @close="showGenerateDialog = false"
    @generate="doGenerate"
  />

  <!-- Swap Modal (wiederverwendet aus altem Code) -->
  <Teleport to="body">
    <div v-if="showSwapModal" class="z-50 fixed inset-0 flex justify-center items-center p-4 pointer-events-none">
      <div class="relative bg-white dark:bg-stone-900 shadow-2xl rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col pointer-events-auto">
      <div class="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-stone-700">
          <h3 class="font-bold text-stone-800 dark:text-stone-100 text-lg">
            {{ swapEntry ? 'Rezept tauschen' : 'Rezept hinzufügen' }}
          </h3>
          <button @click="showSwapModal = false" class="hover:bg-stone-100 dark:hover:bg-stone-800 p-2 rounded-lg">
            <X class="w-5 h-5 text-stone-500" />
          </button>
        </div>
        <div class="flex-1 overflow-y-auto p-4">
          <div class="flex gap-2 mb-4">
            <input v-model="swapSearch" placeholder="Rezept suchen…"
              class="flex-1 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-700 dark:text-stone-200" />
          </div>
          <div v-if="swapSuggestions.length" class="grid grid-cols-2 gap-2">
            <div v-for="recipe in swapSuggestions" :key="recipe.id"
              class="bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 border border-stone-200 dark:border-stone-700 rounded-lg p-3 cursor-pointer transition-colors"
              @click="doSwap(recipe.id)">
              <div class="aspect-video rounded-lg overflow-hidden bg-stone-200 dark:bg-stone-700 mb-2">
                <img v-if="recipe.image_url" :src="recipe.image_url" class="w-full h-full object-cover" />
                <span v-else class="flex justify-center items-center w-full h-full text-2xl">🍽️</span>
              </div>
              <p class="font-medium text-stone-800 dark:text-stone-100 text-sm truncate">{{ recipe.title }}</p>
            </div>
          </div>
          <div v-else class="py-8 text-center text-stone-500 dark:text-stone-400 text-sm">
            Keine Vorschläge gefunden.
          </div>
        </div>
        </div>
      </div>
  </Teleport>

  <!-- Servings Popup – eigener transparente Click-Area außerhalb des Popups -->
  <Teleport to="body">
    <div v-if="servingsPopupEntry" class="z-50 fixed inset-0" @click.self="servingsPopupEntry = null">
      <div class="fixed" :style="servingsPopupStyle">
        <div class="bg-white dark:bg-stone-900 shadow-xl border border-stone-200 dark:border-stone-700 rounded-xl p-3">
          <p class="font-medium text-stone-700 dark:text-stone-200 text-sm mb-2">Portionen</p>
          <div class="flex items-center gap-2">
            <button @click="updateServings(-1)" class="hover:bg-stone-100 dark:hover:bg-stone-800 p-1.5 rounded-lg cursor-pointer">
              <Minus class="w-4 h-4" />
            </button>
            <span class="font-semibold w-8 text-center">{{ servingsPopupEntry.servings }}</span>
            <button @click="updateServings(1)" class="hover:bg-stone-100 dark:hover:bg-stone-800 p-1.5 rounded-lg cursor-pointer">
              <Plus class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Confirm Dialog -->
  <ConfirmDialog
    v-model="confirmDialog.show"
    :title="confirmDialog.title"
    :message="confirmDialog.message"
    :variant="confirmDialog.variant"
    :confirm-text="confirmDialog.confirmText"
    :show-cancel="confirmDialog.showCancel"
    @confirm="onConfirmDialog"
  />

  <!-- Slot Select Modal (nach Drag & Drop) -->
  <SlotSelectModal
    :is-open="showSlotSelect"
    :date-str="slotSelectDate"
    :slots="mealTypes"
    @close="showSlotSelect = false; pendingDropRecipe = null;"
    @select="onSlotSelected"
  />

  <!-- Zentraler Backdrop für alle Overlays in dieser View (v-show für sofortige Sichtbarkeit, kein Flash beim Wechsel) -->
  <Teleport to="body">
    <div
      v-show="backdropVisible"
      class="z-40 fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-150"
      :class="backdropVisible ? 'opacity-100' : 'opacity-0'"
      @click="onBackdropClick"
    />
  </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useWindowSize } from '@vueuse/core';
import {
  BookOpen, Sparkles, X, Minus, Plus,
  Lock, Unlock, Trash2, Clock, Users, Flame, Check,
  RefreshCw, ShoppingCart, Copy,
} from 'lucide-vue-next';
import { useMealPlanStore } from '@/stores/mealplan.js';
import { useRecipesStore } from '@/stores/recipes.js';
import { useCollectionsStore } from '@/stores/collections.js';
import { useHouseholdStore } from '@/stores/household.js';
import { useRecipeBlocksStore } from '@/stores/recipe-blocks.js';

import CalendarGrid from '@/components/mealplan/CalendarGrid.vue';
import CalendarDayCell from '@/components/mealplan/CalendarDayCell.vue';
import DayDetailDrawer from '@/components/mealplan/DayDetailDrawer.vue';
import PlanDetailModal from '@/components/mealplan/PlanDetailModal.vue';
import PlanEditModal from '@/components/mealplan/PlanEditModal.vue';
import GenerateDialog from '@/components/mealplan/GenerateDialog.vue';
import SuggestionBox from '@/components/mealplan/SuggestionBox.vue';
import RecipeBrowserPanel from '@/components/mealplan/RecipeBrowserPanel.vue';

import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import SlotSelectModal from '@/components/mealplan/SlotSelectModal.vue';

const router = useRouter();
const store = useMealPlanStore();
const recipesStore = useRecipesStore();
const collectionsStore = useCollectionsStore();
const householdStore = useHouseholdStore();
const blocksStore = useRecipeBlocksStore();

// ── Reactive State ──
const calendarYear = ref(new Date().getFullYear());
const calendarMonth = ref(new Date().getMonth());
const showRecipeBrowser = ref(false);
const showGenerateDialog = ref(false);
const showDayDrawer = ref(false);
const showPlanModal = ref(false);
const showPlanEditModal = ref(false);
const selectedDay = ref(null);
const selectedPlan = ref(null);

// Hover-Vorschau für Zeitraum-Selektion
const hoveredEndDate = ref(null);

// Swap Modal
const showSwapModal = ref(false);
const swapEntry = ref(null);
const swapDateStr = ref(null);
const swapSearch = ref('');
const swapSuggestions = ref([]);
const reopenPlanAfterSwap = ref(false);

// Servings Popup
const servingsPopupEntry = ref(null);
const servingsPopupPos = ref({ x: 0, y: 0 });

// Drag & Drop
const dragData = ref(null);

// Slot-Auswahl nach Drop
const showSlotSelect = ref(false);
const slotSelectDate = ref('');
const pendingDropRecipe = ref(null);
const pendingDropIsExistingPlan = ref(false);

// Confirm Dialog
const confirmDialog = ref({
  show: false,
  title: '',
  message: '',
  variant: 'danger',
  confirmText: 'Bestätigen',
  showCancel: true,
  onConfirm: null,
});

function showConfirm(opts) {
  confirmDialog.value = { show: true, showCancel: true, ...opts };
}

function showAlert(opts) {
  confirmDialog.value = { show: true, showCancel: false, variant: 'info', confirmText: 'OK', ...opts };
}

function onConfirmDialog() {
  confirmDialog.value.show = false;
  if (confirmDialog.value.onConfirm) confirmDialog.value.onConfirm();
}

// ── Computed ──
const { width: windowWidth } = useWindowSize();
const isMobile = computed(() => windowWidth.value < 1024);

const selectedDayEntries = computed(() => {
  if (!selectedDay.value?.dateStr) return [];
  return store.calendarData?.entries?.filter(e => e.plan_date === selectedDay.value.dateStr) || [];
});

const selectedDayPlans = computed(() => {
  if (!selectedDay.value?.dateStr) return [];
  return store.calendarData?.plans?.filter(p => {
    const start = p.start_date || p.week_start;
    const end = p.end_date || addDays(start, 6);
    return selectedDay.value.dateStr >= start && selectedDay.value.dateStr <= end;
  }) || [];
});

const selectedPlanEntries = computed(() => {
  if (!selectedPlan.value) return [];
  return store.calendarData?.entries?.filter(e => {
    const planStart = selectedPlan.value.start_date || selectedPlan.value.week_start;
    const planEnd = selectedPlan.value.end_date || addDays(planStart, 6);
    return e.plan_date >= planStart && e.plan_date <= planEnd;
  }) || [];
});

const selectedRangeDayCount = computed(() => {
  if (!store.selectedDateRange) return 0;
  const start = new Date(store.selectedDateRange.startDate + 'T12:00:00');
  // Während der Selektion: nutze hoveredEndDate als Vorschau, sonst endDate oder start
  const effectiveEnd = store.selectedDateRange.endDate
    ? store.selectedDateRange.endDate
    : hoveredEndDate.value || store.selectedDateRange.startDate;
  const end = new Date(effectiveEnd + 'T12:00:00');
  return Math.round((end - start) / 86400000) + 1;
});

const generateButtonText = computed(() => {
  if (!store.selectedDateRange) return '';
  const count = selectedRangeDayCount.value;
  const dayLabel = count === 1 ? 'Tag' : 'Tage';
  // Während der Selektion: zeige auch das Enddatum als Vorschau
  if (!store.selectedDateRange.endDate && hoveredEndDate.value) {
    return `Plan für ${count} ${dayLabel} generieren`;
  }
  return `Plan für ${count} ${dayLabel} generieren`;
});

const mealTypes = computed(() => recipesStore.mealTimeCategories || []);

/** Ist der zentrale Backdrop sichtbar? (mindestens ein Overlay offen) */
const backdropVisible = computed(() => {
  return showDayDrawer.value ||
    showPlanModal.value ||
    showPlanEditModal.value ||
    showGenerateDialog.value ||
    showSwapModal.value ||
    !!servingsPopupEntry.value ||
    showSlotSelect.value;
});

/** Klick auf den zentralen Backdrop → oberstes Overlay schließen */
function onBackdropClick() {
  if (showSlotSelect.value) {
    showSlotSelect.value = false;
    pendingDropRecipe.value = null;
  } else if (servingsPopupEntry.value) {
    servingsPopupEntry.value = null;
  } else if (showSwapModal.value) {
    showSwapModal.value = false;
  } else if (showGenerateDialog.value) {
    showGenerateDialog.value = false;
  } else if (showPlanEditModal.value) {
    showPlanEditModal.value = false;
  } else if (showPlanModal.value) {
    showPlanModal.value = false;
  } else if (showDayDrawer.value) {
    showDayDrawer.value = false;
  }
}

// ── Watchers ──
watch([calendarYear, calendarMonth], () => {
  store.fetchMonthEntries(calendarYear.value, calendarMonth.value);
});

watch(() => store.selectedDateRange, (range) => {
  if (!range || range.endDate) {
    hoveredEndDate.value = null;
  }
});

// Wenn Swap-Dialog geschlossen wird und Plan-Modal sollte wieder geöffnet werden
watch(showSwapModal, (isOpen) => {
  if (!isOpen && reopenPlanAfterSwap.value && selectedPlan.value) {
    reopenPlanAfterSwap.value = false;
    showPlanModal.value = true;
  }
});

watch(swapSearch, async (search) => {
  if (!swapEntry.value && !selectedDay.value) return;
  const dayIdx = selectedDay.value ? new Date(selectedDay.value.dateStr + 'T12:00:00').getDay() : 0;
  const data = await store.fetchSuggestions({
    dayIdx,
    categoryId: swapEntry.value?.category_id,
    search: search || null,
  });
  swapSuggestions.value = data || [];
});

// ── Lifecycle ──
onMounted(() => {
  store.fetchMonthEntries(calendarYear.value, calendarMonth.value);
  store.fetchAvailableWeeks();
  store.fetchLastWeekRecipes();
  store.fetchHouseholdSuggestions();
  recipesStore.fetchCategories();
  collectionsStore.fetchCollections();
});

// ── Day Click Handler ──
function onDayClick(day) {
  const entries = store.calendarData?.entries?.filter(e => e.plan_date === day.dateStr) || [];

  if (entries.length > 0) {
    // Tag hat Mahlzeiten → Tagesdetail öffnen
    selectedDay.value = day;
    showDayDrawer.value = true;
  } else {
    // Leerer Tag → Zeitraum-Selektion
    handleEmptyDayClick(day);
  }
}

function handleEmptyDayClick(day) {
  // Abbrechen
  if (day._cancel || !day.dateStr) {
    store.clearSelectedDateRange();
    hoveredEndDate.value = null;
    return;
  }

  const range = store.selectedDateRange;
  if (!range || range.endDate) {
    // Neue Selektion starten
    store.setSelectedDateRange(day.dateStr, null);
  } else {
    // Endtag setzen
    const start = range.startDate;
    const end = day.dateStr;
    store.setSelectedDateRange(
      start <= end ? start : end,
      start <= end ? end : start
    );
    hoveredEndDate.value = null;
  }
}

// ── Hover Handler für Zeitraum-Vorschau ──
function onHoverDate(dateStr) {
  if (!store.selectedDateRange?.endDate) {
    hoveredEndDate.value = dateStr;
  }
}

// ── Selektion zurücksetzen (auch Hover-Vorschau) ──
function clearRangeSelection() {
  store.clearSelectedDateRange();
  hoveredEndDate.value = null;
}

// ── Plan Click Handler ──
function onPlanClick(plan) {
  selectedPlan.value = plan;
  showPlanModal.value = true;
}

// ── Generate ──
function openGenerateDialog() {
  showGenerateDialog.value = true;
}

async function doGenerate(options) {
  try {
    const result = await store.generatePlan(options);
    store.clearSelectedDateRange();
    showGenerateDialog.value = false;
    await store.fetchMonthEntries(calendarYear.value, calendarMonth.value);

    // Neuen Plan direkt im Popup öffnen, damit der Nutzer die
    // generierten Rezepte sofort sieht und bearbeiten / tauschen kann.
    // Kurze Verzögerung, damit der GenerateDialog seine Leave-Transition
    // (200ms) erst beendet – verhindert den weißen Flash beim Übergang.
    if (result?.plan) {
      selectedPlan.value = result.plan;
      setTimeout(() => {
        showPlanModal.value = true;
      }, 200);
    }
  } catch (err) {
    showAlert({ title: 'Fehler', message: err.message || 'Fehler beim Generieren', variant: 'warning' });
  }
}

// ── Navigation ──
function goToRecipe(recipeId) {
  router.push(`/recipes/${recipeId}`);
}

// ── Swap ──
async function openSwapDialog(entry) {
  swapEntry.value = entry;
  swapDateStr.value = entry?.plan_date || null;
  swapSearch.value = '';

  // Inception vermeiden: Plan-Modal sofort schließen
  if (showPlanModal.value) {
    showPlanModal.value = false;
    reopenPlanAfterSwap.value = true;
  }

  showSwapModal.value = true;

  const dayIdx = entry?.plan_date
    ? (new Date(entry.plan_date + 'T12:00:00').getDay() + 6) % 7
    : 0;
  const data = await store.fetchSuggestions({
    dayIdx,
    categoryId: entry?.category_id,
  });
  swapSuggestions.value = data || [];
}

/** Rezept zu einem leeren Tag im Plan hinzufügen */
async function onAddEntryToPlan(dateStr) {
  swapEntry.value = null;
  swapDateStr.value = dateStr;
  swapSearch.value = '';

  // Inception vermeiden: Plan-Modal sofort schließen
  if (showPlanModal.value) {
    showPlanModal.value = false;
    reopenPlanAfterSwap.value = true;
  }

  showSwapModal.value = true;

  const dayIdx = (new Date(dateStr + 'T12:00:00').getDay() + 6) % 7;
  const data = await store.fetchSuggestions({
    dayIdx,
    categoryId: mealTypes.value[0]?.id,
  });
  swapSuggestions.value = data || [];
}

async function doSwap(newRecipeId) {
  try {
    if (swapEntry.value) {
      await store.swapRecipe(swapEntry.value.meal_plan_id, swapEntry.value.id, newRecipeId);
    } else if (swapDateStr.value && selectedPlan.value) {
      // Neuen Eintrag für leeren Tag im Plan hinzufügen
      const dayIdx = (new Date(swapDateStr.value + 'T12:00:00').getDay() + 6) % 7;
      await store.addEntry(selectedPlan.value.id, newRecipeId, dayIdx, mealTypes.value[0]?.id, 4, swapDateStr.value);
    } else if (selectedDay.value) {
      // Neuen Eintrag für leeren Slot erstellen
      const dayIdx = (new Date(selectedDay.value.dateStr + 'T12:00:00').getDay() + 6) % 7;
      const plansForDay = store.calendarData?.plans?.filter(p => {
        const start = p.start_date || p.week_start;
        const end = p.end_date || addDays(start, 6);
        return selectedDay.value.dateStr >= start && selectedDay.value.dateStr <= end;
      });
      const planId = plansForDay?.[0]?.id;
      if (planId) {
        await store.addEntry(planId, newRecipeId, dayIdx, mealTypes.value[0]?.id, 4, selectedDay.value.dateStr);
      } else {
        // Plan automatisch erstellen
        await store.addRecipeToPlan(newRecipeId, dayIdx, mealTypes.value[0]?.id, selectedDay.value.dateStr, 4, selectedDay.value.dateStr);
      }
    }
    showSwapModal.value = false;
    swapDateStr.value = null;

    // Plan-Modal wieder öffnen wenn es vorher offen war
    if (reopenPlanAfterSwap.value && selectedPlan.value) {
      reopenPlanAfterSwap.value = false;
      showPlanModal.value = true;
    }

    store.fetchMonthEntries(calendarYear.value, calendarMonth.value);
  } catch (err) {
    showAlert({ title: 'Fehler', message: err.message || 'Fehler beim Tauschen', variant: 'warning' });
  }
}

// ── Remove ──
async function removeEntry(entry) {
  showConfirm({
    title: 'Mahlzeit entfernen?',
    message: 'Diese Mahlzeit wird aus dem Plan entfernt.',
    variant: 'warning',
    confirmText: 'Entfernen',
    onConfirm: async () => {
      try {
        await store.removeEntry(entry.meal_plan_id, entry.id);
        store.fetchMonthEntries(calendarYear.value, calendarMonth.value);
      } catch (err) {
        showAlert({ title: 'Fehler', message: err.message || 'Fehler beim Entfernen', variant: 'warning' });
      }
    },
  });
}

// ── Cooked ──
async function toggleCooked(entry) {
  try {
    await store.markCooked(entry.meal_plan_id, entry.id);
  } catch (err) {
    // silent
  }
}

// ── Servings ──
function openServingsPopup(entry, event) {
  servingsPopupEntry.value = entry;
  if (event) {
    servingsPopupPos.value = { x: event.clientX, y: event.clientY };
  }
}

const servingsPopupStyle = computed(() => ({
  left: `${servingsPopupPos.value.x}px`,
  top: `${servingsPopupPos.value.y + 20}px`,
}));

async function updateServings(delta) {
  if (!servingsPopupEntry.value) return;
  const newServings = Math.max(1, servingsPopupEntry.value.servings + delta);
  try {
    await store.updateServings(servingsPopupEntry.value.meal_plan_id, servingsPopupEntry.value.id, newServings);
    servingsPopupEntry.value.servings = newServings;
  } catch {
    // silent
  }
}

// ── Lock ──
async function toggleLockPlan(plan) {
  try {
    const result = await store.toggleLock(plan.id);
    // Lokale Kopie aktualisieren, damit das Popup sofort reagiert
    if (selectedPlan.value && selectedPlan.value.id === plan.id) {
      selectedPlan.value.is_locked = result.is_locked;
    }
  } catch (err) {
    showAlert({ title: 'Fehler', message: err.message || 'Fehler beim Sperren', variant: 'warning' });
  }
}

// ── Duplicate ──
async function duplicatePlan(plan) {
  const target = prompt('Zieldatum (YYYY-MM-DD):', plan.start_date || plan.week_start);
  if (!target) return;
  try {
    await store.duplicatePlan(plan.id, target);
    store.fetchMonthEntries(calendarYear.value, calendarMonth.value);
    showPlanModal.value = false;
  } catch (err) {
    showAlert({ title: 'Fehler', message: err.message || 'Fehler beim Duplizieren', variant: 'warning' });
  }
}

// ── Shopping List ──
function createShoppingList(plan) {
  router.push(`/shopping?planId=${plan.id}`);
}

// ── Edit Plan ──
async function doEditPlan({ startDate, endDate }) {
  if (!selectedPlan.value) return;
  try {
    await store.updatePlan(selectedPlan.value.id, { startDate, endDate });
    showPlanEditModal.value = false;
    store.fetchMonthEntries(calendarYear.value, calendarMonth.value);
    showAlert({ title: 'Gespeichert', message: 'Plan erfolgreich aktualisiert.', variant: 'success', showCancel: false });
  } catch (err) {
    showAlert({ title: 'Fehler', message: err.message || 'Fehler beim Aktualisieren', variant: 'warning', showCancel: false });
  }
}

// ── Delete Plan ──
async function confirmDeletePlan(plan) {
  showConfirm({
    title: 'Plan löschen?',
    message: 'Dieser Plan und alle seine Mahlzeiten werden unwiderruflich gelöscht.',
    variant: 'danger',
    confirmText: 'Löschen',
    onConfirm: async () => {
      try {
        await store.deletePlan(plan.id);
        showPlanModal.value = false;
        store.fetchMonthEntries(calendarYear.value, calendarMonth.value);
      } catch (err) {
        showAlert({ title: 'Fehler', message: err.message || 'Fehler beim Löschen', variant: 'warning' });
      }
    },
  });
}

// ── Entry Click (Rezept in Kalender-Zelle) ──
function onEntryClick({ day, entry }) {
  // Öffne Tagesdetail für diesen Tag
  selectedDay.value = day;
  showDayDrawer.value = true;
}

// ── Plan-Click aus DayDetailDrawer ──
function onDayDrawerPlanClick(plan) {
  selectedPlan.value = plan;
  showDayDrawer.value = false;
  showPlanModal.value = true;
}

// ── Drag & Drop ──
function onDragOverDay(event, dateStr) {
  event.preventDefault();
}

async function onDropDay(event, dateStr) {
  event.preventDefault();
  const data = event.dataTransfer.getData('application/json');
  if (!data) return;
  try {
    const parsed = JSON.parse(data);

    if (parsed.recipeId) {
      // Rezept aus Browser oder SuggestionBox → Slot-Auswahl öffnen
      const dayPlans = store.calendarData?.plans?.filter(p => {
        const start = p.start_date || p.week_start;
        const end = p.end_date || addDays(start, 6);
        return dateStr >= start && dateStr <= end;
      });
      pendingDropRecipe.value = { recipeId: parsed.recipeId, dateStr, hasPlan: dayPlans.length > 0, plan: dayPlans[0] };
      slotSelectDate.value = dateStr;
      showSlotSelect.value = true;
    } else if (parsed.entry) {
      // Entry verschieben
      const entry = parsed.entry;
      const dayIdx = (new Date(dateStr + 'T12:00:00').getDay() + 6) % 7;
      await store.moveEntry(entry.meal_plan_id, entry.id, dayIdx, entry.category_id, dateStr);
      store.fetchMonthEntries(calendarYear.value, calendarMonth.value);
    }
  } catch {
    // silent
  }
}

async function onSlotSelected(slot) {
  showSlotSelect.value = false;
  if (!pendingDropRecipe.value) return;
  const { recipeId, dateStr, hasPlan, plan } = pendingDropRecipe.value;
  const dayIdx = (new Date(dateStr + 'T12:00:00').getDay() + 6) % 7;
  try {
    if (hasPlan && plan) {
      // In bestehenden Plan einfügen
      const planWeekStart = plan.start_date || plan.week_start;
      await store.addRecipeToPlan(recipeId, dayIdx, slot.id, planWeekStart, 4, dateStr);
    } else {
      // 1-Tages-Plan erstellen
      await store.addRecipeToPlan(recipeId, dayIdx, slot.id, dateStr, 4, dateStr, dateStr, dateStr);
    }
    store.fetchMonthEntries(calendarYear.value, calendarMonth.value);
  } catch (err) {
    showAlert({ title: 'Fehler', message: err.message || 'Fehler beim Hinzufügen', variant: 'warning' });
  }
  pendingDropRecipe.value = null;
}

function onRecipeDragStart(recipe) {
  dragData.value = { recipeId: recipe.id };
}

function onRecipeDragEnd() {
  dragData.value = null;
}

function onSuggestionDragStart(data) {
  dragData.value = data;
}

function onSuggestionDragEnd() {
  dragData.value = null;
}

function onAssignRecipe(data) {
  // Von SuggestionBox direkt zugewiesen
  store.fetchMonthEntries(calendarYear.value, calendarMonth.value);
}

async function onPastWeekChange(payload) {
  const weekStart = payload?.weekStart ?? payload;
  if (typeof payload?.index === 'number') {
    store.pastWeekIndex = payload.index;
  }
  await store.fetchPastWeekRecipes(weekStart);
}

// ── Helpers ──
function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
</script>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.fab-enter-active,
.fab-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.fab-enter-from,
.fab-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.9);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}


</style>
