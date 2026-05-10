<!--
  ============================================
  SlotSelectModal – Mahlzeit-Typ nach Drag & Drop wählen
  ============================================
  Kleines Modal, das nach dem Droppen eines Rezepts erscheint
  und den Nutzer fragt, in welchen Slot das Rezept kommt.
-->
<template>
  <Transition name="modal">
    <div v-if="isOpen" class="z-50 fixed inset-0 flex justify-center items-center p-4" @click.self="close">
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="close" />

      <div class="relative bg-white dark:bg-stone-900 shadow-2xl rounded-2xl w-full max-w-sm p-6">
        <h3 class="font-bold text-stone-800 dark:text-stone-100 text-lg mb-1">
          Wo soll das Rezept hin?
        </h3>
        <p class="text-stone-500 dark:text-stone-400 text-sm mb-5">
          Wähle den Mahlzeiten-Typ für {{ dateLabel }}
        </p>

        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="slot in availableSlots"
            :key="slot.id"
            @click="select(slot)"
            class="flex flex-col items-center gap-1.5 bg-stone-50 dark:bg-stone-800 hover:bg-primary-50 dark:hover:bg-primary-900/30 border border-stone-200 dark:border-stone-700 hover:border-primary-300 dark:hover:border-primary-700 rounded-xl px-4 py-3 transition-colors"
          >
            <span class="text-2xl">{{ slot.icon }}</span>
            <span class="font-medium text-stone-700 dark:text-stone-200 text-sm">{{ slot.name }}</span>
          </button>
        </div>

        <button @click="close" class="mt-4 w-full py-2 text-stone-500 dark:text-stone-400 text-sm hover:text-stone-700 dark:hover:text-stone-200 transition-colors">
          Abbrechen
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  isOpen: Boolean,
  dateStr: { type: String, default: '' },
  slots: { type: Array, default: () => [] },
});

const emit = defineEmits(['close', 'select']);

const dateLabel = computed(() => {
  if (!props.dateStr) return '';
  const d = new Date(props.dateStr + 'T12:00:00');
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
});

const availableSlots = computed(() => props.slots);

function select(slot) {
  emit('select', slot);
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
