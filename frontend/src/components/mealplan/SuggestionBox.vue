<template>
  <div class="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden suggestion-box">
    <!-- Header mit Toggle -->
    <button
      @click="collapsed = !collapsed"
      class="flex justify-between items-center hover:bg-stone-50 dark:hover:bg-stone-800/50 px-4 py-3 w-full text-left transition-colors"
    >
      <h3 class="flex items-center gap-2 font-semibold text-stone-800 dark:text-stone-100 text-sm">
        <Lightbulb class="w-4 h-4 text-amber-500" />
        Rezeptvorschläge
      </h3>
      <ChevronDown
        class="w-4 h-4 text-stone-400 transition-transform duration-200"
        :class="{ 'rotate-180': !collapsed }"
      />
    </button>

    <!-- Inhalt (einklappbar) -->
    <Transition name="suggestion-expand">
      <div v-if="!collapsed" class="px-4 pb-4">
        <!-- Tab-Leiste -->
        <div class="flex gap-1 mb-3 border-stone-200 dark:border-stone-700 border-b overflow-x-auto scrollbar-hide">
          <button
            @click="activeTab = 'lastWeek'"
            class="suggestion-tab"
            :class="{ 'suggestion-tab--active': activeTab === 'lastWeek' }"
          >
            <RotateCcw class="w-3.5 h-3.5" />
            <span class="whitespace-nowrap">Letzte Woche</span>
          </button>
          <button
            @click="switchToPastWeeks"
            class="suggestion-tab"
            :class="{ 'suggestion-tab--active': activeTab === 'pastWeeks' }"
          >
            <Calendar class="w-3.5 h-3.5" />
            <span class="whitespace-nowrap">Vergangene Wochen</span>
          </button>
          <button
            v-if="showHouseholdTab"
            @click="activeTab = 'household'"
            class="suggestion-tab"
            :class="{ 'suggestion-tab--active': activeTab === 'household' }"
          >
            <Flame class="w-3.5 h-3.5" />
            <span class="whitespace-nowrap">Haushalt</span>
          </button>
        </div>

        <!-- Tab: Letzte Woche -->
        <div v-if="activeTab === 'lastWeek'">
          <div v-if="lastWeekRecipes.length" class="gap-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            <div v-for="recipe in lastWeekRecipes" :key="recipe.id" class="group suggestion-card" :draggable="isDraggable" @dragstart="onDragStart($event, recipe)" @dragend="onDragEnd" @click="onRecipeTap(recipe)">
              <div class="relative bg-stone-100 dark:bg-stone-800 mb-1.5 rounded-lg aspect-video overflow-hidden">
                <img v-if="recipe.image_url" :src="recipe.image_url" :alt="recipe.title" class="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
                <div v-else class="flex justify-center items-center w-full h-full text-2xl">🍽️</div>
                <div v-if="isDraggable" class="absolute inset-0 flex justify-center items-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none drag-hint">
                  <GripVertical class="w-5 h-5 text-white" />
                </div>
              </div>
              <p class="font-medium text-stone-700 dark:group-hover:text-primary-400 dark:text-stone-300 group-hover:text-primary-600 text-xs truncate transition-colors">{{ recipe.title }}</p>
              <p v-if="recipe.total_time" class="text-[10px] text-stone-400 truncate">{{ recipe.total_time }} Min.<span v-if="recipe.difficulty"> · {{ recipe.difficulty }}</span></p>
            </div>
          </div>
          <p v-else class="py-4 text-stone-400 dark:text-stone-500 text-sm text-center">Kein Wochenplan für die letzte Woche vorhanden</p>
        </div>

        <!-- Tab: Vergangene Wochen (KW-Slider) -->
        <div v-if="activeTab === 'pastWeeks'">
          <!-- Keine vergangenen Wochen mit Plan -->
          <p v-if="!pastWeeksList.length" class="py-4 text-stone-400 dark:text-stone-500 text-sm text-center">Keine vergangenen Wochenpläne vorhanden</p>
          <template v-else>
          <!-- KW-Navigator -->
          <div class="flex justify-between items-center mb-3 px-1">
            <button
              @click="changePastWeek(1)"
              :disabled="pastWeekIndex >= pastWeeksList.length - 1"
              class="flex items-center gap-1 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-30 p-1.5 rounded-lg text-stone-500 hover:text-stone-700 dark:hover:text-stone-200 dark:text-stone-400 transition-colors disabled:cursor-not-allowed"
              title="Ältere Woche"
            >
              <ChevronLeft class="w-4 h-4" />
            </button>
            <div class="text-center">
              <span v-if="pastWeekLoading" class="text-stone-400 dark:text-stone-500 text-sm">Lade…</span>
              <span v-else class="font-medium text-stone-700 dark:text-stone-200 text-sm">
                KW {{ pastWeekNumber }}
              </span>
            </div>
            <button
              @click="changePastWeek(-1)"
              :disabled="pastWeekIndex <= 0"
              class="flex items-center gap-1 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-30 p-1.5 rounded-lg text-stone-500 hover:text-stone-700 dark:hover:text-stone-200 dark:text-stone-400 transition-colors disabled:cursor-not-allowed"
              title="Neuere Woche"
            >
              <ChevronRight class="w-4 h-4" />
            </button>
          </div>

          <div v-if="pastWeekRecipes.length" class="gap-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            <div v-for="recipe in pastWeekRecipes" :key="recipe.id" class="group suggestion-card" :draggable="isDraggable" @dragstart="onDragStart($event, recipe)" @dragend="onDragEnd" @click="onRecipeTap(recipe)">
              <div class="relative bg-stone-100 dark:bg-stone-800 mb-1.5 rounded-lg aspect-video overflow-hidden">
                <img v-if="recipe.image_url" :src="recipe.image_url" :alt="recipe.title" class="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
                <div v-else class="flex justify-center items-center w-full h-full text-2xl">🍽️</div>
                <div v-if="isDraggable" class="absolute inset-0 flex justify-center items-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none drag-hint">
                  <GripVertical class="w-5 h-5 text-white" />
                </div>
              </div>
              <p class="font-medium text-stone-700 dark:group-hover:text-primary-400 dark:text-stone-300 group-hover:text-primary-600 text-xs truncate transition-colors">{{ recipe.title }}</p>
              <p v-if="recipe.total_time" class="text-[10px] text-stone-400 truncate">{{ recipe.total_time }} Min.<span v-if="recipe.difficulty"> · {{ recipe.difficulty }}</span></p>
            </div>
          </div>
          <p v-else class="py-4 text-stone-400 dark:text-stone-500 text-sm text-center">Keine Rezepte in dieser Woche</p>
          </template>
        </div>

        <!-- Tab: Haushalt-Vorschläge -->
        <div v-if="activeTab === 'household'">
          <div v-if="householdSuggestions.length" class="gap-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            <div v-for="recipe in householdSuggestions" :key="recipe.id" class="group suggestion-card" :draggable="isDraggable" @dragstart="onDragStart($event, recipe)" @dragend="onDragEnd" @click="onRecipeTap(recipe)">
              <div class="relative bg-stone-100 dark:bg-stone-800 mb-1.5 rounded-lg aspect-video overflow-hidden">
                <img v-if="recipe.image_url" :src="recipe.image_url" :alt="recipe.title" class="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
                <div v-else class="flex justify-center items-center w-full h-full text-2xl">🍽️</div>
                <div v-if="isDraggable" class="absolute inset-0 flex justify-center items-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none drag-hint">
                  <GripVertical class="w-5 h-5 text-white" />
                </div>
                <!-- Score-Badge mit Aufschlüsselung -->
                <div class="absolute top-1.5 right-1.5" @click.stop>
                  <ScorePopover :score="recipe.score" :breakdown="recipe.breakdown" />
                </div>
              </div>
              <p class="font-medium text-stone-700 dark:group-hover:text-primary-400 dark:text-stone-300 group-hover:text-primary-600 text-xs truncate transition-colors">{{ recipe.title }}</p>
              <!-- Hints -->
              <div v-if="recipe.hints?.length" class="flex flex-wrap gap-1 mt-1">
                <span
                  v-for="(hint, idx) in recipe.hints.slice(0, 2)" :key="idx"
                  class="inline-flex items-center gap-0.5 bg-stone-100 dark:bg-stone-700 px-1.5 py-0.5 rounded text-[10px] text-stone-500 dark:text-stone-400"
                >
                  <span>{{ hint.icon }}</span>
                  <span class="truncate max-w-[80px]">{{ hint.text }}</span>
                </span>
              </div>
              <p v-else-if="recipe.reason" class="text-[10px] text-stone-400 truncate">{{ recipe.reason }}</p>
              <p v-else-if="recipe.total_time" class="text-[10px] text-stone-400 truncate">{{ recipe.total_time }} Min.<span v-if="recipe.difficulty"> · {{ recipe.difficulty }}</span></p>
            </div>
          </div>
          <p v-else class="py-4 text-stone-400 dark:text-stone-500 text-sm text-center">Keine Vorschläge verfügbar</p>
        </div>
      </div>
    </Transition>

    <!-- ═══ Mobile Tap-Aktions-Dialog ═══ -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="tapDialog.show" class="z-50 fixed inset-0 flex justify-center items-end sm:items-center p-0 sm:p-4" @mousedown.self="closeTapDialog">
          <div class="fixed inset-0 bg-black/40" @click="closeTapDialog" />
          <div class="safe-bottom z-10 relative bg-white dark:bg-stone-900 shadow-2xl sm:rounded-2xl rounded-t-2xl w-full sm:max-w-sm">
            <!-- Rezept-Vorschau -->
            <div class="flex items-center gap-3 px-5 pt-5 pb-3">
              <div class="bg-stone-100 dark:bg-stone-800 rounded-lg w-12 h-12 overflow-hidden shrink-0">
                <img v-if="tapDialog.recipe?.image_url" :src="tapDialog.recipe.image_url" :alt="tapDialog.recipe.title" class="w-full h-full object-cover" />
                <div v-else class="flex justify-center items-center w-full h-full text-lg">🍽️</div>
              </div>
              <div class="min-w-0">
                <p class="font-semibold text-stone-800 dark:text-stone-100 text-sm truncate">{{ tapDialog.recipe?.title }}</p>
                <p v-if="tapDialog.recipe?.total_time" class="text-stone-400 text-xs">{{ tapDialog.recipe.total_time }} Min.</p>
              </div>
            </div>

            <div class="flex flex-col gap-2 px-5 pb-2">
              <!-- Rezept öffnen -->
              <button
                @click="openRecipe"
                class="flex items-center gap-3 bg-stone-50 hover:bg-stone-100 dark:bg-stone-800/50 dark:hover:bg-stone-800 px-4 py-3 rounded-xl text-left transition-colors"
              >
                <div class="flex justify-center items-center bg-stone-100 dark:bg-stone-800 rounded-lg w-9 h-9 shrink-0">
                  <ExternalLink class="w-4 h-4 text-stone-500 dark:text-stone-400" />
                </div>
                <div>
                  <p class="font-medium text-stone-800 dark:text-stone-100 text-sm">Rezept öffnen</p>
                  <p class="text-stone-400 dark:text-stone-500 text-xs">Details anzeigen</p>
                </div>
              </button>

              <!-- Auf einen Tag legen -->
              <button
                @click="showDayPicker = true"
                :disabled="isLocked"
                class="flex items-center gap-3 bg-primary-50 hover:bg-primary-100 dark:bg-primary-950/50 dark:hover:bg-primary-900/50 disabled:opacity-40 px-4 py-3 border border-primary-200 dark:border-primary-800 rounded-xl text-left transition-colors disabled:cursor-not-allowed"
              >
                <div class="flex justify-center items-center bg-primary-100 dark:bg-primary-900 rounded-lg w-9 h-9 shrink-0">
                  <CalendarPlus class="w-4 h-4 text-primary-600 dark:text-primary-400" />
                </div>
                <div>
                  <p class="font-medium text-stone-800 dark:text-stone-100 text-sm">Auf Tag planen</p>
                  <p class="text-stone-400 dark:text-stone-500 text-xs">Zum Wochenplan hinzufügen</p>
                </div>
              </button>
            </div>

            <!-- Tag-Auswahl (aufklappbar) -->
            <Transition name="slide-down">
              <div v-if="showDayPicker" class="px-5 pb-2">
                <div class="mt-1 pt-3 border-stone-200 dark:border-stone-700 border-t">
                  <p class="mb-2 font-medium text-stone-500 dark:text-stone-400 text-xs">Tag & Mahlzeit wählen:</p>
                  <!-- Meal-Type Auswahl -->
                  <div class="flex gap-1 mb-2 overflow-x-auto scrollbar-hide">
                    <button
                      v-for="mt in dayPickerMealTypes"
                      :key="mt.id"
                      @click="dayPickerMealType = mt.id"
                      class="px-2.5 py-1 rounded-lg font-medium text-xs whitespace-nowrap transition-colors"
                      :class="dayPickerMealType === mt.id
                        ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700'"
                    >
                      {{ mt.icon }} {{ mt.name }}
                    </button>
                  </div>
                  <!-- Tage als Grid -->
                  <div class="gap-1 grid grid-cols-7">
                    <button
                      v-for="(day, idx) in weekDays"
                      :key="idx"
                      @click="assignToDay(idx)"
                      class="flex flex-col items-center gap-0.5 hover:bg-primary-50 dark:hover:bg-primary-950/50 py-2 rounded-lg font-medium hover:text-primary-600 dark:hover:text-primary-400 text-xs transition-colors"
                      :class="getDaySlotStatus(idx, dayPickerMealType) === 'occupied'
                        ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400'
                        : 'bg-stone-50 dark:bg-stone-800/50 text-stone-600 dark:text-stone-300'"
                    >
                      <span>{{ day.short }}</span>
                      <span class="text-[10px] text-stone-400">{{ day.date }}</span>
                      <span v-if="getDaySlotStatus(idx, dayPickerMealType) === 'occupied'" class="text-[9px] text-amber-500">belegt</span>
                    </button>
                  </div>
                </div>
              </div>
            </Transition>

            <button @click="closeTapDialog" class="mt-2 py-3 border-stone-100 dark:border-stone-800 border-t w-full text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 text-sm text-center transition-colors">
              Abbrechen
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Lightbulb, Flame, RotateCcw, ChevronDown, ChevronLeft, ChevronRight, GripVertical, Calendar, ExternalLink, CalendarPlus } from 'lucide-vue-next';
import ScorePopover from './ScorePopover.vue';

const props = defineProps({
  lastWeekRecipes: { type: Array, default: () => [] },
  householdSuggestions: { type: Array, default: () => [] },
  pastWeekRecipes: { type: Array, default: () => [] },
  pastWeekIndex: { type: Number, default: 0 },
  pastWeekNumber: { type: Number, default: null },
  pastWeekHasPlan: { type: Boolean, default: false },
  pastWeeksList: { type: Array, default: () => [] },
  showHouseholdTab: { type: Boolean, default: false },
  currentPlan: { type: Object, default: null },
  isLocked: { type: Boolean, default: false },
  weekDays: { type: Array, default: () => [] },
  mealTypes: { type: Array, default: () => [] },
});

const emit = defineEmits([
  'suggestion-drag-start',
  'suggestion-drag-end',
  'past-week-change',
  'assign-recipe',
]);

const router = useRouter();

// Eingeklappt-Zustand aus localStorage laden
const COLLAPSED_KEY = 'suggestion-box-collapsed';
const collapsed = ref(false);
try {
  collapsed.value = localStorage.getItem(COLLAPSED_KEY) === 'true';
} catch { /* silent */ }

// Bei Änderung persistieren
watch(collapsed, (val) => {
  try {
    localStorage.setItem(COLLAPSED_KEY, String(val));
  } catch { /* silent */ }
});

const activeTab = ref('lastWeek');

// Desktop-Erkennung: Drag nur mit feinem Pointer (Maus)
const isDraggable = computed(() => {
  if (props.isLocked) return false;
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: fine)').matches;
});

// ─── Past Weeks (Slider – nur Wochen mit Plan) ───
const pastWeekLoading = ref(false);

function switchToPastWeeks() {
  activeTab.value = 'pastWeeks';
  if (!props.pastWeekNumber && props.pastWeeksList.length) {
    // Erste verfügbare vergangene Woche laden (Index 0 = neueste)
    emit('past-week-change', { index: 0, weekStart: props.pastWeeksList[0].week_start });
  }
}

function changePastWeek(delta) {
  // delta: -1 = neuere Woche (kleinerer Index), +1 = ältere Woche (größerer Index)
  const newIndex = props.pastWeekIndex + delta;
  if (newIndex < 0 || newIndex >= props.pastWeeksList.length) return;
  pastWeekLoading.value = true;
  emit('past-week-change', { index: newIndex, weekStart: props.pastWeeksList[newIndex].week_start });
}

watch(() => props.pastWeekNumber, () => {
  pastWeekLoading.value = false;
});

// ─── Drag & Drop (Desktop) ───
function onDragStart(event, recipe) {
  const data = {
    recipeId: recipe.id,
    recipeTitle: recipe.title,
    source: 'suggestion',
  };
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('application/json', JSON.stringify(data));
  event.dataTransfer.setData('text/plain', recipe.id.toString());
  if (event.target) event.target.style.opacity = '0.5';
  emit('suggestion-drag-start', data);
}

function onDragEnd(event) {
  if (event?.target) event.target.style.opacity = '';
  emit('suggestion-drag-end');
}

// ─── Mobile Tap-Aktions-Dialog ───
const tapDialog = ref({ show: false, recipe: null });
const showDayPicker = ref(false);
const dayPickerMealType = ref(null);

const dayPickerMealTypes = computed(() => {
  if (props.mealTypes?.length) return props.mealTypes;
  return []; // Fallback: leer, wird über Props befüllt
});

function onRecipeTap(recipe) {
  if (isDraggable.value) {
    // Desktop: Klick öffnet direkt das Rezept
    router.push(`/recipes/${recipe.id}`);
    return;
  }
  // Mobile: Aktions-Dialog anzeigen
  tapDialog.value = { show: true, recipe };
  showDayPicker.value = false;
  dayPickerMealType.value = dayPickerMealTypes.value[0]?.id || null;
}

function closeTapDialog() {
  tapDialog.value = { show: false, recipe: null };
  showDayPicker.value = false;
}

function openRecipe() {
  if (tapDialog.value.recipe) {
    router.push(`/recipes/${tapDialog.value.recipe.id}`);
  }
  closeTapDialog();
}

function getDaySlotStatus(dayIdx, categoryId) {
  if (!props.currentPlan?.entries) return 'free';
  const categoryName = dayPickerMealTypes.value.find(mt => mt.id === categoryId)?.name;
  if (!categoryName) return 'free';
  return props.currentPlan.entries.some(
    e => e.day_of_week === dayIdx && e.category_name === categoryName
  ) ? 'occupied' : 'free';
}

function assignToDay(dayIdx) {
  if (!tapDialog.value.recipe) return;
  emit('assign-recipe', {
    recipeId: tapDialog.value.recipe.id,
    recipeTitle: tapDialog.value.recipe.title,
    dayOfWeek: dayIdx,
    categoryId: dayPickerMealType.value,
  });
  closeTapDialog();
}
</script>

<style scoped>
/* ─── Tabs ─── */
.suggestion-tab {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-stone-500);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
  flex-shrink: 0;
}
.suggestion-tab:hover {
  color: var(--color-stone-700);
}
:is(.dark .suggestion-tab:hover) {
  color: var(--color-stone-300);
}
.suggestion-tab--active {
  color: var(--color-primary-600);
  border-bottom-color: var(--color-primary-600);
}
:is(.dark .suggestion-tab--active) {
  color: var(--color-primary-400);
  border-bottom-color: var(--color-primary-400);
}

/* ─── Suggestion Card ─── */
.suggestion-card {
  cursor: pointer;
  transition: transform 0.1s ease;
}
.suggestion-card:hover {
  transform: translateY(-1px);
}
@media (pointer: fine) {
  .suggestion-card {
    cursor: grab;
  }
  .suggestion-card:active {
    cursor: grabbing;
  }
}

/* ─── Hide Scrollbar ─── */
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}

/* ─── Safe Bottom (iPhone notch) ─── */
.safe-bottom {
  padding-bottom: env(safe-area-inset-bottom, 0);
}

/* ─── Expand Transition ─── */
.suggestion-expand-enter-active,
.suggestion-expand-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}
.suggestion-expand-enter-from,
.suggestion-expand-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}
.suggestion-expand-enter-to,
.suggestion-expand-leave-from {
  opacity: 1;
  max-height: 500px;
}

/* ─── Modal Transition ─── */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .safe-bottom,
.modal-leave-to .safe-bottom {
  transform: translateY(100%);
}

/* ─── Slide Down Transition ─── */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}
.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  max-height: 0;
}
.slide-down-enter-to,
.slide-down-leave-from {
  opacity: 1;
  max-height: 300px;
}
</style>
