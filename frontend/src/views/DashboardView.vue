<!--
  ============================================
  DashboardView - Übersichtsseite
  ============================================
  Zeigt Zusammenfassung aller Bereiche:
  - Statistiken (Rezepte, Favoriten, Kochhistorie)
  - Heutiger Wochenplan
  - Einkaufsliste Quick-View
  - Bald ablaufende Vorräte
-->
<template>
  <div class="space-y-6 mx-auto max-w-7xl animate-fade-in">
    <!-- Begrüßung -->
    <div>
      <h2 class="font-display font-bold text-stone-800 dark:text-stone-100 text-2xl">
        Hallo {{ authStore.displayName }}! 👋
      </h2>
      <p class="mt-1 text-stone-500 dark:text-stone-400">
        Was kochen wir heute?
      </p>
    </div>

    <!-- Statistik-Karten -->
    <div class="gap-4 grid grid-cols-2 lg:grid-cols-4">
      <StatCard
        v-for="stat in stats"
        :key="stat.label"
        :icon="stat.icon"
        :label="stat.label"
        :value="stat.value"
        :color="stat.color"
      />
    </div>

    <div class="gap-6 grid lg:grid-cols-2">
      <!-- Heutiger Plan -->
      <div class="bg-white dark:bg-stone-900 p-6 border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden">
        <h3 class="flex items-center gap-2 mb-4 font-semibold text-stone-800 dark:text-stone-100 text-lg">
          <Calendar class="w-5 h-5 text-primary-500" />
          Heute auf dem Plan
        </h3>
        <div v-if="todayMeals.length" class="space-y-3">
          <router-link
            v-for="meal in todayMeals"
            :key="meal.id"
            :to="`/recipes/${meal.recipe_id}`"
            class="group flex items-center gap-3 bg-stone-50 hover:bg-stone-100 dark:bg-stone-800/50 dark:hover:bg-stone-800 p-3 rounded-lg transition-colors"
          >
            <div class="bg-stone-200 dark:bg-stone-700 rounded-lg w-12 h-12 overflow-hidden shrink-0">
              <img v-if="meal.image_url" :src="meal.image_url" :alt="meal.recipe_title" class="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              <div v-else class="flex justify-center items-center w-full h-full text-lg">{{ meal.category_icon || '🍽️' }}</div>
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-medium text-stone-800 dark:group-hover:text-primary-400 dark:text-stone-200 group-hover:text-primary-600 text-sm truncate transition-colors">{{ meal.recipe_title }}</p>
              <p class="text-stone-500 text-xs">{{ meal.total_time }} Min. • {{ meal.difficulty }}</p>
            </div>
            <button
              v-if="!meal.is_cooked"
              @click.prevent="markMealCooked(meal)"
              class="px-3 py-1 rounded-full text-xs transition-colors bg-accent-100 text-accent-700 hover:bg-accent-200 dark:bg-accent-900/50 dark:hover:bg-accent-800 dark:text-accent-300"
            >
              Gekocht ✓
            </button>
            <span v-else class="text-xs text-accent-600 dark:text-accent-400">Gekocht ✓</span>
          </router-link>
        </div>
        <div v-else class="py-8 text-stone-400 text-center">
          <Calendar class="opacity-50 mx-auto mb-2 w-10 h-10" />
          <p class="text-sm">Kein Plan für heute.</p>
          <router-link to="/mealplan" class="text-primary-600 dark:text-primary-400 text-sm hover:underline">
            Wochenplan erstellen →
          </router-link>
        </div>
      </div>

      <!-- Schnellaktionen -->
      <div class="bg-white dark:bg-stone-900 p-6 border border-stone-200 dark:border-stone-800 rounded-xl">
        <h3 class="flex items-center gap-2 mb-4 font-semibold text-stone-800 dark:text-stone-100 text-lg">
          <Zap class="w-5 h-5 text-amber-500" />
          Schnellaktionen
        </h3>
        <div class="gap-3 grid grid-cols-2">
          <router-link
            v-for="action in quickActions"
            :key="action.to"
            :to="action.to"
            class="group flex flex-col items-center gap-2 hover:bg-primary-50/50 dark:hover:bg-primary-950/30 p-4 border border-stone-200 hover:border-primary-300 dark:border-stone-700 dark:hover:border-primary-700 rounded-xl transition-colors"
          >
            <component
              :is="action.icon"
              class="w-8 h-8 text-stone-400 group-hover:text-primary-500 transition-colors"
            />
            <span class="text-stone-600 dark:text-stone-400 text-xs text-center">{{ action.label }}</span>
          </router-link>
        </div>
      </div>
    </div>

    <!-- Aktueller Wochenplan -->
    <div class="bg-white dark:bg-stone-900 p-6 border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden">
      <div class="flex items-center justify-between mb-4">
        <h3 class="flex items-center gap-2 font-semibold text-stone-800 dark:text-stone-100 text-lg">
          <CalendarDays class="w-5 h-5 text-primary-500" />
          Aktueller Wochenplan
        </h3>
        <router-link to="/mealplan" class="text-primary-600 dark:text-primary-400 text-sm hover:underline">
          Zum Wochenplan →
        </router-link>
      </div>

      <div v-if="weekPlanDays.length" class="overflow-x-auto -mx-6 px-6">
        <div class="gap-2 grid grid-cols-7 min-w-[640px]">
          <div
            v-for="day in weekPlanDays"
            :key="day.dayOfWeek"
            class="flex flex-col"
          >
            <div
              class="mb-2 py-2 rounded-lg text-center"
              :class="day.isToday
                ? 'bg-primary-100 dark:bg-primary-900/40'
                : 'bg-stone-50 dark:bg-stone-800/50'"
            >
              <p
                class="text-xs font-medium"
                :class="day.isToday ? 'text-primary-700 dark:text-primary-300' : 'text-stone-500 dark:text-stone-400'"
              >
                {{ day.dayName }}
              </p>
              <p
                class="text-sm font-bold"
                :class="day.isToday ? 'text-primary-600 dark:text-primary-400' : 'text-stone-700 dark:text-stone-300'"
              >
                {{ day.dateStr }}
              </p>
            </div>

            <div class="flex-1 space-y-1.5 min-h-[60px]">
              <router-link
                v-for="meal in day.meals"
                :key="meal.id"
                :to="`/recipes/${meal.recipe_id}`"
                class="group block"
              >
                <div class="relative bg-stone-100 dark:bg-stone-800 rounded-lg aspect-[4/3] overflow-hidden">
                  <img
                    v-if="meal.image_url"
                    :src="meal.image_url"
                    :alt="meal.recipe_title"
                    class="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    loading="lazy"
                  />
                  <div v-else class="flex justify-center items-center w-full h-full text-lg">
                    {{ meal.category_icon || '🍽️' }}
                  </div>
                  <div
                    v-if="meal.is_cooked"
                    class="absolute top-1 right-1 bg-accent-500/90 rounded-full w-4 h-4 flex items-center justify-center"
                    title="Bereits gekocht"
                  >
                    <span class="text-[8px] text-white font-bold">✓</span>
                  </div>
                </div>
                <p class="mt-0.5 text-[10px] text-stone-600 dark:text-stone-400 truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                  {{ meal.recipe_title }}
                </p>
              </router-link>

              <p v-if="!day.meals.length" class="text-[10px] text-stone-300 dark:text-stone-600 text-center py-4">
                –
              </p>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="py-8 text-stone-400 text-center">
        <CalendarDays class="opacity-50 mx-auto mb-2 w-10 h-10" />
        <p class="text-sm">Kein aktueller Wochenplan.</p>
        <router-link to="/mealplan?generate=true" class="text-primary-600 dark:text-primary-400 text-sm hover:underline">
          Wochenplan erstellen →
        </router-link>
      </div>
    </div>

    <!-- Haushalt-Aktivitäts-Feed -->
    <div v-if="householdStore.isInHousehold" class="bg-white dark:bg-stone-900 p-6 border border-stone-200 dark:border-stone-800 rounded-xl">
      <h3 class="flex items-center gap-2 mb-4 font-semibold text-stone-800 dark:text-stone-100 text-lg">
        <Users class="w-5 h-5 text-primary-500" />
        Haushalt-Aktivitäten
      </h3>
      <div v-if="feedLoading" class="py-6 text-stone-400 text-center">
        <div class="inline-block border-2 border-primary-300 border-t-transparent rounded-full w-5 h-5 animate-spin" />
      </div>
      <div v-else-if="feedEvents.length" class="space-y-3 max-h-80 overflow-y-auto">
        <router-link
          v-for="(event, i) in feedEvents"
          :key="i"
          :to="event.link || '/'"
          class="group flex items-start gap-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 p-2 rounded-lg transition-colors"
        >
          <span class="mt-0.5 text-lg leading-none">{{ event.icon }}</span>
          <div class="flex-1 min-w-0">
            <p class="text-stone-700 dark:text-stone-300 text-sm">
              <span class="font-medium text-stone-900 dark:text-stone-100">{{ event.username }}</span>
              {{ event.message }}
            </p>
            <p class="text-stone-400 text-xs">{{ formatRelativeTime(event.timestamp) }}</p>
          </div>
        </router-link>
      </div>
      <div v-else class="py-6 text-stone-400 text-center">
        <Users class="opacity-50 mx-auto mb-2 w-10 h-10" />
        <p class="text-sm">Noch keine Aktivitäten im Haushalt.</p>
      </div>
    </div>

    <!-- Kürzlich gekochte Rezepte -->
    <div class="bg-white dark:bg-stone-900 p-6 border border-stone-200 dark:border-stone-800 rounded-xl">
      <h3 class="flex items-center gap-2 mb-4 font-semibold text-stone-800 dark:text-stone-100 text-lg">
        <History class="w-5 h-5 text-indigo-500" />
        Zuletzt gekocht
      </h3>
      <div v-if="recipesStore.recentRecipes.length" class="gap-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <router-link
          v-for="recipe in recipesStore.recentRecipes"
          :key="recipe.id"
          :to="`/recipes/${recipe.id}`"
          class="group"
        >
          <div class="bg-stone-100 dark:bg-stone-800 mb-2 rounded-lg aspect-video overflow-hidden">
            <img
              v-if="recipe.image_url"
              :src="recipe.image_url"
              :alt="recipe.title"
              class="w-full h-full object-cover group-hover:scale-105 transition-transform"
            />
            <div v-else class="flex justify-center items-center w-full h-full text-3xl">🍽️</div>
          </div>
          <p class="font-medium text-stone-700 dark:group-hover:text-primary-400 dark:text-stone-300 group-hover:text-primary-600 text-sm truncate">
            {{ recipe.title }}
          </p>
        </router-link>
      </div>
      <div v-else class="py-6 text-stone-400 text-center">
        <p class="text-sm">Noch keine Rezepte vorhanden.</p>
        <router-link to="/recipes/new" class="text-primary-600 dark:text-primary-400 text-sm hover:underline">
          Erstes Rezept erstellen →
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useAuthStore } from '@/stores/auth.js';
import { useRecipesStore } from '@/stores/recipes.js';
import { useMealPlanStore } from '@/stores/mealplan.js';
import { useShoppingStore } from '@/stores/shopping.js';
import { usePantryStore } from '@/stores/pantry.js';
import { useHouseholdStore } from '@/stores/household.js';
import { apiRaw } from '@/composables/useApi.js';
import {
  Calendar, CalendarDays, Zap, History, BookOpen, Sparkles,
  CalendarPlus, ShoppingCart, Star, Warehouse, Users,
} from 'lucide-vue-next';
import StatCard from '@/components/dashboard/StatCard.vue';

const authStore = useAuthStore();
const recipesStore = useRecipesStore();
const mealPlanStore = useMealPlanStore();
const shoppingStore = useShoppingStore();
const pantryStore = usePantryStore();
const householdStore = useHouseholdStore();

// Aktivitäts-Feed
const feedEvents = ref([]);
const feedLoading = ref(false);

function formatRelativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Gerade eben';
  if (mins < 60) return `vor ${mins} Min.`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Gestern';
  if (days < 7) return `vor ${days} Tagen`;
  return new Date(ts).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

async function fetchDashboardFeed() {
  if (!householdStore.isInHousehold) return;
  feedLoading.value = true;
  try {
    const data = await apiRaw(`/households/${householdStore.activeHouseholdId}/dashboard-feed?limit=15`);
    feedEvents.value = data.events || [];
  } catch { /* silent */ }
  feedLoading.value = false;
}

// Emojis für Mahlzeiten-Typen (dynamisch aus Einträgen via category_icon)

// Statistik-Daten
const stats = computed(() => [
  { icon: BookOpen, label: 'Rezepte', value: recipesStore.totalRecipes, color: 'primary' },
  { icon: Star, label: 'Favoriten', value: recipesStore.favoriteRecipes.length, color: 'amber' },
  { icon: ShoppingCart, label: 'Einkauf', value: shoppingStore.openItemsCount, color: 'accent' },
  { icon: Warehouse, label: 'Vorräte', value: pantryStore.items.length, color: 'indigo' },
]);

// Heutiger Plan
const todayMeals = computed(() => {
  if (!mealPlanStore.currentPlan?.entries) return [];
  const today = new Date().getDay();
  // JS: 0=So, unsere DB: 0=Mo -> Umrechnung
  const dayOfWeek = today === 0 ? 6 : today - 1;
  return mealPlanStore.currentPlan.entries.filter(e => e.day_of_week === dayOfWeek);
});

// Aktueller Wochenplan (7-Tage-Übersicht)
const weekPlanDays = computed(() => {
  if (!mealPlanStore.currentPlan?.entries?.length) return [];

  const today = new Date();
  const jsDay = today.getDay(); // 0=So, 1=Mo…
  const todayIdx = jsDay === 0 ? 6 : jsDay - 1; // 0=Mo…6=So

  const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

  const monday = new Date(today);
  monday.setDate(today.getDate() - todayIdx);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {
      dayOfWeek: i,
      dayName: dayNames[i],
      dateStr: `${d.getDate()}. ${monthNames[d.getMonth()]}`,
      isToday: i === todayIdx,
      meals: mealPlanStore.currentPlan.entries.filter(e => e.day_of_week === i),
    };
  });
});

// Schnellaktionen
const quickActions = [
  { to: '/recipes/new', icon: BookOpen, label: 'Rezept erstellen' },
  { to: '/recipes?import=photo', icon: Sparkles, label: 'KI-Import' },
  { to: '/mealplan?generate=true', icon: CalendarPlus, label: 'Wochenplan erstellen' },
  { to: '/shopping', icon: ShoppingCart, label: 'Einkaufsliste' },
];

// Daten beim Laden der Seite abrufen
onMounted(async () => {
  // allSettled statt all: Dashboard lädt auch wenn einzelne APIs fehlschlagen
  await Promise.allSettled([
    recipesStore.fetchRecipes(),
    recipesStore.fetchCategories(),
    mealPlanStore.fetchCurrentPlan(),
    shoppingStore.fetchActiveList(),
    pantryStore.fetchItems(),
    fetchDashboardFeed(),
  ]);
});

async function markMealCooked(meal) {
  if (mealPlanStore.currentPlan) {
    await mealPlanStore.markCooked(mealPlanStore.currentPlan.id, meal.id);
    await mealPlanStore.fetchCurrentPlan();
  }
}
</script>
