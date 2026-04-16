<!--
  ============================================
  App.vue - Haupt-App-Komponente
  ============================================
  Layout mit Sidebar, Header und Hauptinhalt.
  Verwaltet Theme-Toggle und Auth-Status.
-->
<template>
  <!-- Wrapper mit Dark-Mode Klasse -->
  <div :class="{ dark: isDark }" class="min-h-screen">
    <div class="bg-stone-50 dark:bg-stone-950 min-h-screen transition-colors duration-300">

      <!-- Login-Ansicht (kein Layout) -->
      <template v-if="!authStore.isLoggedIn">
        <RouterView />
      </template>

      <!-- App-Layout (nach Login) -->
      <template v-else>
        <div class="flex flex-col h-screen overflow-hidden">

          <!-- Status-Banner (im Dokument-Flow, schiebt Inhalt nach unten) -->
          <Transition name="slide-down">
            <div
              v-if="!isOnline"
              class="flex justify-center items-center gap-2 bg-amber-500 dark:bg-amber-600 px-4 py-1.5 text-white text-sm text-center shrink-0"
            >
              <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728M5.636 5.636a9 9 0 000 12.728M12 12h.01" />
              </svg>
              <span>Offline – Änderungen werden bei Verbindung synchronisiert</span>
              <span v-if="pendingCount > 0" class="bg-white/20 ml-1 px-2 py-0.5 rounded-full font-medium text-xs">
                {{ pendingCount }} ausstehend
              </span>
              <span v-if="failedCount > 0" class="bg-red-600/40 ml-1 px-2 py-0.5 rounded-full font-medium text-xs">
                {{ failedCount }} fehlgeschlagen
              </span>
            </div>
          </Transition>

          <!-- Sync-Erfolg Flash -->
          <Transition name="slide-down">
            <div
              v-if="justReconnected && pendingCount === 0"
              class="bg-emerald-500 dark:bg-emerald-600 px-4 py-1.5 text-white text-sm text-center shrink-0"
            >
              ✓ Wieder online – alles synchronisiert
            </div>
          </Transition>

          <!-- Token-abgelaufen Banner -->
          <Transition name="slide-down">
            <div
              v-if="authExpired && isOnline"
              class="flex justify-center items-center gap-2 bg-red-500 dark:bg-red-600 px-4 py-1.5 text-white text-sm text-center shrink-0"
            >
              <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
              </svg>
              <span>Sitzung abgelaufen – bitte erneut anmelden, um {{ pendingCount }} Änderung{{ pendingCount !== 1 ? 'en' : '' }} zu synchronisieren</span>
            </div>
          </Transition>

          <!-- Fehlgeschlagene Actions Banner -->
          <Transition name="slide-down">
            <div
              v-if="failedCount > 0 && isOnline && !authExpired"
              class="flex justify-center items-center gap-2 bg-red-500 dark:bg-red-600 px-4 py-1.5 text-white text-sm text-center shrink-0"
            >
              <span>{{ failedCount }} Offline-Änderung{{ failedCount !== 1 ? 'en' : '' }} fehlgeschlagen</span>
              <button
                class="bg-white/20 hover:bg-white/30 ml-1 px-3 py-0.5 rounded font-medium text-xs transition-colors"
                @click="syncManager.retryFailed()"
              >
                Erneut versuchen
              </button>
            </div>
          </Transition>

          <!-- Hauptbereich mit Sidebar -->
          <div class="flex flex-1 min-h-0">

          <!-- Mobile Backdrop -->
          <Transition name="fade">
            <div
              v-if="mobileMenuOpen"
              class="lg:hidden z-40 fixed inset-0 bg-black/50 backdrop-blur-sm"
              @click="mobileMenuOpen = false"
            />
          </Transition>

          <!-- Sidebar Navigation -->
          <AppSidebar
            :is-collapsed="sidebarCollapsed"
            :is-mobile-open="mobileMenuOpen"
            @toggle="sidebarCollapsed = !sidebarCollapsed"
            @close-mobile="mobileMenuOpen = false"
          />

          <!-- Hauptbereich -->
          <div class="flex flex-col flex-1 w-0 overflow-hidden">
            <!-- Header mit Suche und Theme-Toggle -->
            <AppHeader @toggle-sidebar="toggleSidebar" />

            <!-- Seiteninhalt -->
            <main ref="mainContent" class="relative flex-1 p-4 lg:p-6 overflow-y-auto">
              <RouterView v-slot="{ Component }">
                <Transition name="page" mode="out-in">
                  <component :is="Component" />
                </Transition>
              </RouterView>
            </main>
          </div>
          </div>
        </div>

        <!-- Benachrichtigungen -->
        <NotificationToast />

        <!-- KI-Fortschrittsanzeige -->
        <AIProgressOverlay />

        <!-- PWA Install-Banner (unten) -->
        <PwaInstallBanner />

        <!-- PWA Update-Banner (oben, überlagert alles) -->
        <PwaUpdateBanner />
      </template>
    </div>
  </div>
</template>

<script setup>
/**
 * App Setup:
 * - Prüft Auth-Status beim Start
 * - Verwaltet Sidebar und Theme
 */
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { RouterView, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';
import { useHouseholdStore } from '@/stores/household.js';
import { useTheme } from '@/composables/useTheme.js';
import { useNetworkStatus } from '@/composables/useNetworkStatus.js';
import { offlineQueue } from '@/services/offlineQueue.js';
import { syncManager } from '@/services/syncManager.js';
import AppSidebar from '@/components/layout/AppSidebar.vue';
import AppHeader from '@/components/layout/AppHeader.vue';
import NotificationToast from '@/components/layout/NotificationToast.vue';
import AIProgressOverlay from '@/components/ui/AIProgressOverlay.vue';
import PwaInstallBanner from '@/components/layout/PwaInstallBanner.vue';
import PwaUpdateBanner from '@/components/layout/PwaUpdateBanner.vue';
import { useAIProgress } from '@/composables/useAIProgress.js';

const authStore = useAuthStore();
const householdStore = useHouseholdStore();
const { handleProgressEvent: onAIProgress } = useAIProgress();
const { isDark } = useTheme();
const { isOnline, justReconnected } = useNetworkStatus();
const { pendingCount, pendingActions } = offlineQueue;
const failedCount = computed(() =>
  pendingActions.value.filter(a => a.status === 'failed').length
);
const { authExpired } = syncManager;
const sidebarCollapsed = ref(false);
const mobileMenuOpen = ref(false);
const mainContent = ref(null);
const router = useRouter();

// Bei Seitenwechsel zum Anfang scrollen
watch(() => router.currentRoute.value.fullPath, () => {
  mainContent.value?.scrollTo({ top: 0 });
});

// Sidebar-Toggle: Auf Mobile → Overlay, auf Desktop → Collapse
function toggleSidebar() {
  if (window.innerWidth < 1024) {
    mobileMenuOpen.value = !mobileMenuOpen.value;
  } else {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }
}

// SSE sauber schließen bevor die Seite entladen wird (verhindert Firefox-Konsolenfehler)
const handleBeforeUnload = () => householdStore.disconnectSSE();

// Auth-Status beim App-Start prüfen + Household laden
onMounted(async () => {
  window.addEventListener('beforeunload', handleBeforeUnload);
  // AI-Progress-Events direkt an das Composable weiterleiten
  householdStore.addEventListener('ai:progress', onAIProgress);
  await authStore.checkAuth();
  if (authStore.isLoggedIn) {
    await householdStore.fetchHouseholds();
    householdStore.connectSSE();
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload);
  householdStore.disconnectSSE();
});

// Bei Logout Household-Store zurücksetzen
watch(() => authStore.isLoggedIn, (loggedIn) => {
  if (!loggedIn) {
    householdStore.$reset();
  } else {
    householdStore.fetchHouseholds().then(() => householdStore.connectSSE());
  }
});
</script>
