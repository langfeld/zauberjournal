<!--
  ============================================
  PlanDetailModal – Details eines Plans als Popup
  ============================================
  Zeigt alle Rezepte des Plans als Liste, mit Optionen zum
  Sperren, Löschen, Duplizieren und zur Einkaufsliste hinzufügen.
-->
<template>
  <Transition name="modal">
    <div v-if="isOpen" class="z-50 fixed inset-0 flex justify-center items-center p-4" @click.self="close">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="close" />

      <!-- Modal -->
      <div class="relative bg-white dark:bg-stone-900 shadow-2xl rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <!-- Header -->
        <div class="flex items-start gap-4 shrink-0 px-6 py-5 border-b border-stone-200 dark:border-stone-700">
          <!-- Farb-Indikator -->
          <div class="mt-1 w-4 h-4 rounded-full shrink-0" :style="{ backgroundColor: plan?.color || '#6366f1' }" />

          <div class="flex-1 min-w-0">
            <h3 class="font-bold text-stone-800 dark:text-stone-100 text-xl">
              Plan vom {{ planLabel }}
            </h3>
            <p class="text-stone-500 dark:text-stone-400 text-sm mt-0.5">
              {{ entries.length }} Rezepte · {{ planDays }} Tage
              <span v-if="plan?.is_locked" class="ml-2 text-amber-600 dark:text-amber-400 font-medium">🔒 Fixiert</span>
            </p>
          </div>

          <button @click="close" class="hover:bg-stone-100 dark:hover:bg-stone-800 p-2 rounded-lg cursor-pointer transition-colors">
            <X class="w-5 h-5 text-stone-500" />
          </button>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-4 space-y-2">
          <!-- Tages-Gruppen -->
          <div v-for="(dayEntries, dateStr) in entriesByDay" :key="dateStr">
            <h4 class="font-medium text-stone-500 dark:text-stone-400 text-xs uppercase tracking-wide mb-1.5 px-2">
              {{ formatDayLabel(dateStr) }}
            </h4>

            <div class="space-y-1.5">
              <div
                v-for="entry in dayEntries"
                :key="entry.id"
                class="flex items-center gap-3 bg-stone-50 dark:bg-stone-800/50 hover:bg-stone-100 dark:hover:bg-stone-800 px-3 py-2.5 rounded-lg transition-colors cursor-pointer"
                :class="{ 'opacity-60': entry.is_cooked }"
                @click="$emit('entry-click', entry.recipe_id)"
              >
                <div class="shrink-0 w-10 h-10 rounded-lg overflow-hidden bg-stone-200 dark:bg-stone-700">
                  <img v-if="entry.image_url" :src="entry.image_url" class="w-full h-full object-cover" loading="lazy" />
                  <span v-else class="flex justify-center items-center w-full h-full text-sm">🍽️</span>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-medium text-stone-800 dark:text-stone-100 text-sm truncate">
                    {{ entry.recipe_title }}
                  </p>
                  <p class="text-stone-500 dark:text-stone-400 text-xs">
                    <span class="mr-1">{{ entry.category_icon }}</span>
                    {{ entry.category_name }}
                    <span v-if="entry.is_cooked" class="ml-2 text-accent-600 dark:text-accent-400">✓ Gekocht</span>
                  </p>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <button
                    @click.stop="$emit('swap', entry)"
                    class="hover:bg-stone-200 dark:hover:bg-stone-700 p-1.5 rounded-lg cursor-pointer transition-colors"
                    title="Tauschen">
                    <RefreshCw class="w-3.5 h-3.5 text-stone-500" />
                  </button>
                  <button
                    @click.stop="$emit('remove', entry)"
                    class="hover:bg-red-100 dark:hover:bg-red-900 p-1.5 rounded-lg cursor-pointer transition-colors"
                    title="Entfernen">
                    <Trash2 class="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="shrink-0 grid grid-cols-2 sm:flex sm:flex-row gap-2 px-6 py-4 border-t border-stone-200 dark:border-stone-700">
          <button @click="$emit('toggle-lock', plan)"
            :class="[
              'flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors',
              plan?.is_locked
                ? 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900'
                : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
            ]">
            <Lock v-if="plan?.is_locked" class="w-4 h-4" />
            <Unlock v-else class="w-4 h-4" />
            {{ plan?.is_locked ? 'Entsperren' : 'Sperren' }}
          </button>

          <button @click="$emit('duplicate', plan)"
            class="flex items-center justify-center gap-1.5 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 px-4 py-2 rounded-lg font-medium text-stone-700 dark:text-stone-300 text-sm cursor-pointer transition-colors">
            <Copy class="w-4 h-4" /> Duplizieren
          </button>

          <button @click="$emit('shopping-list', plan)"
            class="flex items-center justify-center gap-1.5 bg-primary-50 dark:bg-primary-900/30 hover:bg-primary-100 dark:hover:bg-primary-900 px-4 py-2 rounded-lg font-medium text-primary-700 dark:text-primary-300 text-sm cursor-pointer transition-colors">
            <ShoppingCart class="w-4 h-4" /> Einkaufsliste
          </button>

          <button @click="$emit('delete', plan)"
            class="flex items-center justify-center gap-1.5 bg-red-50 dark:bg-red-950 hover:bg-red-100 dark:hover:bg-red-900 px-4 py-2 rounded-lg font-medium text-red-600 dark:text-red-400 text-sm cursor-pointer transition-colors">
            <Trash2 class="w-4 h-4" /> Löschen
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed } from 'vue';
import { X, Lock, Unlock, Copy, ShoppingCart, Trash2, RefreshCw } from 'lucide-vue-next';

const props = defineProps({
  isOpen: Boolean,
  plan: { type: Object, default: null },
  entries: { type: Array, default: () => [] },
});

const emit = defineEmits(['close', 'entry-click', 'swap', 'remove', 'toggle-lock', 'duplicate', 'shopping-list', 'delete']);

const planLabel = computed(() => {
  if (!props.plan) return '';
  const start = props.plan.start_date || props.plan.week_start;
  const end = props.plan.end_date;
  if (!start) return '';
  const s = new Date(start + 'T12:00:00');
  if (!end) return s.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  const e = new Date(end + 'T12:00:00');
  return `${s.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}`;
});

const planDays = computed(() => {
  if (!props.plan) return 0;
  const start = props.plan.start_date || props.plan.week_start;
  const end = props.plan.end_date;
  if (!end) return 7;
  const diff = Math.round((new Date(end + 'T12:00:00') - new Date(start + 'T12:00:00')) / 86400000) + 1;
  return diff;
});

const entriesByDay = computed(() => {
  const grouped = {};
  for (const entry of props.entries) {
    const key = entry.plan_date || '';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(entry);
  }
  // Sortieren nach Datum
  const sorted = {};
  Object.keys(grouped).sort().forEach(k => sorted[k] = grouped[k]);
  return sorted;
});

function close() {
  emit('close');
}

function formatDayLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}
</script>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-active > div:last-child,
.modal-leave-active > div:last-child {
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.modal-enter-from > div:last-child,
.modal-leave-to > div:last-child {
  transform: scale(0.95);
}
</style>
