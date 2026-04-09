/**
 * ============================================
 * Household Store - Haushaltsverwaltung
 * ============================================
 * Verwaltet aktiven Haushalt, Mitgliedschaften, Einladungen
 * und SSE-Verbindung für Echtzeit-Sync.
 */

import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { apiRaw } from '@/composables/useApi.js';

const STORAGE_KEY = 'zauberjournal-household-id';

export const useHouseholdStore = defineStore('household', () => {
  // --- State ---
  const households = ref([]);
  const activeHouseholdId = ref(
    parseInt(localStorage.getItem(STORAGE_KEY)) || null
  );
  const activeHousehold = ref(null);
  const loading = ref(false);
  const eventSource = ref(null);
  const onlineMembers = ref([]);

  // --- Getters ---
  const hasHousehold = computed(() => households.value.length > 0);
  const isInHousehold = computed(() => !!activeHouseholdId.value);
  const memberCount = computed(() => activeHousehold.value?.members?.length || 0);
  const isCreator = computed(() => {
    if (!activeHousehold.value) return false;
    return activeHousehold.value.created_by === currentUserId();
  });

  // Aktueller User-ID — wird aus dem auth-Store geholt
  function currentUserId() {
    try {
      const authData = JSON.parse(localStorage.getItem('zauberjournal-token') || '{}');
      // Token ist ein JWT – wir brauchen die ID anderswo
      return null; // Wird über den Auth-Store abgefragt
    } catch { return null; }
  }

  // --- Actions ---

  /**
   * Haushalte des Users laden
   */
  async function fetchHouseholds() {
    try {
      const data = await apiRaw('/households');
      households.value = data.households || [];

      // Falls aktiver Haushalt nicht mehr in der Liste → zurücksetzen
      if (activeHouseholdId.value && !households.value.find(h => h.id === activeHouseholdId.value)) {
        setActiveHousehold(null);
      }

      // Falls kein aktiver Haushalt aber Haushalte vorhanden → Default setzen
      if (!activeHouseholdId.value && households.value.length > 0) {
        const defaultHh = households.value.find(h => h.is_default) || households.value[0];
        setActiveHousehold(defaultHh.id);
      }
    } catch {
      // Fehler still ignorieren (wird bei checkAuth aufgerufen)
    }
  }

  /**
   * Details eines Haushalts laden
   */
  async function fetchHouseholdDetails(id) {
    loading.value = true;
    try {
      const data = await apiRaw(`/households/${id}`);
      activeHousehold.value = data.household || data;
      return activeHousehold.value;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Neuen Haushalt erstellen
   */
  async function createHousehold(name) {
    loading.value = true;
    try {
      const result = await apiRaw('/households', {
        method: 'POST',
        body: { name },
      });
      await fetchHouseholds();
      setActiveHousehold(result.household?.id || result.id);
      return result;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Haushalt umbenennen
   */
  async function renameHousehold(id, name) {
    return apiRaw(`/households/${id}`, {
      method: 'PUT',
      body: { name },
    });
  }

  /**
   * Haushalt auflösen
   */
  async function deleteHousehold(id) {
    await apiRaw(`/households/${id}`, { method: 'DELETE' });
    if (activeHouseholdId.value === id) {
      setActiveHousehold(null);
    }
    await fetchHouseholds();
  }

  /**
   * Einladungscode generieren
   */
  async function createInvite(householdId, expiresInHours = 48) {
    return apiRaw(`/households/${householdId}/invite`, {
      method: 'POST',
      body: { expires_hours: expiresInHours },
    });
  }

  /**
   * Per Code einem Haushalt beitreten
   */
  async function joinHousehold(code) {
    const result = await apiRaw('/households/join', {
      method: 'POST',
      body: { invite_code: code },
    });
    await fetchHouseholds();
    setActiveHousehold(result.household_id);
    return result;
  }

  /**
   * Haushalt verlassen
   */
  async function leaveHousehold(id) {
    await apiRaw(`/households/${id}/leave`, { method: 'DELETE' });
    if (activeHouseholdId.value === id) {
      setActiveHousehold(null);
    }
    await fetchHouseholds();
  }

  /**
   * Mitglied entfernen (nur Creator)
   */
  async function removeMember(householdId, userId) {
    await apiRaw(`/households/${householdId}/members/${userId}`, {
      method: 'DELETE',
    });
    if (activeHouseholdId.value === householdId) {
      await fetchHouseholdDetails(householdId);
    }
  }

  /**
   * Daten in Haushalt migrieren
   */
  async function migrateData(householdId, options = {}) {
    loading.value = true;
    try {
      return await apiRaw(`/households/${householdId}/migrate`, {
        method: 'POST',
        body: options,
      });
    } finally {
      loading.value = false;
    }
  }

  /**
   * Haushalt als Default setzen
   */
  async function setAsDefault(householdId) {
    await apiRaw(`/households/${householdId}/default`, {
      method: 'PUT',
    });
    await fetchHouseholds();
  }

  /**
   * Aktivitäts-Feed laden
   */
  async function fetchActivity(householdId) {
    return apiRaw(`/households/${householdId}/activity`);
  }

  /**
   * Haushalt-Daten exportieren
   */
  async function exportHousehold(householdId) {
    return apiRaw(`/households/${householdId}/export`);
  }

  /**
   * Aktiven Haushalt setzen
   */
  function setActiveHousehold(id) {
    activeHouseholdId.value = id;
    if (id) {
      localStorage.setItem(STORAGE_KEY, String(id));
    } else {
      localStorage.removeItem(STORAGE_KEY);
      activeHousehold.value = null;
    }
  }

  // --- SSE Real-Time Sync ---

  /** Event-Listener: wird von Views gesetzt, um bei Events zu reagieren */
  const eventListeners = ref(new Map());

  function addEventListener(event, callback) {
    if (!eventListeners.value.has(event)) {
      eventListeners.value.set(event, new Set());
    }
    eventListeners.value.get(event).add(callback);
    // Cleanup-Funktion zurückgeben
    return () => eventListeners.value.get(event)?.delete(callback);
  }

  /**
   * SSE-Verbindung aufbauen
   */
  function connectSSE() {
    disconnectSSE();

    const hhId = activeHouseholdId.value;
    if (!hhId) return;

    const token = localStorage.getItem('zauberjournal-token');
    if (!token) return;

    // EventSource mit Auth: Wir nutzen einen Fetch-Fallback da native EventSource
    // keine Custom-Headers unterstützt. Wir hängen den Token als Query-Param an.
    // Sicherheit: SSE-Endpunkt validiert JWT. Query-Param-Auth ist für SSE üblich.
    const url = `/api/household-events/${hhId}?token=${encodeURIComponent(token)}`;

    try {
      const es = new EventSource(url);

      es.addEventListener('connected', (e) => {
        const data = JSON.parse(e.data);
        console.log('[SSE] Verbunden mit Haushalt', data.householdId);
      });

      // Dynamische Event-Weiterleitung
      const events = [
        'recipe:created', 'recipe:updated', 'recipe:deleted',
        'mealplan:generated', 'mealplan:updated',
        'shopping:generated', 'shopping:updated', 'shopping:status',
        'pantry:created', 'pantry:updated', 'pantry:deleted',
        'ai:progress',
      ];

      for (const eventName of events) {
        es.addEventListener(eventName, (e) => {
          const data = JSON.parse(e.data);
          const listeners = eventListeners.value.get(eventName);
          if (listeners) {
            for (const cb of listeners) {
              try { cb(data); } catch { /* listener error */ }
            }
          }
        });
      }

      es.onerror = () => {
        // Auto-Reconnect nach 5s (EventSource macht das nativ,
        // aber wir setzen den Status)
        console.log('[SSE] Verbindung unterbrochen, versuche erneut...');
      };

      eventSource.value = es;
    } catch {
      // EventSource nicht verfügbar (z.B. in Tests)
    }
  }

  /**
   * SSE-Verbindung trennen
   */
  function disconnectSSE() {
    if (eventSource.value) {
      eventSource.value.close();
      eventSource.value = null;
    }
  }

  // SSE automatisch bei Haushaltswechsel neu verbinden
  watch(activeHouseholdId, (newId, oldId) => {
    if (newId !== oldId) {
      if (newId) {
        connectSSE();
      } else {
        disconnectSSE();
      }
    }
  });

  /**
   * Store zurücksetzen (bei Logout)
   */
  function $reset() {
    disconnectSSE();
    households.value = [];
    activeHouseholdId.value = null;
    activeHousehold.value = null;
    onlineMembers.value = [];
    localStorage.removeItem(STORAGE_KEY);
  }

  return {
    // State
    households,
    activeHouseholdId,
    activeHousehold,
    loading,
    onlineMembers,

    // Getters
    hasHousehold,
    isInHousehold,
    memberCount,
    isCreator,

    // Actions
    fetchHouseholds,
    fetchHouseholdDetails,
    createHousehold,
    renameHousehold,
    deleteHousehold,
    createInvite,
    joinHousehold,
    leaveHousehold,
    removeMember,
    migrateData,
    setAsDefault,
    fetchActivity,
    exportHousehold,
    setActiveHousehold,

    // SSE
    connectSSE,
    disconnectSSE,
    addEventListener,

    // Reset
    $reset,
  };
});
