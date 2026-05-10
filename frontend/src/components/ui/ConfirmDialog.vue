<!--
  ============================================
  ConfirmDialog - Bestätigungs-Dialog
  ============================================
  Wiederverwendbarer modaler Bestätigungs-Dialog
  für destruktive Aktionen (Löschen etc.)
-->
<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="modelValue" class="dialog-overlay" @click.self="cancel">
        <div class="dialog-content">
          <!-- Icon -->
          <div class="dialog-icon" :class="variantClasses.iconBg">
            <component :is="variantIcon" class="w-6 h-6" :class="variantClasses.iconColor" />
          </div>

          <!-- Text -->
          <h3 class="font-semibold text-stone-800 dark:text-stone-100 text-lg">
            {{ title }}
          </h3>
          <p class="mt-1 text-stone-500 dark:text-stone-400 text-sm">
            {{ message }}
          </p>

          <!-- Buttons -->
          <div class="flex justify-end gap-3 mt-6">
            <button
              v-if="showCancel"
              @click="cancel"
              class="cancel-btn"
            >
              {{ cancelText }}
            </button>
            <button
              @click="confirm"
              :disabled="loading"
              class="confirm-btn"
              :class="variantClasses.confirmBtn"
            >
              <Loader2 v-if="loading" class="w-4 h-4 animate-spin" />
              {{ confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue';
import { AlertTriangle, Trash2, Info, CheckCircle, Loader2 } from 'lucide-vue-next';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: 'Bist du sicher?' },
  message: { type: String, default: 'Diese Aktion kann nicht rückgängig gemacht werden.' },
  confirmText: { type: String, default: 'Bestätigen' },
  cancelText: { type: String, default: 'Abbrechen' },
  variant: { type: String, default: 'danger', validator: v => ['danger', 'warning', 'info', 'success'].includes(v) },
  loading: { type: Boolean, default: false },
  showCancel: { type: Boolean, default: true },
});

const emit = defineEmits(['update:modelValue', 'confirm', 'cancel']);

const variantIcon = computed(() => ({
  danger: Trash2,
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle,
})[props.variant]);

const variantClasses = computed(() => ({
  danger: {
    iconBg: 'icon-bg-danger',
    iconColor: 'text-red-600 dark:text-red-400',
    confirmBtn: 'confirm-btn-danger',
  },
  warning: {
    iconBg: 'icon-bg-warning',
    iconColor: 'text-amber-600 dark:text-amber-400',
    confirmBtn: 'confirm-btn-warning',
  },
  info: {
    iconBg: 'icon-bg-info',
    iconColor: 'text-blue-600 dark:text-blue-400',
    confirmBtn: 'confirm-btn-info',
  },
  success: {
    iconBg: 'icon-bg-success',
    iconColor: 'text-green-600 dark:text-green-400',
    confirmBtn: 'confirm-btn-success',
  },
})[props.variant]);

function confirm() {
  emit('confirm');
}

function cancel() {
  emit('update:modelValue', false);
  emit('cancel');
}
</script>

<style scoped>
/* Overlay */
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(var(--spacing) * 4);
  background-color: rgb(0 0 0 / 0.5);
  backdrop-filter: blur(4px);
}

/* Content Box */
.dialog-content {
  width: 100%;
  max-width: 28rem;
  background-color: white;
  border-radius: var(--radius-2xl);
  padding: calc(var(--spacing) * 6);
  box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
}
:is(.dark .dialog-content) {
  background-color: var(--color-stone-900);
  border: 1px solid var(--color-stone-700);
}

/* Icon Container */
.dialog-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border-radius: var(--radius-full);
  margin-bottom: calc(var(--spacing) * 4);
}
.icon-bg-danger {
  background-color: var(--color-red-100);
}
:is(.dark .icon-bg-danger) {
  background-color: color-mix(in oklab, var(--color-red-900) 50%, transparent);
}
.icon-bg-warning {
  background-color: var(--color-amber-100);
}
:is(.dark .icon-bg-warning) {
  background-color: color-mix(in oklab, var(--color-amber-900) 50%, transparent);
}
.icon-bg-info {
  background-color: var(--color-blue-100);
}
:is(.dark .icon-bg-info) {
  background-color: color-mix(in oklab, var(--color-blue-900) 50%, transparent);
}
.icon-bg-success {
  background-color: var(--color-green-100);
}
:is(.dark .icon-bg-success) {
  background-color: color-mix(in oklab, var(--color-green-900) 50%, transparent);
}

/* Cancel Button */
.cancel-btn {
  padding-inline: calc(var(--spacing) * 4);
  padding-block: calc(var(--spacing) * 2);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-stone-300);
  color: var(--color-stone-700);
  font-size: var(--text-sm);
  line-height: var(--text-sm--line-height);
  font-weight: 500;
  transition: background-color 0.15s ease;
}
.cancel-btn:hover {
  background-color: var(--color-stone-50);
}
:is(.dark .cancel-btn) {
  border-color: var(--color-stone-600);
  color: var(--color-stone-300);
}
:is(.dark .cancel-btn:hover) {
  background-color: var(--color-stone-800);
}

/* Confirm Button */
.confirm-btn {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  padding-inline: calc(var(--spacing) * 4);
  padding-block: calc(var(--spacing) * 2);
  border-radius: var(--radius-lg);
  color: white;
  font-size: var(--text-sm);
  line-height: var(--text-sm--line-height);
  font-weight: 500;
  transition: background-color 0.15s ease;
}
.confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.confirm-btn-danger {
  background-color: var(--color-red-600);
}
.confirm-btn-danger:hover:not(:disabled) {
  background-color: var(--color-red-700);
}
.confirm-btn-warning {
  background-color: var(--color-amber-600);
}
.confirm-btn-warning:hover:not(:disabled) {
  background-color: var(--color-amber-700);
}
.confirm-btn-info {
  background-color: var(--color-blue-600);
}
.confirm-btn-info:hover:not(:disabled) {
  background-color: var(--color-blue-700);
}
.confirm-btn-success {
  background-color: var(--color-green-600);
}
.confirm-btn-success:hover:not(:disabled) {
  background-color: var(--color-green-700);
}

/* Transition */
.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.2s ease;
}
.dialog-enter-active .dialog-content,
.dialog-leave-active .dialog-content {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
.dialog-enter-from .dialog-content,
.dialog-leave-to .dialog-content {
  transform: scale(0.95);
  opacity: 0;
}
</style>
