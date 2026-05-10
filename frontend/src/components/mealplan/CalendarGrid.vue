<!--
  ============================================
  CalendarGrid – Monatskalender für Wochenplan
  ============================================
  Zeigt einen Monat als Raster an, mit Plan-Streifen
  über den betroffenen Tagen und Mahlzeiten pro Tag.
  Unterstützt Zeitraum-Selektion für die Generierung.
-->
<template>
  <div class="space-y-4">
    <!-- Monats-Navigation + Selektions-Status (integriert, keine Verschiebung) -->
    <div class="flex flex-wrap justify-between items-center gap-3 min-h-[40px]">
      <div class="flex items-center gap-2">
        <button @click="changeMonth(-1)"
          class="hover:bg-stone-100 dark:hover:bg-stone-800 p-2 rounded-lg transition-colors">
          <ChevronLeft class="w-5 h-5 text-stone-600 dark:text-stone-400" />
        </button>
        <button @click="goToToday"
          class="bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 px-3 py-1.5 rounded-lg font-medium text-stone-700 dark:text-stone-300 text-sm transition-colors">
          Heute
        </button>
        <button @click="changeMonth(1)"
          class="hover:bg-stone-100 dark:hover:bg-stone-800 p-2 rounded-lg transition-colors">
          <ChevronRight class="w-5 h-5 text-stone-600 dark:text-stone-400" />
        </button>
      </div>

      <!-- Monatstitel ODER Selektions-Status (gleicher Platz) -->
      <h2 v-if="!isSelectingRange" class="font-bold text-stone-800 dark:text-stone-100 text-lg">
        {{ monthLabel }}
      </h2>
      <div v-else class="flex items-center gap-2 bg-primary-50 dark:bg-primary-950/50 border border-primary-200 dark:border-primary-800 px-3 py-1.5 rounded-lg">
        <Info class="w-4 h-4 text-primary-600 dark:text-primary-400 shrink-0" />
        <span class="text-primary-800 dark:text-primary-200 text-sm">
          Start: <strong>{{ formatShortDate(selectedRange.startDate) }}</strong> — Enddatum wählen
        </span>
        <button @click="clearSelection" class="ml-1 hover:bg-primary-100 dark:hover:bg-primary-900 px-1.5 py-0.5 rounded text-primary-600 dark:text-primary-400 text-xs transition-colors">
          ✕
        </button>
      </div>
    </div>

    <!-- Wochentags-Header -->
    <div class="gap-1 grid grid-cols-7">
      <div v-for="day in weekdayLabels" :key="day"
        class="text-center font-medium text-stone-400 dark:text-stone-500 text-xs uppercase tracking-wide">
        {{ day }}
      </div>
    </div>

    <!-- Kalender-Raster -->
    <div class="space-y-1">
      <div v-for="(week, weekIdx) in calendarWeeks" :key="weekIdx">
        <!-- Tageszellen -->
        <div class="gap-1 grid grid-cols-7" @mouseleave="hoverDate = null">
          <CalendarDayCell
            v-for="day in week"
            :key="day.dateStr"
            :day="day"
            :entries="getEntriesForDay(day.dateStr)"
            :plans="getPlansForDay(day.dateStr)"
            :is-today="day.isToday"
            :is-current-month="day.isCurrentMonth"
            :is-selected-start="selectedRange?.startDate === day.dateStr"
            :is-selected-end="selectedRange?.endDate === day.dateStr"
            :is-in-range="isInSelectedRange(day.dateStr)"
            :is-in-hover-range="isInHoverRange(day.dateStr)"
            :is-selecting-range="isSelectingRange"
            @click="onDayClick(day)"
            @hover="onDayHover(day.dateStr)"
            @entry-click="onEntryClick(day, $event)"
            @plan-click="$emit('plan-click', $event)"
            @dragover="$emit('dragover-day', $event, day.dateStr)"
            @drop="$emit('drop-day', $event, day.dateStr)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { ChevronLeft, ChevronRight, Info } from 'lucide-vue-next';
import CalendarDayCell from './CalendarDayCell.vue';

const props = defineProps({
  year: { type: Number, required: true },
  month: { type: Number, required: true }, // 0-11
  entries: { type: Array, default: () => [] },
  plans: { type: Array, default: () => [] },
  selectedRange: { type: Object, default: null }, // { startDate, endDate }
});

const emit = defineEmits([
  'update:year',
  'update:month',
  'day-click',
  'plan-click',
  'entry-click',
  'dragover-day',
  'drop-day',
]);

// Hover-Zustand für Zeitraum-Selektion
const hoverDate = ref(null);

/** Zeitraum-Selektion aktiv? (Start gesetzt, aber kein Ende) */
const isSelectingRange = computed(() => {
  return !!(props.selectedRange?.startDate && !props.selectedRange?.endDate);
});

const weekdayLabels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const monthLabel = computed(() => {
  const d = new Date(props.year, props.month, 1);
  return d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
});

/** Alle Tage des Monats in Wochen gruppiert */
const calendarWeeks = computed(() => {
  const weeks = [];
  const firstDayOfMonth = new Date(props.year, props.month, 1);
  const lastDayOfMonth = new Date(props.year, props.month + 1, 0);

  // Tag der Woche des 1. des Monats (0=So, 1=Mo...)
  let startDayOfWeek = firstDayOfMonth.getDay();
  startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1; // 0=Mo

  const totalDays = lastDayOfMonth.getDate();
  const totalCells = Math.ceil((startDayOfWeek + totalDays) / 7) * 7;

  const todayStr = formatDateLocal(new Date());

  let currentWeek = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNumber = i - startDayOfWeek + 1;
    const dateObj = new Date(props.year, props.month, dayNumber);
    const dateStr = formatDateLocal(dateObj);

    currentWeek.push({
      dateObj,
      dateStr,
      dayNumber: dateObj.getDate(),
      isToday: dateStr === todayStr,
      isCurrentMonth: dateObj.getMonth() === props.month,
    });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  return weeks;
});

/** Entries für einen bestimmten Tag */
function getEntriesForDay(dateStr) {
  return props.entries.filter(e => e.plan_date === dateStr);
}

/** Pläne, die an einem bestimmten Tag aktiv sind */
function getPlansForDay(dateStr) {
  return props.plans.filter(p => {
    const start = p.start_date || p.week_start;
    const end = p.end_date || addDays(start, 6);
    return dateStr >= start && dateStr <= end;
  });
}

/** Zeitraum-Selektion: ist dieser Tag im ausgewählten Bereich? (Start und End beide gesetzt) */
function isInSelectedRange(dateStr) {
  if (!props.selectedRange?.startDate || !props.selectedRange?.endDate) return false;
  const start = props.selectedRange.startDate;
  const end = props.selectedRange.endDate;
  if (start <= end) {
    return dateStr >= start && dateStr <= end;
  }
  return dateStr >= end && dateStr <= start;
}

/** Hover-Bereich für Zeitraum-Selektion (nur während der Auswahl) */
function isInHoverRange(dateStr) {
  if (!isSelectingRange.value || !hoverDate.value) return false;
  const start = props.selectedRange.startDate;
  const hover = hoverDate.value;
  const min = start < hover ? start : hover;
  const max = start < hover ? hover : start;
  return dateStr >= min && dateStr <= max;
}

/** Tag geklickt */
function onDayClick(day) {
  hoverDate.value = null;
  emit('day-click', day);
}

/** Rezept in einer Zelle geklickt → Tag-Detail öffnen */
function onEntryClick(day, entry) {
  emit('entry-click', { day, entry });
}

/** Tag gehovert (einfaches String-Date, keine Objektreferenz) */
function onDayHover(dateStr) {
  if (isSelectingRange.value) {
    hoverDate.value = dateStr;
  }
}

/** Selektion abbrechen */
function clearSelection() {
  hoverDate.value = null;
  emit('day-click', { dateStr: null, _cancel: true });
}

/** Monat wechseln */
function changeMonth(delta) {
  let newMonth = props.month + delta;
  let newYear = props.year;
  if (newMonth < 0) { newMonth = 11; newYear--; }
  if (newMonth > 11) { newMonth = 0; newYear++; }
  emit('update:year', newYear);
  emit('update:month', newMonth);
}

/** Zu heutigem Monat springen */
function goToToday() {
  const now = new Date();
  emit('update:year', now.getFullYear());
  emit('update:month', now.getMonth());
}

/** Hilfsfunktion: Date-Objekt zu YYYY-MM-DD (lokale Zeit, kein UTC-Shift) */
function formatDateLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Hilfsfunktion: Tage addieren */
function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return formatDateLocal(d);
}

/** Hilfsfunktion: Kurzes Datum */
function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}
</script>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
