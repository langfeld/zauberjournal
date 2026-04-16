<!--
  ============================================
  AppHeader - Obere Leiste
  ============================================
  Enthält Suche, Theme-Toggle und Benutzermenü.
-->
<template>
  <header class="flex items-center gap-2 bg-white dark:bg-stone-900 px-3 sm:px-4 lg:px-6 border-stone-200 dark:border-stone-800 border-b h-16">
    <!-- Mobile Hamburger-Menü -->
    <button
      @click="$emit('toggle-sidebar')"
      class="lg:hidden hover:bg-stone-100 dark:hover:bg-stone-800 p-2 rounded-lg text-stone-500"
    >
      <Menu class="w-5 h-5" />
    </button>

    <!-- Seitentitel -->
    <h1 class="ml-1 lg:ml-0 font-semibold text-stone-800 dark:text-stone-100 text-base sm:text-lg truncate">
      {{ pageTitle }}
    </h1>

    <!-- Spacer -->
    <div class="flex-1" />

    <!-- Schnellsuche -->
    <div class="hidden relative md:flex items-center mr-4">
      <Search class="left-3 absolute w-4 h-4 text-stone-400" />
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Rezept suchen..."
        class="bg-stone-100 dark:bg-stone-800 py-2 pr-4 pl-9 border border-transparent focus:border-primary-400 rounded-lg outline-none focus:ring-1 focus:ring-primary-400 w-64 text-stone-700 dark:text-stone-300 text-sm transition-colors placeholder-stone-400 dark:placeholder-stone-500"
        @keydown.enter="handleSearch"
      />
    </div>

    <!-- Theme Toggle -->
    <ThemeToggle />

    <!-- Benutzermenü -->
    <div class="relative ml-3">
      <button
        @click="showUserMenu = !showUserMenu"
        class="flex items-center gap-2 hover:bg-stone-100 dark:hover:bg-stone-800 px-3 py-1.5 rounded-lg transition-colors"
      >
        <div class="flex justify-center items-center bg-primary-100 dark:bg-primary-900/50 rounded-full w-8 h-8">
          <span class="font-medium text-primary-700 dark:text-primary-300 text-sm">
            {{ userInitials }}
          </span>
        </div>
        <span class="hidden sm:block text-stone-700 dark:text-stone-300 text-sm">
          {{ authStore.displayName }}
        </span>
      </button>

      <!-- Dropdown -->
      <Transition name="page">
        <div
          v-if="showUserMenu"
          class="right-0 z-50 absolute bg-white dark:bg-stone-800 shadow-lg mt-2 py-1 border border-stone-200 dark:border-stone-700 rounded-lg w-48"
        >
          <router-link
            to="/settings"
            @click="showUserMenu = false"
            class="flex items-center gap-2 hover:bg-stone-100 dark:hover:bg-stone-700 px-4 py-2 w-full text-stone-700 dark:text-stone-300 text-sm"
          >
            <SlidersHorizontal class="w-4 h-4" />
            Einstellungen
          </router-link>
          <div class="mx-2 my-1 border-stone-200 dark:border-stone-700 border-t" />
          <button
            @click="handleLogout"
            class="flex items-center gap-2 hover:bg-stone-100 dark:hover:bg-stone-700 px-4 py-2 w-full text-stone-700 dark:text-stone-300 text-sm"
          >
            <LogOut class="w-4 h-4" />
            Abmelden
          </button>
        </div>
      </Transition>
    </div>
  </header>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';
import { Menu, Search, LogOut, SlidersHorizontal } from 'lucide-vue-next';
import ThemeToggle from './ThemeToggle.vue';

defineEmits(['toggle-sidebar']);

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const searchQuery = ref('');
const showUserMenu = ref(false);

// Seitentitel aus Route-Meta
const pageTitle = computed(() => route.meta.title || 'Zauberjournal');

// Benutzerinitialen für Avatar
const userInitials = computed(() => {
  const name = authStore.displayName;
  return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
});

function handleSearch() {
  if (searchQuery.value.trim()) {
    router.push({ name: 'recipes', query: { search: searchQuery.value } });
    searchQuery.value = '';
  }
}

function handleLogout() {
  authStore.logout();
  showUserMenu.value = false;
  router.push({ name: 'login' });
}
</script>
