<!--
  ============================================
  ShoppingView - Einkaufsliste
  ============================================
  Intelligente Einkaufsliste mit:
  - Generierung aus Wochenplan
  - Gruppierung nach Abteilungen
  - Abhaken der Produkte
  - REWE-Integration (Produktsuche/Matching)
  - KI-Überprüfung (fehlende Zutaten, Mengenlogik, Duplikate, REWE-Zuordnung)
  - Intelligente Duplikat-Erkennung (KI-basiert)
  - Einkauf abschließen → Vorratsschrank
-->
<template>
  <div class="space-y-6 mx-auto max-w-7xl animate-fade-in">
    <!-- Wer kauft ein? Banner -->
    <div v-if="otherShoppers.length" class="flex items-center gap-3 px-4 py-3 border border-accent-200 dark:border-accent-800 rounded-xl animate-fade-in bg-accent-50 dark:bg-accent-900/20">
      <ShoppingCart class="w-5 h-5 text-accent-600 dark:text-accent-400 shrink-0" />
      <p class="text-sm text-accent-700 dark:text-accent-300">
        <span class="font-medium">{{ otherShoppers.map(s => s.display_name || s.username).join(', ') }}</span>
        {{ otherShoppers.length === 1 ? 'kauft gerade ein' : 'kaufen gerade ein' }}
      </p>
    </div>

    <!-- Header -->
    <div class="flex sm:flex-row flex-col justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="font-display font-bold text-stone-800 dark:text-stone-100 text-2xl">🛒 Einkaufsliste</h1>
        <p v-if="shoppingStore.activeList" class="text-stone-500 dark:text-stone-400 text-sm">
          {{ checkedCount }} / {{ totalCount }} erledigt
        </p>
      </div>
      <div class="flex flex-wrap items-stretch gap-1.5">
        <!-- Ich kaufe ein Toggle -->
        <button
          v-if="householdStore.isInHousehold"
          @click="toggleShoppingStatus"
          :class="[
            'flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-sm font-medium transition-colors border',
            iAmShopping
              ? 'bg-accent-100 dark:bg-accent-900/40 border-accent-300 dark:border-accent-700 text-accent-700 dark:text-accent-300'
              : 'bg-stone-100 dark:bg-stone-800 border-stone-300 dark:border-stone-600 text-stone-500 dark:text-stone-400'
          ]"
          :title="iAmShopping ? 'Einkauf beenden' : 'Ich kaufe ein'"
        >
          <MapPin class="w-4 h-4" />
          <span class="hidden sm:inline">{{ iAmShopping ? 'Kaufe ein...' : 'Ich kaufe ein' }}</span>
        </button>
        <button
          @click="toggleRecipeLinks"
          :title="showRecipeLinks ? 'Rezept-Links ausblenden' : 'Rezept-Links einblenden'"
          :class="[
            'flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-sm font-medium transition-colors border',
            showRecipeLinks
              ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300'
              : 'bg-stone-100 dark:bg-stone-800 border-stone-300 dark:border-stone-600 text-stone-500 dark:text-stone-400'
          ]"
        >
          <BookOpen v-if="showRecipeLinks" class="w-4 h-4" />
          <BookX v-else class="w-4 h-4" />
        </button>
        <!-- Verlauf (History-Button mit Dropdown) -->
        <div class="relative" ref="historyBtnRef">
          <button
            @click="openHistoryDropdown"
            :class="[
              'flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-sm font-medium transition-colors border',
              showHistoryDropdown
                ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300'
                : 'bg-stone-100 dark:bg-stone-800 border-stone-300 dark:border-stone-600 text-stone-500 dark:text-stone-400'
            ]"
            title="Vorherige Einkaufslisten laden"
          >
            <History class="w-4 h-4" />
          </button>
          <!-- Backdrop -->
          <Transition name="fade">
            <div v-if="showHistoryDropdown" class="z-30 fixed inset-0" @click="showHistoryDropdown = false" />
          </Transition>
          <!-- Dropdown -->
          <Transition name="fade">
            <div v-if="showHistoryDropdown" class="sm:top-full sm:right-0 z-40 fixed sm:absolute bg-white dark:bg-stone-800 shadow-lg sm:mt-1.5 border border-stone-200 dark:border-stone-700 rounded-xl sm:w-80 overflow-hidden" :style="historyDropdownStyle">
              <div class="px-4 py-3 border-stone-200 dark:border-stone-700 border-b">
                <p class="font-semibold text-stone-700 dark:text-stone-200 text-sm">Vorherige Einkaufslisten</p>
              </div>
              <div class="max-h-72 overflow-y-auto">
                <div v-if="shoppingStore.listHistory.length === 0" class="px-4 py-6 text-center">
                  <p class="text-stone-400 dark:text-stone-500 text-sm italic">Kein Verlauf vorhanden.</p>
                </div>
                <div
                  v-for="hl in shoppingStore.listHistory.slice(0, 15)"
                  :key="hl.id"
                  @click="reactivateHistoryList(hl.id); showHistoryDropdown = false"
                  :class="[
                    'flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors border-b border-stone-100 dark:border-stone-700/50 last:border-b-0',
                    hl.is_active
                      ? 'bg-primary-50 dark:bg-primary-900/20'
                      : 'hover:bg-stone-50 dark:hover:bg-stone-700/50'
                  ]"
                >
                  <div class="flex-1 min-w-0">
                    <p class="font-medium text-stone-700 dark:text-stone-200 text-sm truncate">
                      {{ hl.name || 'Einkaufsliste' }}
                      <span v-if="hl.is_active" class="bg-primary-100 dark:bg-primary-900/40 ml-1.5 px-1.5 py-0.5 rounded font-semibold text-[10px] text-primary-700 dark:text-primary-300">AKTIV</span>
                    </p>
                    <p class="text-stone-400 dark:text-stone-500 text-xs">
                      {{ formatHistoryDate(hl.created_at) }}
                      · {{ hl.checked_count || 0 }}/{{ hl.item_count || 0 }} erledigt
                    </p>
                  </div>
                  <RotateCcw v-if="!hl.is_active" class="w-3.5 h-3.5 text-stone-400 dark:text-stone-500 shrink-0" />
                </div>
              </div>
            </div>
          </Transition>
        </div>
        <!-- Auswahl-Modus -->
        <button
          v-if="shoppingStore.activeList"
          @click="toggleSelectMode"
          :class="[
            'flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-sm font-medium transition-colors border',
            selectMode
              ? 'bg-violet-50 dark:bg-violet-900/30 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300'
              : 'bg-stone-100 dark:bg-stone-800 border-stone-300 dark:border-stone-600 text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'
          ]"
          :title="selectMode ? 'Auswahl beenden' : 'Zutaten auswählen'"
        >
          <CheckSquare v-if="selectMode" class="w-4 h-4" />
          <Square v-else class="w-4 h-4" />
        </button>
        <!-- Einstellungen (zentral) -->
        <button
          v-if="shoppingStore.activeList"
          @click="openSettings()"
          class="flex items-center gap-1.5 bg-stone-100 dark:bg-stone-800 px-2.5 py-2 border border-stone-300 dark:border-stone-600 rounded-xl font-medium text-stone-500 hover:text-stone-700 dark:hover:text-stone-200 dark:text-stone-400 text-sm transition-colors"
          title="Einstellungen"
        >
          <Settings class="w-4 h-4" />
        </button>
        <!-- Aus Wochenplan erstellen (Split-Button) -->
        <div class="relative flex items-stretch w-full sm:w-auto">
          <button
            @click="generateList"
            :disabled="shoppingStore.loading || !shopDateRangeValid || !isOnline"
            :title="!isOnline ? 'Internetverbindung erforderlich' : ''"
            class="flex sm:flex-initial flex-1 justify-center items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-4 py-2 rounded-l-xl font-medium text-white text-sm transition-colors"
          >
            <ListPlus class="w-4 h-4" />
            Aus Essensplan erstellen
          </button>
          <button
            @click="showGenOptions = !showGenOptions; if (showGenOptions) loadAvailablePlans()"
            class="flex items-center bg-primary-600 hover:bg-primary-700 px-2.5 border-primary-500 border-l rounded-r-xl text-white transition-colors"
            title="Optionen"
          >
            <ChevronDown class="w-3.5 h-3.5" :class="showGenOptions ? 'rotate-180' : ''" />
          </button>
          <!-- Dropdown -->
          <Transition name="fade">
            <div v-if="showGenOptions" class="z-30 fixed inset-0" @click="showGenOptions = false" />
          </Transition>
          <Transition name="fade">
            <div v-if="showGenOptions" class="top-full sm:right-0 left-0 sm:left-auto z-30 absolute bg-white dark:bg-stone-800 shadow-lg mt-1.5 border border-stone-200 dark:border-stone-700 rounded-xl w-[calc(100vw-2rem)] sm:w-96 overflow-hidden">
              <div class="space-y-3 p-3">
                <!-- Zeitraum auswählen -->
                <div>
                  <p class="mb-2 font-medium text-stone-500 dark:text-stone-400 text-xs uppercase tracking-wide">Zeitraum auswählen</p>

                  <!-- Ladezustand -->
                  <div v-if="availablePlansLoading" class="flex justify-center items-center py-6">
                    <Loader2 class="w-5 h-5 text-primary-500 animate-spin" />
                  </div>

                  <!-- Fehler -->
                  <div v-else-if="availablePlansError" class="py-4 text-center">
                    <AlertTriangle class="mx-auto mb-2 w-8 h-8 text-amber-400 dark:text-amber-500" />
                    <p class="text-stone-500 dark:text-stone-400 text-sm">Pläne konnten nicht geladen werden</p>
                    <button @click="loadAvailablePlans()" class="bg-primary-600 hover:bg-primary-700 mt-2 px-3 py-1.5 rounded-lg font-medium text-white text-xs transition-colors">
                      <RefreshCw class="inline mr-1 w-3 h-3" />
                      Erneut versuchen
                    </button>
                  </div>

                  <div v-else class="space-y-3">
                    <!-- Von / Bis Datepicker -->
                    <div class="gap-2 grid grid-cols-2">
                      <div>
                        <label class="block mb-1 text-stone-500 dark:text-stone-400 text-xs">Von</label>
                        <input type="date" v-model="shopStartDate"
                          class="bg-white dark:bg-stone-700 px-2.5 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-primary-500 w-full text-stone-800 dark:text-stone-200 text-sm focus:outline-none" />
                      </div>
                      <div>
                        <label class="block mb-1 text-stone-500 dark:text-stone-400 text-xs">Bis</label>
                        <input type="date" v-model="shopEndDate"
                          class="bg-white dark:bg-stone-700 px-2.5 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-primary-500 w-full text-stone-800 dark:text-stone-200 text-sm focus:outline-none" />
                      </div>
                    </div>

                    <!-- Validation Hinweis -->
                    <p v-if="shopStartDate && shopEndDate && !shopDateRangeValid" class="text-red-500 dark:text-red-400 text-xs">
                      Ungültiger Zeitraum (max. 28 Tage, Enddatum muss nach Startdatum liegen)
                    </p>

                    <!-- Quick-Buttons -->
                    <div class="flex flex-wrap gap-1.5">
                      <button @click="setShopDatePreset('thisWeek')"
                        class="bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 px-2.5 py-1 rounded-lg text-stone-600 dark:text-stone-300 text-xs transition-colors">
                        Diese Woche
                      </button>
                      <button @click="setShopDatePreset('nextWeek')"
                        class="bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 px-2.5 py-1 rounded-lg text-stone-600 dark:text-stone-300 text-xs transition-colors">
                        Nächste Woche
                      </button>
                      <button @click="setShopDatePreset('next14')"
                        class="bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 px-2.5 py-1 rounded-lg text-stone-600 dark:text-stone-300 text-xs transition-colors">
                        Nächste 14 Tage
                      </button>
                      <button @click="setShopDatePreset('fromToday')"
                        class="bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 px-2.5 py-1 rounded-lg text-stone-600 dark:text-stone-300 text-xs transition-colors">
                        Ab heute (7 Tage)
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Vergangene Tage Toggle -->
                <label class="group flex items-center gap-3 cursor-pointer select-none">
                  <div class="relative">
                    <input type="checkbox" v-model="genIncludePastDays" class="sr-only peer" />
                    <div class="bg-stone-200 dark:bg-stone-600 peer-checked:bg-primary-500 rounded-full w-9 h-5 transition-colors" />
                    <div class="top-0.5 left-0.5 absolute bg-white shadow-sm rounded-full w-4 h-4 transition-transform peer-checked:translate-x-4" />
                  </div>
                  <div>
                    <p class="font-medium text-stone-700 dark:text-stone-200 text-sm">Vergangene Tage</p>
                    <p class="text-stone-400 dark:text-stone-500 text-xs">Auch Rezepte zurückliegender Tage einbeziehen</p>
                  </div>
                </label>
              </div>
            </div>
          </Transition>
        </div>
        <!-- REWE abgleichen -->
        <button
          v-if="shoppingStore.activeList && reweEnabled"
          @click="matchWithRewe"
          :disabled="reweLoading || !isOnline"
          :title="!isOnline ? 'Internetverbindung erforderlich' : ''"
          class="flex justify-center items-center gap-2 bg-rewe-500 hover:bg-rewe-600 disabled:opacity-50 px-4 py-2 rounded-xl w-full sm:w-auto font-medium text-white text-sm transition-colors"
        >
          <Loader2 v-if="reweLoading" class="w-4 h-4 animate-spin" />
          <span v-else>🏪</span>
          REWE abgleichen
        </button>
        <!-- KI-Check -->
        <button
          v-if="shoppingStore.activeList"
          @click="runAIReview"
          :disabled="shoppingStore.aiReviewLoading || !isOnline"
          :title="!isOnline ? 'Internetverbindung erforderlich' : 'Einkaufsliste mit KI überprüfen'"
          class="relative flex justify-center items-center gap-2 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 px-4 py-2 rounded-xl w-full sm:w-auto font-medium text-white text-sm transition-colors"
        >
          <Loader2 v-if="shoppingStore.aiReviewLoading" class="w-4 h-4 animate-spin" />
          <Bot v-else class="w-4 h-4" />
          KI-Check
          <span v-if="shoppingStore.aiReviewIssues.length" class="-top-1.5 -right-1.5 absolute flex justify-center items-center bg-red-500 rounded-full w-5 h-5 text-white text-xs">
            {{ shoppingStore.aiReviewIssues.length }}
          </span>
        </button>
      </div>
    </div>

    <!-- Fortschrittsbalken (nur wenn mindestens 1 Artikel abgehakt) -->
    <div v-if="shoppingStore.activeList && checkedCount > 0" class="bg-stone-200 dark:bg-stone-700 rounded-full w-full h-2">
      <div
        class="rounded-full h-2 transition-all duration-500 bg-accent-500"
        :style="{ width: `${progressPercent}%` }"
      />
    </div>

    <!-- REWE-Matching Fortschritt -->
    <Transition name="slide">
      <div v-if="shoppingStore.reweProgress" class="bg-white dark:bg-stone-900 border border-rewe-200 dark:border-rewe-800/40 rounded-xl overflow-hidden">
        <!-- Fortschrittsbalken -->
        <div class="bg-rewe-100 dark:bg-rewe-900/20 w-full h-1.5">
          <div
            class="bg-rewe-500 h-1.5 transition-all duration-300 ease-out"
            :style="{ width: `${reweMatchPercent}%` }"
          />
        </div>
        <div class="px-4 py-3">
          <div class="flex justify-between items-center gap-4">
            <!-- Links: Status -->
            <div class="flex items-center gap-3 min-w-0">
              <div class="relative flex justify-center items-center w-9 h-9 shrink-0">
                <svg class="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" stroke-width="3" class="text-rewe-100 dark:text-rewe-900/40" />
                  <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" stroke-width="3"
                    class="text-rewe-500 transition-all duration-300"
                    :stroke-dasharray="`${reweMatchPercent * 0.942} 100`"
                  />
                </svg>
                <span class="absolute font-bold text-[10px] text-rewe-600 dark:text-rewe-400">{{ reweMatchPercent }}%</span>
              </div>
              <div class="min-w-0">
                <p class="font-medium text-stone-800 dark:text-stone-200 text-sm truncate">
                  <span v-if="reweMatchPercent < 100">
                    <span v-if="shoppingStore.reweProgress.fromPreference">⭐</span>
                    <span v-else>🔍</span>
                    {{ shoppingStore.reweProgress.itemName }}…
                  </span>
                  <span v-else>✅ Fertig!</span>
                </p>
                <p class="text-stone-500 dark:text-stone-400 text-xs">
                  {{ shoppingStore.reweProgress.current }} / {{ shoppingStore.reweProgress.total }} Zutaten
                  · {{ shoppingStore.reweProgress.matchedCount }} zugeordnet
                </p>
              </div>
            </div>
            <!-- Rechts: Letzter Match -->
            <div v-if="shoppingStore.reweProgress.matched && shoppingStore.reweProgress.productName" class="hidden sm:block text-right shrink-0">
              <p class="max-w-50 text-green-600 dark:text-green-400 text-xs truncate">
                ✓ {{ shoppingStore.reweProgress.productName }}
              </p>
              <p v-if="shoppingStore.reweProgress.price" class="font-medium text-stone-600 dark:text-stone-300 text-xs">
                {{ shoppingStore.reweProgress.price }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Vorratscheck Toggle -->
    <div v-if="shoppingStore.currentList?.meal_plan_id">
      <button
        @click="togglePantryCheck"
        class="flex items-center gap-2 hover:bg-stone-100 dark:hover:bg-stone-800 px-3 py-2 border border-stone-200 dark:border-stone-700 rounded-xl w-full font-medium text-stone-600 dark:text-stone-300 text-sm transition-colors"
      >
        <ClipboardCheck class="w-4 h-4 text-accent-600 dark:text-accent-400" />
        <span class="flex-1 text-left">Vorratscheck</span>
        <span v-if="pantryCheckTotalCount > 0" class="px-1.5 py-0.5 rounded-full font-semibold tabular-nums text-xs bg-accent-100 text-accent-700 dark:bg-accent-900/40 dark:text-accent-300">
          {{ pantryCheckTotalCount }}
        </span>
        <Loader2 v-if="shoppingStore.pantryCheckLoading" class="w-4 h-4 text-stone-400 animate-spin" />
        <component :is="showPantryCheck ? ChevronUp : ChevronDown" v-else class="w-4 h-4 text-stone-400" />
      </button>

      <!-- Aufklappbarer Vorratscheck-Inhalt -->
      <Transition name="slide">
        <div v-if="showPantryCheck && shoppingStore.pantryCheck" class="space-y-3 mt-3">
          <!-- Info-Hinweis -->
          <p class="text-stone-500 dark:text-stone-400 text-xs">
            Diese Zutaten sollten im Vorrat vorhanden sein. Falls etwas fehlt, kannst du es per Klick zur Einkaufsliste hinzufügen.
          </p>

          <!-- Zutaten-Liste (nach Zutat gruppiert) -->
          <div v-if="shoppingStore.pantryCheck.ingredients?.length" class="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl divide-y divide-stone-100 dark:divide-stone-800 overflow-hidden">
            <div
              v-for="ing in shoppingStore.pantryCheck.ingredients"
              :key="ing.name"
              :class="[
                'flex items-center gap-3 px-4 py-2.5 transition-all',
                movedPantryItems.has(ing.name.toLowerCase()) ? 'opacity-40' : ''
              ]"
            >
              <!-- Status-Icon -->
              <div class="shrink-0">
                <Check v-if="ing.is_covered && !ing.is_partial" class="w-4 h-4 text-green-500" />
                <AlertTriangle v-else-if="ing.is_partial" class="w-4 h-4 text-amber-500" />
              </div>

              <!-- Name + Menge + Rezept-Thumbnails -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="font-medium text-stone-800 dark:text-stone-200 text-sm">{{ ing.name }}</span>
                  <span class="text-stone-400 dark:text-stone-500 text-xs">
                    <template v-if="ing.is_partial">
                      {{ formatPantryAmount(ing.total_covered_base_amount, ing.needed_base_unit) }} von {{ formatPantryAmount(ing.display_amount, ing.display_unit) }} vorhanden
                    </template>
                    <template v-else>
                      {{ formatPantryAmount(ing.display_amount, ing.display_unit) }}
                      <span v-if="ing.is_permanent" class="text-blue-500 dark:text-blue-400">∞</span>
                    </template>
                  </span>
                  <!-- Mini Rezept-Thumbnails (wie bei Einkaufslisten-Items) -->
                  <div v-if="showRecipeLinks && ing.recipes?.length" class="flex -space-x-1.5">
                    <router-link
                      v-for="recipe in ing.recipes"
                      :key="recipe.recipe_id"
                      :to="`/recipes/${recipe.recipe_id}`"
                      :title="`${recipe.recipe_title} (${recipe.day_label} · ${recipe.meal_type_label})`"
                      class="hover:z-10 relative bg-stone-200 dark:bg-stone-700 border-2 border-white dark:border-stone-900 rounded-full w-5 h-5 overflow-hidden hover:scale-125 transition-transform shrink-0"
                    >
                      <img v-if="recipe.recipe_image_url" :src="recipe.recipe_image_url" :alt="recipe.recipe_title" class="w-full h-full object-cover" />
                      <span v-else class="flex justify-center items-center w-full h-full text-[8px]">🍽️</span>
                    </router-link>
                  </div>
                </div>
              </div>

              <!-- Zur Einkaufsliste hinzufügen -->
              <button
                v-if="!movedPantryItems.has(ing.name.toLowerCase())"
                @click="moveFromPantryCheckToList(ing)"
                :disabled="pantryCheckMoving === ing.name.toLowerCase()"
                class="flex items-center gap-1 hover:bg-primary-50 dark:hover:bg-primary-900/20 px-2 py-1 rounded-lg text-stone-400 hover:text-primary-600 dark:hover:text-primary-400 text-xs transition-colors shrink-0"
                title="Zur Einkaufsliste hinzufügen"
              >
                <Loader2 v-if="pantryCheckMoving === ing.name.toLowerCase()" class="w-3.5 h-3.5 animate-spin" />
                <Plus v-else class="w-3.5 h-3.5" />
                <span class="hidden sm:inline">Einkaufen</span>
              </button>
              <span v-else class="text-stone-400 text-xs shrink-0">✓ verschoben</span>
            </div>
          </div>

          <!-- Leer-Zustand -->
          <div v-else-if="!shoppingStore.pantryCheckLoading" class="py-4 text-stone-400 dark:text-stone-500 text-sm text-center">
            Keine Vorräte für die Rezepte dieses Wochenplans gefunden.
          </div>
        </div>
      </Transition>
    </div>

    <!-- Manuell hinzufügen -->
    <form
      v-if="shoppingStore.activeList || !shoppingStore.loading"
      @submit.prevent="addManualItem"
      class="flex items-center gap-1.5"
    >
      <input
        v-model="newItem.name"
        type="text"
        placeholder="Artikel hinzufügen…"
        required
        class="flex-1 bg-white dark:bg-stone-900 px-3 py-2 border border-stone-200 focus:border-primary-400 dark:border-stone-800 rounded-xl outline-none focus:ring-0 min-w-0 text-stone-800 dark:text-stone-200 placeholder:text-stone-400 text-sm"
      />
      <input
        v-model.number="newItem.amount"
        type="number"
        step="any"
        min="0"
        placeholder="1"
        class="bg-white dark:bg-stone-900 px-1 py-2 border border-stone-200 focus:border-primary-400 dark:border-stone-800 rounded-xl outline-none focus:ring-0 w-12 text-stone-800 dark:text-stone-200 placeholder:text-stone-400 text-sm text-center shrink-0"
      />
      <UnitInput
        v-model="newItem.unit"
        placeholder="Stk"
        input-class="bg-white dark:bg-stone-900 px-1 py-2 border border-stone-200 dark:border-stone-800 rounded-xl focus:border-primary-400 focus:ring-0 w-full text-stone-800 dark:text-stone-200 placeholder:text-stone-400 text-sm text-center outline-none"
        :compact="true"
        class="w-12 shrink-0"
      />
      <button
        type="submit"
        :disabled="!newItem.name.trim()"
        class="flex items-center bg-primary-600 hover:bg-primary-700 disabled:opacity-50 p-2.5 rounded-xl text-white transition-colors shrink-0"
        title="Hinzufügen"
      >
        <Plus class="w-4 h-4" />
      </button>
      <!-- Bring! Import -->
      <button
        type="button"
        v-if="shoppingStore.activeList && shoppingStore.bringStatus?.connected"
        @click="openBringImportPicker"
        :disabled="shoppingStore.bringImporting"
        class="flex items-center bg-teal-600 hover:bg-teal-700 disabled:opacity-50 p-2.5 rounded-xl text-white transition-colors shrink-0"
        title="Artikel aus Bring! importieren"
      >
        <Loader2 v-if="shoppingStore.bringImporting" class="w-4 h-4 animate-spin" />
        <Download v-else class="w-4 h-4" />
      </button>
    </form>

    <!-- Einkaufsliste -->
    <div v-if="shoppingStore.activeList" class="space-y-6">
      <!-- Kategorien als Masonry-Layout auf breiten Screens -->
      <div class="gap-6 space-y-6 lg:columns-2">
        <div
          v-for="(items, category) in groupedItems"
          :key="category"
          class="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden break-inside-avoid"
        >
          <!-- Kategorie-Header -->
          <div class="flex justify-between items-center bg-stone-50 dark:bg-stone-800/60 px-4 py-2.5 border-stone-200 dark:border-stone-700 border-b">
            <h3 class="flex items-center gap-2 font-semibold text-stone-600 dark:text-stone-300 text-sm">
              {{ categoryIcon(category) }} {{ category || 'Sonstiges' }}
            </h3>
            <span class="text-stone-400 dark:text-stone-500 text-xs">{{ items.length }} Artikel</span>
          </div>
          <!-- Artikel-Liste -->
          <div class="divide-y divide-stone-100 dark:divide-stone-800">
            <div
              v-for="item in items"
              :key="item.id"
              :data-item-id="item.id"
              @click="selectMode ? handleSelectClick(item) : null"
              :class="[
                'transition-all last:rounded-b-xl border-2 border-transparent',
                selectMode ? 'cursor-pointer' : '',
                selectMode ? 'hover:bg-violet-50 dark:hover:bg-violet-900/20' : '',
                item.is_checked ? 'opacity-50' : '',
                highlightedItemId === item.id ? 'highlight-flash' : '',
                selectMode && selectedItems.some(s => s.id === item.id)
                  ? 'bg-violet-50 dark:bg-violet-900/20 !border-violet-400 dark:!border-violet-500'
                  : ''
              ]"
            >
              <!-- Obere Zeile: Checkbox + Name + Menge + Aktionen -->
              <div class="flex items-center gap-3 px-4 py-3">
                <!-- Checkbox (im Auswahl-Modus: Auswahl-Indikator) -->
                <button
                  v-if="!selectMode"
                  @click.stop="toggleItem(item)"
                  :class="[
                    'w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                    item.is_checked
                      ? 'bg-accent-500 border-accent-500'
                      : 'border-stone-300 dark:border-stone-600 hover:border-accent-400'
                  ]"
                >
                  <Check v-if="item.is_checked" class="w-3.5 h-3.5 text-white" />
                </button>
                <div
                  v-else
                  :class="[
                    'w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 transition-all shadow-sm',
                    selectedItems.some(s => s.id === item.id)
                      ? 'bg-violet-500 border-violet-500'
                      : 'border-violet-300 dark:border-violet-600 bg-white/90 dark:bg-stone-800/90'
                  ]"
                >
                  <Check v-if="selectedItems.some(s => s.id === item.id)" class="w-3.5 h-3.5 text-white" />
                </div>

                <!-- Artikelname + Rezept-Thumbnails -->
                <div class="flex-1 min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <span :class="['font-medium text-sm', item.is_checked ? 'line-through text-stone-400' : 'text-stone-800 dark:text-stone-200']">
                      {{ item.ingredient_name }}
                    </span>
                    <!-- Source-Icons -->
                    <span v-if="item.source === 'manual'" title="Manuell hinzugefügt" class="text-stone-400 dark:text-stone-500">
                      <PenLine class="w-3 h-3" />
                    </span>
                    <!-- Offline-Sync-Indikator -->
                    <span v-if="item._offline || offlineQueue.hasPendingForItem('shopping', item.id)" title="Wird bei Verbindung synchronisiert" class="text-amber-500">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                    </span>
                    <span v-else-if="item.source === 'bring'" title="Aus Bring! importiert" class="text-teal-400 dark:text-teal-500">
                      <Download class="w-3 h-3" />
                    </span>
                    <!-- Menge (klickbar zum Bearbeiten) -->
                    <button
                      v-if="item.amount && !selectMode && editingItemId !== item.id"
                      @click.stop="startEditItem(item)"
                      class="bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 px-1.5 py-0.5 rounded text-stone-500 dark:text-stone-400 text-xs transition-colors"
                      title="Menge anpassen"
                    >
                      {{ item.amount }} {{ item.unit }}
                    </button>
                    <span v-else-if="item.amount && (selectMode || editingItemId === item.id)" class="text-stone-400 dark:text-stone-500 text-xs">
                      {{ item.amount }} {{ item.unit }}
                    </span>
                    <button
                      v-else-if="!item.amount && !selectMode && editingItemId !== item.id"
                      @click.stop="startEditItem(item)"
                      class="text-stone-400 hover:text-stone-500 dark:hover:text-stone-400 dark:text-stone-500 text-xs transition-colors"
                      title="Menge hinzufügen"
                    >
                      <Plus class="inline w-3 h-3" /> Menge
                    </button>
                    <!-- Mini Rezept-Thumbnails -->
                    <div v-if="showRecipeLinks && item.recipes?.length" class="flex -space-x-1.5">
                      <router-link
                        v-for="recipe in item.recipes"
                        :key="recipe.id"
                        :to="`/recipes/${recipe.id}`"
                        :title="recipe.title"
                        class="hover:z-10 relative bg-stone-200 dark:bg-stone-700 border-2 border-white dark:border-stone-900 rounded-full w-5 h-5 overflow-hidden hover:scale-125 transition-transform shrink-0"
                      >
                        <img v-if="recipe.image_url" :src="recipe.image_url" :alt="recipe.title" class="w-full h-full object-cover" />
                        <span v-else class="flex justify-center items-center w-full h-full text-[8px]">🍽️</span>
                      </router-link>
                    </div>
                  </div>
                  <!-- Vorrats-Hinweis -->
                  <div v-if="item.pantry_deducted > 0" class="flex items-center gap-1 mt-0.5 text-emerald-600 dark:text-emerald-400 text-xs">
                    <Package class="w-3 h-3" />
                    {{ item.pantry_deducted }} {{ item.unit }} im Vorrat
                  </div>
                  <!-- Hinweis bei inkompatiblen Einheiten im Vorrat -->
                  <div v-else-if="item.pantry_note" class="flex items-center gap-1 mt-0.5 text-amber-600 dark:text-amber-400 text-xs">
                    <Package class="w-3 h-3" />
                    {{ item.pantry_note }}
                  </div>
                  <!-- Dedup-Hinweis (KI hat Artikel zusammengeführt) -->
                  <div v-if="item.dedup_note" class="flex items-center gap-1 mt-0.5 text-blue-600 dark:text-blue-400 text-xs">
                    <Merge class="w-3 h-3" />
                    {{ item.dedup_note }}
                  </div>
                </div>

                <!-- Aktionen (immer sichtbar, größere Touch-Targets) -->
                <div v-if="!selectMode" class="flex items-center gap-0.5 shrink-0">
                  <button
                    @click.stop="moveToPantry(item)"
                    class="hover:bg-amber-50 dark:hover:bg-amber-900/30 px-2 py-1 rounded-lg text-stone-400 hover:text-amber-600 dark:hover:text-amber-400 dark:text-stone-500 transition-colors"
                    title="In den Vorratsschrank"
                  >
                    <Archive class="w-4 h-4" />
                  </button>
                  <button
                    @click.stop="deleteItem(item)"
                    class="hover:bg-red-50 dark:hover:bg-red-900/30 px-2 py-1 rounded-lg text-stone-400 hover:text-red-500 dark:hover:text-red-400 dark:text-stone-500 transition-colors"
                    title="Artikel entfernen"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </div>

              <!-- KI-Review Inline-Hinweise (volle Breite unter dem Artikel) -->
              <template v-for="(issue, issueIdx) in getIssuesForItem(item.id)" :key="'ai-' + issueIdx">
                <div
                  class="flex items-start gap-1.5 mx-3 -mt-1 mb-1 px-3 py-1.5 rounded-lg text-xs"
                  :class="aiIssueClasses(issue.type)"
                >
                  <component :is="aiIssueIcon(issue.type)" class="mt-0.5 w-3.5 h-3.5 shrink-0" />
                  <div class="flex-1 min-w-0">
                    <p>{{ issue.message }}</p>
                    <p v-if="issue.recipe_id && issue.recipe_title" class="mt-0.5">
                      <router-link
                        :to="`/recipes/${issue.recipe_id}`"
                        @click.stop
                        class="font-medium underline underline-offset-2 hover:no-underline"
                      >{{ issue.recipe_title }}</router-link>
                    </p>
                    <div v-if="issue.suggestion" class="flex gap-2 mt-1">
                      <button
                        @click.stop="applyAISuggestion(issue, getGlobalIssueIndex(item.id, issueIdx))"
                        class="font-medium underline underline-offset-2 hover:no-underline"
                      >
                        {{ issue.suggestion.label || 'Anwenden' }}
                      </button>
                      <button
                        @click.stop="shoppingStore.dismissIssue(getGlobalIssueIndex(item.id, issueIdx))"
                        class="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
                      >
                        Verwerfen
                      </button>
                    </div>
                  </div>
                </div>
              </template>

              <!-- Inline-Mengen-Editor -->
              <Transition name="slide">
                <div v-if="editingItemId === item.id" class="mx-3 -mt-1 pb-3" @click.stop>
                  <div class="space-y-2 bg-stone-50 dark:bg-stone-800/60 px-3 py-2.5 border border-stone-200 dark:border-stone-700 rounded-xl">
                    <div class="flex items-center gap-2">
                      <input
                        ref="editAmountInput"
                        v-model.number="editAmount"
                        type="number"
                        step="any"
                        min="0"
                        placeholder="Menge"
                        class="bg-white dark:bg-stone-900 px-2.5 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg focus:outline-none focus:ring-2 w-24 text-sm focus:ring-accent-500"
                        @keydown.enter="saveEditItem(item)"
                        @keydown.escape="cancelEditItem"
                      />
                      <input
                        v-model="editUnit"
                        type="text"
                        placeholder="Einheit (g, ml, Stk...)"
                        class="flex-1 bg-white dark:bg-stone-900 px-2.5 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg focus:outline-none focus:ring-2 text-sm focus:ring-accent-500"
                        @keydown.enter="saveEditItem(item)"
                        @keydown.escape="cancelEditItem"
                      />
                      <button
                        @click="saveEditItem(item)"
                        class="p-1.5 rounded-lg text-white transition-colors bg-accent-500 hover:bg-accent-600 shrink-0"
                        title="Speichern"
                      >
                        <Check class="w-4 h-4" />
                      </button>
                      <button
                        @click="cancelEditItem"
                        class="hover:bg-stone-200 dark:hover:bg-stone-700 p-1.5 rounded-lg text-stone-400 transition-colors shrink-0"
                        title="Abbrechen"
                      >
                        <X class="w-4 h-4" />
                      </button>
                    </div>
                    <!-- Warnung bei zu niedriger Menge -->
                    <div v-if="editAmountWarning" class="flex items-start gap-1.5 text-amber-600 dark:text-amber-400 text-xs">
                      <AlertTriangle class="mt-0.5 w-3.5 h-3.5 shrink-0" />
                      <span>{{ editAmountWarning }}</span>
                    </div>
                  </div>
                </div>
              </Transition>

              <!-- REWE-Produkt-Karte (wenn zugewiesen) -->
              <div v-if="item.rewe_product" class="mx-3 pb-3" :class="selectMode ? 'pointer-events-none select-none' : ''">
                <div class="bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 rounded-xl overflow-hidden">
                  <!-- Produktinfo mit Bild -->
                  <div class="flex items-center gap-3 p-3">
                    <!-- Produktbild -->
                    <div class="flex justify-center items-center bg-white dark:bg-stone-700 rounded-lg w-14 h-14 overflow-hidden shrink-0">
                      <img
                        v-if="item.rewe_product.imageUrl"
                        :src="item.rewe_product.imageUrl"
                        :alt="item.rewe_product.name"
                        class="w-full h-full object-contain"
                        loading="lazy"
                      />
                      <span v-else class="text-2xl">🏪</span>
                    </div>
                    <!-- Name + Packungsgröße -->
                    <div class="flex-1 min-w-0">
                      <a
                        v-if="item.rewe_product.url"
                        :href="item.rewe_product.url"
                        target="_blank"
                        rel="noopener"
                        @click.stop
                        class="font-medium text-stone-800 hover:text-rewe-600 dark:hover:text-rewe-400 dark:text-stone-200 text-sm line-clamp-2 transition-colors"
                      >
                        {{ item.rewe_product.name }}
                      </a>
                      <p v-else class="font-medium text-stone-800 dark:text-stone-200 text-sm line-clamp-2">
                        {{ item.rewe_product.name }}
                      </p>
                      <p v-if="item.rewe_product.packageSize" class="mt-0.5 text-stone-500 dark:text-stone-400 text-xs">
                        {{ item.rewe_product.packageSize }}
                        <button
                          v-if="item.rewe_product.matchedBy"
                          type="button"
                          class="ml-1 hover:scale-110 transition-transform cursor-pointer"
                          :title="matchedByLabel(item.rewe_product.matchedBy)"
                          @click.stop="openMatchReason($event, item)"
                        >
                          {{ matchedByIcon(item.rewe_product.matchedBy) }}
                        </button>
                      </p>
                    </div>
                    <!-- Preis -->
                    <div class="text-right shrink-0">
                      <p class="font-bold tabular-nums text-stone-800 dark:text-stone-200 text-sm">
                        {{ formatPrice(item.rewe_product.price * (item.rewe_product.quantity || 1)) }}
                      </p>
                      <p v-if="(item.rewe_product.quantity || 1) > 1" class="tabular-nums text-stone-400 dark:text-stone-500 text-xs">
                        Einzelpreis {{ formatPrice(item.rewe_product.price) }}
                      </p>
                    </div>
                  </div>

                  <!-- Menge + Alternative -->
                  <div class="flex justify-between items-center gap-2 px-3 py-2 border-stone-200 dark:border-stone-700 border-t">
                    <!-- Mengen-Steuerung -->
                    <div class="flex items-center gap-1">
                      <button
                        @click.stop="decreaseQuantity(item)"
                        :disabled="(item.rewe_product.quantity || 1) <= 1"
                        class="flex justify-center items-center bg-white hover:bg-stone-100 dark:bg-stone-700 dark:hover:bg-stone-600 disabled:opacity-30 border border-stone-300 dark:border-stone-600 rounded-lg w-8 h-8 text-stone-600 dark:text-stone-300 transition-colors disabled:cursor-not-allowed"
                      >
                        <Minus class="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        :value="item.rewe_product.quantity || 1"
                        min="1"
                        @change="setQuantity(item, $event)"
                        @click.stop
                        @keydown.stop
                        class="bg-transparent border border-stone-300 dark:border-stone-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-rewe-400 w-10 h-8 font-semibold tabular-nums text-stone-800 dark:text-stone-200 text-sm text-center appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                      />
                      <button
                        @click.stop="increaseQuantity(item)"
                        class="flex justify-center items-center bg-white hover:bg-stone-100 dark:bg-stone-700 dark:hover:bg-stone-600 border border-stone-300 dark:border-stone-600 rounded-lg w-8 h-8 text-stone-600 dark:text-stone-300 transition-colors"
                      >
                        <Plus class="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <!-- Alternative wählen -->
                    <button
                      @click.stop="openProductPicker(item)"
                      class="flex items-center gap-1.5 hover:bg-rewe-50 dark:hover:bg-rewe-900/20 px-3 py-1.5 rounded-lg font-medium text-rewe-600 dark:text-rewe-400 text-xs transition-colors"
                    >
                      <ArrowRightLeft class="w-3.5 h-3.5" />
                      Alternative wählen
                    </button>
                  </div>
                </div>
              </div>

              <!-- Kein REWE-Produkt → Suche anbieten -->
              <div v-else-if="(shoppingStore.reweLinkedItems.length > 0 || reweLoading) && !item.rewe_product" class="-mt-1 px-4 pb-3" :class="selectMode ? 'pointer-events-none select-none' : ''">
                <button
                  @click.stop="openProductPicker(item)"
                  class="flex items-center gap-1.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 px-3 py-1.5 rounded-lg text-stone-400 hover:text-rewe-600 dark:hover:text-rewe-400 text-xs transition-colors"
                >
                  <Search class="w-3.5 h-3.5" />
                  REWE-Produkt suchen…
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- KI-Review: Globale Hinweise (nicht einem Item zugeordnet) -->
      <Transition name="slide">
        <div v-if="globalAIIssues.length > 0" class="space-y-2">
          <div class="flex justify-between items-center">
            <h3 class="flex items-center gap-2 font-medium text-stone-700 dark:text-stone-300 text-sm">
              <Bot class="w-4 h-4 text-violet-500" />
              KI-Hinweise
            </h3>
            <button
              @click="shoppingStore.dismissAllIssues()"
              class="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 text-xs"
            >
              Alle verwerfen
            </button>
          </div>
          <div v-for="(issue, idx) in globalAIIssues" :key="'global-ai-' + idx"
            class="flex items-start gap-2 px-3 py-2 rounded-xl text-sm"
            :class="aiIssueClasses(issue.type)"
          >
            <component :is="aiIssueIcon(issue.type)" class="mt-0.5 w-4 h-4 shrink-0" />
            <div class="flex-1 min-w-0">
              <p>{{ issue.message }}</p>
              <p v-if="issue.ingredient" class="mt-0.5 font-medium">{{ issue.ingredient }}</p>
              <p v-if="issue.recipe_id && issue.recipe_title" class="mt-0.5 text-xs">
                Rezept:
                <router-link
                  :to="`/recipes/${issue.recipe_id}`"
                  class="font-medium underline underline-offset-2 hover:no-underline"
                >{{ issue.recipe_title }}</router-link>
              </p>
              <div v-if="issue.suggestion" class="flex gap-2 mt-1">
                <button
                  @click="applyAISuggestion(issue, issue._globalIdx)"
                  class="font-medium underline underline-offset-2 hover:no-underline"
                >
                  {{ issue.suggestion.label || 'Anwenden' }}
                </button>
                <button
                  @click="shoppingStore.dismissIssue(issue._globalIdx)"
                  class="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
                >
                  Verwerfen
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>

      <!-- KI-Review: Auto-resolved Info -->
      <Transition name="slide">
        <div v-if="shoppingStore.aiReviewAutoResolved.length > 0" class="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl overflow-hidden text-emerald-700 dark:text-emerald-300 text-sm">
          <button
            @click="autoResolvedExpanded = !autoResolvedExpanded"
            class="flex items-center gap-2 hover:bg-emerald-100/50 dark:hover:bg-emerald-800/20 px-3 py-2 w-full text-left transition-colors"
          >
            <CheckCircle class="w-4 h-4 shrink-0" />
            <span class="flex-1">{{ autoResolvedSummary }}</span>
            <component :is="autoResolvedExpanded ? ChevronUp : ChevronDown" class="opacity-60 w-4 h-4 shrink-0" />
          </button>
          <Transition name="slide">
            <div v-if="autoResolvedExpanded" class="px-3 pb-2.5 border-emerald-200/60 dark:border-emerald-800/30 border-t">
              <ul class="space-y-1 pt-2">
                <li
                  v-for="(item, idx) in autoResolvedDetails"
                  :key="idx"
                  class="flex items-start gap-2 text-xs leading-relaxed"
                >
                  <component :is="autoResolvedIcon(item.type)" class="opacity-70 mt-0.5 w-3.5 h-3.5 shrink-0" />
                  <span>{{ item.description }}</span>
                </li>
              </ul>
            </div>
          </Transition>
        </div>
      </Transition>

      <!-- Einkauf abschließen -->
      <div class="flex sm:flex-row flex-col justify-between items-center gap-3 mt-8 pt-6 border-stone-200 dark:border-stone-800 border-t">
        <div class="text-stone-500 dark:text-stone-400 text-sm">
          <span v-if="estimatedTotal > 0" class="font-medium text-stone-700 dark:text-stone-300">
            Geschätzte Kosten: {{ formatPrice(estimatedTotal) }}
          </span>
        </div>
        <div class="flex sm:flex-row flex-col sm:flex-wrap gap-2 w-full sm:w-auto">
          <!-- An Bring! senden -->
          <button
            v-if="shoppingStore.bringStatus?.connected && shoppingStore.openItemsCount > 0"
            @click="sendToBring"
            :disabled="shoppingStore.bringSending || !isOnline"
            :title="!isOnline ? 'Internetverbindung erforderlich' : ''"
            class="flex justify-center items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 px-5 py-3 rounded-xl w-full sm:w-auto font-medium text-white transition-colors"
          >
            <Loader2 v-if="shoppingStore.bringSending" class="w-4 h-4 animate-spin" />
            <Send v-else class="w-4 h-4" />
            An Bring! senden
          </button>

          <!-- Bei REWE bestellen -->
          <button
            v-if="reweEnabled && shoppingStore.reweLinkedItems.length"
            @click="handleReweMainAction"
            :disabled="cartScriptLoading"
            class="flex justify-center items-center gap-2 bg-rewe-500 hover:bg-rewe-600 disabled:opacity-50 px-5 py-3 rounded-xl w-full sm:w-auto font-medium text-white transition-colors"
          >
            <Loader2 v-if="cartScriptLoading" class="w-4 h-4 animate-spin" />
            <ShoppingCart v-else class="w-4 h-4" />
            Bei REWE bestellen ({{ shoppingStore.reweLinkedItems.length }})
          </button>
          <button
            @click="completePurchase"
            :disabled="checkedCount === 0"
            class="flex justify-center items-center gap-2 disabled:opacity-50 px-6 py-3 rounded-xl w-full sm:w-auto font-medium text-white transition-colors bg-accent-600 hover:bg-accent-700"
          >
            <ShoppingBag class="w-4 h-4" />
            Einkauf abschließen
          </button>
        </div>
      </div>

      <!-- =============================================
           Zentrale Einstellungen Modal (Tabs)
           ============================================= -->
      <Teleport to="body">
        <Transition name="fade">
          <div v-if="showSettings" class="z-50 fixed inset-0 flex justify-center items-end sm:items-center bg-black/50 p-4" @click.self="showSettings = false">
            <div class="flex flex-col bg-white dark:bg-stone-900 shadow-2xl rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden">

              <!-- Header -->
              <div class="px-5 pt-4 pb-0 shrink-0">
                <div class="flex justify-between items-center mb-4">
                  <h2 class="font-display font-bold text-stone-800 dark:text-stone-100 text-lg">⚙️ Einstellungen</h2>
                  <button @click="showSettings = false" class="hover:bg-stone-100 dark:hover:bg-stone-800 p-1.5 rounded-lg text-stone-400 transition-colors">
                    <X class="w-5 h-5" />
                  </button>
                </div>

                <!-- Tabs -->
                <div class="flex gap-1 -mb-px">
                  <button
                    v-if="reweEnabled"
                    @click="settingsTab = 'rewe'"
                    :class="[
                      'px-4 py-2 text-sm font-medium rounded-t-lg border border-b-0 transition-colors',
                      settingsTab === 'rewe'
                        ? 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-700 text-rewe-600 dark:text-rewe-400'
                        : 'bg-stone-50 dark:bg-stone-800 border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
                    ]"
                  >
                    🏪 REWE
                  </button>
                  <button
                    @click="settingsTab = 'bring'"
                    :class="[
                      'px-4 py-2 text-sm font-medium rounded-t-lg border border-b-0 transition-colors',
                      settingsTab === 'bring'
                        ? 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-700 text-teal-600 dark:text-teal-400'
                        : 'bg-stone-50 dark:bg-stone-800 border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
                    ]"
                  >
                    🛍️ Bring!
                  </button>
                  <button
                    @click="settingsTab = 'ingredients'"
                    :class="[
                      'px-4 py-2 text-sm font-medium rounded-t-lg border border-b-0 transition-colors',
                      settingsTab === 'ingredients'
                        ? 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300'
                        : 'bg-stone-50 dark:bg-stone-800 border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
                    ]"
                  >
                    🥕 Zutaten
                  </button>
                  <button
                    @click="settingsTab = 'ai'"
                    :class="[
                      'px-4 py-2 text-sm font-medium rounded-t-lg border border-b-0 transition-colors',
                      settingsTab === 'ai'
                        ? 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-700 text-violet-600 dark:text-violet-400'
                        : 'bg-stone-50 dark:bg-stone-800 border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
                    ]"
                  >
                    🤖 KI
                  </button>
                </div>
              </div>

              <!-- Tab-Content -->
              <div class="flex-1 border-stone-200 dark:border-stone-700 border-t min-h-132.5 overflow-y-auto">

                <!-- ========== REWE Tab ========== -->
                <div v-if="settingsTab === 'rewe'" class="space-y-4 p-5">

                  <!-- Mein REWE-Markt (eingeklappt wenn gesetzt) -->
                  <h3 class="flex items-center gap-2 font-medium text-stone-700 dark:text-stone-300 text-sm">
                    <MapPin class="w-4 h-4 text-rewe-500" />
                    Mein REWE-Markt
                  </h3>
                  <div class="bg-stone-50 dark:bg-stone-800/50 -mt-1 border border-stone-200 dark:border-stone-700 rounded-xl overflow-hidden">
                    <!-- Markt-Header (immer sichtbar) -->
                    <button
                      v-if="reweMarketId"
                      @click="reweMarketExpanded = !reweMarketExpanded"
                      class="flex items-center gap-3 hover:bg-stone-100 dark:hover:bg-stone-800 px-4 py-3 w-full text-left transition-colors"
                    >
                      <MapPin class="w-4 h-4 text-rewe-500 shrink-0" />
                      <div class="flex-1 min-w-0">
                        <span class="font-medium text-stone-800 dark:text-stone-200 text-sm">{{ reweMarketName || 'REWE Markt' }}</span>
                        <span class="ml-2 text-stone-400 dark:text-stone-500 text-xs">
                          <span v-if="reweZipCode">PLZ {{ reweZipCode }}</span>
                        </span>
                      </div>
                      <ChevronDown :class="['w-4 h-4 text-stone-400 transition-transform shrink-0', reweMarketExpanded ? 'rotate-180' : '']" />
                    </button>
                    <!-- Kein Markt: Warnung + direkt aufgeklappt -->
                    <div v-else class="px-4 py-3">
                      <div class="flex items-center gap-2 mb-3">
                        <MapPin class="w-4 h-4 text-amber-500 shrink-0" />
                        <span class="font-medium text-amber-700 dark:text-amber-300 text-sm">Kein Markt konfiguriert</span>
                      </div>
                    </div>

                    <!-- Markt-Suche (eingeklappt/ausgeklappt) -->
                    <div v-if="reweMarketExpanded || !reweMarketId" class="space-y-3 px-4 pb-3" :class="{ 'border-t border-stone-200 dark:border-stone-700 pt-3': reweMarketId }">
                      <div class="flex gap-2">
                        <input
                          v-model="reweMarketSearch"
                          type="text"
                          placeholder="PLZ eingeben…"
                          @keyup.enter="searchReweMarkets"
                          class="flex-1 bg-white dark:bg-stone-800 px-3 py-2 border border-stone-300 focus:border-transparent dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-rewe-500 text-stone-800 dark:text-stone-200 placeholder:text-stone-400 text-sm"
                        />
                        <button
                          @click="searchReweMarkets"
                          :disabled="!reweMarketSearch.trim() || reweMarketSearchLoading"
                          class="flex items-center gap-1.5 bg-rewe-500 hover:bg-rewe-600 disabled:opacity-50 px-3 py-2 rounded-lg font-medium text-white text-sm transition-colors"
                        >
                          <Loader2 v-if="reweMarketSearchLoading" class="w-4 h-4 animate-spin" />
                          <Search v-else class="w-4 h-4" />
                        </button>
                      </div>
                      <!-- Suchergebnisse -->
                      <div v-if="reweMarketResults.length" class="space-y-1.5 max-h-40 overflow-y-auto">
                        <button
                          v-for="market in reweMarketResults"
                          :key="market.id"
                          @click="selectReweMarket(market)"
                          :class="[
                            'w-full text-left px-3 py-2 rounded-lg border transition-all text-sm',
                            reweMarketId === String(market.id)
                              ? 'bg-rewe-50 dark:bg-rewe-900/20 border-rewe-300 dark:border-rewe-700'
                              : 'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 hover:border-rewe-300 dark:hover:border-rewe-600'
                          ]"
                        >
                          <span class="font-medium text-stone-800 dark:text-stone-200">{{ market.name }}</span>
                          <p class="text-stone-500 dark:text-stone-400 text-xs">
                            {{ market.street }}, {{ market.zipCode }} {{ market.city }}
                            <span v-if="market.distance != null" class="ml-1 text-stone-400 dark:text-stone-500">
                              · {{ market.distance >= 1000 ? (market.distance / 1000).toFixed(1) + ' km' : market.distance + ' m' }}
                            </span>
                          </p>
                        </button>
                      </div>
                      <p v-if="reweMarketSearchError" class="text-amber-600 dark:text-amber-400 text-xs">
                        {{ reweMarketSearchError }}
                      </p>
                      <!-- Markt entfernen -->
                      <button
                        v-if="reweMarketId"
                        @click="resetReweMarket"
                        class="flex items-center gap-1.5 text-stone-400 hover:text-red-500 text-xs transition-colors"
                      >
                        <RotateCcw class="w-3 h-3" />
                        Markt entfernen
                      </button>
                    </div>
                  </div>

                  <!-- Bestell-Methode (kompakt) -->
                  <div>
                    <h3 class="flex items-center gap-2 mb-2 font-medium text-stone-700 dark:text-stone-300 text-sm">
                      <ShoppingCart class="w-4 h-4 text-rewe-500" />
                      Bestell-Methode
                    </h3>
                    <div class="flex gap-2">
                      <label
                        v-for="opt in reweActionOptions"
                        :key="opt.value"
                        :class="[
                          'flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border cursor-pointer transition-all text-center text-sm font-medium',
                          reweAction === opt.value
                            ? 'bg-rewe-50 dark:bg-rewe-900/20 border-rewe-300 dark:border-rewe-700 text-rewe-700 dark:text-rewe-300'
                            : 'bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:border-stone-300 dark:hover:border-stone-600'
                        ]"
                      >
                        <input type="radio" :value="opt.value" v-model="reweAction" @change="saveReweSettings" class="sr-only" />
                        <span>{{ opt.icon }} {{ opt.label }}</span>
                      </label>
                    </div>
                    <!-- Userscript-Hinweis (nur bei Userscript-Methode) -->
                    <div v-if="reweAction === 'direct'" class="space-y-3 mt-3">
                      <div class="flex items-center gap-3 bg-stone-100 dark:bg-stone-800 px-3 py-2.5 rounded-lg">
                        <div class="flex-1 min-w-0">
                          <p class="text-stone-500 dark:text-stone-400 text-xs leading-relaxed">
                            Benötigt das Tampermonkey-Userscript – legt per 🍳-Button auf rewe.de alles in den Warenkorb.
                          </p>
                        </div>
                        <div class="flex gap-1.5 shrink-0">
                          <button
                            @click="installUserscript"
                            class="flex items-center gap-1 bg-stone-200 hover:bg-stone-300 dark:bg-stone-700 dark:hover:bg-stone-600 px-2.5 py-1 rounded-md font-medium text-stone-600 dark:text-stone-300 text-xs transition-colors"
                          >
                            <Download class="w-3 h-3" />
                            Installieren
                          </button>
                        </div>
                      </div>

                      <!-- API-Key Management -->
                      <div class="space-y-2 bg-stone-100 dark:bg-stone-800 px-3 py-2.5 rounded-lg">
                        <div class="flex justify-between items-center">
                          <span class="font-medium text-stone-600 dark:text-stone-400 text-xs">🔑 API-Key</span>
                          <div class="flex gap-1.5">
                            <button
                              v-if="!apiKeyValue"
                              @click="handleGenerateApiKey"
                              class="flex items-center gap-1 bg-red-700/80 hover:bg-red-700 px-2 py-1 rounded-md font-medium text-white text-xs transition-colors"
                            >
                              <Plus class="w-3 h-3" />
                              Generieren
                            </button>
                            <template v-else>
                              <button
                                @click="handleGenerateApiKey"
                                class="flex items-center gap-1 px-2 py-1 rounded-md text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 text-xs transition-colors"
                                title="Neuen Key generieren (alter wird ungültig)"
                              >
                                <RefreshCw class="w-3 h-3" />
                              </button>
                              <button
                                @click="copyApiKey"
                                class="flex items-center gap-1 px-2 py-1 rounded-md text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 text-xs transition-colors"
                                title="Key kopieren"
                              >
                                <Copy class="w-3 h-3" />
                              </button>
                              <button
                                @click="handleRevokeApiKey"
                                class="flex items-center gap-1 px-2 py-1 rounded-md text-stone-400 hover:text-red-500 text-xs transition-colors"
                                title="Key widerrufen"
                              >
                                <Trash2 class="w-3 h-3" />
                              </button>
                            </template>
                          </div>
                        </div>
                        <div v-if="apiKeyValue" class="flex items-center gap-2">
                          <code class="flex-1 bg-stone-200 dark:bg-stone-700 px-2 py-1 rounded font-mono text-stone-600 dark:text-stone-300 text-xs truncate">
                            {{ showApiKey ? apiKeyValue : '••••••••••••••••••••' }}
                          </code>
                          <button
                            @click="showApiKey = !showApiKey"
                            class="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
                            :title="showApiKey ? 'Key verbergen' : 'Key anzeigen'"
                          >
                            <component :is="showApiKey ? EyeOff : Eye" class="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p v-if="!apiKeyValue" class="text-stone-400 dark:text-stone-500 text-xs">
                          Noch kein Key vorhanden. Generiere einen Key – er wird beim Installieren automatisch ins Userscript eingebettet.
                        </p>
                        <p v-else class="text-stone-400 dark:text-stone-500 text-xs">
                          Im Userscript unter 🍳 → Einstellungen einfügen, falls sich der Key ändert.
                        </p>
                      </div>
                    </div>
                  </div>

                  <!-- Vorschau-Option -->
                  <label class="flex items-center gap-3 cursor-pointer select-none">
                    <div class="relative">
                      <input type="checkbox" v-model="reweShowPreview" @change="saveReweSettings" class="sr-only peer" />
                      <div class="bg-stone-200 dark:bg-stone-700 peer-checked:bg-rewe-500 rounded-full w-10 h-5 transition-colors"></div>
                      <div class="top-0.5 left-0.5 absolute bg-white rounded-full w-4 h-4 transition-transform peer-checked:translate-x-5"></div>
                    </div>
                    <div>
                      <span class="font-medium text-stone-700 dark:text-stone-300 text-sm">Vorschau anzeigen</span>
                      <p class="text-stone-400 dark:text-stone-500 text-xs">Produkt-Übersicht vor dem Bestellen zeigen</p>
                    </div>
                  </label>

                  <div class="border-stone-200 dark:border-stone-700 border-t"></div>

                  <!-- Bevorzugte Produkte -->
                  <h3 class="flex items-center gap-2 font-medium text-stone-700 dark:text-stone-300 text-sm">
                    <Star class="w-4 h-4 text-rewe-500" />
                    Produkt-Zuordnungen
                  </h3>
                  <button
                    @click="openRewePreferences()"
                    class="group flex items-center gap-3 bg-stone-50 hover:bg-stone-100 dark:bg-stone-800 dark:hover:bg-stone-700 px-4 py-3 border border-stone-200 dark:border-stone-700 rounded-xl w-full text-left transition-colors"
                  >
                    <Star class="w-4 h-4 text-rewe-500 shrink-0" />
                    <span class="flex-1 font-medium text-stone-700 dark:text-stone-200 text-sm">Bevorzugte Produkte</span>
                    <ChevronRight class="w-4 h-4 text-stone-400 dark:group-hover:text-stone-300 group-hover:text-stone-600 transition-colors shrink-0" />
                  </button>
                  <p class="-mt-2 px-1 text-stone-400 dark:text-stone-500 text-xs">
                    Wenn du ein REWE-Produkt im Picker änderst, wird es hier gespeichert und beim nächsten Mal automatisch zugeordnet.
                  </p>
                </div>

                <!-- ========== Bring! Tab ========== -->
                <div v-if="settingsTab === 'bring'" class="p-5">

                  <!-- Verbunden -->
                  <div v-if="shoppingStore.bringStatus?.connected" class="space-y-4">
                    <div class="flex items-center gap-3 bg-teal-50 dark:bg-teal-900/20 px-4 py-3 border border-teal-200 dark:border-teal-800 rounded-xl">
                      <div class="flex justify-center items-center bg-teal-500 rounded-full w-8 h-8 text-white shrink-0">
                        <Check class="w-4 h-4" />
                      </div>
                      <div class="min-w-0">
                        <p class="font-medium text-teal-800 dark:text-teal-300 text-sm">Verbunden</p>
                        <p class="text-teal-600 dark:text-teal-400 text-xs truncate">{{ shoppingStore.bringStatus.email }}</p>
                      </div>
                    </div>

                    <!-- Listenauswahl -->
                    <div>
                      <label class="block mb-1.5 font-medium text-stone-600 dark:text-stone-400 text-sm">
                        Standard-Liste
                      </label>
                      <div class="relative">
                        <select
                          v-model="selectedBringList"
                          @change="changeBringList"
                          class="bg-stone-50 dark:bg-stone-800 px-3 py-2.5 pr-10 border border-stone-300 dark:border-stone-600 rounded-lg w-full text-stone-800 dark:text-stone-200 text-sm appearance-none"
                        >
                          <option v-for="list in shoppingStore.bringLists" :key="list.uuid" :value="list.uuid">
                            {{ list.name }}
                          </option>
                        </select>
                        <ChevronDown class="top-1/2 right-3 absolute w-4 h-4 text-stone-400 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>

                    <!-- Trennen -->
                    <button
                      @click="disconnectBring"
                      class="flex justify-center items-center gap-2 hover:bg-red-50 dark:hover:bg-red-900/20 py-2 rounded-lg w-full text-red-500 text-sm transition-colors"
                    >
                      <Unlink class="w-3.5 h-3.5" />
                      Verbindung trennen
                    </button>
                  </div>

                  <!-- Nicht verbunden: Login -->
                  <form v-else @submit.prevent="connectBring" class="space-y-4">
                    <p class="text-stone-500 dark:text-stone-400 text-sm">
                      Melde dich mit deinem Bring!-Account an, um Einkaufslisten mit der Bring!-App zu synchronisieren.
                    </p>
                    <div>
                      <label class="block mb-1 font-medium text-stone-600 dark:text-stone-400 text-sm">E-Mail</label>
                      <input
                        v-model="bringEmail"
                        type="email"
                        placeholder="deine@email.de"
                        required
                        autocomplete="email"
                        class="bg-stone-50 dark:bg-stone-800 px-3 py-2.5 border border-stone-300 focus:border-transparent dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-teal-500 w-full text-stone-800 dark:text-stone-200 placeholder:text-stone-400 text-sm"
                      />
                    </div>
                    <div>
                      <label class="block mb-1 font-medium text-stone-600 dark:text-stone-400 text-sm">Passwort</label>
                      <input
                        v-model="bringPassword"
                        type="password"
                        placeholder="Bring!-Passwort"
                        required
                        autocomplete="current-password"
                        class="bg-stone-50 dark:bg-stone-800 px-3 py-2.5 border border-stone-300 focus:border-transparent dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-teal-500 w-full text-stone-800 dark:text-stone-200 placeholder:text-stone-400 text-sm"
                      />
                    </div>
                    <button
                      type="submit"
                      :disabled="bringConnecting || !bringEmail.trim() || !bringPassword"
                      class="flex justify-center items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 py-3 rounded-xl w-full font-medium text-white transition-colors"
                    >
                      <Loader2 v-if="bringConnecting" class="w-4 h-4 animate-spin" />
                      <LogIn v-else class="w-4 h-4" />
                      Verbinden
                    </button>
                    <p class="text-[10px] text-stone-400 dark:text-stone-500 text-center">
                      🔒 Dein Passwort wird verschlüsselt gespeichert und nur zur Kommunikation mit Bring! verwendet.
                    </p>
                  </form>
                </div>

                <!-- ========== Zutaten Tab ========== -->
                <div v-if="settingsTab === 'ingredients'" class="space-y-6 p-5">

                  <!-- Zusammenfassungen -->
                  <div>
                    <h3 class="flex items-center gap-2 mb-3 font-medium text-stone-700 dark:text-stone-300 text-sm">
                      <Merge class="w-4 h-4 text-violet-500" />
                      Zusammenfassungen
                      <span class="bg-stone-200 dark:bg-stone-700 px-1.5 py-0.5 rounded font-mono text-[10px] text-stone-500 dark:text-stone-400">{{ aliasStore.aliases.length }}</span>
                    </h3>

                    <div v-if="aliasStore.aliases.length === 0" class="py-6 text-stone-400 dark:text-stone-500 text-sm text-center">
                      <Merge class="mx-auto mb-2 w-8 h-8 text-stone-300 dark:text-stone-600" />
                      <p>Keine Zusammenfassungen vorhanden.</p>
                      <p class="mt-1 text-xs">Nutze den „Zusammenfassen"-Button in der Liste, um ähnliche Zutaten zu vereinen.</p>
                    </div>
                    <div v-else class="space-y-2">
                      <div
                        v-for="alias in aliasStore.aliases"
                        :key="alias.id"
                        class="flex justify-between items-center bg-stone-50 dark:bg-stone-800 px-4 py-3 rounded-xl"
                      >
                        <div class="flex items-center gap-2 min-w-0">
                          <span class="text-stone-500 dark:text-stone-400 text-sm truncate">{{ alias.alias_name }}</span>
                          <ArrowRight class="w-3.5 h-3.5 text-stone-300 dark:text-stone-600 shrink-0" />
                          <span class="font-medium text-stone-800 dark:text-stone-200 text-sm truncate">{{ alias.canonical_name }}</span>
                        </div>
                        <button
                          @click="deleteAlias(alias)"
                          class="hover:bg-red-50 dark:hover:bg-red-900/30 ml-2 p-1.5 rounded-lg text-stone-300 hover:text-red-500 dark:hover:text-red-400 dark:text-stone-600 transition-all shrink-0"
                          title="Zusammenfassung löschen"
                        >
                          <Trash2 class="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div class="border-stone-200 dark:border-stone-700 border-t"></div>

                  <!-- Blockierte Zutaten -->
                  <div>
                    <h3 class="flex items-center gap-2 mb-3 font-medium text-stone-700 dark:text-stone-300 text-sm">
                      <Ban class="w-4 h-4 text-red-500" />
                      Blockierte Zutaten
                      <span class="bg-stone-200 dark:bg-stone-700 px-1.5 py-0.5 rounded font-mono text-[10px] text-stone-500 dark:text-stone-400">{{ aliasStore.blockedIngredients.length }}</span>
                    </h3>

                    <div v-if="aliasStore.blockedIngredients.length === 0" class="py-6 text-stone-400 dark:text-stone-500 text-sm text-center">
                      <Ban class="mx-auto mb-2 w-8 h-8 text-stone-300 dark:text-stone-600" />
                      <p>Keine blockierten Zutaten.</p>
                      <p class="mt-1 text-xs">Nutze den „Blockieren"-Button, um Zutaten aus zukünftigen Listen auszuschließen.</p>
                    </div>
                    <div v-else class="space-y-2">
                      <div
                        v-for="blocked in aliasStore.blockedIngredients"
                        :key="blocked.id"
                        class="flex justify-between items-center bg-red-50 dark:bg-red-900/10 px-4 py-3 border border-red-100 dark:border-red-900/30 rounded-xl"
                      >
                        <div class="flex items-center gap-2 min-w-0">
                          <Ban class="w-3.5 h-3.5 text-red-400 dark:text-red-500 shrink-0" />
                          <span class="font-medium text-stone-800 dark:text-stone-200 text-sm truncate">{{ blocked.ingredient_name }}</span>
                        </div>
                        <button
                          @click="unblockIngredient(blocked)"
                          class="hover:bg-green-50 dark:hover:bg-green-900/30 ml-2 px-2.5 py-1 rounded-lg font-medium text-green-600 hover:text-green-700 dark:hover:text-green-300 dark:text-green-400 text-xs transition-all shrink-0"
                          title="Block aufheben"
                        >
                          Freigeben
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- ========== KI Tab ========== -->
                <div v-if="settingsTab === 'ai'" class="space-y-6 p-5">
                  <div>
                    <h3 class="flex items-center gap-2 mb-4 font-medium text-stone-700 dark:text-stone-300 text-sm">
                      <Bot class="w-4 h-4 text-violet-500" />
                      KI-Überprüfung
                    </h3>

                    <!-- Auto-Review beim Generieren -->
                    <label class="group flex items-center gap-3 mb-5 cursor-pointer select-none">
                      <div class="relative">
                        <input
                          type="checkbox"
                          :checked="shoppingStore.userSettings.shopping_auto_ai_review === '1'"
                          @change="toggleUserSetting('shopping_auto_ai_review')"
                          class="sr-only peer"
                        />
                        <div class="bg-stone-200 dark:bg-stone-600 peer-checked:bg-violet-500 rounded-full w-9 h-5 transition-colors" />
                        <div class="top-0.5 left-0.5 absolute bg-white shadow-sm rounded-full w-4 h-4 transition-transform peer-checked:translate-x-4" />
                      </div>
                      <div>
                        <p class="font-medium text-stone-700 dark:text-stone-200 text-sm">Automatischer KI-Check</p>
                        <p class="text-stone-400 dark:text-stone-500 text-xs">Beim Generieren der Einkaufsliste automatisch KI-Review durchführen</p>
                      </div>
                    </label>

                    <!-- Smart Dedup -->
                    <label class="group flex items-center gap-3 mb-5 cursor-pointer select-none">
                      <div class="relative">
                        <input
                          type="checkbox"
                          :checked="shoppingStore.userSettings.shopping_smart_dedup === '1'"
                          @change="toggleUserSetting('shopping_smart_dedup')"
                          class="sr-only peer"
                        />
                        <div class="bg-stone-200 dark:bg-stone-600 peer-checked:bg-violet-500 rounded-full w-9 h-5 transition-colors" />
                        <div class="top-0.5 left-0.5 absolute bg-white shadow-sm rounded-full w-4 h-4 transition-transform peer-checked:translate-x-4" />
                      </div>
                      <div>
                        <p class="font-medium text-stone-700 dark:text-stone-200 text-sm">Intelligente Duplikat-Erkennung</p>
                        <p class="text-stone-400 dark:text-stone-500 text-xs">KI erkennt und vereint ähnliche Zutaten (z.B. Tomaten/Cherry-Tomaten, Singular/Plural)</p>
                      </div>
                    </label>

                    <!-- Auto KI-Check nach REWE -->
                    <label class="group flex items-center gap-3 mb-5 cursor-pointer select-none">
                      <div class="relative">
                        <input
                          type="checkbox"
                          :checked="shoppingStore.userSettings.shopping_auto_ai_after_rewe === '1'"
                          @change="toggleUserSetting('shopping_auto_ai_after_rewe')"
                          class="sr-only peer"
                        />
                        <div class="bg-stone-200 dark:bg-stone-600 peer-checked:bg-violet-500 rounded-full w-9 h-5 transition-colors" />
                        <div class="top-0.5 left-0.5 absolute bg-white shadow-sm rounded-full w-4 h-4 transition-transform peer-checked:translate-x-4" />
                      </div>
                      <div>
                        <p class="font-medium text-stone-700 dark:text-stone-200 text-sm">KI-Check nach REWE-Abgleich</p>
                        <p class="text-stone-400 dark:text-stone-500 text-xs">Nach dem REWE-Produktabgleich automatisch einen KI-Check durchführen</p>
                      </div>
                    </label>

                    <!-- Auto-Merge -->
                    <label class="group flex items-center gap-3 mb-5 cursor-pointer select-none">
                      <div class="relative">
                        <input
                          type="checkbox"
                          :checked="shoppingStore.userSettings.shopping_auto_ai_merge === '1'"
                          @change="toggleUserSetting('shopping_auto_ai_merge')"
                          class="sr-only peer"
                        />
                        <div class="bg-stone-200 dark:bg-stone-600 peer-checked:bg-violet-500 rounded-full w-9 h-5 transition-colors" />
                        <div class="top-0.5 left-0.5 absolute bg-white shadow-sm rounded-full w-4 h-4 transition-transform peer-checked:translate-x-4" />
                      </div>
                      <div>
                        <p class="font-medium text-stone-700 dark:text-stone-200 text-sm">Automatisch zusammenführen</p>
                        <p class="text-stone-400 dark:text-stone-500 text-xs">Erkannte Duplikate automatisch zusammenführen (z.B. 2× Halloumi → 1 Eintrag mit Gesamtmenge)</p>
                      </div>
                    </label>

                    <!-- Auto-Adjust -->
                    <label class="group flex items-center gap-3 mb-5 cursor-pointer select-none">
                      <div class="relative">
                        <input
                          type="checkbox"
                          :checked="shoppingStore.userSettings.shopping_auto_ai_adjust === '1'"
                          @change="toggleUserSetting('shopping_auto_ai_adjust')"
                          class="sr-only peer"
                        />
                        <div class="bg-stone-200 dark:bg-stone-600 peer-checked:bg-violet-500 rounded-full w-9 h-5 transition-colors" />
                        <div class="top-0.5 left-0.5 absolute bg-white shadow-sm rounded-full w-4 h-4 transition-transform peer-checked:translate-x-4" />
                      </div>
                      <div>
                        <p class="font-medium text-stone-700 dark:text-stone-200 text-sm">Automatisch Menge anpassen</p>
                        <p class="text-stone-400 dark:text-stone-500 text-xs">Mengenvorschläge der KI automatisch übernehmen (z.B. 4 Stk Tortillas statt 4 Pkg)</p>
                      </div>
                    </label>

                    <div class="border-stone-200 dark:border-stone-700 border-t"></div>

                    <!-- Info -->
                    <div class="flex items-start gap-2 mt-4 text-stone-400 dark:text-stone-500 text-xs">
                      <Info class="mt-0.5 w-4 h-4 shrink-0" />
                      <p>
                        Der KI-Check prüft: fehlende Zutaten, Mengenlogik (z.B. 4 Tortillas ≠ 4 Packungen),
                        Vorrats-Abdeckung, Plausibilität, Duplikate, REWE-Produkt-Zuordnung und fehlende REWE-Artikel.
                        Du kannst den Check auch jederzeit manuell über den „KI-Check"-Button starten.
                      </p>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- REWE Produkt-Präferenzen Modal -->
      <Teleport to="body">
        <Transition name="fade">
          <div v-if="showRewePreferences" class="z-50 fixed inset-0 flex justify-center items-end sm:items-center bg-black/50 p-4" @click.self="showRewePreferences = false">
            <div class="flex flex-col bg-white dark:bg-stone-900 shadow-2xl rounded-2xl w-full max-w-xl max-h-[85vh] overflow-hidden">

              <!-- Header -->
              <div class="flex justify-between items-center px-5 py-4 border-stone-200 dark:border-stone-700 border-b shrink-0">
                <div>
                  <h2 class="font-display font-bold text-stone-800 dark:text-stone-100 text-lg">🏪 Bevorzugte Produkte</h2>
                  <p class="mt-0.5 text-stone-500 dark:text-stone-400 text-xs">
                    {{ rewePreferences.length }} gespeicherte Zuordnungen
                  </p>
                </div>
                <button @click="showRewePreferences = false" class="hover:bg-stone-100 dark:hover:bg-stone-800 p-1.5 rounded-lg text-stone-400 transition-colors">
                  <X class="w-5 h-5" />
                </button>
              </div>

              <!-- Suche -->
              <div class="px-4 pt-3 shrink-0" v-if="rewePreferences.length > 5">
                <div class="relative">
                  <Search class="top-1/2 left-3 absolute w-4 h-4 text-stone-400 -translate-y-1/2" />
                  <input
                    v-model="prefSearch"
                    type="text"
                    placeholder="Zutat suchen…"
                    class="bg-stone-50 dark:bg-stone-800 py-2 pr-4 pl-9 border border-stone-200 dark:border-stone-700 rounded-lg outline-none w-full text-sm"
                  />
                </div>
              </div>

              <!-- Liste -->
              <div class="flex-1 overflow-y-auto">
                <div v-if="rewePreferencesLoading" class="flex justify-center py-12">
                  <Loader2 class="w-6 h-6 text-stone-400 animate-spin" />
                </div>

                <div v-else-if="filteredPreferences.length === 0" class="px-5 py-12 text-center">
                  <Package class="mx-auto mb-3 w-12 h-12 text-stone-300 dark:text-stone-600" />
                  <p class="font-medium text-stone-500 dark:text-stone-400 text-sm">
                    {{ rewePreferences.length === 0 ? 'Noch keine Zuordnungen gespeichert' : 'Keine Treffer' }}
                  </p>
                  <p v-if="rewePreferences.length === 0" class="mt-1 text-stone-400 dark:text-stone-500 text-xs">
                    Beim REWE-Abgleich werden deine Produktauswahlen automatisch gespeichert.
                  </p>
                </div>

                <div v-else class="divide-y divide-stone-100 dark:divide-stone-800">
                  <div
                    v-for="pref in filteredPreferences"
                    :key="pref.id"
                    class="flex items-start gap-3 px-4 py-3 transition-colors"
                  >
                    <!-- Produktbild -->
                    <img
                      v-if="pref.rewe_image_url"
                      :src="pref.rewe_image_url"
                      :alt="pref.rewe_product_name"
                      class="rounded-lg w-12 h-12 object-contain shrink-0"
                    />
                    <div v-else class="flex justify-center items-center bg-stone-100 dark:bg-stone-800 rounded-lg w-12 h-12 text-xl shrink-0">🏪</div>

                    <!-- Info -->
                    <div class="flex-1 min-w-0">
                      <p class="font-medium text-stone-800 dark:text-stone-200 text-sm capitalize">{{ pref.ingredient_name }}</p>
                      <a
                        v-if="pref.rewe_product_id"
                        :href="reweProductUrl(pref.rewe_product_name, pref.rewe_product_id)"
                        target="_blank"
                        rel="noopener"
                        class="block mt-0.5 text-stone-500 hover:text-rewe-600 dark:hover:text-rewe-400 dark:text-stone-400 text-xs truncate transition-colors"
                      >
                        → {{ pref.rewe_product_name }}
                        <ExternalLink class="inline-block -mt-0.5 ml-0.5 w-3 h-3" />
                      </a>
                      <p v-else class="mt-0.5 text-stone-500 dark:text-stone-400 text-xs truncate">
                        → {{ pref.rewe_product_name }}
                      </p>
                      <div class="flex items-center gap-3 mt-1">
                        <span v-if="pref.rewe_price" class="font-medium text-stone-600 dark:text-stone-300 text-xs">{{ formatPrice(pref.rewe_price) }}</span>
                        <span v-if="pref.rewe_package_size" class="text-[11px] text-stone-400 dark:text-stone-500">{{ pref.rewe_package_size }}</span>
                        <span class="text-[11px] text-stone-400 dark:text-stone-500">{{ pref.times_selected }}× gewählt</span>
                      </div>
                    </div>

                    <!-- Aktionen -->
                    <div class="flex items-center gap-1 shrink-0">
                      <button
                        @click="startChangePref(pref)"
                        class="hover:bg-stone-100 dark:hover:bg-stone-800 p-1.5 rounded-lg text-stone-400 hover:text-rewe-600 transition-colors"
                        title="Anderes Produkt wählen"
                      >
                        <ArrowRightLeft class="w-4 h-4" />
                      </button>
                      <button
                        @click="removePref(pref)"
                        class="hover:bg-red-50 dark:hover:bg-red-900/20 p-1.5 rounded-lg text-stone-400 hover:text-red-500 transition-colors"
                        title="Zuordnung vergessen"
                      >
                        <Trash2 class="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Footer -->
              <div v-if="rewePreferences.length > 0" class="flex justify-between items-center px-5 py-3 border-stone-200 dark:border-stone-700 border-t shrink-0">
                <button
                  @click="clearAllPrefs"
                  class="flex items-center gap-1.5 text-red-500 hover:text-red-600 text-sm transition-colors"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                  Alle zurücksetzen
                </button>
                <button
                  @click="showRewePreferences = false"
                  class="bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 px-4 py-2 rounded-lg font-medium text-stone-700 dark:text-stone-300 text-sm transition-colors"
                >
                  Schließen
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- Präferenz ändern: Produkt-Suche (Inline-Overlay) -->
      <Teleport to="body">
        <Transition name="fade">
          <div v-if="changingPref" class="z-60 fixed inset-0 flex justify-center items-end sm:items-center bg-black/50 p-4" @click.self="changingPref = null">
            <div class="flex flex-col bg-white dark:bg-stone-900 shadow-2xl rounded-2xl w-full max-w-md max-h-[70vh] overflow-hidden">
              <!-- Header -->
              <div class="flex justify-between items-center px-5 py-4 border-stone-200 dark:border-stone-700 border-b shrink-0">
                <div>
                  <h2 class="font-display font-bold text-stone-800 dark:text-stone-100 text-base">Produkt ändern</h2>
                  <p class="mt-0.5 text-stone-500 dark:text-stone-400 text-xs capitalize">{{ changingPref.ingredient_name }}</p>
                </div>
                <button @click="changingPref = null" class="hover:bg-stone-100 dark:hover:bg-stone-800 p-1.5 rounded-lg text-stone-400 transition-colors">
                  <X class="w-5 h-5" />
                </button>
              </div>

              <!-- Suche -->
              <div class="px-4 pt-3 shrink-0">
                <div class="relative">
                  <Search class="top-1/2 left-3 absolute w-4 h-4 text-stone-400 -translate-y-1/2" />
                  <input
                    ref="prefProductSearchInput"
                    v-model="prefProductQuery"
                    @input="debouncedPrefSearch"
                    type="text"
                    placeholder="REWE-Produkt suchen…"
                    class="bg-stone-50 dark:bg-stone-800 py-2 pr-4 pl-9 border border-stone-200 dark:border-stone-700 rounded-lg outline-none w-full text-sm"
                  />
                </div>
              </div>

              <!-- Ergebnisse -->
              <div class="flex-1 overflow-y-auto">
                <div v-if="prefProductSearching" class="flex justify-center py-8">
                  <Loader2 class="w-5 h-5 text-stone-400 animate-spin" />
                </div>
                <div v-else-if="prefProductResults.length === 0 && prefProductQuery" class="px-5 py-8 text-center">
                  <p class="text-stone-400 text-sm">Keine Produkte gefunden.</p>
                </div>
                <div v-else class="divide-y divide-stone-100 dark:divide-stone-800">
                  <button
                    v-for="product in prefProductResults"
                    :key="product.id"
                    @click="selectPrefProduct(product)"
                    class="flex items-center gap-3 hover:bg-stone-50 dark:hover:bg-stone-800 px-4 py-3 w-full text-left transition-colors"
                  >
                    <img
                      v-if="product.imageUrl"
                      :src="product.imageUrl"
                      :alt="product.name"
                      class="rounded-lg w-10 h-10 object-contain shrink-0"
                    />
                    <div v-else class="flex justify-center items-center bg-stone-100 dark:bg-stone-800 rounded-lg w-10 h-10 text-lg shrink-0">🏪</div>
                    <div class="flex-1 min-w-0">
                      <p class="font-medium text-stone-800 dark:text-stone-200 text-sm truncate">{{ product.name }}</p>
                      <p class="text-stone-400 dark:text-stone-500 text-xs">{{ product.packageSize }}</p>
                    </div>
                    <span class="font-semibold text-stone-700 dark:text-stone-200 text-sm shrink-0">{{ formatPrice(product.price) }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- REWE Vorschau-Modal -->
      <Teleport to="body">
        <Transition name="fade">
          <div v-if="showRewePreview" class="z-50 fixed inset-0 flex justify-center items-end sm:items-center bg-black/50 p-4" @click.self="showRewePreview = false">
            <div class="flex flex-col bg-white dark:bg-stone-900 shadow-2xl rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden">
              <!-- Header -->
              <div class="flex justify-between items-center px-5 py-4 border-stone-200 dark:border-stone-700 border-b">
                <div>
                  <h2 class="font-display font-bold text-stone-800 dark:text-stone-100 text-lg">🏪 REWE-Bestellung</h2>
                  <p class="mt-0.5 text-stone-500 dark:text-stone-400 text-xs">
                    {{ shoppingStore.reweLinkedItems.length }} Produkte · {{ formatPrice(estimatedTotal) }}
                  </p>
                </div>
                <button @click="showRewePreview = false" class="hover:bg-stone-100 dark:hover:bg-stone-800 p-1.5 rounded-lg text-stone-400 transition-colors">
                  <X class="w-5 h-5" />
                </button>
              </div>

              <!-- Produktliste -->
              <div class="flex-1 divide-y divide-stone-100 dark:divide-stone-800 overflow-y-auto">
                <div
                  v-for="item in shoppingStore.reweLinkedItems"
                  :key="item.id"
                  class="flex items-center gap-3 hover:bg-stone-50 dark:hover:bg-stone-800/30 px-5 py-3 transition-colors"
                >
                  <!-- Produktbild -->
                  <div class="flex justify-center items-center bg-white dark:bg-stone-700 rounded-lg w-10 h-10 overflow-hidden shrink-0">
                    <img
                      v-if="item.rewe_product.imageUrl"
                      :src="item.rewe_product.imageUrl"
                      :alt="item.rewe_product.name"
                      class="w-full h-full object-contain"
                      loading="lazy"
                    />
                    <span v-else class="text-lg">🏪</span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="font-medium text-stone-800 dark:text-stone-200 text-sm truncate">{{ item.ingredient_name }}</p>
                    <p class="text-stone-500 dark:text-stone-400 text-xs truncate">
                      <span v-if="item.rewe_product.quantity > 1" class="font-semibold text-rewe-500">{{ item.rewe_product.quantity }}×</span>
                      {{ item.rewe_product.name }}
                    </p>
                    <p v-if="item.rewe_product.packageSize" class="text-[10px] text-stone-400 dark:text-stone-500">{{ item.rewe_product.packageSize }}</p>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <span class="font-semibold tabular-nums text-stone-700 dark:text-stone-300 text-sm">{{ formatPrice(item.rewe_product.price * (item.rewe_product.quantity || 1)) }}</span>
                    <a
                      :href="item.rewe_product.url"
                      target="_blank"
                      rel="noopener"
                      class="flex items-center gap-1 bg-rewe-50 hover:bg-rewe-100 dark:bg-rewe-900/30 dark:hover:bg-rewe-900/50 px-2.5 py-1.5 rounded-lg font-medium text-rewe-600 dark:text-rewe-400 text-xs transition-colors"
                    >
                      <ExternalLink class="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>

              <!-- Footer mit Aktions-Button -->
              <div class="bg-stone-50 dark:bg-stone-800/50 px-5 py-4 border-stone-200 dark:border-stone-700 border-t">
                <button
                  @click="hasReweWarnings ? (reweWarningFromPreview = true, showReweWarning = true) : executeReweAction()"
                  :disabled="cartScriptLoading"
                  class="flex justify-center items-center gap-2 bg-rewe-500 hover:bg-rewe-600 disabled:opacity-50 py-3 rounded-xl w-full font-medium text-white transition-colors"
                >
                  <Loader2 v-if="cartScriptLoading" class="w-4 h-4 animate-spin" />
                  <component v-else :is="currentReweActionIcon" class="w-4 h-4" />
                  {{ currentReweActionLabel }}
                </button>
                <p class="mt-2 text-[10px] text-stone-400 dark:text-stone-500 text-center">
                  Geschätzte Kosten: {{ formatPrice(estimatedTotal) }}
                </p>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- REWE Produkt-Picker Modal -->
      <Teleport to="body">
        <Transition name="fade">
          <div v-if="pickerItem" class="z-50 fixed inset-0 flex justify-center items-end sm:items-center bg-black/50 p-4" @click.self="closeProductPicker">
            <div class="flex flex-col bg-white dark:bg-stone-900 shadow-2xl rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden">

              <!-- Header -->
              <div class="px-5 py-4 border-stone-200 dark:border-stone-700 border-b">
                <div class="flex justify-between items-start">
                  <div>
                    <h2 class="font-display font-bold text-stone-800 dark:text-stone-100 text-lg">
                      <Search class="inline -mt-0.5 mr-1 w-4 h-4" />
                      Produkt wählen
                    </h2>
                    <p class="mt-1 text-stone-500 dark:text-stone-400 text-sm">
                      {{ pickerItem.ingredient_name }}
                      <span v-if="pickerItem.amount" class="text-stone-400 dark:text-stone-500">
                        · {{ pickerItem.amount }}{{ pickerItem.unit ? ' ' + pickerItem.unit : '' }}
                      </span>
                    </p>
                  </div>
                  <button @click="closeProductPicker" class="hover:bg-stone-100 dark:hover:bg-stone-800 p-1.5 rounded-lg text-stone-400 transition-colors">
                    <X class="w-5 h-5" />
                  </button>
                </div>
                <!-- Aktuell zugewiesenes Produkt -->
                <div v-if="pickerItem.rewe_product" class="flex items-center gap-1.5 bg-green-50 dark:bg-green-900/20 mt-2 px-2.5 py-1.5 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-400 text-xs">
                  <Check class="w-3 h-3 shrink-0" />
                  Aktuell: <span v-if="pickerItem.rewe_product.quantity > 1">{{ pickerItem.rewe_product.quantity }}× </span>{{ pickerItem.rewe_product.name }} – {{ formatPrice(pickerItem.rewe_product.price * (pickerItem.rewe_product.quantity || 1)) }}
                </div>
                <!-- Suchfeld -->
                <form @submit.prevent="searchInPicker" class="flex gap-2 mt-3">
                  <div class="relative flex-1">
                    <Search class="top-1/2 left-3 absolute w-4 h-4 text-stone-400 -translate-y-1/2 pointer-events-none" />
                    <input
                      v-model="pickerSearch"
                      type="text"
                      placeholder="Suchbegriff ändern…"
                      class="bg-stone-50 dark:bg-stone-800 py-2 pr-3 pl-9 border border-stone-300 focus:border-transparent dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-rewe-500 w-full text-stone-800 dark:text-stone-200 placeholder:text-stone-400 text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    :disabled="pickerLoading || pickerSearch.trim().length < 2"
                    class="bg-rewe-500 hover:bg-rewe-600 disabled:opacity-50 px-3 py-2 rounded-lg font-medium text-white text-sm transition-colors shrink-0"
                  >
                    Suchen
                  </button>
                </form>
              </div>

              <!-- Produktliste -->
              <div class="flex-1 overflow-y-auto">
                <!-- Ladezustand -->
                <div v-if="pickerLoading" class="flex flex-col items-center gap-3 py-12">
                  <div class="border-2 border-rewe-200 border-t-rewe-600 rounded-full w-8 h-8 animate-spin" />
                  <p class="text-stone-500 dark:text-stone-400 text-sm">Suche bei REWE…</p>
                </div>

                <!-- Keine Ergebnisse -->
                <div v-else-if="pickerProducts.length === 0" class="py-12 text-center">
                  <div class="mb-2 text-4xl">🔍</div>
                  <p class="text-stone-500 dark:text-stone-400 text-sm">Keine Produkte gefunden.</p>
                </div>

                <!-- Ergebnisliste -->
                <div v-else class="divide-y divide-stone-100 dark:divide-stone-800">
                  <button
                    v-for="(product, idx) in pickerProducts"
                    :key="product.id"
                    @click="selectProduct(product)"
                    class="group flex items-center gap-3 hover:bg-stone-50 dark:hover:bg-stone-800/40 px-5 py-3 w-full text-left transition-colors"
                    :class="{
                      'bg-green-50/50 dark:bg-green-900/10': pickerItem.rewe_product?.id === product.id,
                    }"
                  >
                    <!-- Produktbild -->
                    <div class="flex justify-center items-center bg-white dark:bg-stone-700 border border-stone-100 dark:border-stone-600 rounded-lg w-12 h-12 overflow-hidden shrink-0">
                      <img
                        v-if="product.imageUrl"
                        :src="product.imageUrl"
                        :alt="product.name"
                        class="w-full h-full object-contain"
                        loading="lazy"
                      />
                      <div v-else class="flex justify-center items-center rounded-full w-7 h-7 font-bold text-xs shrink-0"
                        :class="idx === 0
                          ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                          : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'"
                      >
                        <Tag v-if="idx === 0" class="w-3.5 h-3.5" />
                        <span v-else>{{ idx + 1 }}</span>
                      </div>
                    </div>

                    <!-- Produktinfo -->
                    <div class="flex-1 min-w-0">
                      <p class="font-medium text-stone-800 dark:group-hover:text-rewe-400 dark:text-stone-200 group-hover:text-rewe-600 text-sm truncate transition-colors">
                        {{ product.name }}
                      </p>
                      <p class="flex items-center gap-2 mt-0.5 text-stone-500 dark:text-stone-400 text-xs">
                        <span v-if="product.packageSize">{{ product.packageSize }}</span>
                        <span v-if="idx === 0" class="inline-flex items-center gap-0.5 bg-green-100 dark:bg-green-900/40 px-1.5 py-0.5 rounded font-medium text-[10px] text-green-700 dark:text-green-400">
                          Relevantester
                        </span>
                        <span v-if="pickerItem.rewe_product?.id === product.id" class="inline-flex items-center gap-0.5 bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded font-medium text-[10px] text-blue-700 dark:text-blue-400">
                          <Check class="w-2.5 h-2.5" /> Ausgewählt
                        </span>
                      </p>
                    </div>

                    <!-- Preis -->
                    <div class="text-right shrink-0">
                      <p class="font-bold tabular-nums text-sm"
                        :class="idx === 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-stone-700 dark:text-stone-300'"
                      >
                        {{ formatPrice(product.price) }}
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              <!-- Footer -->
              <div class="bg-stone-50 dark:bg-stone-800/50 px-5 py-3 border-stone-200 dark:border-stone-700 border-t">
                <p class="text-[10px] text-stone-400 dark:text-stone-500 text-center">
                  <Heart class="inline -mt-0.5 mr-0.5 w-3 h-3" />
                  Deine Auswahl wird gespeichert und beim nächsten Matching automatisch verwendet.
                </p>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- REWE Warenkorb-Script Modal -->
      <Teleport to="body">
        <Transition name="fade">
          <div v-if="showCartScript" class="z-50 fixed inset-0 flex justify-center items-end sm:items-center bg-black/50 p-4" @click.self="showCartScript = false">
            <div class="flex flex-col bg-white dark:bg-stone-900 shadow-2xl rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden">
              <!-- Header -->
              <div class="flex justify-between items-center px-5 py-4 border-stone-200 dark:border-stone-700 border-b">
                <div>
                  <h2 class="font-display font-bold text-stone-800 dark:text-stone-100 text-lg">🛒 REWE Warenkorb-Script</h2>
                  <p class="mt-0.5 text-stone-500 dark:text-stone-400 text-xs">Automatisch Produkte in den Warenkorb legen</p>
                </div>
                <button @click="showCartScript = false" class="hover:bg-stone-100 dark:hover:bg-stone-800 p-1.5 rounded-lg text-stone-400 transition-colors">
                  <X class="w-5 h-5" />
                </button>
              </div>

              <!-- Anleitung -->
              <div class="flex-1 space-y-4 p-5 overflow-y-auto">
                <div class="bg-amber-50 dark:bg-amber-900/20 px-4 py-3 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-300 text-sm">
                  <p class="mb-1 font-semibold">⚡ So funktioniert's:</p>
                  <ol class="space-y-1.5 text-xs list-decimal list-inside">
                    <li>Öffne <a href="https://www.rewe.de/shop/" target="_blank" rel="noopener" class="font-medium underline hover:no-underline">www.rewe.de/shop</a> und logge dich ein</li>
                    <li>Wähle deinen Markt bzw. dein Liefergebiet aus</li>
                    <li>Öffne die Browser-Konsole: <kbd class="bg-amber-200/60 dark:bg-amber-800/60 px-1 py-0.5 rounded font-mono text-[11px]">F12</kbd> → Tab „Konsole"</li>
                    <li>Kopiere das Script unten und füge es in die Konsole ein</li>
                    <li>Drücke <kbd class="bg-amber-200/60 dark:bg-amber-800/60 px-1 py-0.5 rounded font-mono text-[11px]">Enter</kbd> und warte kurz</li>
                  </ol>
                </div>

                <div class="bg-blue-50 dark:bg-blue-900/20 px-4 py-3 border border-blue-200 dark:border-blue-800 rounded-xl text-blue-800 dark:text-blue-300 text-xs">
                  <p class="mb-1 font-semibold">💡 Wie funktioniert das Script?</p>
                  <p>Das Script lädt für jedes Produkt die Produktseite, ermittelt daraus die marktspezifische <em>Listing-ID</em> und fügt es direkt über die REWE Basket-API in deinen Warenkorb ein. Falls die Listing-ID nicht gefunden wird, öffnet sich ein Popup als Fallback.</p>
                </div>

                <!-- Script zum Kopieren -->
                <div class="relative">
                  <pre class="bg-stone-900 dark:bg-stone-950 p-4 rounded-xl max-h-48 overflow-auto font-mono text-[11px] text-green-400 break-all leading-relaxed whitespace-pre-wrap select-all">{{ cartScript }}</pre>
                  <button
                    @click="copyCartScript"
                    :class="[
                      'absolute top-2 right-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                      cartScriptCopied
                        ? 'bg-green-600 text-white'
                        : 'bg-stone-700 hover:bg-stone-600 text-stone-300'
                    ]"
                  >
                    <ClipboardCopy class="w-3.5 h-3.5" />
                    {{ cartScriptCopied ? 'Kopiert!' : 'Kopieren' }}
                  </button>
                </div>

                <p class="text-[10px] text-stone-400 dark:text-stone-500 text-center">
                  ⚠️ Experimentelles Feature – funktioniert nur auf www.rewe.de (eingeloggt, Markt gewählt).
                  Das Script nutzt die REWE Basket-API mit Listing-IDs. Keine Garantie.
                </p>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>
    </div>

    <!-- Keine Liste vorhanden -->
    <div v-else-if="!shoppingStore.loading" class="py-10 text-center">
      <div class="mb-4 text-6xl">🛒</div>
      <h2 class="mb-2 font-semibold text-stone-700 dark:text-stone-300 text-xl">Keine aktive Einkaufsliste</h2>
      <p class="mx-auto mb-6 max-w-md text-stone-500 dark:text-stone-400">
        Erstelle eine Einkaufsliste aus deinem Wochenplan. Vorhandene Vorräte werden automatisch berücksichtigt.
      </p>

      <!-- Verlauf: vorherige Listen -->
      <div v-if="shoppingStore.listHistory.length > 0" class="mx-auto max-w-lg text-left">
        <h3 class="flex items-center gap-2 mb-3 font-semibold text-stone-600 dark:text-stone-400 text-sm">
          <History class="w-4 h-4" />
          Vorherige Einkaufslisten
        </h3>
        <div class="space-y-2">
          <div
            v-for="hl in shoppingStore.listHistory.slice(0, 10)"
            :key="hl.id"
            class="flex items-center gap-3 bg-white hover:bg-stone-50 dark:bg-stone-900 dark:hover:bg-stone-800 px-4 py-3 border border-stone-200 dark:border-stone-800 rounded-xl transition-colors cursor-pointer"
            @click="reactivateHistoryList(hl.id)"
          >
            <div class="flex-1 min-w-0">
              <p class="font-medium text-stone-700 dark:text-stone-200 text-sm truncate">
                {{ hl.name || 'Einkaufsliste' }}
              </p>
              <p class="text-stone-400 dark:text-stone-500 text-xs">
                {{ formatHistoryDate(hl.created_at) }}
                · {{ hl.checked_count || 0 }}/{{ hl.item_count || 0 }} erledigt
              </p>
            </div>
            <button
              class="flex items-center gap-1.5 bg-primary-50 hover:bg-primary-100 dark:bg-primary-900/30 dark:hover:bg-primary-900/50 px-3 py-1.5 rounded-lg font-medium text-primary-700 dark:text-primary-300 text-xs transition-colors shrink-0"
              @click.stop="reactivateHistoryList(hl.id)"
            >
              <RotateCcw class="w-3.5 h-3.5" />
              Laden
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Laden -->
    <div v-else class="flex justify-center py-16">
      <div class="border-2 border-primary-200 border-t-primary-600 rounded-full w-8 h-8 animate-spin" />
    </div>

    <!-- "Einkauf abschließen?"-Dialog nach Bring!/REWE -->
    <ConfirmDialog
      v-model="showCompletePurchasePrompt"
      variant="success"
      title="Einkauf abschließen?"
      message="Die Artikel wurden erfolgreich übermittelt. Soll der Einkauf jetzt abgeschlossen und die Zutaten in den Vorratsschrank übernommen werden?"
      confirm-text="Ja, abschließen 🎉"
      cancel-text="Nein, noch nicht"
      @confirm="confirmCompletePurchase"
    />

    <!-- Bestätigungs-Dialog für Präferenzen zurücksetzen -->
    <ConfirmDialog
      v-model="showClearPrefsConfirm"
      variant="warning"
      title="Zuordnungen zurücksetzen?"
      :message="`Alle ${rewePreferences.length} gespeicherten Zuordnungen wirklich zurücksetzen?`"
      confirm-text="Zurücksetzen"
      cancel-text="Abbrechen"
      @confirm="executeClearAllPrefs"
    />


    <!-- REWE Bestell-Warnung (fehlende Zuordnungen / hohe Mengen) -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showReweWarning" class="z-50 fixed inset-0 flex justify-center items-end sm:items-center bg-black/50 p-4" @click.self="showReweWarning = false">
          <div class="bg-white dark:bg-stone-900 shadow-2xl rounded-2xl w-full max-w-md overflow-hidden">
            <div class="flex justify-between items-center px-5 py-4 border-stone-200 dark:border-stone-700 border-b">
              <h2 class="flex items-center gap-2 font-display font-bold text-stone-800 dark:text-stone-100 text-lg">
                <AlertTriangle class="w-5 h-5 text-amber-500" />
                Hinweise vor Bestellung
              </h2>
              <button @click="showReweWarning = false" class="hover:bg-stone-100 dark:hover:bg-stone-800 p-1.5 rounded-lg text-stone-400 transition-colors">
                <X class="w-5 h-5" />
              </button>
            </div>
            <div class="space-y-4 p-5 max-h-80 overflow-y-auto">
              <!-- Nicht zugeordnete Artikel -->
              <div v-if="reweUnmatchedItems.length > 0">
                <p class="flex items-center gap-1.5 mb-2 font-semibold text-stone-700 dark:text-stone-200 text-sm">
                  <Search class="w-4 h-4 text-stone-400" />
                  {{ reweUnmatchedItems.length }} Artikel ohne REWE-Zuordnung
                </p>
                <ul class="space-y-1 pl-6 text-stone-500 dark:text-stone-400 text-sm list-disc">
                  <li v-for="item in reweUnmatchedItems" :key="item.id">{{ item.ingredient_name }}</li>
                </ul>
                <p class="mt-1.5 text-stone-400 dark:text-stone-500 text-xs">Diese Artikel werden nicht in den Warenkorb übernommen.</p>
              </div>

              <!-- Hohe Mengen -->
              <div v-if="reweHighQtyItems.length > 0">
                <p class="flex items-center gap-1.5 mb-2 font-semibold text-amber-600 dark:text-amber-400 text-sm">
                  <AlertTriangle class="w-4 h-4" />
                  Ungewöhnlich hohe Mengen
                </p>
                <ul class="space-y-1 pl-6 text-stone-600 dark:text-stone-300 text-sm list-disc">
                  <li v-for="item in reweHighQtyItems" :key="item.id">
                    <span class="font-semibold text-amber-600 dark:text-amber-400">{{ item.rewe_product.quantity }}×</span>
                    {{ item.rewe_product.name }}
                    <span class="text-stone-400">({{ formatPrice(item.rewe_product.price * item.rewe_product.quantity) }})</span>
                  </li>
                </ul>
                <p class="mt-1.5 text-stone-400 dark:text-stone-500 text-xs">Bitte prüfe, ob die Mengen korrekt sind.</p>
              </div>
            </div>
            <div class="flex justify-end gap-3 px-5 py-4 border-stone-200 dark:border-stone-700 border-t">
              <button @click="showReweWarning = false" class="hover:bg-stone-100 dark:hover:bg-stone-800 px-4 py-2 rounded-xl font-medium text-stone-600 dark:text-stone-300 text-sm transition-colors">
                Abbrechen
              </button>
              <button @click="confirmReweWarning" class="flex items-center gap-2 bg-rewe-500 hover:bg-rewe-600 px-5 py-2 rounded-xl font-medium text-white text-sm transition-colors">
                <ShoppingCart class="w-4 h-4" />
                Trotzdem fortfahren
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Dialog: Bestehende Einkaufsliste vorhanden -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showListExistsDialog" class="z-50 fixed inset-0 flex justify-center items-end sm:items-center bg-black/50 p-4" @click.self="showListExistsDialog = false; pendingGenerateOptions = null">
          <div class="bg-white dark:bg-stone-900 shadow-2xl rounded-2xl w-full max-w-md overflow-hidden">
            <!-- Header -->
            <div class="flex justify-between items-center px-5 py-4 border-stone-200 dark:border-stone-700 border-b">
              <h2 class="flex items-center gap-2 font-display font-bold text-stone-800 dark:text-stone-100 text-lg">
                <AlertTriangle class="w-5 h-5 text-amber-500" />
                Einkaufsliste vorhanden
              </h2>
              <button @click="showListExistsDialog = false; pendingGenerateOptions = null" class="hover:bg-stone-100 dark:hover:bg-stone-800 p-1.5 rounded-lg text-stone-400 transition-colors">
                <X class="w-5 h-5" />
              </button>
            </div>
            <div class="p-5">
              <p class="text-stone-600 dark:text-stone-300 text-sm">
                Es befinden sich bereits <span class="font-semibold">{{ shoppingStore.items.length }} Artikel</span> auf deiner Einkaufsliste.
                Sollen die neuen Artikel hinzugefügt oder die Liste ersetzt werden?
              </p>
            </div>
            <div class="flex sm:flex-row flex-col justify-end gap-2 px-5 py-4 border-stone-200 dark:border-stone-700 border-t">
              <button @click="showListExistsDialog = false; pendingGenerateOptions = null" class="hover:bg-stone-100 dark:hover:bg-stone-800 px-4 py-2.5 rounded-xl font-medium text-stone-500 dark:text-stone-400 text-sm transition-colors">
                Abbrechen
              </button>
              <button @click="onListExistsReplace" class="flex justify-center items-center gap-2 bg-stone-600 hover:bg-stone-700 px-4 py-2.5 rounded-xl font-medium text-white text-sm transition-colors">
                <RefreshCw class="w-4 h-4" />
                Liste ersetzen
              </button>
              <button @click="onListExistsAppend" class="flex justify-center items-center gap-2 bg-primary-600 hover:bg-primary-700 px-4 py-2.5 rounded-xl font-medium text-white text-sm transition-colors">
                <Plus class="w-4 h-4" />
                Hinzufügen
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Merge-Dialog -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showMergeDialog" class="z-50 fixed inset-0 flex justify-center items-end sm:items-center bg-black/50 p-4" @click.self="cancelMerge">
          <div class="bg-white dark:bg-stone-900 shadow-2xl rounded-2xl w-full max-w-sm overflow-hidden">
            <!-- Header -->
            <div class="flex justify-between items-center px-5 py-4 border-stone-200 dark:border-stone-700 border-b">
              <h2 class="flex items-center gap-2 font-display font-bold text-stone-800 dark:text-stone-100 text-lg">
                <Merge class="w-5 h-5 text-violet-600" />
                {{ mergeSelection.length }} Zutaten zusammenfassen
              </h2>
              <button @click="cancelMerge" class="hover:bg-stone-100 dark:hover:bg-stone-800 p-1.5 rounded-lg text-stone-400 transition-colors">
                <X class="w-5 h-5" />
              </button>
            </div>
            <div class="space-y-4 p-5">
              <p class="text-stone-600 dark:text-stone-300 text-sm">Welchen Namen soll die zusammengefasste Zutat tragen?</p>
              <!-- Dynamische Optionen aus allen ausgewählten Items (unique names) -->
              <label
                v-for="name in mergeUniqueNames"
                :key="name"
                :class="[
                  'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all',
                  mergeName === name
                    ? 'bg-violet-50 dark:bg-violet-900/20 border-violet-300 dark:border-violet-700'
                    : 'bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 hover:border-stone-300'
                ]"
              >
                <input type="radio" :value="name" v-model="mergeName" class="accent-violet-600" />
                <div>
                  <p class="font-medium text-stone-800 dark:text-stone-200 text-sm">{{ name }}</p>
                  <p class="text-stone-400 text-xs">
                    {{ mergeSelection.filter(s => s.ingredient_name === name).map(s => `${s.amount || '–'} ${s.unit || ''}`).join(', ') }}
                  </p>
                </div>
              </label>
              <!-- Info -->
              <div class="bg-stone-50 dark:bg-stone-800 px-3 py-2 rounded-lg text-stone-500 dark:text-stone-400 text-xs">
                💡 Die Zusammenfassung wird gespeichert und künftig bei neuen Einkaufslisten automatisch angewandt.
              </div>
              <!-- Aktionen -->
              <div class="flex gap-2">
                <button @click="cancelMerge" class="flex-1 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 py-2.5 rounded-xl font-medium text-stone-700 dark:text-stone-300 text-sm transition-colors">
                  Abbrechen
                </button>
                <button @click="confirmMerge" class="flex-1 bg-violet-600 hover:bg-violet-700 py-2.5 rounded-xl font-medium text-white text-sm transition-colors">
                  Zusammenfassen
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Bring! Listen-Auswahl beim Import -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showBringImportPicker" class="z-50 fixed inset-0 flex justify-center items-end sm:items-center bg-black/50 p-4" @click.self="showBringImportPicker = false">
          <div class="bg-white dark:bg-stone-900 shadow-2xl rounded-2xl w-full max-w-sm overflow-hidden">
            <!-- Header -->
            <div class="flex justify-between items-center px-5 py-4 border-stone-200 dark:border-stone-700 border-b">
              <h2 class="flex items-center gap-2 font-display font-bold text-stone-800 dark:text-stone-100 text-lg">
                <Download class="w-5 h-5 text-teal-600" />
                Aus Bring! importieren
              </h2>
              <button @click="showBringImportPicker = false" class="hover:bg-stone-100 dark:hover:bg-stone-800 p-1.5 rounded-lg text-stone-400 transition-colors">
                <X class="w-5 h-5" />
              </button>
            </div>
            <div class="space-y-3 p-5">
              <p class="text-stone-600 dark:text-stone-300 text-sm">Aus welcher Bring!-Liste möchtest du importieren?</p>
              <!-- Listen -->
              <div class="space-y-1.5 max-h-60 overflow-y-auto">
                <button
                  v-for="list in shoppingStore.bringLists"
                  :key="list.uuid"
                  @click="confirmBringImport(list.uuid)"
                  :disabled="shoppingStore.bringImporting"
                  :class="[
                    'flex items-center gap-3 w-full px-4 py-3 rounded-xl border text-left transition-all',
                    list.uuid === (shoppingStore.bringStatus?.list?.uuid)
                      ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-300 dark:border-teal-700'
                      : 'bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 hover:border-teal-300 dark:hover:border-teal-700'
                  ]"
                >
                  <div class="flex justify-center items-center bg-teal-100 dark:bg-teal-900/40 rounded-lg w-8 h-8 shrink-0">
                    <ShoppingBag class="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="font-medium text-stone-800 dark:text-stone-200 text-sm truncate">{{ list.name }}</p>
                    <p v-if="list.uuid === shoppingStore.bringStatus?.list?.uuid" class="text-teal-600 dark:text-teal-400 text-xs">Standard-Liste</p>
                  </div>
                  <Download class="w-4 h-4 text-stone-400 shrink-0" />
                </button>
              </div>
              <!-- Leer-Zustand -->
              <div v-if="shoppingStore.bringLists.length === 0" class="py-4 text-center">
                <Loader2 v-if="bringListsLoading" class="mx-auto w-5 h-5 text-teal-500 animate-spin" />
                <p v-else class="text-stone-400 dark:text-stone-500 text-sm italic">Keine Listen gefunden.</p>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- KI-Matching-Begründung Popover (Teleport, damit es nicht von overflow-hidden abgeschnitten wird) -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition ease-out duration-150"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition ease-in duration-100"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
        <div
          v-if="activeMatchReason"
          class="z-9999 fixed bg-white dark:bg-stone-800 shadow-xl p-3 border border-stone-200 dark:border-stone-600 rounded-xl w-60 text-stone-700 dark:text-stone-300 text-xs"
          :style="{
            left: activeMatchReason.x + 'px',
            top: activeMatchReason.y + 'px',
            transform: 'translate(-50%, calc(-100% - 10px))',
          }"
          @click.stop
        >
          <div class="mb-1.5 font-semibold text-stone-900 dark:text-stone-100">
            {{ matchedByIcon(activeMatchReason.matchedBy) }} {{ matchedByLabel(activeMatchReason.matchedBy) }}
          </div>
          <div v-if="activeMatchReason.matchReason" class="leading-relaxed">
            {{ activeMatchReason.matchReason }}
          </div>
          <div v-else class="text-stone-400 dark:text-stone-500 italic">
            Keine Begründung verfügbar
          </div>
          <!-- Pfeil -->
          <div class="top-full absolute -mt-px border-x-[7px] border-x-transparent border-t-[7px] border-t-stone-200 dark:border-t-stone-600 w-0 h-0" :style="{ left: 'calc(50% + ' + (activeMatchReason.arrowX || 0) + 'px)', transform: 'translateX(-50%)' }"></div>
          <div class="top-full absolute -mt-0.5 border-x-[6px] border-x-transparent border-t-[6px] border-t-white dark:border-t-stone-800 w-0 h-0" :style="{ left: 'calc(50% + ' + (activeMatchReason.arrowX || 0) + 'px)', transform: 'translateX(-50%)' }"></div>
        </div>
      </Transition>
    </Teleport>

    <!-- Floating Aktionsleiste bei Auswahl -->
    <Teleport to="body">
      <Transition name="slide-up">
        <div
          v-if="selectMode && selectedItems.length > 0"
          class="right-0 bottom-0 left-0 z-40 fixed flex flex-wrap justify-center items-center gap-2 sm:gap-3 bg-white/95 dark:bg-stone-900/95 shadow-[0_-4px_24px_rgba(0,0,0,0.12)] backdrop-blur-sm px-3 sm:px-6 py-3 sm:py-4 border-stone-200 dark:border-stone-700 border-t"
        >
          <div class="flex items-center gap-1.5 text-stone-600 dark:text-stone-300 text-sm">
            <CheckSquare class="w-4 h-4" />
            <span class="font-medium">{{ selectedItems.length }}</span>
            <span class="hidden sm:inline">ausgewählt</span>
          </div>
          <button
            @click="selectAllItems"
            class="hover:bg-stone-100 dark:hover:bg-stone-800 px-2.5 sm:px-3 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-stone-600 dark:text-stone-300 text-sm transition-colors"
          >
            Alle ({{ uncheckedItemCount }})
          </button>
          <button
            @click="startMergeFromSelection"
            :disabled="selectedItems.length < 2"
            class="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-3 sm:px-4 py-1.5 rounded-lg font-medium text-white text-sm transition-colors"
          >
            <Merge class="w-4 h-4" />
            Zusammenfassen
          </button>
          <button
            @click="startBlockFromSelection"
            :disabled="selectedItems.length < 1"
            class="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 px-3 sm:px-4 py-1.5 rounded-lg font-medium text-white text-sm transition-colors"
          >
            <Ban class="w-4 h-4" />
            Blockieren
          </button>
          <button
            @click="deleteSelectedItems"
            :disabled="selectedItems.length < 1"
            class="flex items-center gap-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 px-3 sm:px-4 py-1.5 border border-red-300 dark:border-red-700 rounded-lg text-red-600 dark:text-red-400 text-sm transition-colors"
          >
            <Trash2 class="w-4 h-4" />
            Löschen
          </button>
          <button
            @click="toggleSelectMode"
            class="hover:bg-stone-100 dark:hover:bg-stone-800 px-2.5 sm:px-3 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-stone-600 dark:text-stone-300 text-sm transition-colors"
          >
            Abbrechen
          </button>
        </div>
      </Transition>
    </Teleport>

  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useShoppingStore } from '@/stores/shopping.js';
import { useMealPlanStore } from '@/stores/mealplan.js';
import { useIngredientAliasStore } from '@/stores/ingredient-aliases.js';
import { useNotification } from '@/composables/useNotification.js';
import { useNetworkStatus } from '@/composables/useNetworkStatus.js';
import { offlineQueue } from '@/services/offlineQueue.js';
import { useApi } from '@/composables/useApi.js';
import { useHouseholdStore } from '@/stores/household.js';
import { useAuthStore } from '@/stores/auth.js';
import { apiRaw } from '@/composables/useApi.js';
import { ListPlus, Check, ShoppingBag, Plus, Minus, Package, BookOpen, BookX, ExternalLink, ShoppingCart, X, ArrowRightLeft, Search, Tag, Trash2, Star, Heart, Archive, Send, Link2, Unlink, ClipboardCopy, LogIn, LogOut, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Loader2, Terminal, Download, Settings, RefreshCw, Merge, ArrowRight, History, RotateCcw, Ban, MapPin, PenLine, Upload, AlertTriangle, Copy, Eye, EyeOff, CheckSquare, Square, ClipboardCheck, CalendarDays, Lock, Bot, Sparkles, Info, AlertCircle, CheckCircle } from 'lucide-vue-next';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import UnitInput from '@/components/ui/UnitInput.vue';

const shoppingStore = useShoppingStore();
const mealPlanStore = useMealPlanStore();
const aliasStore = useIngredientAliasStore();
const { showSuccess, showError } = useNotification();
const { isOnline } = useNetworkStatus();
const api = useApi();
const householdStore = useHouseholdStore();
const authStore = useAuthStore();
const reweLoading = ref(false);

// "Wer kauft ein?" Status
const shoppers = ref([]);
const iAmShopping = ref(false);
const otherShoppers = computed(() =>
  shoppers.value.filter(s => s.user_id !== authStore.user?.id)
);

async function fetchShoppingStatus() {
  if (!householdStore.isInHousehold) return;
  try {
    const data = await apiRaw('/shopping/shopping-status');
    shoppers.value = data.shoppers || [];
    iAmShopping.value = shoppers.value.some(s => s.user_id === authStore.user?.id);
  } catch { /* silent */ }
}

async function toggleShoppingStatus() {
  const newState = !iAmShopping.value;
  iAmShopping.value = newState;
  try {
    const data = await apiRaw('/shopping/shopping-status', {
      method: 'POST',
      body: { active: newState },
    });
    shoppers.value = data.shoppers || [];
  } catch { iAmShopping.value = !newState; }
}

let cleanupShoppingSse = null;

// Auto-Resolved Details (aufklappbar)
const autoResolvedExpanded = ref(false);

// Einkaufslisten-Generierung Optionen
const showGenOptions = ref(false);
const showHistoryDropdown = ref(false);
const historyBtnRef = ref(null);
const historyDropdownTop = ref(0);
const genIncludePastDays = ref(false); // Standardmäßig: vergangene Tage NICHT einbeziehen
const shopStartDate = ref(null); // Von-Datum (YYYY-MM-DD)
const shopEndDate = ref(null); // Bis-Datum (YYYY-MM-DD)
const availablePlansLoading = ref(false);

// Dialog: Bestehende Liste vorhanden
const showListExistsDialog = ref(false);
const pendingGenerateOptions = ref(null); // { startDate, endDate }


// Datum als YYYY-MM-DD in lokaler Zeitzone formatieren (toISOString() konvertiert nach UTC und kann das Datum verschieben)
function toLocalYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Montag der aktuellen Woche berechnen
function getCurrentMonday() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
  return monday;
}

// Datums-Helfer für Quick-Buttons
function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return toLocalYMD(d);
}

// Validierung: Datumsbereich für Einkaufsliste
const shopDateRangeValid = computed(() => {
  if (!shopStartDate.value || !shopEndDate.value) return false;
  if (shopEndDate.value < shopStartDate.value) return false;
  // Max 28 Tage (wie bei Generate)
  const start = new Date(shopStartDate.value + 'T12:00:00');
  const end = new Date(shopEndDate.value + 'T12:00:00');
  const days = Math.round((end - start) / 86400000) + 1;
  return days > 0 && days <= 28;
});

// Verfügbare Pläne laden (für Smart-Defaults) und Datums-Defaults setzen
const availablePlansError = ref(false);
async function loadAvailablePlans() {
  availablePlansLoading.value = true;
  availablePlansError.value = false;
  try {
    await mealPlanStore.fetchPlans();
    // Smart-Defaults setzen falls noch keine Dates gewählt
    if (!shopStartDate.value || !shopEndDate.value) {
      setSmartDateDefaults();
    }
  } catch {
    availablePlansError.value = true;
  } finally {
    availablePlansLoading.value = false;
  }
}

// Smart-Defaults: Nächstliegenden Plan finden oder Heute → +6
function setSmartDateDefaults() {
  const today = toLocalYMD(new Date());
  const plans = mealPlanStore.plans;
  if (plans.length > 0) {
    // Nächstliegenden Plan finden der heute oder in der Zukunft liegt
    const futurePlan = plans.find(p => {
      const end = p.end_date || addDays(p.week_start || p.start_date, 6);
      return end >= today;
    });
    if (futurePlan) {
      shopStartDate.value = futurePlan.start_date || futurePlan.week_start;
      shopEndDate.value = futurePlan.end_date || addDays(futurePlan.start_date || futurePlan.week_start, 6);
      return;
    }
  }
  // Fallback: Heute → +6 Tage
  shopStartDate.value = today;
  shopEndDate.value = addDays(today, 6);
}

// Quick-Button Presets für Datumsbereich
function setShopDatePreset(preset) {
  const today = toLocalYMD(new Date());
  const monday = toLocalYMD(getCurrentMonday());
  switch (preset) {
    case 'thisWeek':
      shopStartDate.value = monday;
      shopEndDate.value = addDays(monday, 6);
      break;
    case 'nextWeek': {
      const nextMon = addDays(monday, 7);
      shopStartDate.value = nextMon;
      shopEndDate.value = addDays(nextMon, 6);
      break;
    }
    case 'next14':
      shopStartDate.value = today;
      shopEndDate.value = addDays(today, 13);
      break;
    case 'fromToday':
      shopStartDate.value = today;
      shopEndDate.value = addDays(today, 6);
      break;
  }
}

// Zentrales Einstellungs-Modal
const showSettings = ref(false);
const settingsTab = ref('rewe');

// REWE-Einstellungen (persistent)
const showRewePreview = ref(false);
const reweAction = ref(['script', 'direct'].includes(localStorage.getItem('rewe_action')) ? localStorage.getItem('rewe_action') : 'script');
const reweShowPreview = ref(localStorage.getItem('rewe_preview') !== 'false');

// API-Key Management
const apiKeyValue = ref(null);
const showApiKey = ref(false);

// REWE global aktiviert? (Default: false → versteckt bis API bestätigt)
const reweEnabled = ref(false);

// REWE Markt-Einstellungen (pro User, vom Server)
const reweMarketId = ref('');
const reweMarketName = ref('');
const reweZipCode = ref('');
const reweMarketSearch = ref('');
const reweMarketResults = ref([]);
const reweMarketSearchLoading = ref(false);
const reweMarketSearchError = ref('');
const reweMarketSettingsLoading = ref(false);
const reweMarketExpanded = ref(false);

// REWE Produkt-Präferenzen
const showRewePreferences = ref(false);
const rewePreferences = ref([]);
const rewePreferencesLoading = ref(false);
const prefSearch = ref('');
const changingPref = ref(null);
const prefProductQuery = ref('');
const prefProductResults = ref([]);
const prefProductSearching = ref(false);
const prefProductSearchInput = ref(null);
let prefSearchTimeout = null;

const filteredPreferences = computed(() => {
  if (!prefSearch.value) return rewePreferences.value;
  const q = prefSearch.value.toLowerCase();
  return rewePreferences.value.filter(p =>
    p.ingredient_name.includes(q) || p.rewe_product_name?.toLowerCase().includes(q)
  );
});

const reweActionOptions = [
  { value: 'script', icon: '💻', label: 'Konsole' },
  { value: 'direct', icon: '🧩', label: 'Userscript' },
];

function saveReweSettings() {
  localStorage.setItem('rewe_action', reweAction.value);
  localStorage.setItem('rewe_preview', reweShowPreview.value);
}

// REWE Markt-Einstellungen vom Server laden
async function loadReweMarketSettings() {
  reweMarketSettingsLoading.value = true;
  try {
    const data = await api.get('/rewe/settings');
    reweEnabled.value = data.reweEnabled === true;
    reweMarketId.value = data.marketId || '';
    reweMarketName.value = data.marketName || '';
    reweZipCode.value = data.zipCode || '';
  } catch {
    // API-Fehler → sicherheitshalber deaktivieren
    reweEnabled.value = false;
  } finally {
    reweMarketSettingsLoading.value = false;
  }
  // API-Key parallel laden
  loadApiKey();
}

// REWE-Märkte nach PLZ suchen
async function searchReweMarkets() {
  const q = reweMarketSearch.value.trim();
  if (!q) return;
  reweMarketSearchLoading.value = true;
  reweMarketSearchError.value = '';
  reweMarketResults.value = [];
  try {
    const data = await api.get(`/rewe/markets?search=${encodeURIComponent(q)}`);
    if (data.markets?.length) {
      reweMarketResults.value = data.markets;
    } else {
      reweMarketSearchError.value = data.error || 'Keine Märkte gefunden. Versuche eine andere PLZ.';
    }
  } catch {
    reweMarketSearchError.value = 'Suche fehlgeschlagen. Bitte versuche es erneut.';
  } finally {
    reweMarketSearchLoading.value = false;
  }
}

// REWE-Markt auswählen und speichern
async function selectReweMarket(market) {
  try {
    await api.put('/rewe/settings', {
      marketId: String(market.id),
      marketName: market.name || market.displayName || 'REWE Markt',
      zipCode: market.zipCode || '',
    });
    reweMarketId.value = String(market.id);
    reweMarketName.value = market.name || market.displayName || 'REWE Markt';
    reweZipCode.value = market.zipCode || '';
    reweMarketExpanded.value = false;
    reweMarketResults.value = [];
    showSuccess(`${market.name} ausgewählt (ID: ${market.id})`);
  } catch {
    // Fehler von useApi gehandelt
  }
}

// REWE-Markt-Einstellung löschen
async function resetReweMarket() {
  try {
    await api.del('/rewe/settings');
    await loadReweMarketSettings();
    showSuccess('REWE-Markt entfernt.');
  } catch {
    // Fehler von useApi gehandelt
  }
}

const currentReweActionLabel = computed(() => {
  const opt = reweActionOptions.find(o => o.value === reweAction.value);
  return opt ? `${opt.icon} ${opt.label}` : 'Bestellen';
});

const currentReweActionIcon = computed(() => {
  switch (reweAction.value) {
    case 'script': return Terminal;
    case 'direct': return ExternalLink;
    default: return ShoppingCart;
  }
});

// Bring! Integration
const bringEmail = ref('');
const bringPassword = ref('');
const bringConnecting = ref(false);
const bringListsLoading = ref(false);
const selectedBringList = ref('');
const showBringImportPicker = ref(false);

// REWE Warenkorb-Script
const showCartScript = ref(false);
const cartScript = ref('');
const cartScriptLoading = ref(false);
const cartScriptCopied = ref(false);

// REWE-Produkt-Picker
const pickerItem = ref(null);        // Das Shopping-Item, für das der Picker offen ist
const pickerProducts = ref([]);       // Gefundene REWE-Produkte
const pickerLoading = ref(false);     // Ladeindikator
const pickerSearch = ref('');         // Suchbegriff im Picker

// Manuelles Hinzufügen
const newItem = ref({ name: '', amount: null, unit: '' });

// Vorratscheck
const showPantryCheck = ref(false);
const pantryCheckMoving = ref(null);          // Key des gerade verschobenen Items
const movedPantryItems = ref(new Set());      // Bereits verschobene Items
const highlightedItemId = ref(null);          // Item-ID die gerade aufleuchtet

// Wenn der Vorratscheck neu geladen wird (z.B. nach Löschen), movedPantryItems zurücksetzen
watch(() => shoppingStore.pantryCheck, () => {
  movedPantryItems.value = new Set();
});

const pantryCheckTotalCount = computed(() => {
  return shoppingStore.pantryCheck?.ingredients?.length || 0;
});

async function togglePantryCheck() {
  showPantryCheck.value = !showPantryCheck.value;
  if (showPantryCheck.value && !shoppingStore.pantryCheck) {
    await shoppingStore.fetchPantryCheck();
  }
}

function formatPantryAmount(amount, unit) {
  if (!amount && amount !== 0) return '';
  const rounded = Math.round(amount * 100) / 100;
  return unit ? `${rounded} ${unit}` : `${rounded}`;
}

async function moveFromPantryCheckToList(ing) {
  const key = ing.name.toLowerCase();
  pantryCheckMoving.value = key;
  try {
    // Bei partial: fehlende Menge berechnen, bei covered: gesamte Menge
    const amountToAdd = ing.is_partial
      ? Math.round((ing.display_amount - (ing.total_covered_base_amount * (ing.display_amount / (ing.total_needed_base_amount || 1)))) * 100) / 100 || ing.display_amount
      : ing.display_amount;

    const data = await shoppingStore.moveFromPantryToList({
      ingredient_name: ing.name,
      amount: amountToAdd,
      unit: ing.display_unit || null,
      pantry_item_id: ing.pantry_id || null,
    });

    // Als verschoben markieren
    movedPantryItems.value = new Set([...movedPantryItems.value, key]);

    // Highlight in der Einkaufsliste auslösen
    if (data.item?.id) {
      highlightedItemId.value = data.item.id;
      await nextTick();
      const el = document.querySelector(`[data-item-id="${data.item.id}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setTimeout(() => {
        if (highlightedItemId.value === data.item.id) {
          highlightedItemId.value = null;
        }
      }, 1800);
    }

    showSuccess(`${ing.name} zur Einkaufsliste hinzugefügt! 🛒`);
  } catch {
    showError('Zutat konnte nicht verschoben werden.');
  } finally {
    pantryCheckMoving.value = null;
  }
}

// "Einkauf abschließen?"-Dialog nach Bring!/REWE
const showCompletePurchasePrompt = ref(false);
const showClearPrefsConfirm = ref(false);

// REWE-Bestell-Warnung (nicht zugeordnete Artikel / hohe Mengen)
const showReweWarning = ref(false);
const reweWarningFromPreview = ref(false); // ob der Aufruf aus dem Preview-Panel kam
const REWE_QTY_WARN_THRESHOLD = 10;

const reweUnmatchedItems = computed(() =>
  shoppingStore.activeList?.items?.filter(i => !i.is_checked && !i.rewe_product && (shoppingStore.reweLinkedItems.length > 0 || reweLoading.value)) || []
);
const reweHighQtyItems = computed(() =>
  shoppingStore.reweLinkedItems.filter(i => (i.rewe_product?.quantity || 1) > REWE_QTY_WARN_THRESHOLD)
);
const hasReweWarnings = computed(() =>
  reweUnmatchedItems.value.length > 0 || reweHighQtyItems.value.length > 0
);

// Rezept-Links ein-/ausblenden (persistent via localStorage)
const showRecipeLinks = ref(localStorage.getItem('shopping_showRecipeLinks') !== 'false');
function toggleRecipeLinks() {
  showRecipeLinks.value = !showRecipeLinks.value;
  localStorage.setItem('shopping_showRecipeLinks', showRecipeLinks.value);
}

// Auswahl-Modus (vereinheitlicht für Merge + Block)
const selectMode = ref(false);
const selectedItems = ref([]);   // Ausgewählte Items

// Zusammenfassen-Modus (Merge)
const mergeMode = ref(false);
const mergeSelection = ref([]);  // Wird aus selectedItems befüllt
const showMergeDialog = ref(false);
const mergeName = ref('');       // Gewählter Name für das zusammengefasste Item

// Inline-Mengen-Editor
const editingItemId = ref(null);
const editAmount = ref(null);
const editUnit = ref('');
const editRequiredAmount = ref(null); // Benötigte Menge aus Rezepten
const editAmountInput = ref(null);

const editAmountWarning = computed(() => {
  if (!editRequiredAmount.value || editAmount.value == null || editAmount.value === '') return null;
  const required = editRequiredAmount.value;
  // Einfacher Vergleich nur bei gleicher oder fehlender Einheit
  const unitMatch = !required.unit || !editUnit.value || required.unit.toLowerCase() === editUnit.value.toLowerCase();
  if (unitMatch && editAmount.value < required.amount) {
    return `Laut Rezepten werden ${required.amount} ${required.unit || ''} benötigt – du kaufst möglicherweise zu wenig ein.`;
  }
  return null;
});

// KI-Matching-Begründung Popover
const activeMatchReason = ref(null); // { id, matchedBy, matchReason, x, y, arrowX }

const POPOVER_WIDTH = 240; // w-60 = 15rem = 240px
const POPOVER_MARGIN = 8; // Abstand zum Bildschirmrand

function openMatchReason(event, item) {
  if (activeMatchReason.value?.id === item.id) {
    activeMatchReason.value = null;
    return;
  }
  const rect = event.target.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const vw = window.innerWidth;

  // Popover-Left so clampen, dass es im Viewport bleibt
  const half = POPOVER_WIDTH / 2;
  const minLeft = POPOVER_MARGIN + half;
  const maxLeft = vw - POPOVER_MARGIN - half;
  const clampedX = Math.max(minLeft, Math.min(maxLeft, centerX));

  // Pfeil-Offset: wie weit der Pfeil vom Center abweicht (in px)
  const arrowX = centerX - clampedX;

  activeMatchReason.value = {
    id: item.id,
    matchedBy: item.rewe_product.matchedBy,
    matchReason: item.rewe_product.matchReason,
    x: clampedX,
    y: rect.top,
    arrowX,
  };
}

// Blockier-Modus – Multi-Select
const blockMode = ref(false);
const blockSelection = ref([]);

const totalCount = computed(() => shoppingStore.activeList?.items?.length || 0);
const checkedCount = computed(() => shoppingStore.activeList?.items?.filter(i => i.is_checked).length || 0);
const uncheckedItemCount = computed(() => shoppingStore.activeList?.items?.filter(i => !i.is_checked).length || 0);
const progressPercent = computed(() => totalCount.value ? (checkedCount.value / totalCount.value * 100) : 0);

// REWE-Matching Fortschritt (0–100)
const reweMatchPercent = computed(() => {
  const p = shoppingStore.reweProgress;
  if (!p || !p.total) return 0;
  return Math.round((p.current / p.total) * 100);
});

const estimatedTotal = computed(() => {
  if (!shoppingStore.activeList?.items) return 0;
  return shoppingStore.activeList.items.reduce((sum, item) => {
    const price = item.rewe_product?.price || 0;
    const qty = item.rewe_product?.quantity || 1;
    return sum + (price * qty);
  }, 0);
});

/** Zutat → Supermarkt-Abteilung zuordnen */
const categoryKeywords = {
  'Obst & Gemüse': [
    'apfel', 'banane', 'birne', 'orange', 'zitrone', 'lime', 'mango', 'avocado', 'tomate',
    'gurke', 'paprika', 'zwiebel', 'knoblauch', 'kartoffel', 'karotte', 'möhre', 'sellerie',
    'lauch', 'porree', 'brokkoli', 'blumenkohl', 'zucchini', 'aubergine', 'spinat', 'salat',
    'rucola', 'petersilie', 'basilikum', 'koriander', 'dill', 'schnittlauch', 'minze',
    'ingwer', 'chili', 'jalapeño', 'frühlingszwiebel', 'schalotte', 'pilz', 'champignon',
    'radieschen', 'kohlrabi', 'fenchel', 'kürbis', 'süßkartoffel', 'mais', 'erbsen',
    'bohnen', 'linsen', 'kichererbsen', 'cocktailtomaten', 'kirschtomate', 'blattpetersilie',
    'rosmarin', 'thymian', 'salbei', 'oregano', 'gemüse', 'obst', 'beere', 'himbeere',
    'erdbeere', 'blaubeere', 'trauben', 'ananas', 'melone', 'kiwi', 'granatapfel',
  ],
  'Milchprodukte': [
    'milch', 'butter', 'sahne', 'schmand', 'joghurt', 'quark', 'käse', 'frischkäse',
    'mozzarella', 'parmesan', 'gouda', 'emmentaler', 'feta', 'halloumi', 'mascarpone',
    'ricotta', 'crème fraîche', 'creme fraiche', 'sauerrahm', 'schlagsahne', 'ei', 'eier',
  ],
  'Fleisch & Fisch': [
    'fleisch', 'hähnchen', 'huhn', 'chicken', 'pute', 'rind', 'schwein', 'hack', 'gehackt',
    'steak', 'schnitzel', 'wurst', 'schinken', 'speck', 'bacon', 'lachs', 'thunfisch',
    'garnele', 'shrimp', 'fisch', 'filet', 'burger', 'bratwurst', 'salami', 'chorizo',
  ],
  'Backwaren': [
    'brot', 'brötchen', 'toast', 'baguette', 'ciabatta', 'croissant', 'tortilla', 'wrap',
    'pizzateig', 'blätterteig', 'hefeteig', 'mehl', 'hefe', 'backpulver', 'burgerbrötchen',
  ],
  'Gewürze & Öle': [
    'salz', 'pfeffer', 'paprika pulver', 'kurkuma', 'kreuzkümmel', 'kümmel', 'zimt',
    'muskat', 'cayenne', 'chili pulver', 'curry', 'gewürz', 'öl', 'olivenöl', 'sonnenblumenöl',
    'sesamöl', 'essig', 'balsamico', 'sojasoße', 'sojasauce', 'worcester', 'senf', 'ketchup',
    'mayonnaise', 'tabasco', 'sriracha', 'honig', 'zucker', 'vanille', 'estragon',
  ],
  'Getränke': [
    'wasser', 'saft', 'limonade', 'bier', 'wein', 'milch', 'tee', 'kaffee', 'cola',
  ],
  'Reis, Pasta & Co.': [
    'reis', 'nudel', 'pasta', 'spaghetti', 'penne', 'fusilli', 'tagliatelle', 'couscous',
    'bulgur', 'quinoa', 'haferflocken', 'müsli', 'cornflakes', 'basmatireis',
  ],
  'Konserven & Saucen': [
    'dose', 'konserve', 'passata', 'tomatenmark', 'kokosmilch', 'kokosnussmilch',
    'brühe', 'fond', 'sauce', 'pesto', 'currysauce', 'tomatensauce', 'sambal',
  ],
};

function guessCategory(ingredientName) {
  const lower = ingredientName.toLowerCase();
  let bestCategory = 'Sonstiges';
  let bestLength = 0;

  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    for (const kw of keywords) {
      if (lower.includes(kw) && kw.length > bestLength) {
        bestLength = kw.length;
        bestCategory = category;
      }
    }
  }
  return bestCategory;
}

// Artikel nach Kategorie gruppieren
const groupedItems = computed(() => {
  const items = shoppingStore.activeList?.items || [];
  const groups = {};
  for (const item of items) {
    const cat = guessCategory(item.ingredient_name || '');
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }
  // Nicht-abgehakte zuerst
  for (const cat of Object.keys(groups)) {
    groups[cat].sort((a, b) => (a.is_checked ? 1 : 0) - (b.is_checked ? 1 : 0));
  }
  return groups;
});

function categoryIcon(cat) {
  const icons = {
    'Obst & Gemüse': '🥬',
    'Milchprodukte': '🧀',
    'Fleisch & Fisch': '🥩',
    'Backwaren': '🍞',
    'Gewürze & Öle': '🧂',
    'Getränke': '🥤',
    'Reis, Pasta & Co.': '🍚',
    'Konserven & Saucen': '🥫',
    'Sonstiges': '📦',
  };
  return icons[cat] || '📦';
}

function formatPrice(cents) {
  return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

/** Matching-Methoden-Icon: KI, Fallback-Scoring, manuelle Auswahl oder Präferenz */
function matchedByIcon(method) {
  const icons = { ai: '🤖', fallback: '📊', manual: '✋', preference: '⭐' };
  return icons[method] || '';
}
function matchedByLabel(method) {
  const labels = { ai: 'KI-Matching', fallback: 'Regel-basiert', manual: 'Manuell gewählt', preference: 'Gemerktes Produkt' };
  return labels[method] || method;
}

function reweProductUrl(productName, productId) {
  if (!productId) return '#';
  const slug = (productName || 'produkt').toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/(^-|-$)/g, '');
  return `https://www.rewe.de/shop/p/${slug}/${productId}`;
}

async function addManualItem() {
  const name = newItem.value.name.trim();
  if (!name) return;
  try {
    await shoppingStore.addItem({
      ingredient_name: name,
      amount: newItem.value.amount || undefined,
      unit: newItem.value.unit.trim() || undefined,
    });
    newItem.value = { name: '', amount: null, unit: '' };
    showSuccess(`${name} hinzugefügt! ✏️`);
  } catch {
    showError('Artikel konnte nicht hinzugefügt werden.');
  }
}

async function deleteItem(item) {
  try {
    await shoppingStore.deleteItem(item.id);
    showSuccess(`${item.ingredient_name} entfernt 🗑️`);
  } catch {
    showError('Artikel konnte nicht gelöscht werden.');
  }
}

/** Inline-Mengen-Editor öffnen */
function startEditItem(item) {
  editingItemId.value = item.id;
  editAmount.value = item.amount || null;
  editUnit.value = item.unit || '';
  editRequiredAmount.value = null;
  nextTick(() => {
    // Input fokussieren (editAmountInput ist ein Array wegen v-for + ref)
    const inputs = editAmountInput.value;
    if (Array.isArray(inputs) && inputs.length > 0) {
      inputs[0].focus();
      inputs[0].select();
    } else if (inputs) {
      inputs.focus();
      inputs.select();
    }
  });
}

/** Inline-Mengen-Editor abschließen */
async function saveEditItem(item) {
  try {
    const data = await shoppingStore.updateItem(item.id, {
      amount: editAmount.value || null,
      unit: editUnit.value?.trim() || null,
    });
    // Warnung prüfen (required amount vom Server)
    if (data?.requiredAmount) {
      editRequiredAmount.value = data.requiredAmount;
      // Warnung anzeigen, aber Editor offen lassen wenn Menge zu niedrig
      const unitMatch = !data.requiredAmount.unit || !editUnit.value || data.requiredAmount.unit.toLowerCase() === (editUnit.value || '').toLowerCase();
      if (unitMatch && (editAmount.value || 0) < data.requiredAmount.amount) {
        // Editor bleibt offen mit Warnung
        return;
      }
    }
    editingItemId.value = null;
    editRequiredAmount.value = null;
  } catch {
    showError('Menge konnte nicht aktualisiert werden.');
  }
}

/** Inline-Mengen-Editor abbrechen */
function cancelEditItem() {
  editingItemId.value = null;
  editRequiredAmount.value = null;
}

async function moveToPantry(item) {
  try {
    await shoppingStore.moveToPantry(item.id);
    showSuccess(`${item.ingredient_name} in den Vorratsschrank verschoben! 🗄️`);
  } catch {
    showError('Artikel konnte nicht verschoben werden.');
  }
}

async function increaseQuantity(item) {
  const newQty = (item.rewe_product?.quantity || 1) + 1;
  try {
    await shoppingStore.updateReweQuantity(item.id, newQty);
  } catch {
    showError('Menge konnte nicht geändert werden.');
  }
}

async function decreaseQuantity(item) {
  const current = item.rewe_product?.quantity || 1;
  if (current <= 1) return;
  try {
    await shoppingStore.updateReweQuantity(item.id, current - 1);
  } catch {
    showError('Menge konnte nicht geändert werden.');
  }
}

async function setQuantity(item, event) {
  const val = parseInt(event.target.value, 10);
  const newQty = Math.max(1, isNaN(val) ? 1 : val);
  event.target.value = newQty; // Korrektur im Feld anzeigen
  if (newQty === (item.rewe_product?.quantity || 1)) return;
  try {
    await shoppingStore.updateReweQuantity(item.id, newQty);
  } catch {
    showError('Menge konnte nicht geändert werden.');
  }
}

async function generateList() {
  showGenOptions.value = false;
  if (!shopDateRangeValid.value) {
    showError('Bitte wähle einen gültigen Zeitraum (max. 28 Tage).');
    return;
  }

  await checkExistingListAndGenerate({ startDate: shopStartDate.value, endDate: shopEndDate.value });
}

/** Prüft ob bereits eine aktive Liste mit Artikeln existiert und zeigt ggf. Dialog */
async function checkExistingListAndGenerate(options) {
  const hasItems = shoppingStore.items.length > 0;
  if (hasItems) {
    // Dialog anzeigen: Hinzufügen oder Ersetzen?
    pendingGenerateOptions.value = options;
    showListExistsDialog.value = true;
  } else {
    await doGenerateList(options, 'replace');
  }
}

/** Benutzer hat im Dialog "Hinzufügen" gewählt */
async function onListExistsAppend() {
  showListExistsDialog.value = false;
  if (pendingGenerateOptions.value) {
    await doGenerateList(pendingGenerateOptions.value, 'append');
  }
  pendingGenerateOptions.value = null;
}

/** Benutzer hat im Dialog "Ersetzen" gewählt */
async function onListExistsReplace() {
  showListExistsDialog.value = false;
  if (pendingGenerateOptions.value) {
    await doGenerateList(pendingGenerateOptions.value, 'replace');
  }
  pendingGenerateOptions.value = null;
}

async function doGenerateList(options, mode = 'replace') {
  try {
    const data = await shoppingStore.generateList(null, {
      startDate: options.startDate,
      endDate: options.endDate,
      excludePastDays: !genIncludePastDays.value,
      mode,
    });
    const msg = mode === 'append'
      ? 'Artikel zur Einkaufsliste hinzugefügt! 📝'
      : data.skippedDays
        ? `Einkaufsliste erstellt! 📝 (${data.skippedDays} vergangene Tage übersprungen)`
        : 'Einkaufsliste erstellt! 📝';
    showSuccess(msg);
  } catch {
    // Fehler wird von useApi angezeigt
  }
}

async function toggleItem(item) {
  try {
    await shoppingStore.toggleItem(item.id, !item.is_checked);
  } catch {
    // Fehler wird im Store behandelt (offline-queue oder rollback)
  }
}

async function matchWithRewe() {
  reweLoading.value = true;
  try {
    await shoppingStore.matchWithRewe();
    showSuccess('REWE-Produkte zugeordnet! 🏪');
    // Optional: Auto-KI-Check nach REWE-Abgleich
    if (shoppingStore.userSettings.shopping_auto_ai_after_rewe === '1') {
      try {
        await shoppingStore.fetchAIReview();
        if (shoppingStore.aiReviewIssues.length > 0) {
          showSuccess(`KI-Check: ${shoppingStore.aiReviewIssues.length} Hinweis${shoppingStore.aiReviewIssues.length > 1 ? 'e' : ''} gefunden`);
        }
      } catch {
        // KI-Check-Fehler ist nicht kritisch
      }
    }
  } catch {
    // Fehler wird von useApi angezeigt
  } finally {
    reweLoading.value = false;
  }
}

// ============================================
// REWE Produkt-Präferenzen Verwaltung
// ============================================

async function openRewePreferences() {
  showRewePreferences.value = true;
  rewePreferencesLoading.value = true;
  prefSearch.value = '';
  try {
    const data = await shoppingStore.fetchPreferences();
    rewePreferences.value = data.preferences || [];
  } catch {
    showError('Präferenzen konnten nicht geladen werden.');
  } finally {
    rewePreferencesLoading.value = false;
  }
}

async function removePref(pref) {
  try {
    await shoppingStore.deletePreference(pref.id);
    rewePreferences.value = rewePreferences.value.filter(p => p.id !== pref.id);
    showSuccess(`Zuordnung für „${pref.ingredient_name}" entfernt`);
  } catch {
    showError('Löschen fehlgeschlagen.');
  }
}

async function clearAllPrefs() {
  showClearPrefsConfirm.value = true;
}

async function executeClearAllPrefs() {
  showClearPrefsConfirm.value = false;
  try {
    await shoppingStore.clearAllPreferences();
    rewePreferences.value = [];
    showSuccess('Alle Zuordnungen zurückgesetzt');
  } catch {
    showError('Zurücksetzen fehlgeschlagen.');
  }
}

function startChangePref(pref) {
  changingPref.value = pref;
  prefProductQuery.value = pref.ingredient_name;
  prefProductResults.value = [];
  prefProductSearching.value = true;
  // Direkt nach dem Zutatennamen suchen
  nextTick(() => {
    prefProductSearchInput.value?.focus();
    searchPrefProducts();
  });
}

function debouncedPrefSearch() {
  clearTimeout(prefSearchTimeout);
  prefSearchTimeout = setTimeout(searchPrefProducts, 350);
}

async function searchPrefProducts() {
  if (!prefProductQuery.value || prefProductQuery.value.length < 2) {
    prefProductResults.value = [];
    prefProductSearching.value = false;
    return;
  }
  prefProductSearching.value = true;
  try {
    const data = await shoppingStore.searchReweProducts(prefProductQuery.value);
    prefProductResults.value = data.products || [];
  } catch {
    prefProductResults.value = [];
  } finally {
    prefProductSearching.value = false;
  }
}

async function selectPrefProduct(product) {
  if (!changingPref.value) return;
  try {
    await shoppingStore.updatePreference(changingPref.value.id, product);
    // Lokale Liste aktualisieren
    const idx = rewePreferences.value.findIndex(p => p.id === changingPref.value.id);
    if (idx >= 0) {
      rewePreferences.value[idx] = {
        ...rewePreferences.value[idx],
        rewe_product_id: product.id,
        rewe_product_name: product.name,
        rewe_price: product.price,
        rewe_package_size: product.packageSize,
        rewe_image_url: product.imageUrl || null,
      };
    }
    showSuccess(`Bevorzugtes Produkt für „${changingPref.value.ingredient_name}" geändert`);
    changingPref.value = null;
    prefProductResults.value = [];
    prefProductQuery.value = '';
  } catch {
    showError('Änderung fehlgeschlagen.');
  }
}

async function completePurchase({ includeAll = false } = {}) {
  try {
    const result = await shoppingStore.completePurchase({ includeAll });
    showSuccess('Einkauf abgeschlossen! Vorräte aktualisiert. 🎉');
    // Wochenplan im Store als fixiert markieren (falls Backend Auto-Lock gegriffen hat)
    if (result?.mealPlanLocked && result.mealPlanId) {
      if (mealPlanStore.currentPlan?.id === result.mealPlanId) {
        mealPlanStore.currentPlan.is_locked = 1;
      }
    }
  } catch {
    // Fehler wird von useApi angezeigt
  }
}

/** Nach Bring!/REWE-Aktion: Einkauf abschließen (alle Items, nicht nur abgehakte) */
async function confirmCompletePurchase() {
  showCompletePurchasePrompt.value = false;
  await completePurchase({ includeAll: true });
}

/** REWE Hauptaktion (Split-Button links) */
async function handleReweMainAction() {
  // Prüfen ob Warnungen angezeigt werden müssen
  if (hasReweWarnings.value) {
    reweWarningFromPreview.value = false;
    showReweWarning.value = true;
    return;
  }
  if (reweShowPreview.value) {
    showRewePreview.value = true;
  } else {
    await executeReweAction();
  }
}

function confirmReweWarning() {
  showReweWarning.value = false;
  if (reweWarningFromPreview.value) {
    executeReweAction();
  } else if (reweShowPreview.value) {
    showRewePreview.value = true;
  } else {
    executeReweAction();
  }
}

/** Gewählte REWE-Aktion ausführen */
async function executeReweAction() {
  switch (reweAction.value) {
    case 'script':
      await loadCartScript();
      showRewePreview.value = false;
      showCompletePurchasePrompt.value = true;
      break;
    case 'direct':
      window.open('https://www.rewe.de/shop/', '_blank', 'noopener');
      showRewePreview.value = false;
      showSuccess('REWE geöffnet – klicke dort auf den 🍳-Button!');
      showCompletePurchasePrompt.value = true;
      break;
    default:
      showRewePreview.value = true;
  }
}

/** API-Key generieren */
async function handleGenerateApiKey() {
  try {
    const data = await shoppingStore.generateApiKey();
    apiKeyValue.value = data.apiKey;
    showApiKey.value = true;
    showSuccess('API-Key generiert! Beim nächsten Installieren wird er automatisch eingebettet.');
  } catch {
    showError('API-Key konnte nicht generiert werden.');
  }
}

/** API-Key kopieren */
async function copyApiKey() {
  if (!apiKeyValue.value) return;
  try {
    await navigator.clipboard.writeText(apiKeyValue.value);
    showSuccess('API-Key in die Zwischenablage kopiert!');
  } catch {
    // Fallback für unsicheren Kontext (HTTP) oder fehlende Clipboard-API
    try {
      const textarea = document.createElement('textarea');
      textarea.value = apiKeyValue.value;
      textarea.style.cssText = 'position:fixed;opacity:0;left:-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showSuccess('API-Key in die Zwischenablage kopiert!');
    } catch {
      showError('Kopieren fehlgeschlagen.');
    }
  }
}

/** API-Key widerrufen */
async function handleRevokeApiKey() {
  try {
    await shoppingStore.revokeApiKey();
    apiKeyValue.value = null;
    showApiKey.value = false;
    showSuccess('API-Key widerrufen.');
  } catch {
    showError('API-Key konnte nicht widerrufen werden.');
  }
}

/** API-Key beim Laden der REWE-Einstellungen abrufen */
async function loadApiKey() {
  try {
    const data = await shoppingStore.getApiKey();
    apiKeyValue.value = data.apiKey || null;
  } catch {
    // Nicht kritisch
  }
}

/** Produkt-Picker öffnen: Alternativen für eine Zutat suchen */
async function openProductPicker(item) {
  pickerItem.value = item;
  pickerProducts.value = [];
  // Bei Alternativsuche (z.B. "Linsen" statt "Belugalinsen") den tatsächlichen Suchbegriff verwenden
  const searchTerm = item.rewe_product?.searchQuery || item.ingredient_name;
  pickerSearch.value = searchTerm;
  pickerLoading.value = true;
  try {
    const data = await shoppingStore.searchReweProducts(searchTerm);
    pickerProducts.value = data.products || [];
  } catch {
    showError('REWE-Suche fehlgeschlagen.');
  } finally {
    pickerLoading.value = false;
  }
}

function closeProductPicker() {
  pickerItem.value = null;
  pickerProducts.value = [];
  pickerSearch.value = '';
}

/** Manuelle Suche im Picker */
async function searchInPicker() {
  const q = pickerSearch.value.trim();
  if (!q || q.length < 2) return;
  pickerLoading.value = true;
  pickerProducts.value = [];
  try {
    const data = await shoppingStore.searchReweProducts(q);
    pickerProducts.value = data.products || [];
  } catch {
    showError('REWE-Suche fehlgeschlagen.');
  } finally {
    pickerLoading.value = false;
  }
}

/** Produkt aus Picker auswählen und dem Item zuweisen */
async function selectProduct(product) {
  if (!pickerItem.value) return;
  try {
    await shoppingStore.setReweProduct(pickerItem.value.id, product);
    showSuccess(`${product.name} zugewiesen & gemerkt! ⭐`);
    closeProductPicker();
  } catch {
    showError('Produkt konnte nicht zugewiesen werden.');
  }
}

onMounted(async () => {
  await shoppingStore.fetchActiveList();
  shoppingStore.fetchBringStatus();
  shoppingStore.fetchUserSettings();
  aliasStore.fetchAliases();
  aliasStore.fetchBlockedIngredients();
  // Verlauf immer laden (für History-Button)
  shoppingStore.fetchListHistory();
  // Verfügbare Pläne vorladen (für Datums-Defaults)
  loadAvailablePlans();
  // REWE-Status prüfen (reweEnabled)
  loadReweMarketSettings();
  // Click-Outside: Matching-Begründung schließen
  document.addEventListener('click', closeMatchReason);
  // "Wer kauft ein?" laden
  fetchShoppingStatus();
  // SSE: Einkaufs-Status anderer Mitglieder
  if (householdStore.isInHousehold) {
    cleanupShoppingSse = householdStore.addEventListener('shopping:status', (data) => {
      shoppers.value = data.shoppers || [];
      iAmShopping.value = shoppers.value.some(s => s.user_id === authStore.user?.id);
    });
  }
});

onUnmounted(() => {
  document.removeEventListener('click', closeMatchReason);
  cleanupShoppingSse?.();
  // Bei Verlassen der Seite Einkaufs-Status beenden
  if (iAmShopping.value && householdStore.isInHousehold) {
    apiRaw('/shopping/shopping-status', { method: 'POST', body: { active: false } }).catch(() => {});
  }
});

function closeMatchReason() {
  activeMatchReason.value = null;
}

// ============================================
// Einstellungen (zentrales Modal)
// ============================================

// ---- KI-Review Helpers ----

/** KI-Review manuell starten */
async function runAIReview() {
  try {
    await shoppingStore.fetchAIReview();
    if (shoppingStore.aiReviewIssues.length === 0 && shoppingStore.aiReviewAutoResolved.length === 0) {
      showSuccess('Alles in Ordnung – keine Auffälligkeiten gefunden! ✨');
    } else {
      const count = shoppingStore.aiReviewIssues.length;
      const autoCount = shoppingStore.aiReviewAutoResolved.length;
      const parts = [];
      if (count > 0) parts.push(`${count} Hinweis${count > 1 ? 'e' : ''}`);
      if (autoCount > 0) parts.push(`${autoCount} auto-erledigt`);
      showSuccess(`KI-Check abgeschlossen: ${parts.join(', ')}`);
    }
  } catch (err) {
    showError('KI-Check fehlgeschlagen: ' + (err.message || 'Unbekannter Fehler'));
  }
}

/** Issues für ein bestimmtes Item filtern */
function getIssuesForItem(itemId) {
  return shoppingStore.aiReviewIssues.filter(i => i.item_id === itemId);
}

/** Globale Issues (nicht einem Item zugeordnet) */
const globalAIIssues = computed(() => {
  return shoppingStore.aiReviewIssues
    .map((issue, idx) => ({ ...issue, _globalIdx: idx }))
    .filter(i => !i.item_id);
});

/** Zusammenfassung der Auto-Resolved-Aktionen */
const autoResolvedSummary = computed(() => {
  const resolved = shoppingStore.aiReviewAutoResolved;
  if (!resolved.length) return '';
  const pantry = resolved.filter(r => r.type === 'pantry_covered').length;
  const merged = resolved.filter(r => r.type === 'duplicate').length;
  const adjusted = resolved.filter(r => r.suggestion?.action === 'adjust').length;
  const parts = [];
  if (pantry) parts.push(`${pantry} abgehakt (Vorrat)`);
  if (merged) parts.push(`${merged} zusammengeführt`);
  if (adjusted) parts.push(`${adjusted} Menge angepasst`);
  return `${resolved.length} Artikel automatisch verarbeitet: ${parts.join(', ')}`;
});

/** Detail-Liste der Auto-Resolved-Aktionen für aufklappbare Anzeige */
const autoResolvedDetails = computed(() => {
  return shoppingStore.aiReviewAutoResolved.map(r => {
    let description = '';
    if (r.type === 'pantry_covered') {
      description = `${r.ingredient || 'Zutat'}: abgehakt — ${r.message || 'im Vorrat vorhanden'}`;
    } else if (r.type === 'duplicate') {
      const target = r.merged_name || r.ingredient || 'Zutat';
      const amount = r.merged_amount != null ? `${r.merged_amount}${r.merged_unit ? ' ' + r.merged_unit : ''}` : '';
      description = r.message || `${target} zusammengeführt${amount ? ' → ' + amount : ''}`;
    } else if (r.suggestion?.action === 'adjust') {
      const amount = r.suggestion.amount != null ? `${r.suggestion.amount}${r.suggestion.unit ? ' ' + r.suggestion.unit : ''}` : '';
      description = r.message || `${r.ingredient || 'Zutat'}: Menge angepasst${amount ? ' → ' + amount : ''}`;
    } else {
      description = r.message || `${r.ingredient || 'Zutat'}: automatisch verarbeitet`;
    }
    return { type: r.type, description };
  });
});

/** Icon je Auto-Resolved-Typ */
function autoResolvedIcon(type) {
  switch (type) {
    case 'pantry_covered': return Package;
    case 'duplicate': return Merge;
    default: return ArrowRight;
  }
}

/** Globalen Index eines Item-Issues finden */
function getGlobalIssueIndex(itemId, localIdx) {
  let count = 0;
  for (let i = 0; i < shoppingStore.aiReviewIssues.length; i++) {
    if (shoppingStore.aiReviewIssues[i].item_id === itemId) {
      if (count === localIdx) return i;
      count++;
    }
  }
  return -1;
}

/** CSS-Klassen je Issue-Typ */
function aiIssueClasses(type) {
  switch (type) {
    case 'rewe_missing':
    case 'rewe_mismatch':
      return 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/40';
    case 'missing_ingredient':
      return 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800/40';
    case 'quantity_logic':
    case 'plausibility':
    case 'duplicate':
      return 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40';
    case 'pantry_covered':
      return 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40';
    default:
      return 'bg-stone-50 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700';
  }
}

/** Icon je Issue-Typ */
function aiIssueIcon(type) {
  switch (type) {
    case 'rewe_missing':
    case 'rewe_mismatch':
      return AlertCircle;
    case 'missing_ingredient':
      return AlertTriangle;
    case 'quantity_logic':
    case 'plausibility':
    case 'duplicate':
      return AlertTriangle;
    case 'pantry_covered':
      return CheckCircle;
    default:
      return Info;
  }
}

/** AI-Vorschlag anwenden */
async function applyAISuggestion(issue, issueIndex) {
  try {
    await shoppingStore.applyIssueSuggestion(issue, issueIndex);
    showSuccess('Vorschlag angewendet');
  } catch (err) {
    showError('Fehler beim Anwenden: ' + (err.message || 'Unbekannter Fehler'));
  }
}

/** User-Setting toggeln */
async function toggleUserSetting(key) {
  const currentVal = shoppingStore.userSettings[key];
  const newVal = currentVal === '1' ? '0' : '1';
  try {
    await shoppingStore.saveUserSetting(key, newVal);
  } catch (err) {
    showError('Einstellung konnte nicht gespeichert werden');
  }
}

function openSettings(tab = 'rewe') {
  settingsTab.value = tab;
  showSettings.value = true;
  if (tab === 'rewe') {
    loadReweMarketSettings();
  }
}

// Bring!-Listen laden, wenn Bring!-Tab im Einstellungs-Modal geöffnet wird
watch(() => showSettings.value && settingsTab.value === 'bring', async (open) => {
  if (open && shoppingStore.bringStatus?.connected) {
    bringListsLoading.value = true;
    try {
      await shoppingStore.fetchBringLists();
      selectedBringList.value = shoppingStore.bringStatus.list?.uuid || shoppingStore.bringLists[0]?.uuid || '';
    } catch { /* ignore */ }
    bringListsLoading.value = false;
  }
});

// ============================================
// Bring! Funktionen
// ============================================

async function connectBring() {
  bringConnecting.value = true;
  try {
    const data = await shoppingStore.connectBring(bringEmail.value.trim(), bringPassword.value);
    bringPassword.value = '';
    // Listen setzen
    if (data.availableLists?.length) {
      selectedBringList.value = data.list?.uuid || data.availableLists[0].uuid;
    }
    showSuccess(`Bring! verbunden! 🎉 Liste: ${data.list?.name || 'Einkaufsliste'}`);
  } catch {
    showError('Bring!-Login fehlgeschlagen. Bitte prüfe deine Zugangsdaten.');
  } finally {
    bringConnecting.value = false;
  }
}

async function sendToBring() {
  try {
    const listUuid = selectedBringList.value || shoppingStore.bringStatus?.list?.uuid;
    const result = await shoppingStore.sendToBring(listUuid);
    showSuccess(`${result.sentCount} Artikel an Bring! gesendet! 📲`);
    if (result.errors?.length) {
      showError(`${result.errors.length} Artikel konnten nicht gesendet werden.`);
    }
    showCompletePurchasePrompt.value = true;
  } catch {
    showError('Senden an Bring! fehlgeschlagen.');
  }
}

async function changeBringList() {
  const list = shoppingStore.bringLists.find(l => l.uuid === selectedBringList.value);
  if (list) {
    try {
      await shoppingStore.setBringList(list.uuid, list.name);
      showSuccess(`Standard-Liste: ${list.name}`);
    } catch {
      showError('Liste konnte nicht geändert werden.');
    }
  }
}

async function disconnectBring() {
  try {
    await shoppingStore.disconnectBring();
    showSuccess('Bring!-Verbindung getrennt.');
  } catch {
    showError('Fehler beim Trennen.');
  }
}

async function openBringImportPicker() {
  showBringImportPicker.value = true;
  // Listen laden falls noch nicht vorhanden
  if (shoppingStore.bringLists.length === 0) {
    bringListsLoading.value = true;
    try {
      await shoppingStore.fetchBringLists();
    } catch { /* ignore */ }
    bringListsLoading.value = false;
  }
}

async function confirmBringImport(listUuid) {
  showBringImportPicker.value = false;
  try {
    const result = await shoppingStore.importFromBring(listUuid);
    if (result.importedCount > 0) {
      showSuccess(`${result.importedCount} Artikel aus Bring! importiert! 📥`);
    } else if (result.skippedCount > 0) {
      showSuccess('Alle Bring!-Artikel sind bereits in der Liste.');
    } else {
      showSuccess(result.message || 'Keine Artikel zum Importieren.');
    }
    if (result.skippedCount > 0 && result.importedCount > 0) {
      showSuccess(`${result.skippedCount} Duplikate übersprungen.`);
    }
  } catch {
    showError('Import aus Bring! fehlgeschlagen.');
  }
}

// ============================================
// REWE Warenkorb-Script
// ============================================

async function loadCartScript() {
  cartScriptLoading.value = true;
  try {
    const data = await shoppingStore.getReweCartScript();
    if (data.error) {
      showError(data.error);
      return;
    }
    cartScript.value = data.script;
    showCartScript.value = true;
  } catch {
    showError('Script konnte nicht generiert werden.');
  } finally {
    cartScriptLoading.value = false;
  }
}

async function copyCartScript() {
  try {
    await navigator.clipboard.writeText(cartScript.value);
    cartScriptCopied.value = true;
    setTimeout(() => { cartScriptCopied.value = false; }, 2000);
    showSuccess('Script kopiert! Jetzt in die REWE-Konsole einfügen.');
  } catch {
    showError('Kopieren fehlgeschlagen.');
  }
}

async function installUserscript() {
  try {
    // Sicherstellen, dass ein API-Key existiert
    if (!apiKeyValue.value) {
      const data = await shoppingStore.generateApiKey();
      apiKeyValue.value = data.apiKey;
    }
    const url = shoppingStore.getReweUserscriptUrl();
    window.open(url, '_blank');
    showSuccess('Userscript wird geöffnet – bestätige die Installation in Tampermonkey!');
  } catch {
    showError('Userscript-URL konnte nicht generiert werden.');
  }
}

// ============================================
// Auswahl-Modus (vereinheitlicht)
// ============================================

function toggleSelectMode() {
  selectMode.value = !selectMode.value;
  selectedItems.value = [];
  // Modi zurücksetzen
  mergeMode.value = false;
  mergeSelection.value = [];
  showMergeDialog.value = false;
  blockMode.value = false;
  blockSelection.value = [];
}

function handleSelectClick(item) {
  if (!selectMode.value) return;
  const idx = selectedItems.value.findIndex(s => s.id === item.id);
  if (idx >= 0) {
    selectedItems.value.splice(idx, 1);
  } else {
    selectedItems.value.push(item);
  }
}

function selectAllItems() {
  const items = shoppingStore.activeList?.items?.filter(i => !i.is_checked) || [];
  selectedItems.value = [...items];
}

function startMergeFromSelection() {
  if (selectedItems.value.length < 2) return;
  mergeSelection.value = [...selectedItems.value];
  mergeMode.value = true;
  openMergeDialog();
}

function startBlockFromSelection() {
  if (selectedItems.value.length < 1) return;
  blockSelection.value = [...selectedItems.value];
  blockMode.value = true;
  confirmBlockSelection();
}

async function deleteSelectedItems() {
  if (selectedItems.value.length < 1) return;
  const toDelete = [...selectedItems.value];
  const count = toDelete.length;
  try {
    for (const item of toDelete) {
      await shoppingStore.deleteItem(item.id);
    }
    showSuccess(`${count} Artikel gelöscht 🗑️`);
    selectedItems.value = [];
    selectMode.value = false;
  } catch {
    showError('Artikel konnten nicht gelöscht werden.');
  }
}

// ============================================
// Zusammenfassen (Merge) Funktionen
// ============================================

function toggleMergeMode() {
  mergeMode.value = !mergeMode.value;
  mergeSelection.value = [];
  showMergeDialog.value = false;
}

function selectAllForMerge() {
  const items = shoppingStore.activeList?.items?.filter(i => !i.is_checked) || [];
  mergeSelection.value = [...items];
}

// Eindeutige Namen aus der Auswahl (für Radio-Buttons im Dialog)
const mergeUniqueNames = computed(() => {
  const names = mergeSelection.value.map(s => s.ingredient_name);
  return [...new Set(names)];
});

function openMergeDialog() {
  if (mergeSelection.value.length < 2) return;
  mergeName.value = mergeSelection.value[0].ingredient_name;
  showMergeDialog.value = true;
}

async function confirmMerge() {
  if (mergeSelection.value.length < 2 || !mergeName.value.trim()) return;
  try {
    // Erstes Item wird Ziel, alle anderen sind Sources
    const targetItem = mergeSelection.value[0];
    const sourceItems = mergeSelection.value.slice(1);
    await aliasStore.mergeItems(
      sourceItems.map(s => s.id),
      targetItem.id,
      mergeName.value.trim()
    );
    await shoppingStore.fetchActiveList();
    await aliasStore.fetchAliases();
    showSuccess(`${mergeSelection.value.length} Zutaten zusammengefasst! "${mergeName.value}" wird künftig automatisch erkannt. ✅`);
    showMergeDialog.value = false;
    mergeSelection.value = [];
    mergeMode.value = false;
    selectMode.value = false;
    selectedItems.value = [];
  } catch {
    showError('Zusammenfassen fehlgeschlagen.');
  }
}

function cancelMerge() {
  showMergeDialog.value = false;
}

// ============================================
// Alias-Verwaltung
// ============================================

async function deleteAlias(alias) {
  try {
    await aliasStore.deleteAlias(alias.id);
    showSuccess(`Zusammenfassung "${alias.alias_name}" gelöscht.`);
  } catch {
    showError('Löschen fehlgeschlagen.');
  }
}

async function unblockIngredient(blocked) {
  try {
    await aliasStore.unblockIngredient(blocked.id);
    showSuccess(`"${blocked.ingredient_name}" wieder freigegeben ✅`);
  } catch {
    showError('Freigabe fehlgeschlagen.');
  }
}

// ============================================
// Blockier-Modus Funktionen
// ============================================

function toggleBlockMode() {
  blockMode.value = !blockMode.value;
  blockSelection.value = [];
}

async function confirmBlockSelection() {
  if (blockSelection.value.length === 0) return;
  try {
    // Alle ausgewählten Zutaten blockieren und von der Liste entfernen
    const names = [];
    for (const item of blockSelection.value) {
      await aliasStore.blockIngredient(item.ingredient_name);
      await shoppingStore.deleteItem(item.id);
      names.push(item.ingredient_name);
    }
    showSuccess(`${names.length} Zutat${names.length > 1 ? 'en' : ''} blockiert: ${names.join(', ')} 🚫`);
    blockSelection.value = [];
    blockMode.value = false;
    selectMode.value = false;
    selectedItems.value = [];
  } catch {
    showError('Blockieren fehlgeschlagen.');
  }
}

// ============================================
// Einkaufslisten-Verlauf
// ============================================

async function reactivateHistoryList(listId) {
  try {
    await shoppingStore.reactivateList(listId);
    // Verlauf neu laden (Aktiv-Status hat sich geändert)
    shoppingStore.fetchListHistory();
    showSuccess('Einkaufsliste wiederhergestellt! 🛒');
  } catch {
    showError('Liste konnte nicht geladen werden.');
  }
}

const historyDropdownStyle = computed(() => {
  // Trigger bei Öffnen (macht den computed reaktiv)
  void historyDropdownTop.value;
  // Auf Desktop (sm+) → absolute-Positionierung via CSS-Klassen
  if (typeof window !== 'undefined' && window.innerWidth >= 640) return {};
  // Auf Mobile → fixed mit sicheren Rändern
  if (!historyBtnRef.value) return { left: '0.75rem', right: '0.75rem' };
  const rect = historyBtnRef.value.getBoundingClientRect();
  return {
    top: `${rect.bottom + 6}px`,
    left: '0.75rem',
    right: '0.75rem',
  };
});

async function openHistoryDropdown() {
  showHistoryDropdown.value = !showHistoryDropdown.value;
  if (showHistoryDropdown.value) {
    // Verlauf aktualisieren beim Öffnen
    shoppingStore.fetchListHistory();
    // Position nach nächstem Tick neu berechnen (für computed reactivity)
    await nextTick();
    historyDropdownTop.value = Date.now(); // Trigger reactivity
  }
}

function formatHistoryDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
</script>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
.slide-enter-active {
  transition: all 0.3s ease-out;
}
.slide-leave-active {
  transition: all 0.2s ease-in;
}
.slide-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}
.slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* Highlight-Flash für neu aus dem Vorratscheck hinzugefügte Items */
@keyframes highlight-flash {
  0% {
    background-color: rgb(187 247 208); /* green-200 */
  }
  100% {
    background-color: transparent;
  }
}
@media (prefers-color-scheme: dark) {
  @keyframes highlight-flash {
    0% {
      background-color: rgb(6 78 59 / 0.5); /* emerald-950/50 */
    }
    100% {
      background-color: transparent;
    }
  }
}
.highlight-flash {
  animation: highlight-flash 1.8s ease-out;
}
:is(.dark .highlight-flash) {
  animation: highlight-flash-dark 1.8s ease-out;
}
@keyframes highlight-flash-dark {
  0% {
    background-color: rgb(6 78 59 / 0.5);
  }
  100% {
    background-color: transparent;
  }
}
</style>
