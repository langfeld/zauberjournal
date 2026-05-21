<template>
  <div ref="triggerRef" class="relative inline-block">
    <button
      @click.stop="toggle"
      class="px-1.5 py-0.5 rounded-md text-[10px] font-bold shadow-sm cursor-pointer transition-transform hover:scale-105"
      :class="badgeClass"
    >
      {{ score ?? '–' }}
    </button>
  </div>

  <Teleport to="body">
    <div
      v-if="show"
      ref="popupRef"
      class="fixed z-[9999] w-56 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-xl rounded-xl p-3"
      :style="popupStyle"
      @click.stop
    >
        <div class="flex justify-between items-center mb-2 pb-1 border-b border-stone-100 dark:border-stone-800">
          <span class="font-semibold text-stone-700 dark:text-stone-200 text-xs">Score-Aufschlüsselung</span>
          <span class="font-bold text-sm" :class="badgeClass">{{ score }}</span>
        </div>
        <div class="space-y-1">
          <div v-for="item in items" :key="item.key" class="flex justify-between items-center text-xs">
            <span class="text-stone-500 dark:text-stone-400">{{ item.label }}</span>
            <span
              class="font-medium tabular-nums"
              :class="item.value > 0 ? 'text-emerald-600 dark:text-emerald-400' : item.value < 0 ? 'text-red-500 dark:text-red-400' : 'text-stone-400 dark:text-stone-500'"
            >
              {{ item.value > 0 ? '+' : '' }}{{ item.value }}
            </span>
          </div>
        </div>
        <button
          @click="show = false"
          class="mt-2 pt-1 border-t border-stone-100 dark:border-stone-800 w-full text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 text-[10px] text-center transition-colors"
        >
          Schließen
        </button>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  score: { type: Number, default: null },
  breakdown: { type: Object, default: null },
});

const show = ref(false);
const triggerRef = ref(null);
const popupRef = ref(null);
const popupStyle = ref({ top: '0px', left: '0px' });

const badgeClass = computed(() => {
  if (props.score == null) return 'bg-stone-500 text-white';
  if (props.score >= 150) return 'bg-emerald-500 text-white';
  if (props.score >= 100) return 'bg-amber-500 text-white';
  return 'bg-stone-400 text-white';
});

const items = computed(() => {
  const b = props.breakdown;
  if (!b) return [];
  return [
    { key: 'base', label: 'Basis', value: b.base },
    { key: 'categoryMatch', label: 'Kategorie-Passung', value: b.categoryMatch },
    { key: 'rotation', label: 'Rotation', value: b.rotation },
    { key: 'rarity', label: 'Selten gekocht', value: b.rarity },
    { key: 'favorite', label: 'Favorit', value: b.favorite },
    { key: 'rating', label: 'Bewertung', value: b.rating },
    { key: 'duplicate', label: 'Duplikat', value: b.duplicate },
    { key: 'categoryVariety', label: 'Abwechslung', value: b.categoryVariety },
    { key: 'difficulty', label: 'Schwierigkeit', value: b.difficulty },
    { key: 'time', label: 'Zeitaufwand', value: b.time },
    { key: 'ingredientOverlap', label: 'Zutaten-Überlappung', value: b.ingredientOverlap },
    { key: 'pantry', label: 'Vorräte', value: b.pantry },
    { key: 'calories', label: 'Kalorien', value: b.calories },
  ].filter(i => i.value !== 0);
});

function positionPopup() {
  const trigger = triggerRef.value;
  if (!trigger) return;
  const rect = trigger.getBoundingClientRect();
  const popupWidth = 224; // w-56 = 14rem = 224px
  let left = rect.left + rect.width / 2 - popupWidth / 2;
  let top = rect.bottom + 4;

  // Viewport-Grenzen beachten
  if (left < 8) left = 8;
  if (left + popupWidth > window.innerWidth - 8) left = window.innerWidth - popupWidth - 8;

  popupStyle.value = { top: `${top}px`, left: `${left}px` };
}

function toggle() {
  if (!show.value) {
    show.value = true;
    nextTick(() => {
      positionPopup();
      document.addEventListener('click', onOutsideClick);
      window.addEventListener('resize', positionPopup);
      window.addEventListener('scroll', positionPopup, true);
    });
  } else {
    close();
  }
}

function close() {
  show.value = false;
  document.removeEventListener('click', onOutsideClick);
  window.removeEventListener('resize', positionPopup);
  window.removeEventListener('scroll', positionPopup, true);
}

function onOutsideClick(event) {
  // Klick auf den Trigger-Button → nicht schließen (Toggle-Verhalten)
  if (triggerRef.value && triggerRef.value.contains(event.target)) return;
  // Klick auf das Popup selbst → nicht schließen
  if (popupRef.value && popupRef.value.contains(event.target)) return;
  close();
}

onUnmounted(() => {
  document.removeEventListener('click', onOutsideClick);
  window.removeEventListener('resize', positionPopup);
  window.removeEventListener('scroll', positionPopup, true);
});
</script>

<style scoped>
.popover-enter-active,
.popover-leave-active {
  transition: all 0.15s ease;
}
.popover-enter-from,
.popover-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.97);
}
</style>
