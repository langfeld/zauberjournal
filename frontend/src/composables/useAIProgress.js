/**
 * ============================================
 * useAIProgress Composable
 * ============================================
 * Globaler reaktiver State für KI-Fortschrittsanzeigen.
 * Empfängt `ai:progress`-Events über die bestehende
 * Household-SSE-Verbindung und stellt sie der UI bereit.
 *
 * Singleton-Pattern: State wird modulweit geteilt,
 * genau wie useNotification.
 */

import { ref, computed } from 'vue';

// ── Globaler Singleton-State ──

/** Aktuelle Operation (oder null wenn idle) */
const operation = ref(null);

/**
 * operation hat folgendes Format:
 * {
 *   operationId: 'shopping-generate',
 *   operationLabel: 'Einkaufsliste erstellen',
 *   steps: ['Wochenplan laden', 'Zutaten sammeln', ...],
 *   totalSteps: 5,
 *   stepIndex: 2,          // aktueller Schritt (0-basiert)
 *   stepLabel: 'KI-Aggregation',
 *   status: 'in-progress', // 'in-progress' | 'complete' | 'error'
 *   errorMessage: null,
 * }
 */

let hideTimeout = null;

export function useAIProgress() {
  /**
   * Verarbeitet ein eingehendes SSE ai:progress Event.
   * Wird vom Household-Store aufgerufen.
   */
  function handleProgressEvent(data) {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }

    if (data.status === 'complete') {
      // Kurz den Abschluss anzeigen, dann ausblenden
      operation.value = { ...data, status: 'complete' };
      hideTimeout = setTimeout(() => {
        operation.value = null;
      }, 2000);
    } else if (data.status === 'error') {
      // Fehler anzeigen, nach längerem Timeout ausblenden
      operation.value = { ...data, status: 'error' };
      hideTimeout = setTimeout(() => {
        operation.value = null;
      }, 5000);
    } else {
      // in-progress
      operation.value = { ...data };
    }
  }

  /** Manuell die Anzeige schließen (z.B. bei X-Button) */
  function dismiss() {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    operation.value = null;
  }

  /** Fortschritt in Prozent (0-100) basierend auf Schritten */
  const progressPercent = computed(() => {
    if (!operation.value) return 0;
    const { stepIndex, totalSteps, status } = operation.value;
    if (status === 'complete') return 100;
    if (!totalSteps || totalSteps === 0) return 0;
    return Math.round((stepIndex / totalSteps) * 100);
  });

  /** Ob gerade eine KI-Operation aktiv ist */
  const isActive = computed(() => operation.value !== null);

  return {
    operation,
    progressPercent,
    isActive,
    handleProgressEvent,
    dismiss,
  };
}
