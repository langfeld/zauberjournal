<!--
  ============================================
  GenerateDialog – Plan-Generierung
  ============================================
  Dialog zur Konfiguration und Generierung eines Essensplans.
  Zeitraum wird aus dem Kalender übernommen, falls vorhanden.
-->
<template>
  <Transition name="modal">
    <div v-if="isOpen" class="z-50 fixed inset-0 flex justify-center items-center p-4 pointer-events-none">
      <div class="relative bg-white dark:bg-stone-900 shadow-2xl rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col pointer-events-auto">
        <!-- Header -->
        <div class="shrink-0 flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-stone-700">
          <h3 class="font-bold text-stone-800 dark:text-stone-100 text-lg">Plan generieren</h3>
          <button @click="close" class="hover:bg-stone-100 dark:hover:bg-stone-800 p-2 rounded-lg transition-colors">
            <X class="w-5 h-5 text-stone-500" />
          </button>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-6 space-y-5">
          <!-- Zeitraum -->
          <div>
            <label class="block mb-2 font-medium text-stone-700 dark:text-stone-200 text-sm">Zeitraum</label>
            <div class="flex items-center gap-2">
              <input
                v-model="form.startDate"
                type="date"
                class="flex-1 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-700 dark:text-stone-200"
              />
              <span class="text-stone-400">–</span>
              <input
                v-model="form.endDate"
                type="date"
                class="flex-1 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-700 dark:text-stone-200"
              />
            </div>
            <div class="flex gap-2 mt-2">
              <button v-for="preset in datePresets" :key="preset.label"
                @click="applyPreset(preset)"
                class="bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 px-2.5 py-1 rounded-md text-stone-600 dark:text-stone-300 text-xs transition-colors">
                {{ preset.label }}
              </button>
            </div>
          </div>

          <!-- Mahlzeiten -->
          <div>
            <label class="block mb-2 font-medium text-stone-700 dark:text-stone-200 text-sm">Mahlzeiten</label>
            <div class="flex flex-wrap gap-2">
              <label v-for="cat in mealCategories" :key="cat.id"
                class="flex items-center gap-2 bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  :value="cat.id"
                  v-model="form.categoryIds"
                  class="rounded text-primary-600 accent-primary-600"
                />
                <span class="text-sm">{{ cat.icon }} {{ cat.name }}</span>
              </label>
            </div>
          </div>

          <!-- Personen -->
          <div>
            <label class="block mb-2 font-medium text-stone-700 dark:text-stone-200 text-sm">Personen</label>
            <div class="flex items-center gap-3">
              <button @click="form.personCount = Math.max(1, form.personCount - 1)"
                class="hover:bg-stone-100 dark:hover:bg-stone-800 p-2 rounded-lg transition-colors">
                <Minus class="w-4 h-4 text-stone-600" />
              </button>
              <span class="font-semibold text-stone-800 dark:text-stone-100 w-8 text-center">{{ form.personCount }}</span>
              <button @click="form.personCount = Math.min(20, form.personCount + 1)"
                class="hover:bg-stone-100 dark:hover:bg-stone-800 p-2 rounded-lg transition-colors">
                <Plus class="w-4 h-4 text-stone-600" />
              </button>
            </div>
          </div>

          <!-- Quelle -->
          <div>
            <label class="block mb-2 font-medium text-stone-700 dark:text-stone-200 text-sm">Rezeptquelle</label>
            <select v-model="form.source"
              class="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-700 dark:text-stone-200">
              <option value="all">Alle Rezepte</option>
              <option value="household">Nur Haushalt-Rezepte</option>
              <option value="collections">Ausgewählte Sammlungen</option>
            </select>
          </div>

          <!-- KI-Reasoning -->
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" v-model="form.enableAiReasoning" class="rounded text-primary-600 accent-primary-600" />
            <span class="text-sm text-stone-700 dark:text-stone-200">KI-Begründung generieren</span>
          </label>
        </div>

        <!-- Footer -->
        <div class="shrink-0 flex justify-end gap-3 px-6 py-4 border-t border-stone-200 dark:border-stone-700">
          <button @click="close"
            class="hover:bg-stone-100 dark:hover:bg-stone-800 px-4 py-2 rounded-lg font-medium text-stone-700 dark:text-stone-300 text-sm transition-colors">
            Abbrechen
          </button>
          <button @click="generate"
            :disabled="!canGenerate || generating"
            class="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2 rounded-lg font-medium text-white text-sm transition-colors">
            <Sparkles class="w-4 h-4" :class="{ 'animate-pulse': generating }" />
            {{ generating ? 'Wird erstellt…' : 'Generieren' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { X, Minus, Plus, Sparkles } from 'lucide-vue-next';

const props = defineProps({
  isOpen: Boolean,
  generating: Boolean,
  initialRange: { type: Object, default: null }, // { startDate, endDate }
  mealCategories: { type: Array, default: () => [] },
});

const emit = defineEmits(['close', 'generate']);

const LS_KEY = 'zauberjournal-generate-settings';

const form = ref({
  startDate: '',
  endDate: '',
  categoryIds: [],
  personCount: 4,
  source: 'all',
  enableAiReasoning: false,
});

/** Gespeicherte Einstellungen aus localStorage laden */
function loadSavedSettings() {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.personCount) form.value.personCount = parsed.personCount;
      if (parsed.source) form.value.source = parsed.source;
      if (typeof parsed.enableAiReasoning === 'boolean') form.value.enableAiReasoning = parsed.enableAiReasoning;
      // Kategorien nur übernehmen, wenn sie in den aktuellen Kategorien existieren
      if (Array.isArray(parsed.categoryIds) && parsed.categoryIds.length > 0) {
        const validIds = parsed.categoryIds.filter(id => props.mealCategories.some(c => c.id === id));
        if (validIds.length > 0) form.value.categoryIds = validIds;
      }
    }
  } catch { /* ignore parse errors */ }
}

/** Aktuelle Einstellungen in localStorage speichern */
function saveSettings() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      categoryIds: form.value.categoryIds,
      personCount: form.value.personCount,
      source: form.value.source,
      enableAiReasoning: form.value.enableAiReasoning,
    }));
  } catch { /* ignore quota errors */ }
}

const datePresets = [
  { label: 'Diese Woche', days: 0 },
  { label: 'Nächste Woche', days: 7 },
  { label: '14 Tage', days: 0, endDays: 13 },
];

/** Hilfsfunktion: Date zu YYYY-MM-DD (lokal, kein UTC-Shift) */
function formatDateLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

watch(() => props.isOpen, (open) => {
  if (open) {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));

    if (props.initialRange?.startDate && props.initialRange?.endDate) {
      form.value.startDate = props.initialRange.startDate;
      form.value.endDate = props.initialRange.endDate;
    } else {
      form.value.startDate = formatDateLocal(monday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      form.value.endDate = formatDateLocal(sunday);
    }

    // Gespeicherte Einstellungen laden (falls vorhanden)
    loadSavedSettings();

    // Default: alle Kategorien außer die letzte (Snack-Equivalent)
    if (props.mealCategories.length > 0 && form.value.categoryIds.length === 0) {
      form.value.categoryIds = props.mealCategories.length > 1
        ? props.mealCategories.slice(0, -1).map(c => c.id)
        : props.mealCategories.map(c => c.id);
    }
  }
});

const canGenerate = computed(() => {
  return form.value.startDate &&
    form.value.endDate &&
    form.value.categoryIds.length > 0 &&
    form.value.endDate >= form.value.startDate;
});

function applyPreset(preset) {
  const base = new Date();
  base.setDate(base.getDate() + preset.days);
  const start = new Date(base);
  start.setDate(base.getDate() - (base.getDay() === 0 ? 6 : base.getDay() - 1));
  form.value.startDate = formatDateLocal(start);

  const end = preset.endDays !== undefined
    ? new Date(start.getTime() + preset.endDays * 86400000)
    : new Date(start.getTime() + 6 * 86400000);
  form.value.endDate = formatDateLocal(end);
}

function generate() {
  saveSettings();
  const collectionIds = form.value.source === 'collections' ? [] : undefined;
  emit('generate', {
    startDate: form.value.startDate,
    endDate: form.value.endDate,
    categoryIds: form.value.categoryIds,
    personCount: form.value.personCount,
    householdOnly: form.value.source === 'household',
    enableAiReasoning: form.value.enableAiReasoning,
    collectionIds,
  });
}

function close() {
  emit('close');
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
