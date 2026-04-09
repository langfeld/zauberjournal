/**
 * ============================================
 * AI Progress Reporter
 * ============================================
 * Sendet schrittbasierte Fortschritts-Events über die bestehende
 * Household-SSE-Verbindung an den auslösenden User.
 *
 * Nutzung in Route-Handlern / Services:
 *   const progress = createAIProgress(householdId, userId, 'shopping-generate', 'Einkaufsliste erstellen', [
 *     'Wochenplan laden',
 *     'Zutaten sammeln',
 *     'KI-Aggregation',
 *     'Vorräte abziehen',
 *     'Speichern',
 *   ]);
 *   progress.start();
 *   // ... Arbeit ...
 *   progress.step(1); // → "Zutaten sammeln"
 *   // ... Arbeit ...
 *   progress.complete();
 */

import { sendToUser } from '../routes/household-events.js';

const SSE_EVENT = 'ai:progress';

/**
 * Erstellt einen Progress-Reporter für eine KI-Operation.
 * @param {number} householdId
 * @param {number} userId
 * @param {string} operationId   - z.B. 'shopping-generate', 'recipe-import-photo'
 * @param {string} operationLabel - z.B. 'Einkaufsliste erstellen'
 * @param {string[]} steps        - Array der Schrittnamen
 * @returns {{ start, step, complete, error }}
 */
export function createAIProgress(householdId, userId, operationId, operationLabel, steps) {
  // Wenn keine householdId/userId vorhanden → stiller No-Op
  if (!householdId || !userId) {
    return {
      start() {},
      step() {},
      complete() {},
      error() {},
    };
  }

  function send(data) {
    sendToUser(householdId, userId, SSE_EVENT, {
      operationId,
      operationLabel,
      totalSteps: steps.length,
      steps,
      ...data,
    });
  }

  return {
    /** Signalisiert den Start der Operation (Schritt 0). */
    start() {
      send({
        status: 'in-progress',
        stepIndex: 0,
        stepLabel: steps[0] || '',
      });
    },

    /**
     * Signalisiert den Fortschritt zum nächsten Schritt.
     * @param {number} index - 0-basierter Index des aktuellen Schritts
     */
    step(index) {
      send({
        status: 'in-progress',
        stepIndex: index,
        stepLabel: steps[index] || '',
      });
    },

    /** Signalisiert den erfolgreichen Abschluss. */
    complete() {
      send({
        status: 'complete',
        stepIndex: steps.length,
        stepLabel: '',
      });
    },

    /**
     * Signalisiert einen Fehler.
     * @param {string} message - Fehlerbeschreibung
     */
    error(message) {
      send({
        status: 'error',
        errorMessage: message || 'Ein Fehler ist aufgetreten',
      });
    },
  };
}
