<!--
  ============================================
  PlanEditModal – Plan bearbeiten (Start/End-Datum)
  ============================================
  Kleiner Dialog zum Ändern des Zeitraums eines Plans.
-->
<template>
  <Transition name="modal">
    <div v-if="isOpen" class="z-50 fixed inset-0 flex justify-center items-center p-4" @click.self="close">
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="close" />

      <div class="relative bg-white dark:bg-stone-900 shadow-2xl rounded-2xl w-full max-w-sm p-6">
        <h3 class="font-bold text-stone-800 dark:text-stone-100 text-lg mb-4">
          Plan bearbeiten
        </h3>

        <div class="space-y-4">
          <div>
            <label class="block mb-1.5 font-medium text-stone-700 dark:text-stone-200 text-sm">Startdatum</label>
            <input
              v-model="form.startDate"
              type="date"
              class="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-700 dark:text-stone-200"
            />
          </div>

          <div>
            <label class="block mb-1.5 font-medium text-stone-700 dark:text-stone-200 text-sm">Enddatum</label>
            <input
              v-model="form.endDate"
              type="date"
              class="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-700 dark:text-stone-200"
            />
          </div>

          <p v-if="dayCount > 0" class="text-stone-500 dark:text-stone-400 text-xs">
            {{ dayCount }} {{ dayCount === 1 ? 'Tag' : 'Tage' }} ausgewählt
          </p>
          <p v-if="error" class="text-red-500 text-xs">{{ error }}</p>
        </div>

        <div class="flex justify-end gap-3 mt-6">
          <button @click="close"
            class="hover:bg-stone-100 dark:hover:bg-stone-800 px-4 py-2 rounded-lg font-medium text-stone-700 dark:text-stone-300 text-sm transition-colors">
            Abbrechen
          </button>
          <button @click="save"
            :disabled="!canSave || saving"
            class="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg font-medium text-white text-sm transition-colors">
            <Loader2 v-if="saving" class="w-4 h-4 animate-spin" />
            Speichern
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { Loader2 } from 'lucide-vue-next';

const props = defineProps({
  isOpen: Boolean,
  plan: { type: Object, default: null },
});

const emit = defineEmits(['close', 'save']);

const form = ref({ startDate: '', endDate: '' });
const error = ref('');
const saving = ref(false);

watch(() => props.isOpen, (open) => {
  if (open && props.plan) {
    form.value.startDate = props.plan.start_date || props.plan.week_start || '';
    form.value.endDate = props.plan.end_date || props.plan.week_start || '';
    error.value = '';
  }
});

const dayCount = computed(() => {
  if (!form.value.startDate || !form.value.endDate) return 0;
  const start = new Date(form.value.startDate + 'T12:00:00');
  const end = new Date(form.value.endDate + 'T12:00:00');
  if (isNaN(start) || isNaN(end)) return 0;
  return Math.round((end - start) / 86400000) + 1;
});

const canSave = computed(() => {
  return form.value.startDate &&
    form.value.endDate &&
    form.value.endDate >= form.value.startDate &&
    (form.value.startDate !== (props.plan?.start_date || props.plan?.week_start) ||
     form.value.endDate !== (props.plan?.end_date || props.plan?.week_start));
});

function close() {
  emit('close');
}

function save() {
  if (!canSave.value) return;
  saving.value = true;
  error.value = '';
  emit('save', { startDate: form.value.startDate, endDate: form.value.endDate });
}
</script>

<style scoped>
.modal-enter-active, .modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from, .modal-leave-to {
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
