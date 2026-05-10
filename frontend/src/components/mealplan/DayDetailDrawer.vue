<!--
  ============================================
  DayDetailDrawer – Mahlzeiten eines Tages im Detail
  ============================================
  Slide-in Drawer (Desktop) / Bottom-Sheet (Mobile) mit allen
  Mahlzeiten des ausgewählten Tags. Zeigt zugehörige Pläne an.
-->
<template>
  <Transition name="drawer">
    <div v-if="isOpen" class="z-50 fixed inset-0" @click.self="close">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="close" />

      <!-- Drawer -->
      <div
        class="absolute bg-white dark:bg-stone-900 shadow-2xl flex flex-col"
        :class="isMobile ? 'bottom-0 inset-x-0 rounded-t-2xl max-h-[85vh]' : 'right-0 top-0 bottom-0 w-full max-w-lg rounded-l-2xl'"
      >
        <!-- Header -->
        <div class="shrink-0 px-5 py-4 border-b border-stone-200 dark:border-stone-700">
          <div class="flex items-center gap-3">
            <div class="flex-1 min-w-0">
              <h3 class="font-bold text-stone-800 dark:text-stone-100 text-lg">
                {{ dateLabel }}
              </h3>
              <p class="text-stone-500 dark:text-stone-400 text-sm">
                {{ entries.length }} Mahlzeit{{ entries.length !== 1 ? 'en' : '' }}
              </p>
            </div>
            <button @click="close" class="hover:bg-stone-100 dark:hover:bg-stone-800 p-2 rounded-lg transition-colors">
              <X class="w-5 h-5 text-stone-500" />
            </button>
          </div>

          <!-- Zugehörige Pläne -->
          <div v-if="dayPlans.length" class="flex flex-wrap gap-2 mt-3">
            <button
              v-for="plan in dayPlans"
              :key="plan.id"
              @click="$emit('plan-click', plan)"
              class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-transform hover:scale-105"
              :style="{ backgroundColor: plan.color + '20', color: plan.color, border: '1px solid ' + plan.color + '40' }"
            >
              <span class="w-2 h-2 rounded-full" :style="{ backgroundColor: plan.color }" />
              {{ formatShortDate(plan.start_date || plan.week_start) }}–{{ formatShortDate(plan.end_date || plan.week_start) }}
            </button>
          </div>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-4 space-y-3">
          <div v-if="!entries.length" class="py-12 text-center">
            <span class="text-4xl mb-3 block">🍽️</span>
            <p class="text-stone-500 dark:text-stone-400 text-sm">Keine Mahlzeiten für diesen Tag.</p>
            <button
              @click="openSwap(null)"
              class="mt-3 bg-primary-600 hover:bg-primary-700 px-4 py-2 rounded-lg font-medium text-white text-sm cursor-pointer transition-colors">
              Rezept hinzufügen
            </button>
          </div>

          <div
            v-for="entry in entries"
            :key="entry.id"
            class="group bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 rounded-xl overflow-hidden transition-all hover:shadow-md"
            :class="{ 'opacity-60': entry.is_cooked }"
          >
            <!-- Rezeptkarte -->
            <div class="flex gap-3 p-3">
              <div class="shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-stone-200 dark:bg-stone-700 cursor-pointer"
                @click="openRecipe(entry.recipe_id)">
                <img v-if="entry.image_url" :src="entry.image_url" class="w-full h-full object-cover" loading="lazy" />
                <div v-else class="flex justify-center items-center w-full h-full text-2xl">🍽️</div>
              </div>

              <div class="flex-1 min-w-0">
                <div class="flex items-start gap-2">
                  <span class="text-lg">{{ entry.category_icon }}</span>
                  <div class="flex-1 min-w-0">
                    <h4 class="font-semibold text-stone-800 dark:text-stone-100 text-sm truncate cursor-pointer hover:text-primary-600 dark:hover:text-primary-400"
                      @click="openRecipe(entry.recipe_id)">
                      {{ entry.recipe_title }}
                    </h4>
                    <p v-if="entry.recipe_description" class="text-stone-500 dark:text-stone-400 text-xs line-clamp-2 mt-0.5">
                      {{ entry.recipe_description }}
                    </p>
                  </div>
                </div>

                <div class="flex flex-wrap items-center gap-2 mt-2 text-xs text-stone-500 dark:text-stone-400">
                  <span v-if="entry.total_time" class="flex items-center gap-1">
                    <Clock class="w-3 h-3" /> {{ entry.total_time }} Min.
                  </span>
                  <button @click="openServings(entry)" class="flex items-center gap-1 cursor-pointer hover:text-stone-700 dark:hover:text-stone-200">
                    <Users class="w-3 h-3" /> {{ entry.servings }} Port.
                  </button>
                  <span v-if="entry.calories" class="flex items-center gap-1 text-orange-500 dark:text-orange-400">
                    <Flame class="w-3 h-3" /> {{ Math.round(entry.calories) }} kcal
                  </span>
                </div>
              </div>
            </div>

            <!-- Aktionen -->
            <div class="flex items-center gap-1 px-3 pb-3">
              <button @click="toggleCooked(entry)"
                :class="[
                  'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors',
                  entry.is_cooked
                    ? 'bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300'
                    : 'bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 text-stone-600 dark:text-stone-300'
                ]">
                <Check class="w-3.5 h-3.5" />
                {{ entry.is_cooked ? 'Gekocht' : 'Als gekocht markieren' }}
              </button>
              <button @click="openSwap(entry)"
                class="flex items-center justify-center bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 p-2 rounded-lg text-stone-600 dark:text-stone-300 cursor-pointer transition-colors"
                title="Rezept tauschen">
                <RefreshCw class="w-3.5 h-3.5" />
              </button>
              <button @click="remove(entry)"
                class="flex items-center justify-center bg-red-50 dark:bg-red-950 hover:bg-red-100 dark:hover:bg-red-900 p-2 rounded-lg text-red-500 cursor-pointer transition-colors"
                title="Entfernen">
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed } from 'vue';
import { X, Clock, Users, Flame, Check, RefreshCw, Trash2 } from 'lucide-vue-next';

const props = defineProps({
  isOpen: Boolean,
  dateStr: { type: String, default: '' },
  entries: { type: Array, default: () => [] },
  plans: { type: Array, default: () => [] },
  isMobile: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'entry-click', 'swap', 'remove', 'toggle-cooked', 'update-servings', 'plan-click']);

const dateLabel = computed(() => {
  if (!props.dateStr) return '';
  const d = new Date(props.dateStr + 'T12:00:00');
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
});

/** Pläne, die diesen Tag abdecken */
const dayPlans = computed(() => {
  return props.plans.filter(p => {
    const start = p.start_date || p.week_start;
    const end = p.end_date || addDays(start, 6);
    return props.dateStr >= start && props.dateStr <= end;
  });
});

function close() {
  emit('close');
}

function openRecipe(recipeId) {
  emit('entry-click', recipeId);
}

function openSwap(entry) {
  emit('swap', entry);
}

function openServings(entry) {
  emit('update-servings', entry);
}

function toggleCooked(entry) {
  emit('toggle-cooked', entry);
}

function remove(entry) {
  emit('remove', entry);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}
</script>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.2s ease;
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
.drawer-enter-active > div:last-child,
.drawer-leave-active > div:last-child {
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.drawer-enter-from > div:last-child,
.drawer-leave-to > div:last-child {
  transform: translateX(100%);
}
@media (max-width: 1023px) {
  .drawer-enter-from > div:last-child,
  .drawer-leave-to > div:last-child {
    transform: translateY(100%);
  }
}
</style>
