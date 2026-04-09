<!--
  ============================================
  AIProgressOverlay - KI-Fortschrittsanzeige
  ============================================
  Floating-Box unten rechts, zeigt den Fortschritt
  laufender KI-Operationen mit Schritt-Indikator.
  Global sichtbar – bleibt bei Navigation erhalten.
-->
<template>
  <Transition name="ai-progress">
    <div
      v-if="isActive"
      class="right-4 bottom-20 z-40 fixed w-80 max-w-[calc(100vw-2rem)]"
    >
      <div
        :class="[
          'rounded-xl shadow-xl border backdrop-blur-sm overflow-hidden transition-colors duration-300',
          statusClasses,
        ]"
      >
        <!-- Header -->
        <div class="flex items-center gap-2.5 px-4 pt-3 pb-2">
          <!-- Animiertes Icon -->
          <div class="relative shrink-0">
            <Sparkles
              v-if="status !== 'error'"
              :class="[
                'w-5 h-5 transition-colors',
                status === 'complete' ? 'text-emerald-500 dark:text-emerald-400' : 'text-violet-500 dark:text-violet-400 animate-pulse',
              ]"
            />
            <XCircle v-else class="w-5 h-5 text-red-500 dark:text-red-400" />
          </div>

          <!-- Titel -->
          <span class="flex-1 font-semibold text-sm truncate">
            {{ operation?.operationLabel || 'KI arbeitet…' }}
          </span>

          <!-- Dismiss-Button -->
          <button
            @click="dismiss"
            class="opacity-40 hover:opacity-80 p-0.5 rounded transition-opacity"
            title="Schließen"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Steps -->
        <div class="space-y-1 px-4 pb-2" v-if="operation?.steps?.length && status !== 'error'">
          <div
            v-for="(step, index) in operation.steps"
            :key="index"
            :class="[
              'flex items-center gap-2 text-xs transition-all duration-300',
              stepClass(index),
            ]"
          >
            <!-- Step-Icon -->
            <div class="flex justify-center items-center w-4 h-4 shrink-0">
              <Check
                v-if="isStepComplete(index)"
                class="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400"
              />
              <Loader2
                v-else-if="isStepCurrent(index)"
                class="w-3.5 h-3.5 text-violet-500 dark:text-violet-400 animate-spin"
              />
              <div
                v-else
                class="bg-stone-300 dark:bg-stone-600 rounded-full w-1.5 h-1.5"
              />
            </div>

            <span class="truncate">{{ step }}</span>
          </div>
        </div>

        <!-- Error message -->
        <div
          v-if="status === 'error' && operation?.errorMessage"
          class="px-4 pb-2 text-red-600 dark:text-red-400 text-xs"
        >
          {{ operation.errorMessage }}
        </div>

        <!-- Fortschrittsbalken -->
        <div class="bg-black/5 dark:bg-white/5 w-full h-1 overflow-hidden">
          <div
            :class="[
              'h-full transition-all duration-500 ease-out',
              status === 'complete'
                ? 'bg-emerald-500'
                : status === 'error'
                  ? 'bg-red-500'
                  : 'bg-violet-500',
            ]"
            :style="{ width: progressPercent + '%' }"
          />
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed } from 'vue';
import { Sparkles, Check, Loader2, X, XCircle } from 'lucide-vue-next';
import { useAIProgress } from '@/composables/useAIProgress.js';

const { operation, progressPercent, isActive, dismiss } = useAIProgress();

const status = computed(() => operation.value?.status || 'in-progress');

const statusClasses = computed(() => {
  switch (status.value) {
    case 'complete':
      return 'bg-white/95 dark:bg-stone-900/95 border-emerald-200 dark:border-emerald-800';
    case 'error':
      return 'bg-white/95 dark:bg-stone-900/95 border-red-300 dark:border-red-800';
    default:
      return 'bg-white/95 dark:bg-stone-900/95 border-violet-200 dark:border-violet-800';
  }
});

function isStepComplete(index) {
  if (!operation.value) return false;
  if (operation.value.status === 'complete') return true;
  return index < operation.value.stepIndex;
}

function isStepCurrent(index) {
  if (!operation.value || operation.value.status === 'complete') return false;
  return index === operation.value.stepIndex;
}

function stepClass(index) {
  if (isStepComplete(index)) {
    return 'text-stone-500 dark:text-stone-400';
  }
  if (isStepCurrent(index)) {
    return 'text-stone-900 dark:text-stone-100 font-medium';
  }
  return 'text-stone-400 dark:text-stone-600';
}
</script>

<style scoped>
/* Einblenden / Ausblenden */
.ai-progress-enter-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.ai-progress-leave-active {
  transition: all 0.2s ease-in;
}
.ai-progress-enter-from {
  opacity: 0;
  transform: translateY(16px) scale(0.95);
}
.ai-progress-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
</style>
