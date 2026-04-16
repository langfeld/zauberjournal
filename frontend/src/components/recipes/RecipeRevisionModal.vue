<!--
  ============================================
  RecipeRevisionModal - KI-Rezeptüberarbeitung
  ============================================
  Modal zum Überarbeiten eines Rezepts per KI.
  Der Nutzer beschreibt gewünschte Änderungen im Freitext.
  Vor Ausführung wird geprüft, ob das Rezept in einem
  fixierten (noch ungekochten) Wochenplan steht.
-->
<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="modelValue" class="z-50 fixed inset-0 flex justify-center items-center bg-black/40 p-4" @click.self="close">
        <div class="bg-white dark:bg-stone-900 shadow-2xl border border-stone-200 dark:border-stone-700 rounded-2xl w-full max-w-lg overflow-hidden">
          <!-- Header -->
          <div class="flex justify-between items-center p-5 border-stone-200 dark:border-stone-700 border-b">
            <h3 class="font-bold text-stone-800 dark:text-stone-100 text-lg">✨ Rezept mit KI überarbeiten</h3>
            <button @click="close" :disabled="revising"
              class="hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-50 p-1.5 rounded-full transition-colors">
              <X class="w-5 h-5 text-stone-500" />
            </button>
          </div>

          <div class="space-y-4 p-5">
            <!-- Konflikt-Warnung -->
            <div v-if="conflict?.hasConflict" class="flex gap-3 bg-amber-50 dark:bg-amber-950/30 p-3.5 border border-amber-200 dark:border-amber-800 rounded-xl">
              <AlertTriangle class="mt-0.5 w-5 h-5 text-amber-500 shrink-0" />
              <div class="text-sm">
                <p class="font-medium text-amber-800 dark:text-amber-300">Rezept ist in einem fixierten Wochenplan eingeplant</p>
                <p class="mt-1 text-amber-700 dark:text-amber-400">
                  Möglicherweise wurden bereits Zutaten eingekauft.
                  <span v-if="conflict.conflictDetails?.length" class="block mt-1">
                    Betroffen: {{ formatConflicts(conflict.conflictDetails) }}
                  </span>
                </p>
              </div>
            </div>

            <!-- Änderungswünsche -->
            <div>
              <label for="revision-instructions" class="block mb-1.5 font-medium text-stone-700 dark:text-stone-300 text-sm">
                Was soll geändert werden?
              </label>
              <textarea
                id="revision-instructions"
                v-model="instructions"
                :disabled="revising"
                maxlength="2000"
                rows="4"
                class="bg-stone-50 dark:bg-stone-800 disabled:opacity-50 px-3 py-2.5 border border-stone-200 focus:border-primary-400 dark:border-stone-700 rounded-xl outline-none focus:ring-2 focus:ring-primary-500/30 w-full text-stone-800 dark:placeholder:text-stone-500 dark:text-stone-200 placeholder:text-stone-400 text-sm leading-relaxed transition-colors resize-y"
                placeholder="z.B. Bohnen nicht mariniert, sondern angebraten mit Süß-Sauer und Soja-Sauce"
              />
              <p class="mt-1 text-stone-400 text-xs text-right">{{ instructions.length }} / 2000</p>
            </div>

            <!-- Modus-Auswahl -->
            <div>
              <label class="block mb-2 font-medium text-stone-700 dark:text-stone-300 text-sm">Speichermodus</label>
              <div class="flex flex-col gap-2">
                <label class="flex items-center gap-3 hover:bg-stone-50 dark:hover:bg-stone-800 px-3 py-2.5 border border-stone-200 dark:border-stone-700 rounded-xl transition-colors cursor-pointer"
                  :class="{ 'border-primary-400 dark:border-primary-500 bg-primary-50/50 dark:bg-primary-900/20': mode === 'overwrite' }">
                  <input type="radio" v-model="mode" value="overwrite" :disabled="revising"
                    class="focus:ring-primary-500 text-primary-600" />
                  <div>
                    <span class="font-medium text-stone-700 dark:text-stone-300 text-sm">Rezept überschreiben</span>
                    <p class="text-stone-400 dark:text-stone-500 text-xs">Das bestehende Rezept wird direkt aktualisiert</p>
                  </div>
                </label>
                <label class="flex items-center gap-3 hover:bg-stone-50 dark:hover:bg-stone-800 px-3 py-2.5 border border-stone-200 dark:border-stone-700 rounded-xl transition-colors cursor-pointer"
                  :class="{ 'border-primary-400 dark:border-primary-500 bg-primary-50/50 dark:bg-primary-900/20': mode === 'copy' }">
                  <input type="radio" v-model="mode" value="copy" :disabled="revising"
                    class="focus:ring-primary-500 text-primary-600" />
                  <div>
                    <span class="font-medium text-stone-700 dark:text-stone-300 text-sm">Als Kopie speichern</span>
                    <p class="text-stone-400 dark:text-stone-500 text-xs">Neues Rezept erstellen, Original bleibt erhalten</p>
                  </div>
                </label>
              </div>
            </div>

            <!-- Fehler -->
            <div v-if="error" class="flex gap-2 bg-red-50 dark:bg-red-950/30 p-3 border border-red-200 dark:border-red-800 rounded-xl">
              <AlertTriangle class="mt-0.5 w-4 h-4 text-red-500 shrink-0" />
              <p class="text-red-700 dark:text-red-400 text-sm">{{ error }}</p>
            </div>
          </div>

          <!-- Footer -->
          <div class="flex justify-end gap-3 p-5 border-stone-200 dark:border-stone-700 border-t">
            <button @click="close" :disabled="revising"
              class="hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-50 px-4 py-2 rounded-xl font-medium text-stone-600 dark:text-stone-400 text-sm transition-colors">
              Abbrechen
            </button>
            <button @click="submit" :disabled="!canSubmit || revising"
              class="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:bg-stone-300 dark:disabled:bg-stone-700 px-4 py-2 rounded-xl font-medium text-white disabled:text-stone-500 dark:disabled:text-stone-400 text-sm transition-colors">
              <Loader2 v-if="revising" class="w-4 h-4 animate-spin" />
              <Sparkles v-else class="w-4 h-4" />
              {{ revising ? 'Wird überarbeitet…' : 'Überarbeiten' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { X, AlertTriangle, Loader2, Sparkles } from 'lucide-vue-next';
import { useRecipesStore } from '@/stores/recipes.js';
import { useNotification } from '@/composables/useNotification.js';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  recipeId: { type: Number, required: true },
});

const emit = defineEmits(['update:modelValue', 'revised', 'created']);

const recipesStore = useRecipesStore();
const { showSuccess } = useNotification();

const instructions = ref('');
const mode = ref('overwrite');
const revising = ref(false);
const error = ref('');
const conflict = ref(null);
const checkingConflict = ref(false);

const canSubmit = computed(() => instructions.value.trim().length >= 3 && !revising.value);

const DAY_NAMES = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function formatConflicts(details) {
  return details.map(d => {
    const day = DAY_NAMES[d.dayOfWeek] || `Tag ${d.dayOfWeek}`;
    const meal = d.categoryName || 'Mahlzeit';
    return `${day} (${meal})`;
  }).join(', ');
}

// Beim Öffnen: Conflict-Check ausführen, State zurücksetzen
watch(() => props.modelValue, async (open) => {
  if (open) {
    instructions.value = '';
    mode.value = 'overwrite';
    error.value = '';
    conflict.value = null;
    checkingConflict.value = true;
    try {
      conflict.value = await recipesStore.checkRevisionConflicts(props.recipeId);
    } catch {
      // Conflict-Check fehlgeschlagen – nicht blockierend
    } finally {
      checkingConflict.value = false;
    }
  }
});

function close() {
  if (revising.value) return;
  emit('update:modelValue', false);
}

async function submit() {
  if (!canSubmit.value) return;

  revising.value = true;
  error.value = '';

  try {
    const data = await recipesStore.reviseRecipe(props.recipeId, instructions.value.trim(), mode.value);

    if (mode.value === 'overwrite') {
      showSuccess('Rezept erfolgreich überarbeitet! ✨');
      emit('revised');
    } else {
      showSuccess('Rezept-Kopie erfolgreich erstellt! ✨');
      emit('created', data.id);
    }

    emit('update:modelValue', false);
  } catch (err) {
    error.value = err?.message || 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.';
  } finally {
    revising.value = false;
  }
}
</script>
