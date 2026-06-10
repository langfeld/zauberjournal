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
          <p class="text-sm">Kein Rezept für heute.</p>
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
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 mb-4">
        <h3 class="flex items-center gap-2 font-semibold text-stone-800 dark:text-stone-100 text-lg">
          <CalendarDays class="w-5 h-5 text-primary-500" />
          Aktueller Wochenplan
        </h3>
        <div class="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
          <!-- Plan-Dropdown -->
          <div v-if="availablePlans.length > 1" class="relative w-full sm:w-auto" ref="planDropdownRef">
            <button
              @click="showPlanDropdown = !showPlanDropdown"
              class="flex items-center justify-between gap-2 bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-1.5 text-xs text-stone-700 dark:text-stone-200 transition-colors cursor-pointer w-full sm:w-auto"
            >
              <span class="font-medium truncate">{{ currentPlanLabel }}</span>
              <ChevronDown class="w-3.5 h-3.5 text-stone-400 shrink-0" :class="showPlanDropdown ? 'rotate-180' : ''" />
            </button>
            <div
              v-if="showPlanDropdown"
              class="absolute left-0 sm:right-0 sm:left-auto top-full mt-1 bg-white dark:bg-stone-900 shadow-lg border border-stone-200 dark:border-stone-700 rounded-xl py-1 z-50 min-w-[240px] max-h-60 overflow-y-auto"
            >
              <button
                v-for="plan in availablePlans"
                :key="plan.id"
                @click="switchPlan(plan.id)"
                class="flex items-center gap-2.5 w-full px-3 py-2 text-left transition-colors"
                :class="mealPlanStore.currentPlan?.id === plan.id
                  ? 'bg-primary-50 dark:bg-primary-900/30'
                  : 'hover:bg-stone-50 dark:hover:bg-stone-700/50'"
              >
                <!-- Rezept-Anzahl Badge -->
                <div class="flex justify-center items-center rounded-md w-7 h-7 font-bold text-[10px] shrink-0"
                  :class="mealPlanStore.currentPlan?.id === plan.id
                    ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400'
                    : 'bg-stone-100 dark:bg-stone-700 text-stone-500 dark:text-stone-400'">
                  {{ plan.meal_count || plan.entry_count || 0 }}
                </div>
                <!-- Datum + Info -->
                <div class="min-w-0 flex-1">
                  <div class="font-medium text-xs truncate" :class="mealPlanStore.currentPlan?.id === plan.id ? 'text-primary-700 dark:text-primary-300' : 'text-stone-700 dark:text-stone-200'">
                    {{ planLabel(plan) }}
                  </div>
                  <div class="text-[10px] text-stone-400 dark:text-stone-500">
                    {{ plan.meal_count || plan.entry_count || 0 }} Rezepte
                  </div>
                </div>
                <!-- Lock-Badge -->
                <Lock v-if="plan.is_locked" class="w-3 h-3 text-emerald-500 shrink-0" title="Plan fixiert" />
              </button>
            </div>
          </div>
          <button
            v-if="mealPlanStore.currentPlan"
            @click="showPlanModal = true"
            class="flex items-center gap-1.5 bg-primary-50 dark:bg-primary-900/30 hover:bg-primary-100 dark:hover:bg-primary-900 px-3 py-1.5 rounded-lg text-xs font-medium text-primary-700 dark:text-primary-300 transition-colors cursor-pointer w-full lg:w-auto border border-primary-300 dark:border-primary-700"
          >
            <Eye class="w-3.5 h-3.5" />
            Plan anzeigen
          </button>
        </div>
      </div>

      <div v-if="weekPlanDays.length" class="relative">
        <!-- Desktop: Pfeile -->
        <div class="relative">
          <button
            v-if="weekPlanDays.length > 7"
            @click="currentSlide = Math.max(0, currentSlide - 1)"
            :disabled="currentSlide === 0"
            class="hidden sm:flex absolute -left-2 top-1/2 -translate-y-1/2 z-10 items-center justify-center bg-white dark:bg-stone-800 shadow-md hover:shadow-lg disabled:opacity-0 disabled:pointer-events-none border border-stone-200 dark:border-stone-700 rounded-full w-8 h-8 text-stone-600 dark:text-stone-300 transition-all cursor-pointer"
          >
            <ChevronLeft class="w-4 h-4" />
          </button>

          <!-- Mobile: horizontal scroll (alle Tage), Desktop: Grid (7 Tage) -->
          <div class="flex sm:grid gap-2 overflow-x-auto sm:overflow-visible snap-x snap-mandatory sm:snap-none pb-1 sm:pb-0 sm:grid-cols-7 px-1 sm:px-2 -mx-2 sm:mx-0">
            <div
              v-for="day in visibleDays"
              :key="day.dayOfWeek"
              class="snap-start shrink-0 w-[120px] sm:w-auto sm:shrink flex flex-col"
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
                      class="absolute top-1.5 right-1.5 bg-accent-500/90 backdrop-blur-sm rounded-full w-5 h-5 flex items-center justify-center shadow-sm"
                      title="Bereits gekocht"
                    >
                      <span class="text-[10px] text-white font-bold leading-none">✓</span>
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

          <button
            v-if="weekPlanDays.length > 7"
            @click="currentSlide = Math.min(Math.ceil(weekPlanDays.length / 7) - 1, currentSlide + 1)"
            :disabled="currentSlide >= Math.ceil(weekPlanDays.length / 7) - 1"
            class="hidden sm:flex absolute -right-2 top-1/2 -translate-y-1/2 z-10 items-center justify-center bg-white dark:bg-stone-800 shadow-md hover:shadow-lg disabled:opacity-0 disabled:pointer-events-none border border-stone-200 dark:border-stone-700 rounded-full w-8 h-8 text-stone-600 dark:text-stone-300 transition-all cursor-pointer"
          >
            <ChevronRight class="w-4 h-4" />
          </button>
        </div>

        <!-- Wochen-Indikator (nur Desktop) -->
        <div v-if="weekPlanDays.length > 7" class="hidden sm:block text-center mt-3">
          <span class="text-[10px] text-stone-400 dark:text-stone-500 tracking-wide">
            WOCHE {{ currentSlide + 1 }} / {{ Math.ceil(weekPlanDays.length / 7) }}
          </span>
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

    <!-- Plan Detail Modal -->
    <PlanDetailModal
      :is-open="showPlanModal"
      :plan="selectedPlan"
      :entries="selectedPlanEntries"
      @close="showPlanModal = false"
      @entry-click="goToRecipe"
      @swap="openSwapDialog"
      @remove="removeEntry"
      @add-entry="onAddEntryToPlan"
      @toggle-cooked="toggleCooked"
      @update-servings="openServingsPopup"
      @toggle-lock="toggleLockPlan"
      @duplicate="duplicatePlan"
      @shopping-list="createShoppingList"
      @delete="confirmDeletePlan"
      @edit="showPlanEditModal = true"
    />

    <!-- Plan Edit Modal -->
    <PlanEditModal
      :is-open="showPlanEditModal"
      :plan="selectedPlan"
      @close="showPlanEditModal = false"
      @save="doEditPlan"
    />

    <!-- Swap Modal -->
    <Teleport to="body">
      <div v-if="showSwapModal" class="z-50 fixed inset-0 flex justify-center items-center p-4 pointer-events-none">
        <div class="relative bg-white dark:bg-stone-900 shadow-2xl rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col pointer-events-auto">
          <div class="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-stone-700">
            <h3 class="font-bold text-stone-800 dark:text-stone-100 text-lg">
              {{ swapEntry ? 'Rezept tauschen' : 'Rezept hinzufügen' }}
            </h3>
            <button @click="showSwapModal = false" class="hover:bg-stone-100 dark:hover:bg-stone-800 p-2 rounded-lg">
              <X class="w-5 h-5 text-stone-500" />
            </button>
          </div>
          <div class="flex-1 overflow-y-auto p-4">
            <!-- Kategorie / Slot Auswahl -->
            <div class="mb-4">
              <p class="text-xs text-stone-500 dark:text-stone-400 mb-1.5 font-medium uppercase tracking-wide">Mahlzeit-Typ</p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="slot in mealTypes"
                  :key="slot.id"
                  @click="onSwapCategoryChange(slot.id)"
                  :class="[
                    'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                    swapCategoryId === slot.id
                      ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 border border-primary-300 dark:border-primary-700'
                      : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border border-stone-200 dark:border-stone-700 hover:bg-stone-200 dark:hover:bg-stone-700'
                  ]"
                >
                  <span class="mr-1">{{ slot.icon }}</span>
                  {{ slot.name }}
                </button>
              </div>
            </div>
            <div class="flex gap-2 mb-4">
              <input v-model="swapSearch" @keyup.enter="onSwapSearchChange" placeholder="Rezept suchen…"
                class="flex-1 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-700 dark:text-stone-200" />
            </div>
            <div v-if="swapSuggestions.length" class="grid grid-cols-2 gap-2">
              <div v-for="recipe in swapSuggestions" :key="recipe.id"
                class="bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 border border-stone-200 dark:border-stone-700 rounded-lg p-3 cursor-pointer transition-colors"
                @click="doSwap(recipe.id)">
                <div class="relative aspect-video rounded-lg overflow-hidden bg-stone-200 dark:bg-stone-700 mb-2">
                  <img v-if="recipe.image_url" :src="recipe.image_url" class="w-full h-full object-cover" />
                  <span v-else class="flex justify-center items-center w-full h-full text-2xl">🍽️</span>
                  <!-- Score-Badge mit Aufschlüsselung -->
                  <div class="absolute top-1.5 right-1.5" @click.stop>
                    <ScorePopover :score="recipe.score" :breakdown="recipe.breakdown" />
                  </div>
                </div>
                <p class="font-medium text-stone-800 dark:text-stone-100 text-sm truncate">{{ recipe.title }}</p>
                <!-- Hints -->
                <div v-if="recipe.hints?.length" class="flex flex-wrap gap-1 mt-1">
                  <span
                    v-for="(hint, idx) in recipe.hints.slice(0, 3)" :key="idx"
                    class="inline-flex items-center gap-0.5 bg-stone-100 dark:bg-stone-700 px-1.5 py-0.5 rounded text-[10px] text-stone-500 dark:text-stone-400"
                  >
                    <span>{{ hint.icon }}</span>
                    <span class="truncate max-w-[80px]">{{ hint.text }}</span>
                  </span>
                </div>
              </div>
            </div>
            <div v-else-if="!swapLoading" class="py-8 text-center text-stone-500 dark:text-stone-400 text-sm">
              Keine Vorschläge gefunden.
            </div>
            <div v-if="swapLoading" class="py-4 text-center">
              <div class="border-2 border-stone-200 border-t-primary-600 rounded-full w-5 h-5 animate-spin mx-auto" />
            </div>
            <!-- Mehr laden -->
            <div v-if="swapSuggestions.length > 0 && !swapLoading" class="mt-3 text-center">
              <button
                @click="loadMoreSuggestions"
                class="inline-flex items-center gap-1.5 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 px-4 py-2 rounded-lg text-xs font-medium text-stone-600 dark:text-stone-400 transition-colors cursor-pointer"
              >
                <Plus class="w-3.5 h-3.5" />
                Mehr laden
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Servings Popup -->
    <Teleport to="body">
      <div v-if="servingsPopupEntry" class="z-50 fixed inset-0" @click.self="servingsPopupEntry = null">
        <div class="fixed" :style="servingsPopupStyle">
          <div class="bg-white dark:bg-stone-900 shadow-xl border border-stone-200 dark:border-stone-700 rounded-xl p-3">
            <p class="font-medium text-stone-700 dark:text-stone-200 text-sm mb-2">Portionen</p>
            <div class="flex items-center gap-2">
              <button @click="updateServings(-1)" class="hover:bg-stone-100 dark:hover:bg-stone-800 p-1.5 rounded-lg cursor-pointer">
                <Minus class="w-4 h-4" />
              </button>
              <span class="font-semibold w-8 text-center">{{ servingsPopupEntry.servings }}</span>
              <button @click="updateServings(1)" class="hover:bg-stone-100 dark:hover:bg-stone-800 p-1.5 rounded-lg cursor-pointer">
                <Plus class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Confirm Dialog -->
    <ConfirmDialog
      v-model="confirmDialog.show"
      :title="confirmDialog.title"
      :message="confirmDialog.message"
      :variant="confirmDialog.variant"
      :confirm-text="confirmDialog.confirmText"
      :show-cancel="confirmDialog.showCancel"
      @confirm="onConfirmDialog"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useWindowSize } from '@vueuse/core';
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
  ChevronDown, ChevronLeft, ChevronRight, Lock, Eye, X, RefreshCw, Minus, Plus,
} from 'lucide-vue-next';
import StatCard from '@/components/dashboard/StatCard.vue';
import PlanDetailModal from '@/components/mealplan/PlanDetailModal.vue';
import PlanEditModal from '@/components/mealplan/PlanEditModal.vue';
import ScorePopover from '@/components/mealplan/ScorePopover.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';

const router = useRouter();
const authStore = useAuthStore();
const recipesStore = useRecipesStore();
const mealPlanStore = useMealPlanStore();
const shoppingStore = useShoppingStore();
const pantryStore = usePantryStore();
const householdStore = useHouseholdStore();

// Aktivitäts-Feed
const feedEvents = ref([]);
const feedLoading = ref(false);

// Verfügbare Wochenpläne für Dropdown
const availablePlans = ref([]);
const showPlanDropdown = ref(false);
const planDropdownRef = ref(null);

// Plan-Detail Modal
const currentSlide = ref(0);
const showPlanModal = ref(false);
const showPlanEditModal = ref(false);
const selectedPlan = computed(() => mealPlanStore.currentPlan);
const selectedPlanEntries = computed(() => mealPlanStore.currentPlan?.entries || []);
const mealTypes = computed(() => recipesStore.mealTimeCategories || []);

// Swap Modal
const showSwapModal = ref(false);
const swapEntry = ref(null);
const swapDateStr = ref('');
const swapSearch = ref('');
const swapSuggestions = ref([]);
const swapCategoryId = ref(null);
const swapOffset = ref(0);
const swapLoading = ref(false);
const reopenPlanAfterSwap = ref(false);

// Servings Popup
const servingsPopupEntry = ref(null);
const servingsPopupPos = ref({ x: 0, y: 0 });
const servingsPopupStyle = computed(() => ({
  left: `${servingsPopupPos.value.x}px`,
  top: `${servingsPopupPos.value.y + 20}px`,
}));

// Confirm Dialog
const confirmDialog = ref({
  show: false,
  title: '',
  message: '',
  variant: 'danger',
  confirmText: 'Bestätigen',
  showCancel: true,
  onConfirm: null,
});

function showConfirm(opts) {
  confirmDialog.value = { show: true, showCancel: true, ...opts };
}

function showAlert(opts) {
  confirmDialog.value = { show: true, showCancel: false, variant: 'info', confirmText: 'OK', ...opts };
}

function onConfirmDialog() {
  confirmDialog.value.show = false;
  if (confirmDialog.value.onConfirm) confirmDialog.value.onConfirm();
}

const currentPlanLabel = computed(() => {
  const plan = mealPlanStore.currentPlan;
  if (!plan) return 'Kein Plan';
  return planLabel(plan);
});

// Click-Outside: Dropdown schliessen
function onDocumentClick(event) {
  if (planDropdownRef.value && !planDropdownRef.value.contains(event.target)) {
    showPlanDropdown.value = false;
  }
}

function planLabel(plan) {
  const start = plan.start_date || plan.week_start;
  if (!start) return 'Unbenannter Plan';
  const d = new Date(start + 'T12:00:00');
  const kw = getCalendarWeek(d);
  const endStr = plan.end_date
    ? ' – ' + new Date(plan.end_date + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
    : '';
  return `KW ${kw}: ${d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}${endStr}`;
}

function getCalendarWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

async function switchPlan(planId) {
  if (!planId) return;
  showPlanDropdown.value = false;
  currentSlide.value = 0;
  try {
    await mealPlanStore.fetchPlanById(planId);
  } catch { /* silent */ }
}

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

// Aktueller Wochenplan – beginnt immer am Montag der Plan-Woche,
// zeigt mindestens Mo–So und erweitert nach rechts, falls der Plan
// über den Sonntag hinausgeht. Rezepte werden per plan_date zugeordnet.
const weekPlanDays = computed(() => {
  if (!mealPlanStore.currentPlan?.entries?.length) return [];

  const plan = mealPlanStore.currentPlan;
  const startStr = plan.start_date || plan.week_start;
  const endStr = plan.end_date;
  if (!startStr) return [];

  const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

  const planStart = new Date(startStr + 'T12:00:00');
  const planEnd = endStr
    ? new Date(endStr + 'T12:00:00')
    : new Date(planStart);
  if (!endStr) planEnd.setDate(planStart.getDate() + 6);

  // Montag der Woche, die den Plan-Start enthält
  const jsDayStart = planStart.getDay(); // 0=So, 1=Mo…
  const mondayOffset = jsDayStart === 0 ? 6 : jsDayStart - 1;
  const monday = new Date(planStart);
  monday.setDate(planStart.getDate() - mondayOffset);

  // Sonntag der Woche, die den Plan-Ende enthält
  const jsDayEnd = planEnd.getDay();
  const sundayOffset = jsDayEnd === 0 ? 0 : 7 - jsDayEnd;
  const sunday = new Date(planEnd);
  sunday.setDate(planEnd.getDate() + sundayOffset);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function formatDateLocal(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const dayCount = Math.round((sunday - monday) / 86400000) + 1;
  if (dayCount <= 0 || dayCount > 366) return [];

  return Array.from({ length: dayCount }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateKey = formatDateLocal(d);

    const isToday = d.getFullYear() === today.getFullYear() &&
                    d.getMonth() === today.getMonth() &&
                    d.getDate() === today.getDate();

    const jsDay = d.getDay(); // 0=So, 1=Mo…
    const dayIdx = jsDay === 0 ? 6 : jsDay - 1;

    return {
      dayOfWeek: i,
      dayName: dayNames[dayIdx],
      dateStr: `${d.getDate()}. ${monthNames[d.getMonth()]}`,
      isToday,
      meals: plan.entries.filter(e => e.plan_date === dateKey),
    };
  });
});

const { width: windowWidth } = useWindowSize();
const isMobile = computed(() => windowWidth.value < 640);

// Sichtbare Tage: Mobile = alle Tage (horizontal scroll), Desktop = 7 pro Slide
const visibleDays = computed(() => {
  if (isMobile.value) return weekPlanDays.value;
  const start = currentSlide.value * 7;
  return weekPlanDays.value.slice(start, start + 7);
});

// Slide zurücksetzen, wenn der Plan wechselt
watch(() => mealPlanStore.currentPlan?.id, () => {
  currentSlide.value = 0;
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
  document.addEventListener('click', onDocumentClick);

  // allSettled statt all: Dashboard lädt auch wenn einzelne APIs fehlschlagen
  await Promise.allSettled([
    recipesStore.fetchRecipes(),
    recipesStore.fetchCategories(),
    mealPlanStore.fetchCurrentPlan(),
    mealPlanStore.fetchAvailableWeeks(),
    shoppingStore.fetchActiveList(),
    pantryStore.fetchItems(),
    fetchDashboardFeed(),
  ]);

  availablePlans.value = mealPlanStore.availableWeeks || [];

  // Fallback: Wenn kein Plan für die aktuelle Woche existiert,
  // suche unter allen Plänen denjenigen, dessen Zeitraum am
  // nächsten an "heute" liegt (egal ob vergangen oder zukünftig).
  if (!mealPlanStore.currentPlan) {
    try {
      const { plans } = await mealPlanStore.fetchPlans();
      if (plans?.length) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTs = today.getTime();

        function planDistance(p) {
          const s = p.start_date || p.week_start;
          const e = p.end_date || s;
          if (!s) return Infinity;
          const start = new Date(s + 'T12:00:00').getTime();
          const end = new Date(e + 'T12:00:00').getTime();
          if (todayTs >= start && todayTs <= end) return 0; // heute im Plan
          if (todayTs < start) return start - todayTs;      // Plan liegt in Zukunft
          return todayTs - end;                             // Plan liegt in Vergangenheit
        }

        const best = plans.slice().sort((a, b) => planDistance(a) - planDistance(b))[0];
        if (best) {
          await mealPlanStore.fetchPlanById(best.id);
        }
      }
      if (!availablePlans.value.length && plans?.length) {
        availablePlans.value = plans;
      }
    } catch { /* silent */ }
  }
});

async function markMealCooked(meal) {
  if (mealPlanStore.currentPlan) {
    await mealPlanStore.markCooked(mealPlanStore.currentPlan.id, meal.id);
    await mealPlanStore.fetchPlanById(mealPlanStore.currentPlan.id);
  }
}

// ── Plan Detail Modal Handler ──
function goToRecipe(recipeId) {
  router.push(`/recipes/${recipeId}`);
}

async function openSwapDialog(entry) {
  swapEntry.value = entry;
  swapSearch.value = '';
  swapCategoryId.value = entry?.category_id || mealTypes.value[0]?.id || null;
  swapOffset.value = 0;

  if (showPlanModal.value) {
    showPlanModal.value = false;
    reopenPlanAfterSwap.value = true;
  }

  showSwapModal.value = true;

  const dayIdx = entry?.plan_date
    ? (new Date(entry.plan_date + 'T12:00:00').getDay() + 6) % 7
    : 0;
  swapLoading.value = true;
  try {
    const data = await mealPlanStore.fetchSuggestions({
      dayIdx,
      categoryId: swapCategoryId.value,
      offset: 0,
    });
    swapSuggestions.value = data || [];
  } finally {
    swapLoading.value = false;
  }
}

async function onAddEntryToPlan(dateStr) {
  swapEntry.value = null;
  swapDateStr.value = dateStr;
  swapSearch.value = '';
  swapCategoryId.value = null;
  swapOffset.value = 0;

  if (showPlanModal.value) {
    showPlanModal.value = false;
    reopenPlanAfterSwap.value = true;
  }

  showSwapModal.value = true;
  swapSuggestions.value = [];
}

/** Slot/Kategorie im Swap-Modal wechseln → Vorschläge neu laden */
async function onSwapCategoryChange(categoryId) {
  swapCategoryId.value = categoryId;
  swapOffset.value = 0;
  swapLoading.value = true;
  try {
    const dayIdx = swapDateStr.value
      ? (new Date(swapDateStr.value + 'T12:00:00').getDay() + 6) % 7
      : 0;
    const data = await mealPlanStore.fetchSuggestions({
      dayIdx,
      categoryId: swapCategoryId.value,
      search: swapSearch.value || null,
      offset: 0,
    });
    swapSuggestions.value = data || [];
  } finally {
    swapLoading.value = false;
  }
}

/** Suche im Swap-Modal ausführen */
async function onSwapSearchChange() {
  swapOffset.value = 0;
  swapLoading.value = true;
  try {
    const dayIdx = swapDateStr.value
      ? (new Date(swapDateStr.value + 'T12:00:00').getDay() + 6) % 7
      : 0;
    const data = await mealPlanStore.fetchSuggestions({
      dayIdx,
      categoryId: swapCategoryId.value,
      search: swapSearch.value || null,
      offset: 0,
    });
    swapSuggestions.value = data || [];
  } finally {
    swapLoading.value = false;
  }
}

/** Weitere Rezepte laden */
async function loadMoreSuggestions() {
  swapLoading.value = true;
  try {
    const dayIdx = swapDateStr.value
      ? (new Date(swapDateStr.value + 'T12:00:00').getDay() + 6) % 7
      : 0;
    const newOffset = swapOffset.value + 8;
    const data = await mealPlanStore.fetchSuggestions({
      dayIdx,
      categoryId: swapCategoryId.value,
      search: swapSearch.value || null,
      offset: newOffset,
    });
    const more = data || [];
    if (more.length > 0) {
      swapSuggestions.value.push(...more);
      swapOffset.value = newOffset;
    }
  } finally {
    swapLoading.value = false;
  }
}

async function doSwap(newRecipeId) {
  try {
    if (swapEntry.value) {
      await mealPlanStore.swapRecipe(swapEntry.value.meal_plan_id, swapEntry.value.id, newRecipeId);
    } else if (selectedPlan.value?.id && swapDateStr.value) {
      // Neuer Eintrag für leeren Tag im Plan hinzufügen
      const dayIdx = (new Date(swapDateStr.value + 'T12:00:00').getDay() + 6) % 7;
      await mealPlanStore.addEntry(selectedPlan.value.id, newRecipeId, dayIdx, swapCategoryId.value || mealTypes.value[0]?.id, 4, swapDateStr.value);
    }
    showSwapModal.value = false;
    swapEntry.value = null;
    swapDateStr.value = '';

    if (reopenPlanAfterSwap.value && selectedPlan.value) {
      reopenPlanAfterSwap.value = false;
      showPlanModal.value = true;
    }

    if (mealPlanStore.currentPlan?.id) {
      await mealPlanStore.fetchPlanById(mealPlanStore.currentPlan.id);
    }
  } catch (err) {
    showAlert({ title: 'Fehler', message: err.message || 'Fehler beim Tauschen', variant: 'warning' });
  }
}

async function removeEntry(entry) {
  showConfirm({
    title: 'Mahlzeit entfernen?',
    message: 'Diese Mahlzeit wird aus dem Plan entfernt.',
    variant: 'warning',
    confirmText: 'Entfernen',
    onConfirm: async () => {
      try {
        await mealPlanStore.removeEntry(entry.meal_plan_id, entry.id);
        if (mealPlanStore.currentPlan?.id) {
          await mealPlanStore.fetchPlanById(mealPlanStore.currentPlan.id);
        }
      } catch (err) {
        showAlert({ title: 'Fehler', message: err.message || 'Fehler beim Entfernen', variant: 'warning' });
      }
    },
  });
}

async function toggleCooked(entry) {
  try {
    await mealPlanStore.markCooked(entry.meal_plan_id, entry.id);
    if (mealPlanStore.currentPlan?.id) {
      await mealPlanStore.fetchPlanById(mealPlanStore.currentPlan.id);
    }
  } catch {
    // silent
  }
}

function openServingsPopup(entry, event) {
  servingsPopupEntry.value = entry;
  if (event) {
    servingsPopupPos.value = { x: event.clientX, y: event.clientY };
  }
}

async function updateServings(delta) {
  if (!servingsPopupEntry.value) return;
  const newServings = Math.max(1, servingsPopupEntry.value.servings + delta);
  try {
    await mealPlanStore.updateServings(servingsPopupEntry.value.meal_plan_id, servingsPopupEntry.value.id, newServings);
    servingsPopupEntry.value.servings = newServings;
  } catch {
    // silent
  }
}

async function toggleLockPlan(plan) {
  try {
    await mealPlanStore.toggleLock(plan.id);
  } catch (err) {
    showAlert({ title: 'Fehler', message: err.message || 'Fehler beim Sperren', variant: 'warning' });
  }
}

async function duplicatePlan(plan) {
  const target = prompt('Zieldatum (YYYY-MM-DD):', plan.start_date || plan.week_start);
  if (!target) return;
  try {
    await mealPlanStore.duplicatePlan(plan.id, target);
    if (mealPlanStore.currentPlan?.id) {
      await mealPlanStore.fetchPlanById(mealPlanStore.currentPlan.id);
    }
    showPlanModal.value = false;
    showAlert({ title: 'Dupliziert', message: 'Plan erfolgreich dupliziert.', variant: 'success', showCancel: false });
  } catch (err) {
    showAlert({ title: 'Fehler', message: err.message || 'Fehler beim Duplizieren', variant: 'warning' });
  }
}

function createShoppingList(plan) {
  router.push(`/shopping?planId=${plan.id}`);
}

async function confirmDeletePlan(plan) {
  showConfirm({
    title: 'Plan löschen?',
    message: 'Dieser Plan und alle seine Mahlzeiten werden unwiderruflich gelöscht.',
    variant: 'danger',
    confirmText: 'Löschen',
    onConfirm: async () => {
      try {
        await mealPlanStore.deletePlan(plan.id);
        showPlanModal.value = false;
        await mealPlanStore.fetchAvailableWeeks();
        availablePlans.value = mealPlanStore.availableWeeks || [];
      } catch (err) {
        showAlert({ title: 'Fehler', message: err.message || 'Fehler beim Löschen', variant: 'warning' });
      }
    },
  });
}

async function doEditPlan({ startDate, endDate }) {
  if (!selectedPlan.value) return;
  try {
    await mealPlanStore.updatePlan(selectedPlan.value.id, { startDate, endDate });
    showPlanEditModal.value = false;
    if (mealPlanStore.currentPlan?.id) {
      await mealPlanStore.fetchPlanById(mealPlanStore.currentPlan.id);
    }
    showAlert({ title: 'Gespeichert', message: 'Plan erfolgreich aktualisiert.', variant: 'success', showCancel: false });
  } catch (err) {
    showAlert({ title: 'Fehler', message: err.message || 'Fehler beim Aktualisieren', variant: 'warning', showCancel: false });
  }
}

// Wenn Swap-Dialog geschlossen wird und Plan-Modal sollte wieder geöffnet werden
watch(showSwapModal, (isOpen) => {
  if (!isOpen && reopenPlanAfterSwap.value && selectedPlan.value) {
    reopenPlanAfterSwap.value = false;
    showPlanModal.value = true;
  }
});

watch(swapSearch, async (search) => {
  if (!swapEntry.value) return;
  const dayIdx = swapEntry.value?.plan_date
    ? (new Date(swapEntry.value.plan_date + 'T12:00:00').getDay() + 6) % 7
    : 0;
  const data = await mealPlanStore.fetchSuggestions({
    dayIdx,
    categoryId: swapEntry.value?.category_id,
    search: search || null,
  });
  swapSuggestions.value = data || [];
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick);
});
</script>
