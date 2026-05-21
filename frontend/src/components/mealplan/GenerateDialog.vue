<!--
  ============================================
  GenerateDialog – Plan-Generierung
  ============================================
  Zwei Reiter: Generieren (Zeitraum, Mahlzeiten, Personen)
  und Einstellungen (Quelle, Sammlungen, Duplikate, Aktive Tage, KI, Vorlagen)
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

        <!-- Tabs -->
        <div class="flex gap-1 px-6 pt-4 border-b border-stone-200 dark:border-stone-700">
          <button
            v-for="tab in tabs" :key="tab.id"
            @click="activeTab = tab.id"
            class="px-4 py-2 rounded-t-lg text-sm font-medium transition-colors"
            :class="activeTab === tab.id
              ? 'bg-stone-100 dark:bg-stone-800 text-primary-600 dark:text-primary-400 border-b-2 border-primary-500'
              : 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800/50'"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- Content: Generieren -->
        <div v-if="activeTab === 'generate'" class="flex-1 overflow-y-auto p-6 space-y-5">
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
                class="bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 px-2.5 py-1 rounded-md text-stone-600 dark:text-stone-300 text-xs transition-colors cursor-pointer">
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
                class="hover:bg-stone-100 dark:hover:bg-stone-800 p-2 rounded-lg transition-colors cursor-pointer">
                <Minus class="w-4 h-4 text-stone-600" />
              </button>
              <span class="font-semibold text-stone-800 dark:text-stone-100 w-8 text-center">{{ form.personCount }}</span>
              <button @click="form.personCount = Math.min(20, form.personCount + 1)"
                class="hover:bg-stone-100 dark:hover:bg-stone-800 p-2 rounded-lg transition-colors cursor-pointer">
                <Plus class="w-4 h-4 text-stone-600" />
              </button>
            </div>
          </div>
        </div>

        <!-- Content: Einstellungen -->
        <div v-else-if="activeTab === 'settings'" class="flex-1 overflow-y-auto p-6 space-y-5">
          <!-- Rezeptquelle -->
          <div>
            <label class="block mb-2 font-medium text-stone-700 dark:text-stone-200 text-sm">Rezeptquelle</label>
            <label class="flex items-center gap-2 mb-2 cursor-pointer">
              <input type="radio" v-model="form.source" value="all" class="accent-primary-600" />
              <span class="text-sm text-stone-700 dark:text-stone-200">Alle Rezepte</span>
            </label>
            <label v-if="isInHousehold" class="flex items-center gap-2 mb-2 cursor-pointer">
              <input type="radio" v-model="form.source" value="household" class="accent-primary-600" />
              <span class="text-sm text-stone-700 dark:text-stone-200">Nur Haushalt-Rezepte</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" v-model="form.source" value="collections" class="accent-primary-600" />
              <span class="text-sm text-stone-700 dark:text-stone-200">Ausgewählte Sammlungen</span>
            </label>
          </div>

          <!-- Sammlungs-Auswahl -->
          <Transition name="fade">
            <div v-if="form.source === 'collections'">
              <label class="block mb-2 font-medium text-stone-700 dark:text-stone-200 text-sm">Sammlungen</label>
              <div v-if="!collections.length" class="text-stone-400 dark:text-stone-500 text-sm">
                Keine Sammlungen vorhanden.
              </div>
              <div v-else class="space-y-1 max-h-40 overflow-y-auto">
                <label
                  v-for="col in collections" :key="col.id"
                  :class="[
                    'flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors',
                    form.collectionIds.includes(col.id)
                      ? 'border-primary-400 bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300'
                      : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800'
                  ]"
                >
                  <input type="checkbox" :value="col.id" v-model="form.collectionIds" class="accent-primary-600" />
                  <span
                    class="flex justify-center items-center rounded w-6 h-6 text-sm shrink-0"
                    :style="{ backgroundColor: col.color + '20' }"
                  >{{ col.icon }}</span>
                  <span class="flex-1 truncate">{{ col.name }}</span>
                  <span class="text-stone-400 text-xs shrink-0">{{ col.recipe_count ?? 0 }}</span>
                </label>
              </div>
            </div>
          </Transition>

          <!-- Duplikate vermeiden -->
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" v-model="form.deduplicate" class="rounded text-primary-600 accent-primary-600" />
            <div>
              <span class="text-sm text-stone-700 dark:text-stone-200 font-medium">Duplikate vermeiden</span>
              <p class="text-stone-400 dark:text-stone-500 text-xs">Rezepte in mehreren Sammlungen nur einmal berücksichtigen</p>
            </div>
          </label>

          <!-- Aktive Tage -->
          <div>
            <label class="block mb-1 font-medium text-stone-700 dark:text-stone-200 text-sm">Aktive Tage</label>
            <p class="mb-2 text-stone-400 dark:text-stone-500 text-xs">An welchen Wochentagen sollen Gerichte geplant werden? Inaktive Tage werden übersprungen.</p>
            <div class="flex gap-1">
              <button
                v-for="(day, idx) in weekdayLabels" :key="idx"
                @click="toggleActiveDay(idx)"
                class="flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                :class="form.activeDays.includes(idx)
                  ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300'
                  : 'bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-700'"
              >
                {{ day }}
              </button>
            </div>
            <p v-if="form.activeDays.length === 0" class="mt-1 text-amber-600 text-xs">
              Mindestens ein Tag muss aktiv sein
            </p>
          </div>

          <!-- KI-Reasoning -->
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" v-model="form.enableAiReasoning" class="rounded text-primary-600 accent-primary-600" />
            <span class="text-sm text-stone-700 dark:text-stone-200">KI-Begründung generieren</span>
          </label>

          <!-- Vorlagen -->
          <div class="pt-4 border-t border-stone-200 dark:border-stone-700 space-y-3">
            <p class="font-medium text-stone-700 dark:text-stone-200 text-sm">Einstellungen speichern & laden</p>
            <div class="flex gap-2">
              <input
                v-model="newTemplateName"
                placeholder="Name der Vorlage…"
                class="flex-1 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-700 dark:text-stone-200"
                @keydown.enter="saveAsTemplate"
              />
              <button
                @click="saveAsTemplate"
                :disabled="!newTemplateName.trim()"
                class="flex items-center gap-1.5 bg-primary-50 dark:bg-primary-950/30 hover:bg-primary-100 dark:hover:bg-primary-900/50 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2 rounded-lg text-sm font-medium text-primary-600 dark:text-primary-400 transition-colors cursor-pointer"
              >
                <Save class="w-4 h-4" />
                Speichern
              </button>
            </div>
            <div v-if="templates.length > 0" class="space-y-1.5">
              <div
                v-for="tmpl in templates" :key="tmpl.id"
                class="group flex items-center gap-2 bg-stone-50 dark:bg-stone-800/50 hover:bg-stone-100 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2 cursor-pointer transition-all"
                @click="loadTemplate(tmpl)"
              >
                <div class="flex-1 min-w-0">
                  <p class="font-medium text-stone-700 dark:text-stone-200 text-sm truncate">{{ tmpl.name }}</p>
                </div>
                <button
                  @click.stop="deleteTemplate(tmpl.id)"
                  class="opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900 p-1 rounded text-red-400 transition-all cursor-pointer"
                  title="Vorlage löschen"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Content: Scoring -->
        <div v-if="activeTab === 'scoring'" class="flex-1 overflow-y-auto p-6 space-y-5">
          <!-- Profil-Auswahl -->
          <div>
            <label class="block mb-2 font-medium text-stone-700 dark:text-stone-200 text-sm">Scoring-Profil</label>
            <p class="mb-2 text-stone-400 dark:text-stone-500 text-xs">Wähle, welche Aspekte bei der Rezept-Auswahl bevorzugt werden sollen.</p>
            <div class="space-y-2">
              <label v-for="p in scoringProfiles" :key="p.id"
                class="flex items-center gap-2.5 bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2.5 cursor-pointer transition-colors">
                <input type="radio" :value="p.id" v-model="form.scoringProfile" class="accent-primary-600" />
                <div>
                  <p class="text-sm text-stone-700 dark:text-stone-200 font-medium">{{ p.label }}</p>
                  <p class="text-stone-400 dark:text-stone-500 text-xs">{{ p.description }}</p>
                </div>
              </label>
            </div>
          </div>

          <!-- Erweiterte Anpassung (ausklappbar) -->
          <div class="pt-3 border-t border-stone-200 dark:border-stone-700">
            <button @click="showAdvancedScoring = !showAdvancedScoring"
              class="flex items-center gap-1.5 text-sm font-medium text-stone-600 dark:text-stone-300 hover:text-stone-800 dark:hover:text-stone-100 transition-colors cursor-pointer">
              <span>{{ showAdvancedScoring ? '▾' : '▸' }}</span>
              <span>Erweiterte Anpassung</span>
            </button>

            <Transition name="fade">
              <div v-if="showAdvancedScoring" class="mt-3 space-y-4">
                <div v-for="slider in scoringSliders" :key="slider.key">
                  <div class="flex justify-between items-center mb-1">
                    <label class="text-xs text-stone-600 dark:text-stone-300">{{ slider.label }}</label>
                    <span class="text-xs font-medium text-stone-500 dark:text-stone-400">{{ Math.round((form.scoringWeights[slider.key] ?? 1.0) * 100) }}%</span>
                  </div>
                  <input
                    type="range"
                    :min="0"
                    :max="300"
                    :value="Math.round((form.scoringWeights[slider.key] ?? 1.0) * 100)"
                    @input="updateWeight(slider.key, $event.target.value)"
                    class="w-full accent-primary-600 h-1.5 bg-stone-200 dark:bg-stone-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <div class="flex justify-between text-[10px] text-stone-400 mt-0.5">
                    <span>0%</span>
                    <span>150%</span>
                    <span>300%</span>
                  </div>
                </div>
                <p v-if="isCustomScoring" class="text-xs text-amber-600 dark:text-amber-400">
                  Profil wird als „Benutzerdefiniert" gespeichert.
                </p>
              </div>
            </Transition>
          </div>
        </div>

        <!-- Footer -->
        <div class="shrink-0 flex justify-end gap-3 px-6 py-4 border-t border-stone-200 dark:border-stone-700">
          <button @click="close"
            class="hover:bg-stone-100 dark:hover:bg-stone-800 px-4 py-2 rounded-lg font-medium text-stone-700 dark:text-stone-300 text-sm transition-colors cursor-pointer">
            Abbrechen
          </button>
          <button @click="generate"
            :disabled="!canGenerate || generating || form.activeDays.length === 0"
            class="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2 rounded-lg font-medium text-white text-sm transition-colors cursor-pointer">
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
import { X, Minus, Plus, Sparkles, Save, Trash2 } from 'lucide-vue-next';

const props = defineProps({
  isOpen: Boolean,
  generating: Boolean,
  initialRange: { type: Object, default: null },
  mealCategories: { type: Array, default: () => [] },
  collections: { type: Array, default: () => [] },
  isInHousehold: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'generate']);

const LS_KEY_SETTINGS = 'zauberjournal-generate-settings';
const LS_KEY_TEMPLATES = 'zauberjournal-generate-templates';

const weekdayLabels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const form = ref({
  startDate: '',
  endDate: '',
  categoryIds: [],
  personCount: 4,
  source: 'all',
  collectionIds: [],
  deduplicate: true,
  activeDays: [0, 1, 2, 3, 4, 5, 6],
  enableAiReasoning: false,
  scoringProfile: 'balanced',
  scoringWeights: {},
});

const showAdvancedScoring = ref(false);

const scoringProfiles = [
  { id: 'balanced', label: 'Ausgewogen', description: 'Alle Faktoren gleich gewichtet – guter Mix aus Abwechslung, Favoriten und Einkaufsoptimierung.' },
  { id: 'variety', label: 'Mehr Abwechslung', description: 'Bevorzugt lange nicht gekochte Rezepte und vermeidet Duplikate & gleiche Kategorien hintereinander.' },
  { id: 'favorites', label: 'Favoriten bevorzugen', description: 'Favoriten und gut bewertete Rezepte werden stärker gewichtet.' },
  { id: 'shopping', label: 'Einkaufsoptimierung', description: 'Rezepte mit überlappenden Zutaten und vorhandenen Vorräten werden bevorzugt.' },
  { id: 'quick', label: 'Schnell & einfach', description: 'Einfache, schnelle Rezepte werden unter der Woche bevorzugt.' },
];

const scoringSliders = [
  { key: 'rotationWeight', label: 'Rotation (lange nicht gekocht)' },
  { key: 'favoriteWeight', label: 'Favoriten' },
  { key: 'ratingWeight', label: 'Bewertung' },
  { key: 'varietyWeight', label: 'Abwechslung & Duplikate' },
  { key: 'difficultyWeight', label: 'Schwierigkeit' },
  { key: 'timeWeight', label: 'Zeitaufwand' },
  { key: 'shoppingWeight', label: 'Zutaten-Überlappung & Vorräte' },
  { key: 'calorieWeight', label: 'Kalorien-Passung' },
];

const isCustomScoring = computed(() => {
  // Custom wenn ein Slider vom Default (1.0) abweicht
  const weights = form.value.scoringWeights;
  if (!weights || Object.keys(weights).length === 0) return false;
  return Object.values(weights).some(v => v !== 1.0);
});

function updateWeight(key, value) {
  if (!form.value.scoringWeights) form.value.scoringWeights = {};
  form.value.scoringWeights[key] = parseInt(value, 10) / 100;
  if (form.value.scoringProfile !== 'custom') {
    form.value.scoringProfile = 'custom';
  }
}

const activeTab = ref('generate');
const newTemplateName = ref('');
const isInitialized = ref(false);

const tabs = [
  { id: 'generate', label: 'Generieren' },
  { id: 'settings', label: 'Einstellungen' },
  { id: 'scoring', label: 'Scoring' },
];

const templates = ref([]);

function loadTemplates() {
  try {
    const saved = localStorage.getItem(LS_KEY_TEMPLATES);
    if (saved) templates.value = JSON.parse(saved);
  } catch { templates.value = []; }
}

function persistTemplates() {
  try {
    localStorage.setItem(LS_KEY_TEMPLATES, JSON.stringify(templates.value));
  } catch { /* ignore */ }
}

function saveAsTemplate() {
  const name = newTemplateName.value.trim();
  if (!name) return;
  templates.value.unshift({
    id: Date.now().toString(),
    name,
    categoryIds: [...form.value.categoryIds],
    personCount: form.value.personCount,
    source: form.value.source,
    collectionIds: [...form.value.collectionIds],
    deduplicate: form.value.deduplicate,
    activeDays: [...form.value.activeDays],
    enableAiReasoning: form.value.enableAiReasoning,
  });
  persistTemplates();
  newTemplateName.value = '';
}

function loadTemplate(tmpl) {
  const validIds = tmpl.categoryIds?.filter(id => props.mealCategories.some(c => c.id === id)) || [];
  form.value.categoryIds = validIds.length > 0 ? validIds : defaultCategoryIds();
  form.value.personCount = tmpl.personCount || 4;
  form.value.source = tmpl.source || 'all';
  form.value.collectionIds = tmpl.collectionIds ? [...tmpl.collectionIds] : [];
  form.value.deduplicate = tmpl.deduplicate !== undefined ? tmpl.deduplicate : true;
  form.value.activeDays = tmpl.activeDays?.length ? [...tmpl.activeDays] : [0, 1, 2, 3, 4, 5, 6];
  form.value.enableAiReasoning = !!tmpl.enableAiReasoning;
  activeTab.value = 'generate';
}

function deleteTemplate(id) {
  templates.value = templates.value.filter(t => t.id !== id);
  persistTemplates();
}

function defaultCategoryIds() {
  if (!props.mealCategories.length) return [];
  return props.mealCategories.length > 1
    ? props.mealCategories.slice(0, -1).map(c => c.id)
    : props.mealCategories.map(c => c.id);
}

function loadSavedSettings() {
  try {
    const saved = localStorage.getItem(LS_KEY_SETTINGS);
    if (!saved) return;
    const parsed = JSON.parse(saved);
    if (parsed.personCount) form.value.personCount = parsed.personCount;
    if (parsed.source) form.value.source = parsed.source;
    if (parsed.deduplicate !== undefined) form.value.deduplicate = parsed.deduplicate;
    if (Array.isArray(parsed.activeDays) && parsed.activeDays.length > 0) {
      form.value.activeDays = parsed.activeDays;
    }
    if (Array.isArray(parsed.collectionIds)) form.value.collectionIds = parsed.collectionIds;
    if (typeof parsed.enableAiReasoning === 'boolean') form.value.enableAiReasoning = parsed.enableAiReasoning;
    if (Array.isArray(parsed.categoryIds) && parsed.categoryIds.length > 0) {
      const validIds = parsed.categoryIds.filter(id => props.mealCategories.some(c => c.id === id));
      if (validIds.length > 0) form.value.categoryIds = validIds;
    }
    if (parsed.scoringProfile) form.value.scoringProfile = parsed.scoringProfile;
    if (parsed.scoringWeights && typeof parsed.scoringWeights === 'object') {
      form.value.scoringWeights = parsed.scoringWeights;
    }
  } catch { /* ignore */ }
}

function saveSettings() {
  try {
    localStorage.setItem(LS_KEY_SETTINGS, JSON.stringify({
      categoryIds: form.value.categoryIds,
      personCount: form.value.personCount,
      source: form.value.source,
      collectionIds: form.value.collectionIds,
      deduplicate: form.value.deduplicate,
      activeDays: form.value.activeDays,
      enableAiReasoning: form.value.enableAiReasoning,
      scoringProfile: form.value.scoringProfile,
      scoringWeights: form.value.scoringWeights,
    }));
  } catch { /* ignore */ }
}

function toggleActiveDay(idx) {
  const pos = form.value.activeDays.indexOf(idx);
  if (pos >= 0) {
    if (form.value.activeDays.length > 1) {
      form.value.activeDays.splice(pos, 1);
    }
  } else {
    form.value.activeDays.push(idx);
    form.value.activeDays.sort((a, b) => a - b);
  }
}

const datePresets = [
  { label: 'Diese Woche', days: 0 },
  { label: 'Nächste Woche', days: 7 },
  { label: '14 Tage', days: 0, endDays: 13 },
];

function formatDateLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

watch(() => props.isOpen, (open) => {
  if (!open) {
    isInitialized.value = false;
    return;
  }
  activeTab.value = 'generate';
  newTemplateName.value = '';
  loadTemplates();

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

  loadSavedSettings();

  if (props.mealCategories.length > 0 && form.value.categoryIds.length === 0) {
    form.value.categoryIds = defaultCategoryIds();
  }

  // Erst nach Initialisierung speichern erlauben, damit der Watch
  // nicht die aus localStorage geladenen Werte sofort wieder überschreibt
  isInitialized.value = true;
});

// Einstellungen automatisch speichern wenn sich etwas ändert
watch(
  () => ({
    categoryIds: form.value.categoryIds,
    personCount: form.value.personCount,
    source: form.value.source,
    collectionIds: form.value.collectionIds,
    deduplicate: form.value.deduplicate,
    activeDays: form.value.activeDays,
    enableAiReasoning: form.value.enableAiReasoning,
    scoringProfile: form.value.scoringProfile,
    scoringWeights: form.value.scoringWeights,
  }),
  () => {
    if (!isInitialized.value) return;
    saveSettings();
  },
  { deep: true }
);

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
  const collectionIds = form.value.source === 'collections' ? form.value.collectionIds : undefined;
  const payload = {
    startDate: form.value.startDate,
    endDate: form.value.endDate,
    categoryIds: form.value.categoryIds,
    personCount: form.value.personCount,
    householdOnly: form.value.source === 'household',
    enableAiReasoning: form.value.enableAiReasoning,
    collectionIds,
    deduplicate: form.value.deduplicate,
    activeDays: form.value.activeDays,
    scoringProfile: form.value.scoringProfile,
  };
  // Nur Benutzerdefinierte Gewichte mitschicken, sonst nutzt das Backend das Profil
  if (form.value.scoringProfile === 'custom' && form.value.scoringWeights && Object.keys(form.value.scoringWeights).length > 0) {
    payload.scoringWeights = form.value.scoringWeights;
  }
  emit('generate', payload);
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

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
