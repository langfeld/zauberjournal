<!--
  ============================================
  CalendarDayCell – Einzelner Tag im Monatskalender
  ============================================
  Zeigt Datum, Mahlzeiten-Thumbnails und leeren Zustand.
  Plan-Farben als klickbare Balken oben in der Zelle.
  Unterstützt Drag & Drop mit visuellem Indikator.
-->
<template>
  <div
    class="relative flex flex-col border rounded-lg overflow-hidden transition-all duration-150"
    :class="cellClasses"
    @click="$emit('click')"
    @mouseenter="$emit('hover')"
    @dragenter.prevent="dragOver = true"
    @dragleave.prevent="dragOver = false"
    @dragover.prevent="$emit('dragover', $event)"
    @drop.prevent="onDrop($event)"
  >
    <!-- Drop-Indikator (Overlay bei Drag über Zelle) -->
    <div v-if="dragOver" class="z-20 absolute inset-0 border-2 border-dashed border-primary-500 bg-primary-500/10 pointer-events-none" />

    <!-- Plan-Farb-Balken (oben, klickbar) -->
    <div v-if="plans.length" class="flex flex-col gap-px shrink-0">
      <div
        v-for="plan in visiblePlans"
        :key="plan.id"
        class="relative h-1.5 sm:h-1 cursor-pointer hover:opacity-80 transition-opacity"
        :style="{ backgroundColor: plan.color || '#6366f1' }"
        :title="`Plan ${formatShortDate(plan.start_date || plan.week_start)} – ${formatShortDate(plan.end_date || plan.week_start)}`"
        @click.stop="$emit('plan-click', plan)"
      >
        <!-- Start-Ecke (oben links, konkav) -->
        <svg
          v-if="isPlanStart(plan)"
          class="absolute top-1 left-0 w-8 h-8"
          viewBox="0 0 34 34"
        >
          <path
            :fill="plan.color || '#6366f1'"
            d="M 0 0 H 34 C 6 0 0 9 0 21 Z"
          />
        </svg>

        <!-- Ende-Ecke (oben rechts, konkav) -->
        <svg
          v-if="isPlanEnd(plan)"
          class="absolute top-1 right-0 w-7 h-7"
          viewBox="0 0 34 34"
        >
          <path
            :fill="plan.color || '#6366f1'"
            d="M 34 0 H 0 C 28 0 34 9 34 21 Z"
          />
        </svg>
      </div>
    </div>

    <!-- Datum (oben rechts) -->
    <div class="flex justify-end px-1 pt-0.5 sm:pt-1 pb-0.5">
      <span
        class="flex justify-center items-center rounded-full w-7 h-7 sm:w-6 sm:h-6 font-semibold text-sm sm:text-xs"
        :class="{
          'bg-primary-500 text-white': isToday,
          'text-stone-600 dark:text-stone-300': !isToday && isCurrentMonth,
          'text-stone-400 dark:text-stone-600': !isCurrentMonth,
        }">
        {{ day.dayNumber }}
      </span>
    </div>

    <!-- Mahlzeiten (Thumbnails) -->
    <div class="flex-1 flex flex-col gap-1 sm:gap-0.5 px-1 sm:px-1 pb-2 sm:pb-1.5 overflow-hidden">
      <template v-if="entries.length">
        <div
          v-for="entry in visibleEntries"
          :key="entry.id"
          class="flex items-center gap-2 sm:gap-1.5 bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 px-2 sm:px-1.5 py-1.5 sm:py-1 rounded cursor-pointer transition-colors"
          @click.stop="$emit('entry-click', entry)"
        >
          <!-- Thumbnail -->
          <div class="shrink-0 w-6 h-6 sm:w-5 sm:h-5 rounded overflow-hidden bg-stone-200 dark:bg-stone-700">
            <img
              v-if="entry.image_url"
              :src="entry.image_url"
              class="w-full h-full object-cover"
              loading="lazy"
              alt=""
            />
            <span v-else class="flex justify-center items-center w-full h-full text-xs">🍽️</span>
          </div>
          <!-- Titel (nur Desktop) -->
          <span class="hidden lg:block truncate text-stone-700 dark:text-stone-200 text-[11px] leading-tight">
            {{ entry.recipe_title }}
          </span>
          <!-- Gekocht-Indikator -->
          <Check v-if="entry.is_cooked" class="ml-auto w-4 h-4 sm:w-3 sm:h-3 text-accent-500 shrink-0" />
        </div>

        <!-- "+X mehr" falls zu viele -->
        <div v-if="entries.length > maxVisible" class="text-center text-stone-400 dark:text-stone-500 text-xs sm:text-[10px]">
          +{{ entries.length - maxVisible }}
        </div>
      </template>

      <!-- Leerer Zustand -->
      <div v-else class="flex-1 flex justify-center items-center">
        <span class="text-stone-300 dark:text-stone-600 text-xl sm:text-lg lg:text-2xl opacity-50">+</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { Check } from 'lucide-vue-next';

const props = defineProps({
  day: { type: Object, required: true },
  entries: { type: Array, default: () => [] },
  plans: { type: Array, default: () => [] },
  isToday: Boolean,
  isCurrentMonth: Boolean,
  isSelectedStart: Boolean,
  isSelectedEnd: Boolean,
  isInRange: Boolean,
  isInHoverRange: Boolean,
  isSelectingRange: Boolean,
});

const emit = defineEmits(['click', 'entry-click', 'plan-click', 'hover', 'dragover', 'drop']);

const dragOver = ref(false);

const maxVisible = 3;
const maxVisiblePlans = 3;

const visibleEntries = computed(() => props.entries.slice(0, maxVisible));
const visiblePlans = computed(() => props.plans.slice(0, maxVisiblePlans));

const cellClasses = computed(() => {
  const classes = [];

  // Basis-Styling + Mindesthöhe (Mobile-optimiert)
  classes.push('bg-white', 'dark:bg-stone-900', 'min-h-[110px]', 'sm:min-h-[100px]', 'lg:min-h-[130px]');

  // Range-Zustände (in absteigender Priorität)
  if (props.isSelectedStart || props.isSelectedEnd) {
    classes.push('ring-2', 'ring-primary-500', 'z-10');
    classes.push('bg-primary-100', 'dark:bg-primary-900/50');
  } else if (props.isInHoverRange) {
    classes.push('border-2', 'border-primary-400', 'border-dashed');
    classes.push('bg-primary-100', 'dark:bg-primary-900/40');
    classes.push('cursor-crosshair');
  } else if (props.isInRange) {
    classes.push('border-2', 'border-primary-300');
    classes.push('bg-primary-50', 'dark:bg-primary-950/40');
  } else {
    classes.push('border-stone-200', 'dark:border-stone-700');
  }

  if (props.isToday && !props.isSelectedStart && !props.isSelectedEnd && !props.isInRange && !props.isInHoverRange) {
    classes.push('border-primary-300', 'dark:border-primary-700');
  }

  if (!props.isCurrentMonth && !props.isInRange && !props.isInHoverRange) {
    classes.push('opacity-50');
  }

  // Cursor: Pointer für klickbare Zelle (außer bei Range-Selektion)
  if (!props.isInHoverRange) {
    classes.push('cursor-pointer');
  }

  return classes;
});

function onDrop(event) {
  dragOver.value = false;
  emit('drop', event);
}

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

function isPlanStart(plan) {
  const start = plan.start_date || plan.week_start;
  return start === props.day.dateStr;
}

function isPlanEnd(plan) {
  const end = plan.end_date;
  return end === props.day.dateStr;
}
</script>
