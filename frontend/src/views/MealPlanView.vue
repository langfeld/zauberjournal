<!--
  ============================================
  MealPlanView – Moderner Wochenplaner
  ============================================
  Features:
  - Funktionierende Wochen-Navigation (lädt Plan beim Wechsel)
  - Wochen-Raster (Desktop) + Tages-Ansicht (Mobile / Klick)
  - Rezeptbilder, Zubereitungszeit, Schwierigkeit
  - Drag & Drop zwischen Slots
  - Rezept tauschen mit intelligenten Vorschlägen
  - Generierungs-Dialog mit Mahlzeiten-Auswahl
  - Gekocht-Markierung (toggle)
-->
<template>
  <div class="flex absolute inset-0">
  <!-- Hauptbereich -->
  <div class="flex-1 overflow-y-auto p-4 lg:p-6 min-w-0">
  <div class="space-y-6 mx-auto max-w-7xl animate-fade-in">

    <!-- ═══════════════════ HEADER ═══════════════════ -->
    <div class="flex sm:flex-row flex-col justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="font-display font-bold text-stone-800 dark:text-stone-100 text-2xl">🗓️ Wochenplaner</h1>
        <p class="text-stone-500 dark:text-stone-400 text-sm">
          Intelligenter Essensplan – score-basiert &amp; per Drag&amp;Drop anpassbar
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto">
        <button @click="showRecipeBrowser = !showRecipeBrowser"
          :class="['hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-colors',
            showRecipeBrowser
              ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900'
              : 'hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 dark:text-stone-400']"
          title="Rezepte-Browser ein-/ausblenden">
          <BookOpen class="w-4 h-4" />
          <span class="hidden sm:inline">Rezepte</span>
        </button>
        <button v-if="currentPlan?.id && viewMode === 'plan'" @click="toggleLockPlan"
          :class="['flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-colors',
            isLocked
              ? 'bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900'
              : 'hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400']"
          :title="isLocked ? 'Fixierung aufheben' : 'Woche fixieren (bereits eingekauft)'">
          <Lock v-if="isLocked" class="w-4 h-4" />
          <Unlock v-else class="w-4 h-4" />
          <span class="hidden sm:inline">{{ isLocked ? 'Fixiert' : 'Fixieren' }}</span>
        </button>
        <button @click="showLoadDialog = true"
          class="flex items-center gap-1.5 hover:bg-stone-100 dark:hover:bg-stone-800 px-3 py-2 rounded-xl text-stone-600 dark:text-stone-400 text-sm transition-colors"
          title="Gespeicherten Plan laden">
          <FolderSearch class="w-4 h-4" />
          <span class="hidden sm:inline">Laden</span>
        </button>
        <button v-if="currentPlan?.id && viewMode === 'plan' && !isLocked" @click="confirmDeletePlan"
          class="flex items-center gap-1.5 hover:bg-red-50 dark:hover:bg-red-950 px-3 py-2 rounded-xl text-red-500 text-sm transition-colors">
          <Trash2 class="w-4 h-4" /> <span class="hidden sm:inline">Löschen</span>
        </button>
        <!-- Split-Button: Generieren + Einstellungen -->
        <div class="flex sm:flex-initial flex-1 shadow-sm rounded-xl overflow-hidden">
          <button @click="openGenerateModal()" :disabled="store.generating || !isOnline"
            :title="!isOnline ? 'Internetverbindung erforderlich' : ''"
            class="flex sm:flex-initial flex-1 justify-center items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-3 sm:px-4 py-2 font-medium text-white text-sm transition-colors">
            <Sparkles class="w-4 h-4" :class="{ 'animate-pulse': store.generating }" />
            <span class="hidden sm:inline">{{ store.generating ? 'Wird erstellt…' : 'Plan generieren' }}</span>
            <span class="sm:hidden">{{ store.generating ? 'Erstellt…' : 'Generieren' }}</span>
          </button>
          <button @click="showGenSettings = true"
            class="flex items-center bg-primary-600 hover:bg-primary-700 px-2.5 py-2 border-primary-500 border-l text-white transition-colors"
            title="Generierungs-Einstellungen">
            <Settings class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>

    <!-- ═══════════════════ NAVIGATION ═══════════════════ -->
    <div :class="viewMode === 'plan'
      ? 'flex items-center gap-2'
      : 'flex flex-wrap justify-between items-center gap-3'">

      <!-- Plan-Modus: Plan-Auswahl -->
      <div v-if="viewMode === 'plan'" class="flex items-center gap-2 flex-1 min-w-0">
        <div v-if="store.plans.length" class="relative min-w-0">
          <button @click="showPlanDropdown = !showPlanDropdown"
            class="flex items-center gap-2 bg-white dark:bg-stone-800 shadow-sm hover:shadow px-3 py-2 border border-stone-200 dark:border-stone-700 rounded-xl font-medium text-stone-700 dark:text-stone-200 text-sm transition-all w-full sm:w-auto sm:max-w-xs">
            <CalendarDays class="w-4 h-4 text-primary-500 shrink-0" />
            <span class="truncate">{{ selectedPlanId ? planLabel(store.plans.find(p => p.id === selectedPlanId)) : 'Plan wählen' }}</span>
            <ChevronDown class="w-3.5 h-3.5 text-stone-400 shrink-0 transition-transform" :class="showPlanDropdown ? 'rotate-180' : ''" />
          </button>
          <!-- Backdrop -->
          <Transition name="fade">
            <div v-if="showPlanDropdown" class="fixed inset-0 z-30" @click="showPlanDropdown = false" />
          </Transition>
          <!-- Dropdown -->
          <Transition name="fade">
            <div v-if="showPlanDropdown" class="absolute left-0 top-full mt-1.5 z-30 bg-white dark:bg-stone-800 shadow-xl border border-stone-200 dark:border-stone-700 rounded-xl w-72 sm:w-80 max-w-[calc(100vw-2rem)] max-h-72 overflow-y-auto scrollbar-thin">
              <div class="p-1.5">
                <button v-for="p in store.plans" :key="p.id"
                  @click="onPlanSelect(p.id); showPlanDropdown = false"
                  class="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left transition-colors"
                  :class="selectedPlanId === p.id
                    ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 ring-1 ring-primary-300 dark:ring-primary-700'
                    : 'hover:bg-stone-50 dark:hover:bg-stone-700/50 text-stone-700 dark:text-stone-200'">
                  <div class="flex justify-center items-center rounded-lg w-9 h-9 font-bold text-sm shrink-0"
                    :class="selectedPlanId === p.id
                      ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400'
                      : 'bg-stone-100 dark:bg-stone-700 text-stone-500 dark:text-stone-400'">
                    {{ p.meal_count || 0 }}
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="font-medium text-sm truncate">{{ planDateRange(p) }}</div>
                    <div class="text-xs text-stone-400 dark:text-stone-500">{{ p.meal_count || 0 }} Rezepte · {{ planDaysCount(p) }} Tage</div>
                  </div>
                  <Check v-if="selectedPlanId === p.id" class="w-4 h-4 text-primary-500 shrink-0" />
                </button>
              </div>
            </div>
          </Transition>
        </div>
        <span v-else class="text-stone-500 dark:text-stone-400 text-sm">Keine Pläne vorhanden</span>
      </div>

      <!-- Wochen/Tag-Modus: Klassische Navigation -->
      <template v-else>
        <div class="flex items-center gap-1">
          <button @click="changeWeek(-1)" class="hover:bg-stone-100 dark:hover:bg-stone-800 p-2 rounded-lg transition-colors">
            <ChevronLeft class="w-5 h-5 text-stone-600 dark:text-stone-400" />
          </button>
          <button @click="goToToday"
            class="bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 px-3 py-1.5 rounded-lg font-medium text-stone-700 dark:text-stone-300 text-sm transition-colors">
            Heute
          </button>
          <button @click="changeWeek(1)" class="hover:bg-stone-100 dark:hover:bg-stone-800 p-2 rounded-lg transition-colors">
            <ChevronRight class="w-5 h-5 text-stone-600 dark:text-stone-400" />
          </button>
        </div>

        <span class="font-semibold text-stone-700 dark:text-stone-300 text-sm">
          {{ weekLabel }}
        </span>
      </template>

      <!-- Ansicht-Toggle + Slot-Einstellungen -->
      <div class="flex items-center gap-2 shrink-0">
        <!-- Sichtbare Slots -->
        <div class="relative">
          <button @click="showSlotSettings = !showSlotSettings"
            :class="[
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors',
              showSlotSettings
                ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
                : 'hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-400'
            ]">
            <Settings class="w-4 h-4" />
            <span class="hidden sm:inline">Slots</span>
          </button>
          <Transition name="fade">
            <div v-if="showSlotSettings"
              class="sm:right-0 left-0 sm:left-auto z-30 absolute bg-white dark:bg-stone-900 shadow-lg mt-2 p-3 border border-stone-200 dark:border-stone-700 rounded-xl w-52">
              <p class="mb-2 font-medium text-stone-700 dark:text-stone-300 text-xs uppercase tracking-wide">Sichtbare Zeitslots</p>
              <label v-for="mt in allMealTypes" :key="mt.id"
                class="flex items-center gap-2 hover:bg-stone-50 dark:hover:bg-stone-800 px-2 py-1.5 rounded-lg transition-colors cursor-pointer">
                <input type="checkbox" :value="mt.id" v-model="visibleSlots"
                  class="rounded text-primary-600 accent-primary-600" />
                <span class="text-sm">{{ mt.icon }} {{ mt.name }}</span>
              </label>
              <p v-if="visibleSlots.length === 0" class="mt-1 text-amber-600 text-xs">
                Mindestens ein Slot sollte sichtbar sein
              </p>
            </div>
          </Transition>
          <!-- Backdrop zum Schließen -->
          <div v-if="showSlotSettings" @click="showSlotSettings = false" class="z-20 fixed inset-0" />
        </div>

        <div class="flex bg-stone-100 dark:bg-stone-800 rounded-lg overflow-hidden">
          <button @click="switchToViewMode('plan')" :class="viewToggleClass('plan')">
            <List class="w-4 h-4" /> <span class="hidden sm:inline">Plan</span>
          </button>
          <button @click="switchToViewMode('week')" :class="viewToggleClass('week')">
            <LayoutGrid class="w-4 h-4" /> <span class="hidden sm:inline">Woche</span>
          </button>
          <button @click="switchToViewMode('day')" :class="viewToggleClass('day')">
            <CalendarDays class="w-4 h-4" /> <span class="hidden sm:inline">Tag</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ═══════════════════ REZEPT-VORSCHLÄGE ═══════════════════ -->
    <SuggestionBox
      :last-week-recipes="store.lastWeekRecipes"
      :household-suggestions="suggestions"
      :past-week-recipes="store.pastWeekRecipes"
      :past-week-index="store.pastWeekIndex"
      :past-week-number="store.pastWeekNumber"
      :past-week-has-plan="store.pastWeekHasPlan"
      :past-weeks-list="store.pastWeeksList"
      :show-household-tab="householdStore.isInHousehold"
      :current-plan="currentPlan"
      :is-locked="isLocked"
      :week-days="weekDays"
      :meal-types="mealTypes"
      @suggestion-drag-start="onSuggestionDragStart"
      @suggestion-drag-end="onSuggestionDragEnd"
      @past-week-change="onPastWeekChange"
      @assign-recipe="onAssignRecipe"
    />

    <!-- ═══════════════════ INHALT ═══════════════════ -->

    <!-- KI-/Algorithmus-Reasoning -->
    <Transition name="fade">
      <!-- Lade-Zustand: Reasoning wird im Hintergrund geladen -->
      <div v-if="store.reasoningLoading && !store.reasoning && currentPlan" key="reasoning-loading"
           class="relative bg-linear-to-r from-primary-50 dark:from-primary-950/50 to-transparent px-4 py-3 border border-primary-200 dark:border-primary-800 rounded-xl">
        <div class="flex items-start gap-3">
          <div class="flex justify-center items-center bg-primary-100 dark:bg-primary-900 rounded-lg w-8 h-8 shrink-0">
            <div class="border-2 border-primary-200 border-t-primary-600 rounded-full w-4 h-4 animate-spin" />
          </div>
          <!-- Desktop: volles Loading -->
          <div class="hidden lg:block flex-1 min-w-0">
            <p class="mb-0.5 font-medium text-primary-800 dark:text-primary-200 text-xs uppercase tracking-wide">KI-Begründung</p>
            <div class="space-y-1.5">
              <div class="bg-primary-100 dark:bg-primary-900/50 rounded w-4/5 h-3 animate-pulse" />
              <div class="bg-primary-100 dark:bg-primary-900/50 rounded w-3/5 h-3 animate-pulse" />
            </div>
          </div>
          <!-- Mobile: kompaktes Loading -->
          <div class="lg:hidden flex-1 min-w-0">
            <p class="font-medium text-primary-800 dark:text-primary-200 text-xs uppercase tracking-wide">KI-Begründung wird geladen…</p>
          </div>
        </div>
      </div>

      <!-- Fertiges Reasoning -->
      <div v-else-if="store.reasoning && currentPlan" key="reasoning-ready" class="relative border rounded-xl"
           :class="[
             store.reasoningSource === 'ai'
               ? 'bg-linear-to-r from-primary-50 dark:from-primary-950/50 to-transparent border-primary-200 dark:border-primary-800'
               : 'bg-linear-to-r from-stone-50 dark:from-stone-900/50 to-transparent border-stone-200 dark:border-stone-700',
             reasoningCollapsed ? 'lg:px-4 lg:py-3' : 'px-4 py-3'
           ]">
        <!-- Desktop: immer voll sichtbar -->
        <div class="hidden lg:flex items-start gap-3">
          <div class="flex justify-center items-center rounded-lg w-8 h-8 shrink-0"
               :class="store.reasoningSource === 'ai' ? 'bg-primary-100 dark:bg-primary-900' : 'bg-stone-100 dark:bg-stone-800'">
            <Sparkles v-if="store.reasoningSource === 'ai'" class="w-4 h-4 text-primary-600 dark:text-primary-400" />
            <Info v-else class="w-4 h-4 text-stone-500 dark:text-stone-400" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="mb-0.5 font-medium text-xs uppercase tracking-wide"
               :class="store.reasoningSource === 'ai' ? 'text-primary-800 dark:text-primary-200' : 'text-stone-600 dark:text-stone-400'">
              {{ store.reasoningSource === 'ai' ? 'KI-Begründung' : 'Plan-Zusammenfassung' }}
              <span v-if="store.reasoningSource === 'algorithm'" class="opacity-70 font-normal normal-case tracking-normal">(KI nicht verfügbar)</span>
            </p>
            <p class="text-stone-700 dark:text-stone-300 text-sm leading-relaxed">{{ store.reasoning }}</p>
          </div>
          <button @click="store.reasoning = null" class="hover:bg-stone-100 dark:hover:bg-stone-800 p-1 rounded-lg transition-colors shrink-0" title="Schließen">
            <X class="w-4 h-4 text-stone-400" />
          </button>
        </div>
        <!-- Mobile: einklappbar -->
        <div class="lg:hidden">
          <button @click="reasoningCollapsed = !reasoningCollapsed" class="flex items-center gap-2.5 px-3.5 py-2.5 w-full text-left">
            <div class="flex justify-center items-center rounded-lg w-7 h-7 shrink-0"
                 :class="store.reasoningSource === 'ai' ? 'bg-primary-100 dark:bg-primary-900' : 'bg-stone-100 dark:bg-stone-800'">
              <Sparkles v-if="store.reasoningSource === 'ai'" class="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />
              <Info v-else class="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
            </div>
            <span class="flex-1 font-medium text-xs uppercase tracking-wide"
                  :class="store.reasoningSource === 'ai' ? 'text-primary-800 dark:text-primary-200' : 'text-stone-600 dark:text-stone-400'">
              {{ store.reasoningSource === 'ai' ? 'KI-Begründung' : 'Plan-Zusammenfassung' }}
            </span>
            <ChevronDown class="w-4 h-4 text-stone-400 transition-transform duration-200" :class="{ 'rotate-180': !reasoningCollapsed }" />
          </button>
          <Transition name="fade">
            <div v-if="!reasoningCollapsed" class="px-3.5 pb-3">
              <p class="text-stone-700 dark:text-stone-300 text-sm leading-relaxed">{{ store.reasoning }}</p>
              <button @click="store.reasoning = null" class="mt-2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 text-xs underline hover:no-underline">
                Ausblenden
              </button>
            </div>
          </Transition>
        </div>
      </div>
    </Transition>

    <!-- Laden -->
    <div v-if="store.loading || store.generating" class="flex flex-col items-center gap-3 py-16">
      <div class="border-2 border-primary-200 border-t-primary-600 rounded-full w-10 h-10 animate-spin" />
      <p class="text-stone-500 text-sm">{{ store.generating ? 'Plan wird generiert…' : 'Lade Plan…' }}</p>
    </div>

    <!-- Kein Plan -->
    <div v-else-if="!currentPlan && viewMode !== 'plan'" class="py-16 text-center"
      @dragover.prevent="suggestionDragData && onDragOverEmpty($event)"
      @dragleave="dragOverEmpty = false"
      @drop.prevent="suggestionDragData && onDropEmpty($event)"
      :class="{ 'no-plan-drop-target': dragOverEmpty }">
      <div class="mb-4 text-6xl">📋</div>
      <h2 class="mb-2 font-semibold text-stone-700 dark:text-stone-300 text-xl">Kein Plan für diese Woche</h2>
      <p v-if="!dragOverEmpty" class="mx-auto mb-6 max-w-md text-stone-500 dark:text-stone-400 text-sm">
        Erstelle einen intelligenten Essensplan basierend auf deinen Rezepten, Kochhistorie und Vorräten.
      </p>
      <p v-else class="mx-auto mb-6 max-w-md font-medium text-primary-600 dark:text-primary-400 text-sm">
        Loslassen um einen neuen Wochenplan zu erstellen
      </p>
      <div class="flex flex-wrap justify-center gap-3">
        <button @click="openGenerateModal()"
          class="bg-primary-600 hover:bg-primary-700 px-6 py-3 rounded-xl font-medium text-white transition-colors">
          <Sparkles class="inline mr-2 w-4 h-4" /> Plan generieren
        </button>
        <button @click="showLoadDialog = true"
          class="bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 px-6 py-3 rounded-xl font-medium text-stone-700 dark:text-stone-300 transition-colors">
          <FolderSearch class="inline mr-2 w-4 h-4" /> Plan laden
        </button>
      </div>
    </div>

    <!-- ═══════════════════ PLAN-ANSICHT ═══════════════════ -->
    <template v-if="currentPlan && viewMode === 'plan' && planDays.length">
      <!-- Plan-Info Banner -->
      <div class="flex items-center gap-3 bg-stone-50 dark:bg-stone-900 px-4 py-3 border border-stone-200 dark:border-stone-700 rounded-xl">
        <List class="w-5 h-5 text-primary-500 shrink-0" />
        <div class="flex-1 min-w-0">
          <span class="font-semibold text-stone-700 dark:text-stone-200 text-sm">
            {{ currentPlan.start_date && currentPlan.end_date
              ? new Date(currentPlan.start_date + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' })
                + ' – '
                + new Date(currentPlan.end_date + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' })
              : '' }}
          </span>
          <span class="ml-2 text-stone-500 dark:text-stone-400 text-xs">
            {{ planDays.length }} Tage · {{ currentPlan.entries?.length || 0 }} Rezepte
          </span>
        </div>
        <Lock v-if="isLocked" class="w-4 h-4 text-amber-500 shrink-0" title="Fixiert" />
        <!-- Toggle: Vergangene Tage -->
        <button @click="hidePastDays = !hidePastDays"
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors shrink-0"
          :class="hidePastDays
            ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400'
            : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700'"
          :title="hidePastDays ? 'Vergangene Tage einblenden' : 'Vergangene Tage ausblenden'">
          <EyeOff v-if="hidePastDays" class="w-3.5 h-3.5" />
          <Eye v-else class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">{{ hidePastDays ? 'Vergangene ausgeblendet' : 'Alle Tage' }}</span>
        </button>
      </div>

      <!-- Fixiert-Banner -->
      <div v-if="isLocked" class="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/50 px-4 py-2.5 border border-amber-200 dark:border-amber-800 rounded-xl">
        <Lock class="w-4 h-4 text-amber-500 shrink-0" />
        <p class="flex-1 text-amber-700 dark:text-amber-300 text-sm">
          <span class="font-medium">Plan fixiert</span> – Bereits eingekauft.
        </p>
        <button @click="toggleLockPlan" class="text-amber-600 hover:text-amber-800 dark:hover:text-amber-200 dark:text-amber-400 text-xs underline hover:no-underline shrink-0">
          Aufheben
        </button>
      </div>

      <!-- ═══════ DESKTOP PLAN-ANSICHT ═══════ -->
      <div class="hidden lg:block space-y-6">
        <!-- Hinweis wenn alle Tage gefiltert -->
        <div v-if="filteredPlanDays.length === 0 && planDays.length > 0" class="py-8 text-center">
          <EyeOff class="mx-auto mb-2 w-8 h-8 text-stone-300 dark:text-stone-600" />
          <p class="text-stone-500 dark:text-stone-400 text-sm">Alle Tage liegen in der Vergangenheit.</p>
          <button @click="hidePastDays = false" class="mt-2 text-primary-600 dark:text-primary-400 text-sm underline hover:no-underline">Vergangene Tage einblenden</button>
        </div>

        <!-- ── Single-Slot: Tage nebeneinander im Grid ── -->
        <template v-if="isSingleSlot && filteredPlanDays.length">
          <!-- Slot-Überschrift -->
          <div v-if="mealTypes.length === 1" class="flex items-center gap-2">
            <span class="text-lg">{{ mealTypes[0].icon }}</span>
            <h3 class="font-semibold text-stone-700 dark:text-stone-200 text-base">{{ mealTypes[0].name }}</h3>
          </div>

          <div class="gap-x-4 gap-y-8 grid grid-cols-2 xl:grid-cols-4">
            <div v-for="day in filteredPlanDays" :key="'ss-' + day.dateStr"
              class="flex flex-col gap-2"
              :class="{ 'opacity-50': isDatePast(day.dateStr) && !isDateToday(day.dateStr) }">

              <!-- Tag-Header -->
              <div class="flex items-center gap-3">
                <div class="flex justify-center items-center rounded-xl w-10 h-10 font-bold tabular-nums text-lg shrink-0"
                  :class="isDateToday(day.dateStr)
                    ? 'bg-primary-500 text-white shadow-sm'
                    : isDatePast(day.dateStr)
                      ? 'bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500'
                      : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200'">
                  {{ day.dateObj.getDate() }}
                </div>
                <div class="min-w-0 leading-tight">
                  <div class="font-semibold text-sm truncate"
                    :class="isDateToday(day.dateStr)
                      ? 'text-primary-600 dark:text-primary-400'
                      : isDatePast(day.dateStr)
                        ? 'text-stone-400 dark:text-stone-500'
                        : 'text-stone-700 dark:text-stone-200'">
                    {{ day.dateObj.toLocaleDateString('de-DE', { weekday: 'long' }) }}
                  </div>
                  <div class="text-xs"
                    :class="isDateToday(day.dateStr) ? 'text-primary-500/70 dark:text-primary-400/60' : 'text-stone-400 dark:text-stone-500'">
                    {{ day.dateObj.toLocaleDateString('de-DE', { month: 'long' }) }}
                  </div>
                </div>
              </div>

              <!-- Rezeptkarte -->
              <template v-for="mt in mealTypes" :key="mt.id + '-plan-' + day.dateStr">
                <div v-if="getMealByDate(day.dateStr, mt.id)"
                  class="group bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg hover:border-primary-300 dark:hover:border-primary-700"
                  :class="[
                    { 'opacity-55': getMealByDate(day.dateStr, mt.id).is_cooked },
                    { 'meal-slot-dragover': dragTarget?.day === day.dateStr && dragTarget?.meal === mt.id }
                  ]"
                  :draggable="!isLocked"
                  @dragstart="!isLocked && onDragStart($event, getMealByDate(day.dateStr, mt.id))"
                  @dragend="onDragEnd"
                  @dragover.prevent="!isLocked && onPlanDragOver(day.dateStr, mt.id)"
                  @dragleave="onDragLeave"
                  @drop.prevent="!isLocked && onPlanDrop(day.dateStr, mt.id)"
                  @click="selectMeal(getMealByDate(day.dateStr, mt.id))">

                  <!-- Bild -->
                  <div class="relative bg-stone-100 dark:bg-stone-800 aspect-4/3 overflow-hidden">
                    <img v-if="getMealByDate(day.dateStr, mt.id).image_url"
                      :src="getMealByDate(day.dateStr, mt.id).image_url"
                      :alt="getMealByDate(day.dateStr, mt.id).recipe_title"
                      class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy" />
                    <div v-else class="flex justify-center items-center opacity-50 w-full h-full text-5xl">🍽️</div>

                    <!-- Favorit (oben rechts) -->
                    <button @click.stop="toggleMealFavorite(getMealByDate(day.dateStr, mt.id))"
                      class="top-2 right-2 absolute bg-white/80 hover:bg-white dark:bg-stone-900/80 dark:hover:bg-stone-900 backdrop-blur-sm p-1.5 rounded-full transition-colors">
                      <Star class="w-4 h-4" :class="getMealByDate(day.dateStr, mt.id).is_favorite ? 'fill-amber-400 text-amber-400' : 'text-stone-400'" />
                    </button>

                    <!-- Gekocht (oben links) -->
                    <div v-if="getMealByDate(day.dateStr, mt.id).is_cooked"
                      class="top-2 left-2 absolute place-items-center grid rounded-full w-6 h-6 bg-accent-500">
                      <Check class="w-3.5 h-3.5 text-white" />
                    </div>

                    <!-- Schwierigkeitsgrad (unten links) -->
                    <span v-if="getMealByDate(day.dateStr, mt.id).difficulty"
                      :class="['absolute bottom-2 left-2 px-2 py-0.5 text-xs font-medium rounded-full', difficultyClasses[getMealByDate(day.dateStr, mt.id).difficulty] || difficultyClasses.mittel]">
                      {{ getMealByDate(day.dateStr, mt.id).difficulty }}
                    </span>

                    <!-- KI-Badge (unten rechts) -->
                    <span v-if="getMealByDate(day.dateStr, mt.id).ai_generated"
                      class="right-2 bottom-2 absolute bg-indigo-100 dark:bg-indigo-900/60 px-2 py-0.5 rounded-full font-medium text-indigo-700 dark:text-indigo-300 text-xs">
                      🤖 KI
                    </span>
                  </div>

                  <!-- Info -->
                  <div class="p-4">
                    <h4 class="font-semibold text-stone-800 dark:group-hover:text-primary-400 dark:text-stone-100 group-hover:text-primary-600 truncate transition-colors">
                      {{ getMealByDate(day.dateStr, mt.id).recipe_title }}
                    </h4>
                    <p v-if="getMealByDate(day.dateStr, mt.id).recipe_description" class="mt-1 text-stone-500 dark:text-stone-400 text-sm line-clamp-2">
                      {{ getMealByDate(day.dateStr, mt.id).recipe_description }}
                    </p>
                    <div class="flex items-center gap-3 mt-3 text-stone-500 dark:text-stone-400 text-xs">
                      <span v-if="getMealByDate(day.dateStr, mt.id).total_time" class="flex items-center gap-1">
                        <Clock class="w-3.5 h-3.5" /> {{ getMealByDate(day.dateStr, mt.id).total_time }} Min.
                      </span>
                      <span class="flex items-center gap-1 cursor-pointer hover:text-stone-700 dark:hover:text-stone-200"
                        @click.stop="openServingsPopup(getMealByDate(day.dateStr, mt.id), $event)">
                        <Users class="w-3.5 h-3.5" /> {{ getMealByDate(day.dateStr, mt.id).servings }} Port.
                      </span>
                      <span v-if="getMealByDate(day.dateStr, mt.id).times_cooked" class="flex items-center gap-1">
                        <ChefHat class="w-3.5 h-3.5" /> {{ getMealByDate(day.dateStr, mt.id).times_cooked }}x
                      </span>
                      <span v-if="getMealByDate(day.dateStr, mt.id).calories" class="flex items-center gap-1 text-orange-500 dark:text-orange-400">
                        <Flame class="w-3.5 h-3.5" /> {{ Math.round(getMealByDate(day.dateStr, mt.id).calories) }} kcal
                      </span>
                    </div>
                    <div v-if="getMealByDate(day.dateStr, mt.id).category_names" class="flex flex-wrap gap-1 mt-3">
                      <span v-for="cat in getMealByDate(day.dateStr, mt.id).category_names.split(',')"
                        :key="cat"
                        class="bg-stone-100 dark:bg-stone-800 px-2 py-0.5 rounded-full text-stone-600 dark:text-stone-400 text-xs">
                        {{ cat.trim() }}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Leere Karte -->
                <div v-else
                  class="flex flex-col justify-center items-center bg-stone-50 dark:bg-stone-900/50 py-10 border-2 border-stone-200 dark:border-stone-800 border-dashed rounded-xl transition-colors"
                  :class="{ 'meal-slot-dragover': dragTarget?.day === day.dateStr && dragTarget?.meal === mt.id }"
                  @dragover.prevent="!isLocked && onPlanDragOver(day.dateStr, mt.id)"
                  @dragleave="onDragLeave"
                  @drop.prevent="!isLocked && onPlanDrop(day.dateStr, mt.id)">
                  <span class="text-stone-300 dark:text-stone-600 text-xs">Kein Rezept</span>
                </div>
              </template>
            </div>
          </div>

          <!-- Nährwerte unter dem Grid -->
          <div class="gap-x-4 grid grid-cols-2 xl:grid-cols-4 mt-2">
            <template v-for="day in filteredPlanDays" :key="'ssn-' + day.dateStr">
              <div v-if="getDayNutritionByDate(day.dateStr)" class="py-1 text-center">
                <span class="text-[0.65rem] text-stone-400 dark:text-stone-500">
                  🔥 {{ getDayNutritionByDate(day.dateStr).calories }} kcal
                  · {{ getDayNutritionByDate(day.dateStr).protein }}g E
                  · {{ getDayNutritionByDate(day.dateStr).carbs }}g K
                  · {{ getDayNutritionByDate(day.dateStr).fat }}g F
                </span>
              </div>
              <div v-else class="py-1"></div>
            </template>
          </div>
        </template>

        <!-- ── Multi-Slot: Tage untereinander, Slots pro Tag in einer Zeile ── -->
        <template v-if="!isSingleSlot" v-for="day in filteredPlanDays" :key="day.dateStr">
          <div :class="{ 'opacity-50': isDatePast(day.dateStr) && !isDateToday(day.dateStr) }">
            <!-- Tag-Header -->
            <div class="flex items-center gap-3 mb-3">
              <div class="flex justify-center items-center rounded-xl w-10 h-10 font-bold tabular-nums text-lg shrink-0"
                :class="isDateToday(day.dateStr)
                  ? 'bg-primary-500 text-white shadow-sm'
                  : isDatePast(day.dateStr)
                    ? 'bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200'">
                {{ day.dateObj.getDate() }}
              </div>
              <div class="min-w-0 leading-tight">
                <div class="font-semibold text-sm"
                  :class="isDateToday(day.dateStr)
                    ? 'text-primary-600 dark:text-primary-400'
                    : isDatePast(day.dateStr)
                      ? 'text-stone-400 dark:text-stone-500'
                      : 'text-stone-700 dark:text-stone-200'">
                  {{ day.dateObj.toLocaleDateString('de-DE', { weekday: 'long' }) }}
                </div>
                <div class="text-xs"
                  :class="isDateToday(day.dateStr) ? 'text-primary-500/70 dark:text-primary-400/60' : 'text-stone-400 dark:text-stone-500'">
                  {{ day.dateObj.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' }) }}
                  <span v-if="isDateToday(day.dateStr)" class="bg-primary-600 ml-1 px-1.5 py-0.5 rounded-full font-medium text-[0.6rem] text-white">Heute</span>
                </div>
              </div>
              <div v-if="getDayNutritionByDate(day.dateStr)" class="ml-auto text-stone-400 dark:text-stone-500 text-xs">
                🔥 {{ getDayNutritionByDate(day.dateStr).calories }} kcal
                · {{ getDayNutritionByDate(day.dateStr).protein }}g E
                · {{ getDayNutritionByDate(day.dateStr).carbs }}g K
              </div>
            </div>

            <!-- Mahlzeiten horizontal -->
            <div class="gap-x-4 gap-y-6 grid pl-13"
              :class="mealTypes.length <= 2 ? 'grid-cols-2 xl:grid-cols-2' : 'grid-cols-2 xl:grid-cols-4'">
              <template v-for="mt in mealTypes" :key="mt.id + '-plan-' + day.dateStr">
                <div v-if="getMealByDate(day.dateStr, mt.id)"
                  class="group bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg hover:border-primary-300 dark:hover:border-primary-700"
                  :class="[
                    { 'opacity-55': getMealByDate(day.dateStr, mt.id).is_cooked },
                    { 'meal-slot-dragover': dragTarget?.day === day.dateStr && dragTarget?.meal === mt.id }
                  ]"
                  :draggable="!isLocked"
                  @dragstart="!isLocked && onDragStart($event, getMealByDate(day.dateStr, mt.id))"
                  @dragend="onDragEnd"
                  @dragover.prevent="!isLocked && onPlanDragOver(day.dateStr, mt.id)"
                  @dragleave="onDragLeave"
                  @drop.prevent="!isLocked && onPlanDrop(day.dateStr, mt.id)"
                  @click="selectMeal(getMealByDate(day.dateStr, mt.id))">

                  <!-- Bild -->
                  <div class="relative bg-stone-100 dark:bg-stone-800 aspect-4/3 overflow-hidden">
                    <img v-if="getMealByDate(day.dateStr, mt.id).image_url"
                      :src="getMealByDate(day.dateStr, mt.id).image_url"
                      :alt="getMealByDate(day.dateStr, mt.id).recipe_title"
                      class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy" />
                    <div v-else class="flex justify-center items-center opacity-50 w-full h-full text-5xl">🍽️</div>

                    <!-- Mahlzeit-Badge (oben links) -->
                    <div class="top-2 left-2 absolute bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded-lg font-medium text-white text-xs">
                      {{ mt.icon }} {{ mt.name }}
                    </div>

                    <!-- Favorit (oben rechts) -->
                    <button @click.stop="toggleMealFavorite(getMealByDate(day.dateStr, mt.id))"
                      class="top-2 right-2 absolute bg-white/80 hover:bg-white dark:bg-stone-900/80 dark:hover:bg-stone-900 backdrop-blur-sm p-1.5 rounded-full transition-colors">
                      <Star class="w-4 h-4" :class="getMealByDate(day.dateStr, mt.id).is_favorite ? 'fill-amber-400 text-amber-400' : 'text-stone-400'" />
                    </button>

                    <!-- Gekocht (mittig links, unter Mahlzeit-Badge) -->
                    <div v-if="getMealByDate(day.dateStr, mt.id).is_cooked"
                      class="top-9 left-2 absolute place-items-center grid rounded-full w-6 h-6 bg-accent-500">
                      <Check class="w-3.5 h-3.5 text-white" />
                    </div>

                    <!-- Schwierigkeitsgrad (unten links) -->
                    <span v-if="getMealByDate(day.dateStr, mt.id).difficulty"
                      :class="['absolute bottom-2 left-2 px-2 py-0.5 text-xs font-medium rounded-full', difficultyClasses[getMealByDate(day.dateStr, mt.id).difficulty] || difficultyClasses.mittel]">
                      {{ getMealByDate(day.dateStr, mt.id).difficulty }}
                    </span>

                    <!-- KI-Badge (unten rechts) -->
                    <span v-if="getMealByDate(day.dateStr, mt.id).ai_generated"
                      class="right-2 bottom-2 absolute bg-indigo-100 dark:bg-indigo-900/60 px-2 py-0.5 rounded-full font-medium text-indigo-700 dark:text-indigo-300 text-xs">
                      🤖 KI
                    </span>
                  </div>

                  <!-- Info -->
                  <div class="p-4">
                    <h4 class="font-semibold text-stone-800 dark:group-hover:text-primary-400 dark:text-stone-100 group-hover:text-primary-600 truncate transition-colors">
                      {{ getMealByDate(day.dateStr, mt.id).recipe_title }}
                    </h4>
                    <p v-if="getMealByDate(day.dateStr, mt.id).recipe_description" class="mt-1 text-stone-500 dark:text-stone-400 text-sm line-clamp-2">
                      {{ getMealByDate(day.dateStr, mt.id).recipe_description }}
                    </p>
                    <div class="flex items-center gap-3 mt-3 text-stone-500 dark:text-stone-400 text-xs">
                      <span v-if="getMealByDate(day.dateStr, mt.id).total_time" class="flex items-center gap-1">
                        <Clock class="w-3.5 h-3.5" /> {{ getMealByDate(day.dateStr, mt.id).total_time }} Min.
                      </span>
                      <span class="flex items-center gap-1 cursor-pointer hover:text-stone-700 dark:hover:text-stone-200"
                        @click.stop="openServingsPopup(getMealByDate(day.dateStr, mt.id), $event)">
                        <Users class="w-3.5 h-3.5" /> {{ getMealByDate(day.dateStr, mt.id).servings }} Port.
                      </span>
                      <span v-if="getMealByDate(day.dateStr, mt.id).times_cooked" class="flex items-center gap-1">
                        <ChefHat class="w-3.5 h-3.5" /> {{ getMealByDate(day.dateStr, mt.id).times_cooked }}x
                      </span>
                      <span v-if="getMealByDate(day.dateStr, mt.id).calories" class="flex items-center gap-1 text-orange-500 dark:text-orange-400">
                        <Flame class="w-3.5 h-3.5" /> {{ Math.round(getMealByDate(day.dateStr, mt.id).calories) }} kcal
                      </span>
                    </div>
                    <div v-if="getMealByDate(day.dateStr, mt.id).category_names" class="flex flex-wrap gap-1 mt-3">
                      <span v-for="cat in getMealByDate(day.dateStr, mt.id).category_names.split(',')"
                        :key="cat"
                        class="bg-stone-100 dark:bg-stone-800 px-2 py-0.5 rounded-full text-stone-600 dark:text-stone-400 text-xs">
                        {{ cat.trim() }}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Leere Karte -->
                <div v-else
                  class="flex flex-col justify-center items-center bg-stone-50 dark:bg-stone-900/50 py-10 border-2 border-stone-200 dark:border-stone-800 border-dashed rounded-xl transition-colors"
                  :class="{ 'meal-slot-dragover': dragTarget?.day === day.dateStr && dragTarget?.meal === mt.id }"
                  @dragover.prevent="!isLocked && onPlanDragOver(day.dateStr, mt.id)"
                  @dragleave="onDragLeave"
                  @drop.prevent="!isLocked && onPlanDrop(day.dateStr, mt.id)">
                  <span class="text-stone-300 dark:text-stone-600 text-xs">{{ mt.icon }} {{ mt.name }}</span>
                </div>
              </template>
            </div>
          </div>
        </template>
      </div>

      <!-- ═══════ MOBILE PLAN-ANSICHT ═══════ -->
      <div class="lg:hidden space-y-3">
        <!-- Hinweis wenn alle Tage gefiltert -->
        <div v-if="filteredPlanDays.length === 0 && planDays.length > 0" class="py-8 text-center">
          <EyeOff class="mx-auto mb-2 w-8 h-8 text-stone-300 dark:text-stone-600" />
          <p class="text-stone-500 dark:text-stone-400 text-sm">Alle Tage liegen in der Vergangenheit.</p>
          <button @click="hidePastDays = false" class="mt-2 text-primary-600 dark:text-primary-400 text-sm underline hover:no-underline">Vergangene Tage einblenden</button>
        </div>
        <template v-for="day in filteredPlanDays" :key="'plan-mob-' + day.dateStr">
          <div class="space-y-2" :class="{ 'opacity-50': isDatePast(day.dateStr) && !isDateToday(day.dateStr) }">
            <!-- Tag-Header -->
            <div :class="[
              'flex items-center justify-between px-3 py-2 rounded-xl',
              isDateToday(day.dateStr)
                ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
                : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
            ]">
              <div class="flex items-center gap-2">
                <span class="font-semibold text-sm">{{ day.short }}</span>
                <span class="opacity-75 text-xs">{{ day.date }}</span>
              </div>
              <span v-if="isDateToday(day.dateStr)" class="bg-primary-600 px-2 py-0.5 rounded-full font-medium text-[0.65rem] text-white">Heute</span>
            </div>

            <!-- Mahlzeiten -->
            <template v-for="mt in mealTypes" :key="mt.id + '-plan-mob-' + day.dateStr">
              <!-- Gefüllte Mahlzeit -->
              <div v-if="getMealByDate(day.dateStr, mt.id)"
                class="mobile-meal-card"
                :class="{ 'opacity-55': getMealByDate(day.dateStr, mt.id).is_cooked }"
                @click="router.push('/recipes/' + getMealByDate(day.dateStr, mt.id).recipe_id)">
                <!-- Bild -->
                <div class="relative aspect-[5/3] overflow-hidden">
                  <img v-if="getMealByDate(day.dateStr, mt.id).image_url"
                    :src="getMealByDate(day.dateStr, mt.id).image_url"
                    :alt="getMealByDate(day.dateStr, mt.id).recipe_title"
                    class="w-full h-full object-cover" loading="lazy" />
                  <div v-else class="flex justify-center items-center bg-stone-100 dark:bg-stone-800 w-full h-full">
                    <UtensilsCrossed class="w-10 h-10 text-stone-300 dark:text-stone-600" />
                  </div>
                  <!-- Gradient Overlay -->
                  <div class="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
                  <!-- Mahlzeit-Badge -->
                  <div class="top-2.5 left-2.5 absolute bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded-lg font-medium text-white text-xs">
                    {{ mt.icon }} {{ mt.name }}
                  </div>
                  <!-- Gekocht-Badge -->
                  <div v-if="getMealByDate(day.dateStr, mt.id).is_cooked"
                    class="top-2.5 right-2.5 absolute place-items-center grid rounded-full w-7 h-7 bg-accent-500">
                    <Check class="w-4 h-4 text-white" />
                  </div>
                  <!-- Info-Badges unten -->
                  <div class="right-2.5 bottom-2.5 left-2.5 absolute flex items-center gap-2">
                    <span class="flex items-center gap-1 bg-black/50 backdrop-blur-sm px-2 py-1 rounded-lg text-white text-xs"
                      @click.stop="openServingsPopup(getMealByDate(day.dateStr, mt.id), $event)">
                      <Users class="w-3.5 h-3.5" /> {{ getMealByDate(day.dateStr, mt.id).servings }}
                    </span>
                    <span v-if="getMealByDate(day.dateStr, mt.id).total_time"
                      class="flex items-center gap-1 bg-black/50 backdrop-blur-sm px-2 py-1 rounded-lg text-white text-xs">
                      <Clock class="w-3.5 h-3.5" /> {{ getMealByDate(day.dateStr, mt.id).total_time }} min
                    </span>
                    <span v-if="getMealByDate(day.dateStr, mt.id).difficulty"
                      class="bg-black/50 backdrop-blur-sm ml-auto px-2 py-1 rounded-lg text-white text-xs">
                      {{ getMealByDate(day.dateStr, mt.id).difficulty }}
                    </span>
                  </div>
                </div>
                <!-- Titel + Options-Button -->
                <div class="flex items-center gap-2 px-3.5 py-2.5">
                  <h4 class="flex-1 font-semibold text-stone-800 dark:text-stone-100 text-base leading-snug">
                    {{ getMealByDate(day.dateStr, mt.id).recipe_title }}
                  </h4>
                  <button @click.stop="selectMeal(getMealByDate(day.dateStr, mt.id))"
                    class="flex justify-center items-center hover:bg-stone-100 dark:hover:bg-stone-800 p-1.5 rounded-lg text-stone-400 dark:text-stone-500 transition-colors shrink-0"
                    title="Optionen">
                    <EllipsisVertical class="w-5 h-5" />
                  </button>
                </div>
              </div>
            </template>

            <!-- Nährwerte (mobile) -->
            <div v-if="getDayNutritionByDate(day.dateStr)" class="px-2 py-1 text-center">
              <span class="text-stone-400 dark:text-stone-500 text-xs">
                🔥 {{ getDayNutritionByDate(day.dateStr).calories }} kcal · {{ getDayNutritionByDate(day.dateStr).protein }}g E · {{ getDayNutritionByDate(day.dateStr).carbs }}g K · {{ getDayNutritionByDate(day.dateStr).fat }}g F
              </span>
            </div>
          </div>
        </template>
      </div>
    </template>

    <!-- Kein Plan in Plan-Ansicht -->
    <div v-else-if="viewMode === 'plan' && !store.loading && !store.generating && (!currentPlan || !planDays.length)" class="py-16 text-center">
      <div class="mb-4 text-6xl">📋</div>
      <h2 class="mb-2 font-semibold text-stone-700 dark:text-stone-300 text-xl">Kein Plan vorhanden</h2>
      <p class="mx-auto mb-6 max-w-md text-stone-500 dark:text-stone-400 text-sm">
        Erstelle einen Plan über den "Plan generieren" Button oder wechsle zur Wochen-Ansicht.
      </p>
    </div>

    <!-- ═══════════════════ WOCHEN-ANSICHT ═══════════════════ -->
    <!-- Fixiert-Banner: Desktop -->
    <div v-if="isLocked && currentPlan && viewMode === 'week'" class="hidden lg:flex items-center gap-2 bg-amber-50 dark:bg-amber-950/50 px-4 py-2.5 border border-amber-200 dark:border-amber-800 rounded-xl">
      <Lock class="w-4 h-4 text-amber-500 shrink-0" />
      <p class="text-amber-700 dark:text-amber-300 text-sm">
        <span class="font-medium">Woche fixiert</span> – Bereits eingekauft. Änderungen sind gesperrt.
      </p>
      <button @click="toggleLockPlan" class="ml-auto text-amber-600 hover:text-amber-800 dark:hover:text-amber-200 dark:text-amber-400 text-xs underline hover:no-underline shrink-0">
        Aufheben
      </button>
    </div>
    <!-- Fixiert-Banner: Mobile (kompakt) -->
    <div v-if="isLocked && currentPlan && viewMode === 'week'" class="lg:hidden flex items-center gap-2 bg-amber-50 dark:bg-amber-950/50 px-3 py-2 border border-amber-200 dark:border-amber-800 rounded-xl">
      <Lock class="w-4 h-4 text-amber-500 shrink-0" />
      <span class="flex-1 font-medium text-amber-700 dark:text-amber-300 text-xs">Woche fixiert</span>
      <button @click="toggleLockPlan" class="text-amber-600 hover:text-amber-800 dark:hover:text-amber-200 dark:text-amber-400 text-xs underline hover:no-underline shrink-0">
        Aufheben
      </button>
    </div>

    <!-- ═══════ DESKTOP WOCHEN-ANSICHT: KOMPAKT (3+ Slots) ═══════ -->
    <div v-if="currentPlan && viewMode === 'week' && isCompactGrid" class="hidden lg:block -mx-4 lg:mx-0 px-4 lg:px-0 overflow-x-auto">
      <div class="gap-x-2 gap-y-1.5 grid grid-cols-7 lg:min-w-0 min-w-4xl">

        <!-- ── Zeile 1: Tag-Header ── -->
        <button v-for="(day, dayIdx) in weekDays" :key="'h-'+dayIdx"
          @click="openDayView(dayIdx)" :class="dayHeaderClass(dayIdx)">
          <div class="font-semibold text-sm">{{ day.short }}</div>
          <div class="opacity-75 font-normal text-xs">{{ day.date }}</div>
        </button>

        <!-- ── Pro Mahlzeit-Typ: eine Zeile quer über alle 7 Tage ── -->
        <template v-for="mt in mealTypes" :key="mt.id">
          <div v-for="(day, dayIdx) in weekDays" :key="mt.id+'-'+dayIdx"
            class="meal-slot"
            :class="[
              { 'meal-slot-dragover': dragTarget?.day === dayIdx && dragTarget?.meal === mt.id },
              { 'meal-slot--inactive': !dayHasMeals(dayIdx) }
            ]"
            @dragover.prevent="!isLocked && onDragOver(dayIdx, mt.id)"
            @dragleave="onDragLeave"
            @drop.prevent="!isLocked && onDrop(dayIdx, mt.id)">

            <div class="mb-0.5 text-[0.65rem] text-stone-400 dark:text-stone-500 uppercase tracking-wide">
              {{ mt.icon }} {{ mt.name }}
            </div>

            <!-- Gefüllter Slot -->
            <div v-if="getMeal(dayIdx, mt.id)" class="group meal-card border-l-4"
              :class="[
                { 'meal-card--cooked': getMeal(dayIdx, mt.id).is_cooked },
                getPlanBorderColor(getMeal(dayIdx, mt.id).meal_plan_id)
              ]"
              :draggable="!isLocked"
              @dragstart="!isLocked && onDragStart($event, getMeal(dayIdx, mt.id))"
              @dragend="onDragEnd"
              @click="selectMeal(getMeal(dayIdx, mt.id))">

              <!-- Rezeptbild -->
              <div class="relative rounded-lg aspect-4/3 overflow-hidden">
                <img v-if="getMeal(dayIdx, mt.id).image_url"
                  :src="getMeal(dayIdx, mt.id).image_url"
                  :alt="getMeal(dayIdx, mt.id).recipe_title"
                  class="w-full h-full object-cover"
                  loading="lazy" />
                <div v-else class="flex justify-center items-center bg-stone-100 dark:bg-stone-800 w-full h-full">
                  <UtensilsCrossed class="w-6 h-6 text-stone-300 dark:text-stone-600" />
                </div>
                <!-- Gekocht-Badge -->
                <div v-if="getMeal(dayIdx, mt.id).is_cooked"
                  class="top-1 right-1 absolute place-items-center grid rounded-full w-5 h-5 bg-accent-500">
                  <Check class="w-3 h-3 text-white" />
                </div>
                <!-- Portionen-Badge -->
                <div class="top-1 left-1 absolute flex items-center gap-0.5 bg-black/50 px-1.5 py-0.5 rounded text-[0.6rem] text-white"
                  :class="{ 'cursor-pointer hover:bg-black/70': !isLocked }"
                  @click.stop="!isLocked && openServingsPopup(getMeal(dayIdx, mt.id), $event)">
                  <Users class="w-2.5 h-2.5" /> {{ getMeal(dayIdx, mt.id).servings }}
                </div>
                <!-- Schwierigkeit -->
                <span v-if="getMeal(dayIdx, mt.id).difficulty"
                  class="bottom-1 left-1 absolute bg-black/50 px-1.5 py-0.5 rounded text-[0.6rem] text-white">
                  {{ getMeal(dayIdx, mt.id).difficulty }}
                </span>
              </div>
              <!-- Titel + Info -->
              <div class="mt-1.5">
                <div class="font-medium text-stone-800 dark:text-stone-200 text-xs line-clamp-2 leading-tight">
                  {{ getMeal(dayIdx, mt.id).recipe_title }}
                </div>
                <div v-if="getMeal(dayIdx, mt.id).total_time" class="flex items-center gap-1 mt-0.5 text-[0.6rem] text-stone-400">
                  <Clock class="w-3 h-3" /> {{ getMeal(dayIdx, mt.id).total_time }} min
                </div>
              </div>
            </div>

            <!-- Leerer Slot -->
            <button v-else class="meal-card-empty"
              :disabled="isLocked"
              @click="!isLocked && openSwapModal({ day_of_week: dayIdx, category_id: mt.id, _isNew: true })"
              @dragover.prevent="!isLocked && onDragOver(dayIdx, mt.id)"
              @drop.prevent="!isLocked && onDrop(dayIdx, mt.id)">
              <Plus v-if="!isLocked" class="w-4 h-4 text-stone-300 dark:text-stone-600" />
              <Lock v-else class="w-3.5 h-3.5 text-stone-300 dark:text-stone-600" />
            </button>
          </div>
        </template>

        <!-- ── Zeile: Tages-Nährwerte ── -->
        <template v-for="(day, dayIdx) in weekDays" :key="'nut-'+dayIdx">
          <div v-if="getDayNutrition(dayIdx)" class="py-1 text-center">
            <span class="text-[0.6rem] text-stone-400 dark:text-stone-500">
              🔥 {{ getDayNutrition(dayIdx).calories }} kcal
              · {{ getDayNutrition(dayIdx).protein }}g E
              · {{ getDayNutrition(dayIdx).carbs }}g K
              · {{ getDayNutrition(dayIdx).fat }}g F
            </span>
          </div>
          <div v-else class="py-1"></div>
        </template>
      </div>
    </div>

    <!-- ═══════ DESKTOP WOCHEN-ANSICHT: GROSSE KARTEN (1-2 Slots) ═══════ -->
    <div v-if="currentPlan && viewMode === 'week' && !isCompactGrid" class="hidden lg:block space-y-6">
      <template v-for="mt in mealTypes" :key="'lg-'+mt.id">
        <!-- Slot-Überschrift -->
        <div v-if="mealTypes.length > 1" class="flex items-center gap-2 mb-3">
          <span class="text-lg">{{ mt.icon }}</span>
          <h3 class="font-semibold text-stone-700 dark:text-stone-200 text-base">{{ mt.name }}</h3>
        </div>

        <!-- Karten-Grid -->
        <div class="gap-x-4 gap-y-8 grid grid-cols-2 xl:grid-cols-4"
          :class="mealTypes.length === 1 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'">

          <div v-for="(day, dayIdx) in weekDays" :key="mt.id+'-lg-'+dayIdx"
            class="flex flex-col gap-2"
            @dragover.prevent="!isLocked && onDragOver(dayIdx, mt.id)"
            @dragleave="onDragLeave"
            @drop.prevent="!isLocked && onDrop(dayIdx, mt.id)">

            <!-- Tag-Header (Kalender-Stil) -->
            <div class="flex items-center gap-3">
              <div class="flex justify-center items-center rounded-xl w-10 h-10 font-bold tabular-nums text-lg shrink-0"
                :class="isToday(dayIdx)
                  ? 'bg-primary-500 text-white shadow-sm'
                  : isDayPast(dayIdx)
                    ? 'bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200'">
                {{ day.dateObj.getDate() }}
              </div>
              <div class="min-w-0 leading-tight">
                <div class="font-semibold text-sm truncate"
                  :class="isToday(dayIdx)
                    ? 'text-primary-600 dark:text-primary-400'
                    : isDayPast(dayIdx)
                      ? 'text-stone-400 dark:text-stone-500'
                      : 'text-stone-700 dark:text-stone-200'">
                  {{ day.dateObj.toLocaleDateString('de-DE', { weekday: 'long' }) }}
                </div>
                <div class="text-xs"
                  :class="isToday(dayIdx) ? 'text-primary-500/70 dark:text-primary-400/60' : 'text-stone-400 dark:text-stone-500'">
                  {{ day.dateObj.toLocaleDateString('de-DE', { month: 'long' }) }}
                </div>
              </div>
            </div>

            <!-- Gefüllte Karte (RecipeCard-Design) -->
            <div v-if="getMeal(dayIdx, mt.id)"
              class="group meal-card-large border-l-4"
              :class="[
                { 'meal-card-large--cooked': getMeal(dayIdx, mt.id).is_cooked },
                getPlanBorderColor(getMeal(dayIdx, mt.id).meal_plan_id)
              ]"
              :draggable="!isLocked"
              @dragstart="!isLocked && onDragStart($event, getMeal(dayIdx, mt.id))"
              @dragend="onDragEnd"
              @click="selectMeal(getMeal(dayIdx, mt.id))">

              <!-- Bild -->
              <div class="relative bg-stone-100 dark:bg-stone-800 aspect-4/3 overflow-hidden">
                <img v-if="getMeal(dayIdx, mt.id).image_url"
                  :src="getMeal(dayIdx, mt.id).image_url"
                  :alt="getMeal(dayIdx, mt.id).recipe_title"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy" />
                <div v-else class="flex justify-center items-center opacity-50 w-full h-full text-5xl">🍽️</div>

                <!-- Favorit-Button (oben rechts) -->
                <button
                  @click.stop="toggleMealFavorite(getMeal(dayIdx, mt.id))"
                  class="top-2 right-2 absolute bg-white/80 hover:bg-white dark:bg-stone-900/80 dark:hover:bg-stone-900 backdrop-blur-sm p-1.5 rounded-full transition-colors">
                  <Star class="w-4 h-4" :class="getMeal(dayIdx, mt.id).is_favorite ? 'fill-amber-400 text-amber-400' : 'text-stone-400'" />
                </button>

                <!-- Gekocht-Badge (oben links) -->
                <div v-if="getMeal(dayIdx, mt.id).is_cooked"
                  class="top-2 left-2 absolute place-items-center grid rounded-full w-6 h-6 bg-accent-500">
                  <Check class="w-3.5 h-3.5 text-white" />
                </div>

                <!-- Schwierigkeitsgrad (unten links, bunt) -->
                <span v-if="getMeal(dayIdx, mt.id).difficulty"
                  :class="['absolute bottom-2 left-2 px-2 py-0.5 text-xs font-medium rounded-full', difficultyClasses[getMeal(dayIdx, mt.id).difficulty] || difficultyClasses.mittel]">
                  {{ getMeal(dayIdx, mt.id).difficulty }}
                </span>

                <!-- KI-Badge (unten rechts) -->
                <span v-if="getMeal(dayIdx, mt.id).ai_generated"
                  class="right-2 bottom-2 absolute bg-indigo-100 dark:bg-indigo-900/60 px-2 py-0.5 rounded-full font-medium text-indigo-700 dark:text-indigo-300 text-xs">
                  🤖 KI
                </span>
              </div>

              <!-- Info -->
              <div class="p-4">
                <h4 class="font-semibold text-stone-800 dark:group-hover:text-primary-400 dark:text-stone-100 group-hover:text-primary-600 truncate transition-colors">
                  {{ getMeal(dayIdx, mt.id).recipe_title }}
                </h4>
                <p v-if="getMeal(dayIdx, mt.id).recipe_description" class="mt-1 text-stone-500 dark:text-stone-400 text-sm line-clamp-2">
                  {{ getMeal(dayIdx, mt.id).recipe_description }}
                </p>

                <!-- Meta-Infos -->
                <div class="flex items-center gap-3 mt-3 text-stone-500 dark:text-stone-400 text-xs">
                  <span v-if="getMeal(dayIdx, mt.id).total_time" class="flex items-center gap-1">
                    <Clock class="w-3.5 h-3.5" /> {{ getMeal(dayIdx, mt.id).total_time }} Min.
                  </span>
                  <span class="flex items-center gap-1"
                    :class="{ 'cursor-pointer hover:text-stone-700 dark:hover:text-stone-200': !isLocked }"
                    @click.stop="!isLocked && openServingsPopup(getMeal(dayIdx, mt.id), $event)">
                    <Users class="w-3.5 h-3.5" /> {{ getMeal(dayIdx, mt.id).servings }} Port.
                  </span>
                  <span v-if="getMeal(dayIdx, mt.id).times_cooked" class="flex items-center gap-1">
                    <ChefHat class="w-3.5 h-3.5" /> {{ getMeal(dayIdx, mt.id).times_cooked }}x
                  </span>
                  <span v-if="getMeal(dayIdx, mt.id).calories" class="flex items-center gap-1 text-orange-500 dark:text-orange-400">
                    <Flame class="w-3.5 h-3.5" /> {{ Math.round(getMeal(dayIdx, mt.id).calories) }} kcal
                  </span>
                </div>

                <!-- Kategorien -->
                <div v-if="getMeal(dayIdx, mt.id).category_names" class="flex flex-wrap gap-1 mt-3">
                  <span v-for="cat in getMeal(dayIdx, mt.id).category_names.split(',')"
                    :key="cat"
                    class="bg-stone-100 dark:bg-stone-800 px-2 py-0.5 rounded-full text-stone-600 dark:text-stone-400 text-xs">
                    {{ cat.trim() }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Leere Karte -->
            <button v-else
              class="meal-card-large-empty"
              :disabled="isLocked"
              @click="!isLocked && openSwapModal({ day_of_week: dayIdx, category_id: mt.id, _isNew: true })"
              @dragover.prevent="!isLocked && onDragOver(dayIdx, mt.id)"
              @drop.prevent="!isLocked && onDrop(dayIdx, mt.id)">
              <div class="text-center">
                <Plus v-if="!isLocked" class="mx-auto w-6 h-6 text-stone-300 dark:text-stone-600" />
                <Lock v-else class="mx-auto w-5 h-5 text-stone-300 dark:text-stone-600" />
              </div>
            </button>
          </div>
        </div>
      </template>

      <!-- Tages-Nährwerte Zusammenfassung -->
      <div class="gap-x-4 grid grid-cols-2 xl:grid-cols-4 mt-4"
        :class="mealTypes.length === 1 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'">
        <template v-for="(day, dayIdx) in weekDays" :key="'lgn-'+dayIdx">
          <div v-if="getDayNutrition(dayIdx)" class="py-1 text-center">
            <span class="text-[0.65rem] text-stone-400 dark:text-stone-500">
              🔥 {{ getDayNutrition(dayIdx).calories }} kcal
              · {{ getDayNutrition(dayIdx).protein }}g E
              · {{ getDayNutrition(dayIdx).carbs }}g K
              · {{ getDayNutrition(dayIdx).fat }}g F
            </span>
          </div>
          <div v-else class="py-1"></div>
        </template>
      </div>
    </div>

    <!-- ═══════════════════ MOBILE WOCHEN-ANSICHT ═══════════════════ -->
    <div v-if="currentPlan && viewMode === 'week'" class="lg:hidden space-y-3">
      <!-- Vergangene Tage Toggle -->
      <button v-if="pastDaysCount > 0 && pastDaysCount < 7" @click="showPastDays = !showPastDays"
        class="flex items-center gap-2 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 px-3 py-2 rounded-xl w-full text-stone-500 dark:text-stone-400 text-sm transition-colors">
        <ChevronDown class="w-4 h-4 transition-transform duration-200" :class="{ 'rotate-180': showPastDays }" />
        {{ showPastDays ? 'Vergangene Tage ausblenden' : `${pastDaysCount} vergangene${pastDaysCount === 1 ? 'r Tag' : ' Tage'} anzeigen` }}
      </button>

      <template v-for="(day, dayIdx) in weekDays" :key="'mob-'+dayIdx">
        <div v-if="showPastDays || !isDayPast(dayIdx) || pastDaysCount === 7" class="space-y-2">
          <!-- Tag-Header -->
          <div :class="[
            'flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer',
            isToday(dayIdx)
              ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
              : isDayPast(dayIdx)
                ? 'bg-stone-50 dark:bg-stone-900 text-stone-400 dark:text-stone-500'
                : dayHasMeals(dayIdx)
                  ? 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                  : 'bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500'
          ]" @click="openDayView(dayIdx)">
            <div class="flex items-center gap-2">
              <span class="font-semibold text-sm">{{ day.short }}</span>
              <span class="opacity-75 text-xs">{{ day.date }}</span>
            </div>
            <span v-if="isToday(dayIdx)" class="bg-primary-600 px-2 py-0.5 rounded-full font-medium text-[0.65rem] text-white">Heute</span>
          </div>

          <!-- Mahlzeiten -->
          <template v-for="mt in mealTypes" :key="mt.id+'-mob-'+dayIdx">
            <!-- Gefüllte Mahlzeit -->
            <div v-if="getMeal(dayIdx, mt.id)"
              class="mobile-meal-card border-l-4"
              :class="[
                { 'opacity-55': getMeal(dayIdx, mt.id).is_cooked },
                getPlanBorderColor(getMeal(dayIdx, mt.id).meal_plan_id)
              ]"
              @click="router.push('/recipes/' + getMeal(dayIdx, mt.id).recipe_id)">
              <!-- Bild -->
              <div class="relative aspect-[5/3] overflow-hidden">
                <img v-if="getMeal(dayIdx, mt.id).image_url"
                  :src="getMeal(dayIdx, mt.id).image_url"
                  :alt="getMeal(dayIdx, mt.id).recipe_title"
                  class="w-full h-full object-cover"
                  loading="lazy" />
                <div v-else class="flex justify-center items-center bg-stone-100 dark:bg-stone-800 w-full h-full">
                  <UtensilsCrossed class="w-10 h-10 text-stone-300 dark:text-stone-600" />
                </div>
                <!-- Gradient Overlay -->
                <div class="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
                <!-- Mahlzeit-Badge -->
                <div class="top-2.5 left-2.5 absolute bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded-lg font-medium text-white text-xs">
                  {{ mt.icon }} {{ mt.name }}
                </div>
                <!-- Gekocht-Badge -->
                <div v-if="getMeal(dayIdx, mt.id).is_cooked"
                  class="top-2.5 right-2.5 absolute place-items-center grid rounded-full w-7 h-7 bg-accent-500">
                  <Check class="w-4 h-4 text-white" />
                </div>
                <!-- Info-Badges unten -->
                <div class="right-2.5 bottom-2.5 left-2.5 absolute flex items-center gap-2">
                  <span class="flex items-center gap-1 bg-black/50 backdrop-blur-sm px-2 py-1 rounded-lg text-white text-xs"
                    @click.stop="!isLocked && openServingsPopup(getMeal(dayIdx, mt.id), $event)">
                    <Users class="w-3.5 h-3.5" /> {{ getMeal(dayIdx, mt.id).servings }}
                  </span>
                  <span v-if="getMeal(dayIdx, mt.id).total_time"
                    class="flex items-center gap-1 bg-black/50 backdrop-blur-sm px-2 py-1 rounded-lg text-white text-xs">
                    <Clock class="w-3.5 h-3.5" /> {{ getMeal(dayIdx, mt.id).total_time }} min
                  </span>
                  <span v-if="getMeal(dayIdx, mt.id).difficulty"
                    class="bg-black/50 backdrop-blur-sm ml-auto px-2 py-1 rounded-lg text-white text-xs">
                    {{ getMeal(dayIdx, mt.id).difficulty }}
                  </span>
                </div>
              </div>
              <!-- Titel + Options-Button -->
              <div class="flex items-center gap-2 px-3.5 py-2.5">
                <h4 class="flex-1 font-semibold text-stone-800 dark:text-stone-100 text-base leading-snug">
                  {{ getMeal(dayIdx, mt.id).recipe_title }}
                </h4>
                <button @click.stop="selectMeal(getMeal(dayIdx, mt.id))"
                  class="flex justify-center items-center hover:bg-stone-100 dark:hover:bg-stone-800 p-1.5 rounded-lg text-stone-400 dark:text-stone-500 transition-colors shrink-0"
                  title="Optionen">
                  <EllipsisVertical class="w-5 h-5" />
                </button>
              </div>
            </div>

            <!-- Leerer Slot (mobile) -->
            <button v-else-if="!isLocked"
              class="flex justify-center items-center gap-1.5 py-3.5 border-2 border-stone-200 hover:border-primary-300 dark:border-stone-800 dark:hover:border-primary-700 border-dashed rounded-xl w-full text-stone-400 hover:text-primary-500 dark:text-stone-600 text-sm transition-colors"
              @click="openSwapModal({ day_of_week: dayIdx, category_id: mt.id, _isNew: true })">
              <Plus class="w-4 h-4" /> {{ mt.icon }} {{ mt.name }}
            </button>
          </template>

          <!-- Tages-Nährwerte (mobile) -->
          <div v-if="getDayNutrition(dayIdx)" class="px-2 py-1 text-center">
            <span class="text-stone-400 dark:text-stone-500 text-xs">
              🔥 {{ getDayNutrition(dayIdx).calories }} kcal · {{ getDayNutrition(dayIdx).protein }}g E · {{ getDayNutrition(dayIdx).carbs }}g K · {{ getDayNutrition(dayIdx).fat }}g F
            </span>
          </div>
        </div>
      </template>

    </div>

    <!-- ═══════════════════ TAGES-ANSICHT ═══════════════════ -->
    <div v-if="currentPlan && viewMode === 'day'" class="space-y-3">
      <!-- Tag-Navigation -->
      <div class="flex gap-1.5 pb-2 overflow-x-auto">
        <button v-for="(day, idx) in weekDays" :key="idx"
          @click="selectedDayIdx = idx"
          :class="[
            'shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
            idx === selectedDayIdx
              ? 'bg-primary-600 text-white'
              : isToday(idx)
                ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
                : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700'
          ]">
          <div>{{ day.short }}</div>
          <div class="opacity-75 text-[0.65rem]">{{ day.date }}</div>
        </button>
      </div>

      <!-- Mahlzeiten des Tages -->
      <div class="space-y-4">
        <div v-for="mt in mealTypes" :key="mt.id">

          <!-- ── Desktop: horizontales Layout (wie bisher) ── -->
            <div v-if="getMeal(selectedDayIdx, mt.id)" class="hidden lg:block">
            <h3 class="mb-2 font-semibold text-stone-600 dark:text-stone-400 text-sm">{{ mt.icon }} {{ mt.name }}</h3>
            <div class="group day-meal-card border-l-4"
              :class="[
                { 'day-meal-card--cooked': getMeal(selectedDayIdx, mt.id).is_cooked },
                getPlanBorderColor(getMeal(selectedDayIdx, mt.id).meal_plan_id)
              ]">
              <div class="flex gap-4">
                <div class="relative rounded-xl w-28 sm:w-36 h-20 sm:h-24 overflow-hidden shrink-0">
                  <img v-if="getMeal(selectedDayIdx, mt.id).image_url"
                    :src="getMeal(selectedDayIdx, mt.id).image_url"
                    class="w-full h-full object-cover" loading="lazy" />
                  <div v-else class="flex justify-center items-center bg-stone-100 dark:bg-stone-800 w-full h-full">
                    <UtensilsCrossed class="w-8 h-8 text-stone-300 dark:text-stone-600" />
                  </div>
                </div>
                <div class="flex-1 min-w-0">
                  <h4 class="font-semibold text-stone-800 dark:text-stone-100 text-base truncate">
                    {{ getMeal(selectedDayIdx, mt.id).recipe_title }}
                  </h4>
                  <div class="flex flex-wrap items-center gap-3 mt-1 text-stone-500 dark:text-stone-400 text-xs">
                    <span class="flex items-center gap-1"
                      :class="{ 'cursor-pointer hover:text-stone-700 dark:hover:text-stone-200': !isLocked }"
                      @click.stop="!isLocked && openServingsPopup(getMeal(selectedDayIdx, mt.id), $event)">
                      <Users class="w-3.5 h-3.5" /> {{ getMeal(selectedDayIdx, mt.id).servings }} Pers.
                    </span>
                    <span v-if="getMeal(selectedDayIdx, mt.id).total_time" class="flex items-center gap-1">
                      <Clock class="w-3.5 h-3.5" /> {{ getMeal(selectedDayIdx, mt.id).total_time }} min
                    </span>
                    <span v-if="getMeal(selectedDayIdx, mt.id).difficulty" class="flex items-center gap-1">
                      <ChefHat class="w-3.5 h-3.5" /> {{ getMeal(selectedDayIdx, mt.id).difficulty }}
                    </span>
                    <span v-if="getMeal(selectedDayIdx, mt.id).is_cooked"
                      class="flex items-center gap-1 font-medium text-accent-600">
                      <Check class="w-3.5 h-3.5" /> Gekocht
                    </span>
                  </div>
                  <div class="flex flex-wrap gap-2 mt-3">
                    <button @click="toggleCooked(getMeal(selectedDayIdx, mt.id))"
                      class="day-action-btn" :class="getMeal(selectedDayIdx, mt.id).is_cooked ? 'day-action-btn--active' : ''">
                      <Check class="w-3.5 h-3.5" />
                      {{ getMeal(selectedDayIdx, mt.id).is_cooked ? 'Rückgängig' : 'Gekocht' }}
                    </button>
                    <template v-if="!isLocked">
                      <button @click="openSwapModal(getMeal(selectedDayIdx, mt.id))" class="day-action-btn">
                        <RefreshCw class="w-3.5 h-3.5" /> Tauschen
                      </button>
                      <router-link :to="`/recipes/${getMeal(selectedDayIdx, mt.id).recipe_id}`" class="day-action-btn">
                        <Eye class="w-3.5 h-3.5" /> Rezept
                      </router-link>
                      <button @click="removeEntry(getMeal(selectedDayIdx, mt.id))" class="day-action-btn day-action-btn--danger">
                        <X class="w-3.5 h-3.5" /> Entfernen
                      </button>
                      <button @click="openBlockDialog(getMeal(selectedDayIdx, mt.id))" class="day-action-btn day-action-btn--danger">
                        <Ban class="w-3.5 h-3.5" /> Sperren
                      </button>
                    </template>
                    <router-link v-else :to="`/recipes/${getMeal(selectedDayIdx, mt.id).recipe_id}`" class="day-action-btn">
                      <Eye class="w-3.5 h-3.5" /> Rezept
                    </router-link>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ── Mobile: Karten-Layout (Tap → Rezept, ⋮-Button → Optionen) ── -->
          <div v-if="getMeal(selectedDayIdx, mt.id)" class="lg:hidden">
            <div class="mobile-meal-card border-l-4"
              :class="[
                { 'opacity-55': getMeal(selectedDayIdx, mt.id).is_cooked },
                getPlanBorderColor(getMeal(selectedDayIdx, mt.id).meal_plan_id)
              ]"
              @click="router.push('/recipes/' + getMeal(selectedDayIdx, mt.id).recipe_id)">
              <!-- Bild -->
              <div class="relative aspect-[5/3] overflow-hidden">
                <img v-if="getMeal(selectedDayIdx, mt.id).image_url"
                  :src="getMeal(selectedDayIdx, mt.id).image_url"
                  :alt="getMeal(selectedDayIdx, mt.id).recipe_title"
                  class="w-full h-full object-cover"
                  loading="lazy" />
                <div v-else class="flex justify-center items-center bg-stone-100 dark:bg-stone-800 w-full h-full">
                  <UtensilsCrossed class="w-10 h-10 text-stone-300 dark:text-stone-600" />
                </div>
                <div class="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
                <!-- Mahlzeit-Badge -->
                <div class="top-2.5 left-2.5 absolute bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded-lg font-medium text-white text-xs">
                  {{ mt.icon }} {{ mt.name }}
                </div>
                <!-- Gekocht-Badge -->
                <div v-if="getMeal(selectedDayIdx, mt.id).is_cooked"
                  class="top-2.5 right-2.5 absolute place-items-center grid rounded-full w-7 h-7 bg-accent-500">
                  <Check class="w-4 h-4 text-white" />
                </div>
                <!-- Info-Badges unten -->
                <div class="right-2.5 bottom-2.5 left-2.5 absolute flex items-center gap-2">
                  <span class="flex items-center gap-1 bg-black/50 backdrop-blur-sm px-2 py-1 rounded-lg text-white text-xs"
                    @click.stop="!isLocked && openServingsPopup(getMeal(selectedDayIdx, mt.id), $event)">
                    <Users class="w-3.5 h-3.5" /> {{ getMeal(selectedDayIdx, mt.id).servings }}
                  </span>
                  <span v-if="getMeal(selectedDayIdx, mt.id).total_time"
                    class="flex items-center gap-1 bg-black/50 backdrop-blur-sm px-2 py-1 rounded-lg text-white text-xs">
                    <Clock class="w-3.5 h-3.5" /> {{ getMeal(selectedDayIdx, mt.id).total_time }} min
                  </span>
                  <span v-if="getMeal(selectedDayIdx, mt.id).difficulty"
                    class="bg-black/50 backdrop-blur-sm ml-auto px-2 py-1 rounded-lg text-white text-xs">
                    {{ getMeal(selectedDayIdx, mt.id).difficulty }}
                  </span>
                </div>
              </div>
              <!-- Titel + Options-Button -->
              <div class="flex items-center gap-2 px-3.5 py-2.5">
                <h4 class="flex-1 font-semibold text-stone-800 dark:text-stone-100 text-base leading-snug">
                  {{ getMeal(selectedDayIdx, mt.id).recipe_title }}
                </h4>
                <button @click.stop="selectMeal(getMeal(selectedDayIdx, mt.id))"
                  class="flex justify-center items-center hover:bg-stone-100 dark:hover:bg-stone-800 p-1.5 rounded-lg text-stone-400 dark:text-stone-500 transition-colors shrink-0"
                  title="Optionen">
                  <EllipsisVertical class="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          <!-- Leerer Slot (beide Varianten) -->
          <template v-if="!getMeal(selectedDayIdx, mt.id)">
            <h3 class="hidden lg:block mb-2 font-semibold text-stone-600 dark:text-stone-400 text-sm">{{ mt.icon }} {{ mt.name }}</h3>
            <!-- Desktop -->
            <div class="hidden lg:flex day-meal-empty">
              <span class="text-stone-400 text-sm">Keine Mahlzeit geplant</span>
            </div>
            <!-- Mobile -->
            <button v-if="!isLocked"
              class="lg:hidden flex justify-center items-center gap-1.5 py-3.5 border-2 border-stone-200 hover:border-primary-300 dark:border-stone-800 dark:hover:border-primary-700 border-dashed rounded-xl w-full text-stone-400 hover:text-primary-500 dark:text-stone-600 text-sm transition-colors"
              @click="openSwapModal({ day_of_week: selectedDayIdx, category_id: mt.id, _isNew: true })">
              <Plus class="w-4 h-4" /> {{ mt.icon }} {{ mt.name }}
            </button>
            <div v-else class="lg:hidden flex day-meal-empty">
              <span class="text-stone-400 text-sm">Keine Mahlzeit geplant</span>
            </div>
          </template>
        </div>
      </div>

      <!-- Tages-Nährwerte (Tagesansicht) -->
      <div v-if="getDayNutrition(selectedDayIdx)" class="px-2 py-2 text-center">
        <span class="text-stone-400 dark:text-stone-500 text-xs">
          🔥 {{ getDayNutrition(selectedDayIdx).calories }} kcal · {{ getDayNutrition(selectedDayIdx).protein }}g Eiweiß · {{ getDayNutrition(selectedDayIdx).carbs }}g Kohlenhydrate · {{ getDayNutrition(selectedDayIdx).fat }}g Fett
        </span>
      </div>

    </div>

    <!-- ═══════════════════ GENERIEREN-MODAL ═══════════════════ -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showGenerateModal" class="z-50 fixed inset-0 flex justify-center items-center bg-black/40 p-4" @click.self="showGenerateModal = false">
          <div class="bg-white dark:bg-stone-900 shadow-2xl p-6 border border-stone-200 dark:border-stone-700 rounded-2xl w-full max-w-md">
            <h2 class="flex items-center gap-2 mb-4 font-bold text-stone-800 dark:text-stone-100 text-lg">
              <Sparkles class="w-5 h-5 text-primary-500" /> Plan generieren
            </h2>

            <!-- Mahlzeiten auswählen -->
            <div class="mb-4">
              <label class="block mb-2 font-medium text-stone-700 dark:text-stone-300 text-sm">Welche Mahlzeiten?</label>
              <div class="gap-2 grid grid-cols-2">
                <label v-for="mt in allMealTypes" :key="mt.id"
                  :class="['flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors',
                    genMealTypes.includes(mt.id)
                      ? 'border-primary-400 bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300'
                      : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800']">
                  <input type="checkbox" :value="mt.id" v-model="genMealTypes" class="accent-primary-600" />
                  {{ mt.icon }} {{ mt.name }}
                </label>
              </div>
            </div>

            <!-- Personen -->
            <div class="mb-4">
              <label class="block mb-2 font-medium text-stone-700 dark:text-stone-300 text-sm">Personen</label>
              <div class="flex items-center gap-3">
                <button @click="genPersons = Math.max(1, genPersons - 1)"
                  class="place-items-center grid bg-stone-100 dark:bg-stone-800 rounded-lg w-8 h-8 font-bold text-stone-600 dark:text-stone-400">−</button>
                <span class="w-8 font-semibold text-stone-800 dark:text-stone-100 text-lg text-center">{{ genPersons }}</span>
                <button @click="genPersons = Math.min(20, genPersons + 1)"
                  class="place-items-center grid bg-stone-100 dark:bg-stone-800 rounded-lg w-8 h-8 font-bold text-stone-600 dark:text-stone-400">+</button>
              </div>
            </div>

            <!-- Zeitraum -->
            <div class="mb-4">
              <label class="block mb-2 font-medium text-stone-700 dark:text-stone-300 text-sm">Zeitraum</label>
              <div class="flex items-center gap-2 mb-2">
                <div class="flex-1">
                  <label class="block mb-1 text-stone-500 dark:text-stone-400 text-xs">Von</label>
                  <input type="date" v-model="genStartDate"
                    class="bg-white dark:bg-stone-800 px-3 py-2 border border-stone-200 dark:border-stone-700 rounded-lg w-full text-stone-800 dark:text-stone-100 text-sm" />
                </div>
                <div class="flex-1">
                  <label class="block mb-1 text-stone-500 dark:text-stone-400 text-xs">Bis</label>
                  <input type="date" v-model="genEndDate"
                    class="bg-white dark:bg-stone-800 px-3 py-2 border border-stone-200 dark:border-stone-700 rounded-lg w-full text-stone-800 dark:text-stone-100 text-sm" />
                </div>
              </div>
              <!-- Quick-Buttons -->
              <div class="flex flex-wrap gap-1.5">
                <button @click="setGenTodayPlus6" type="button"
                  class="px-2.5 py-1 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-600 dark:text-stone-400 text-xs hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors">
                  Ab heute (7 Tage)
                </button>
                <button @click="setGenThisWeek" type="button"
                  class="px-2.5 py-1 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-600 dark:text-stone-400 text-xs hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors">
                  Diese Woche
                </button>
                <button @click="setGenNextWeek" type="button"
                  class="px-2.5 py-1 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-600 dark:text-stone-400 text-xs hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors">
                  Nächste Woche
                </button>
                <button @click="setGenNext14Days" type="button"
                  class="px-2.5 py-1 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-600 dark:text-stone-400 text-xs hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors">
                  14 Tage
                </button>
              </div>
              <p v-if="genStartDate && genEndDate && genDateRangeValid" class="mt-1.5 text-stone-500 dark:text-stone-400 text-xs">
                {{ genDateRangeDays }} Tag{{ genDateRangeDays !== 1 ? 'e' : '' }}
              </p>
              <p v-if="genStartDate && genEndDate && !genDateRangeValid" class="mt-1.5 text-amber-600 text-xs">
                {{ daysBetween(genStartDate, genEndDate) < 0 ? 'Startdatum muss vor Enddatum liegen' : 'Maximal 28 Tage erlaubt' }}
              </p>
            </div>

            <!-- Aktive Sammlungs-/Haushalt-Info -->
            <div v-if="genSourceMode === 'collections' && genCollectionIds.length > 0"
              class="flex items-center gap-2 bg-primary-50 dark:bg-primary-950 mb-4 px-3 py-2 border border-primary-200 dark:border-primary-800 rounded-lg">
              <FolderOpen class="w-4 h-4 text-primary-500 shrink-0" />
              <p class="text-primary-700 dark:text-primary-300 text-xs">
                <span class="font-medium">{{ genCollectionIds.length }} Sammlung(en)</span> aktiv
                <button @click="showGenSettings = true; showGenerateModal = false"
                  class="ml-1 underline hover:no-underline">ändern</button>
              </p>
            </div>
            <div v-else-if="genSourceMode === 'household'"
              class="flex items-center gap-2 bg-primary-50 dark:bg-primary-950 mb-4 px-3 py-2 border border-primary-200 dark:border-primary-800 rounded-lg">
              <Home class="w-4 h-4 text-primary-500 shrink-0" />
              <p class="text-primary-700 dark:text-primary-300 text-xs">
                <span class="font-medium">Nur Haushalt-Rezepte</span>
                <button @click="showGenSettings = true; showGenerateModal = false"
                  class="ml-1 underline hover:no-underline">ändern</button>
              </p>
            </div>

            <div class="flex justify-end gap-2">
              <button @click="showGenerateModal = false"
                class="hover:bg-stone-100 dark:hover:bg-stone-800 px-4 py-2 rounded-xl text-stone-600 dark:text-stone-400 text-sm transition-colors">
                Abbrechen
              </button>
              <button @click="doGenerate" :disabled="store.generating || !genMealTypes.length || !genDateRangeValid"
                class="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-4 py-2 rounded-xl font-medium text-white text-sm transition-colors">
                <Sparkles class="w-4 h-4" /> Generieren
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ═══════════════════ GENERIERUNGS-EINSTELLUNGEN-MODAL ═══════════════════ -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showGenSettings" class="z-50 fixed inset-0 flex justify-center items-center bg-black/40 p-4" @click.self="showGenSettings = false">
          <div class="bg-white dark:bg-stone-900 shadow-2xl p-6 border border-stone-200 dark:border-stone-700 rounded-2xl w-full max-w-md">
            <h2 class="flex items-center gap-2 mb-5 font-bold text-stone-800 dark:text-stone-100 text-lg">
              <Settings2 class="w-5 h-5 text-primary-500" /> Generierungs-Einstellungen
            </h2>

            <!-- Rezeptquelle: Sammlungen oder Alle -->
            <div class="mb-5">
              <label class="block mb-2 font-medium text-stone-700 dark:text-stone-300 text-sm">Rezeptquelle</label>
              <label class="flex items-center gap-2 mb-2 cursor-pointer">
                <input type="radio" v-model="genSourceMode" value="all" class="accent-primary-600" />
                <span class="text-stone-700 dark:text-stone-300 text-sm">Alle Rezepte</span>
              </label>
              <label v-if="householdStore.isInHousehold" class="flex items-center gap-2 mb-2 cursor-pointer">
                <input type="radio" v-model="genSourceMode" value="household" class="accent-primary-600" />
                <span class="flex items-center gap-1.5 text-stone-700 dark:text-stone-300 text-sm">
                  <Home class="w-3.5 h-3.5 text-primary-500" />
                  Nur Haushalt-Rezepte
                </span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" v-model="genSourceMode" value="collections" class="accent-primary-600" />
                <span class="text-stone-700 dark:text-stone-300 text-sm">Nur bestimmte Sammlungen</span>
              </label>
              <p v-if="genSourceMode === 'household'" class="mt-2 text-stone-400 dark:text-stone-500 text-xs">
                Nur Rezepte, die für den Haushalt freigegeben wurden – keine privaten.
              </p>
            </div>

            <!-- Sammlungs-Auswahl (nur wenn "collections" gewählt) -->
            <Transition name="fade">
              <div v-if="genSourceMode === 'collections'" class="mb-5">
                <label class="block mb-2 font-medium text-stone-700 dark:text-stone-300 text-sm">Sammlungen auswählen</label>
                <div v-if="collectionsStore.loading" class="text-stone-400 text-sm">Laden…</div>
                <div v-else-if="!collectionsStore.collections.length" class="text-stone-400 text-sm">
                  Keine Sammlungen vorhanden. Erstelle zuerst eine Sammlung.
                </div>
                <div v-else class="space-y-1 max-h-40 overflow-y-auto">
                  <label
                    v-for="col in collectionsStore.collections" :key="col.id"
                    :class="[
                      'flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors',
                      genCollectionIds.includes(col.id)
                        ? 'border-primary-400 bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300'
                        : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800'
                    ]"
                  >
                    <input type="checkbox" :value="col.id" v-model="genCollectionIds" class="accent-primary-600" />
                    <span
                      class="flex justify-center items-center rounded w-6 h-6 text-sm shrink-0"
                      :style="{ backgroundColor: col.color + '20' }"
                    >{{ col.icon }}</span>
                    <span class="flex-1 truncate">{{ col.name }}</span>
                    <span class="text-stone-400 text-xs shrink-0">{{ col.recipe_count ?? 0 }}</span>
                  </label>
                </div>
              </div>
            </Transition>

            <!-- Deduplizierung -->
            <div class="mb-5">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="genDeduplicate" class="rounded accent-primary-600" />
                <div>
                  <span class="font-medium text-stone-700 dark:text-stone-300 text-sm">Duplikate vermeiden</span>
                  <p class="text-stone-400 text-xs">Rezepte, die in mehreren gewählten Sammlungen vorkommen, nur einmal berücksichtigen.</p>
                </div>
              </label>
            </div>

            <!-- KI-Reasoning -->
            <div class="mb-6">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="genAiReasoning" class="rounded accent-primary-600" />
                <div>
                  <span class="font-medium text-stone-700 dark:text-stone-300 text-sm">🤖 KI-Begründung</span>
                  <p class="text-stone-400 text-xs">Die KI erklärt in 2-3 Sätzen, warum der Plan ausgewogen ist. Erfordert konfigurierten KI-Provider.</p>
                </div>
              </label>
            </div>

            <!-- ═══ Kalorien-Optimierung ═══ -->
            <div class="mb-6 pt-4 border-stone-200 dark:border-stone-700 border-t">
              <!-- Haupt-Toggle -->
              <label class="flex items-center gap-2 mb-3 cursor-pointer">
                <input type="checkbox" v-model="calorieEnabled" class="rounded accent-primary-600" />
                <div>
                  <span class="font-medium text-stone-700 dark:text-stone-300 text-sm">🔥 Kalorien-Ziel berücksichtigen</span>
                  <p class="text-stone-400 text-xs">Bevorzugt Rezepte, die zu deinem Tagesbudget passen</p>
                </div>
              </label>

              <Transition name="fade">
                <div v-if="calorieEnabled" class="space-y-4 mt-3 pl-1">

                  <!-- Presets -->
                  <div>
                    <label class="block mb-2 font-medium text-stone-700 dark:text-stone-300 text-sm">Tagesziel</label>
                    <div class="flex gap-1.5 mb-2">
                      <button
                        v-for="(preset, key) in CALORIE_PRESETS" :key="key"
                        @click="caloriePreset = key"
                        :class="[
                          'flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                          caloriePreset === key
                            ? 'border-primary-400 bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300'
                            : 'border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800'
                        ]"
                      >
                        {{ preset.label }}<br>
                        <span class="opacity-70 text-[10px]">{{ preset.description }}</span>
                      </button>
                    </div>
                    <!-- Eigenes Ziel -->
                    <div class="flex items-center gap-2">
                      <input
                        type="number"
                        :value="calorieTarget"
                        @input="onCalorieTargetInput($event.target.value)"
                        min="800" max="5000" step="50"
                        class="bg-stone-50 dark:bg-stone-800 px-3 py-1.5 border border-stone-200 dark:border-stone-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 w-24 text-stone-800 dark:text-stone-200 text-sm"
                      />
                      <span class="text-stone-400 text-xs">kcal / Tag</span>
                      <span v-if="caloriePreset === 'custom'" class="bg-amber-50 dark:bg-amber-950 px-1.5 py-0.5 rounded font-medium text-[10px] text-amber-600 dark:text-amber-400">Eigenes Ziel</span>
                    </div>
                  </div>

                  <!-- Strenge -->
                  <div>
                    <label class="block mb-2 font-medium text-stone-700 dark:text-stone-300 text-sm">Strenge</label>
                    <div class="flex gap-1.5">
                      <button
                        v-for="s in [
                          { key: 'soft', label: 'Locker', desc: 'Leichte Bevorzugung' },
                          { key: 'moderate', label: 'Moderat', desc: 'Spürbare Bevorzugung' },
                          { key: 'strict', label: 'Strikt', desc: 'Filtern + stark bevorzugen' },
                        ]" :key="s.key"
                        @click="calorieStrictness = s.key"
                        :class="[
                          'flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors text-center',
                          calorieStrictness === s.key
                            ? 'border-primary-400 bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300'
                            : 'border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800'
                        ]"
                        :title="s.desc"
                      >
                        {{ s.label }}
                      </button>
                    </div>
                    <p class="mt-1 text-[10px] text-stone-400">
                      {{ calorieStrictness === 'soft' ? 'Kalorien fließen leicht ins Scoring ein' : calorieStrictness === 'moderate' ? 'Spürbare Bevorzugung passender Rezepte' : 'Starke Bevorzugung, Ausreißer werden ausgeschlossen' }}
                    </p>
                  </div>

                  <!-- Verteilung (Collapsible) -->
                  <div>
                    <button @click="showCalorieDistribution = !showCalorieDistribution"
                      class="flex items-center gap-1.5 mb-2 font-medium text-stone-600 hover:text-stone-800 dark:hover:text-stone-200 dark:text-stone-400 text-sm transition-colors">
                      <ChevronDown class="w-3.5 h-3.5 transition-transform duration-200" :class="{ 'rotate-180': showCalorieDistribution }" />
                      Verteilung anpassen
                    </button>

                    <Transition name="fade">
                      <div v-if="showCalorieDistribution" class="space-y-2">
                        <div v-for="mt in allMealTypes" :key="mt.id" class="flex items-center gap-2">
                          <span class="w-5 text-sm text-center">{{ mt.icon }}</span>
                          <span class="w-20 text-stone-600 dark:text-stone-400 text-xs truncate">{{ mt.name }}</span>
                          <input
                            type="range"
                            :value="calorieDistribution[mt.id]"
                            @input="calorieDistribution[mt.id] = parseInt($event.target.value)"
                            min="5" max="60" step="5"
                            class="flex-1 h-1.5 accent-primary-600"
                          />
                          <span class="w-8 font-mono text-stone-600 dark:text-stone-400 text-xs text-right">{{ calorieDistribution[mt.id] }}%</span>
                          <span class="w-14 text-[10px] text-stone-400 text-right">~{{ slotKcal(mt.id) }} kcal</span>
                        </div>
                        <div class="flex justify-between items-center pt-1">
                          <span :class="['text-xs font-medium', Math.abs(distributionSum() - 100) > 5 ? 'text-amber-600' : 'text-stone-400']">
                            Summe: {{ distributionSum() }}%
                            <span v-if="Math.abs(distributionSum() - 100) > 5" class="ml-1">⚠️</span>
                          </span>
                          <button @click="resetDistribution" class="flex items-center gap-1 text-stone-400 hover:text-stone-600 text-xs transition-colors">
                            <RotateCcw class="w-3 h-3" /> Zurücksetzen
                          </button>
                        </div>
                      </div>
                    </Transition>
                  </div>

                  <!-- Info: Fehlende Nährwerte -->
                  <div class="flex items-start gap-2 bg-blue-50 dark:bg-blue-950/40 p-2.5 rounded-lg">
                    <Info class="mt-0.5 w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <p class="text-[10px] text-blue-700 dark:text-blue-300 leading-relaxed">
                      Rezepte ohne Nährwertdaten werden bei der Generierung automatisch per KI geschätzt und gespeichert. Das kann beim ersten Mal etwas länger dauern.
                    </p>
                  </div>
                </div>
              </Transition>
            </div>

            <!-- Gesperrte Rezepte -->
            <div class="mb-6">
              <div class="flex justify-between items-center mb-2">
                <span class="font-medium text-stone-700 dark:text-stone-300 text-sm">🚫 Gesperrte Rezepte</span>
                <span v-if="blocksStore.activeBlocks.length" class="bg-red-100 dark:bg-red-900/40 px-2 py-0.5 rounded-full font-medium text-red-600 dark:text-red-400 text-xs">
                  {{ blocksStore.activeBlocks.length }}
                </span>
              </div>
              <div v-if="!blocksStore.activeBlocks.length"
                class="py-3 text-stone-400 text-xs text-center">
                Keine Rezepte gesperrt
              </div>
              <div v-else class="space-y-1.5 max-h-40 overflow-y-auto">
                <div v-for="block in blocksStore.activeBlocks" :key="block.id"
                  class="flex items-center gap-2.5 bg-stone-50 dark:bg-stone-800 px-3 py-2 rounded-lg">
                  <Ban class="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <div class="flex-1 min-w-0">
                    <div class="font-medium text-stone-700 dark:text-stone-300 text-sm truncate">{{ block.recipe_title }}</div>
                    <div class="text-stone-400 text-xs">
                      bis {{ new Date(block.blocked_until).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) }}
                      <span v-if="block.reason" class="ml-1 text-stone-400 dark:text-stone-500">· {{ block.reason }}</span>
                    </div>
                  </div>
                  <button @click="doUnblockRecipe(block.id)"
                    class="hover:bg-red-100 dark:hover:bg-red-900/40 p-1 rounded-lg transition-colors shrink-0"
                    title="Sperre aufheben">
                    <ShieldOff class="w-3.5 h-3.5 text-red-400 hover:text-red-600" />
                  </button>
                </div>
              </div>
            </div>

            <!-- Aktive Einstellungen Zusammenfassung -->
            <div class="bg-stone-50 dark:bg-stone-800 mb-4 p-3 rounded-lg">
              <p class="text-stone-600 dark:text-stone-400 text-xs">
                <span class="font-medium">Aktiv:</span>
                {{ genSourceMode === 'all' ? 'Alle Rezepte' : genSourceMode === 'household' ? 'Nur Haushalt-Rezepte' : `${genCollectionIds.length} Sammlung(en)` }}
                · {{ genDeduplicate ? 'Duplikate werden vermieden' : 'Duplikate erlaubt' }}
                · {{ genAiReasoning ? 'KI-Begründung an' : 'KI-Begründung aus' }}
                <span v-if="calorieEnabled"> · 🔥 {{ calorieTarget }} kcal/Tag ({{ calorieStrictness === 'soft' ? 'locker' : calorieStrictness === 'moderate' ? 'moderat' : 'strikt' }})</span>
                <span v-if="blocksStore.activeBlocks.length"> · {{ blocksStore.activeBlocks.length }} Rezept{{ blocksStore.activeBlocks.length > 1 ? 'e' : '' }} gesperrt</span>
              </p>
            </div>

            <div class="flex justify-end gap-2">
              <button @click="showGenSettings = false"
                class="hover:bg-stone-100 dark:hover:bg-stone-800 px-4 py-2 rounded-xl text-stone-600 dark:text-stone-400 text-sm transition-colors">
                Schließen
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ═══════════════════ TAUSCH-MODAL ═══════════════════ -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="swapModal.show" class="z-50 fixed inset-0 flex justify-center items-center bg-black/40 p-4" @click.self="closeSwapModal">
          <div class="flex flex-col bg-white dark:bg-stone-900 shadow-2xl border border-stone-200 dark:border-stone-700 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden">
            <div class="flex justify-between items-center p-5 border-stone-200 dark:border-stone-800 border-b">
              <h2 class="font-bold text-stone-800 dark:text-stone-100 text-lg">
                <RefreshCw v-if="!swapModal.entry?._isNew" class="inline mr-2 w-5 h-5 text-primary-500" />
                <Plus v-else class="inline mr-2 w-5 h-5 text-primary-500" />
                {{ swapModal.entry?._isNew ? 'Rezept hinzufügen' : 'Rezept tauschen' }}
              </h2>
              <button @click="closeSwapModal" class="hover:bg-stone-100 dark:hover:bg-stone-800 p-1 rounded-lg">
                <X class="w-5 h-5 text-stone-400" />
              </button>
            </div>

            <!-- Suchfeld -->
            <div class="px-5 pt-4 pb-2">
              <div class="relative">
                <Search class="top-1/2 left-3 absolute w-4 h-4 text-stone-400 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  :value="swapSearch"
                  @input="onSwapSearchInput($event.target.value)"
                  placeholder="Rezept suchen…"
                  data-testid="swap-search-input"
                  class="bg-stone-50 dark:bg-stone-800 py-2 pr-3 pl-9 border border-stone-200 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-400 w-full text-stone-800 dark:text-stone-200 text-sm placeholder-stone-400"
                />
              </div>
            </div>

            <div class="flex-1 px-5 pb-5 overflow-y-auto">
              <!-- Lade-Zustand -->
              <p v-if="swapModal.loading || swapSearchLoading" class="py-8 text-stone-500 text-sm text-center">
                {{ swapSearch ? 'Suche läuft…' : 'Vorschläge werden geladen…' }}
              </p>

              <!-- Suchergebnisse -->
              <template v-else-if="swapSearch.trim()">
                <p v-if="!swapSearchResults.length" class="py-8 text-stone-400 text-sm text-center">
                  Keine Rezepte für „{{ swapSearch }}“ gefunden.
                </p>
                <div v-else class="space-y-2">
                  <p class="mb-1 text-stone-400 text-xs">{{ swapSearchResults.length }} Ergebnis{{ swapSearchResults.length !== 1 ? 'se' : '' }}</p>
                  <button v-for="s in swapSearchResults" :key="s.id"
                    @click="doSwap(s.id)"
                    data-testid="swap-search-result"
                    class="group swap-suggestion">
                    <div class="relative rounded-lg w-16 h-12 overflow-hidden shrink-0">
                      <img v-if="s.image_url" :src="s.image_url" class="w-full h-full object-cover" loading="lazy" />
                      <div v-else class="flex justify-center items-center bg-stone-100 dark:bg-stone-800 w-full h-full">
                        <UtensilsCrossed class="w-4 h-4 text-stone-300" />
                      </div>
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="font-medium text-stone-800 dark:text-stone-200 text-sm truncate">{{ s.title }}</div>
                      <div class="flex items-center gap-2 text-stone-400 text-xs">
                        <span v-if="s.total_time"><Clock class="inline w-3 h-3" /> {{ s.total_time }} min</span>
                        <span v-if="s.difficulty">{{ s.difficulty }}</span>
                      </div>
                    </div>
                    <div class="flex flex-col items-end gap-1 shrink-0">
                      <Star v-if="s.is_favorite" class="fill-amber-400 w-4 h-4 text-amber-400" />
                      <span class="bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded font-mono text-[0.6rem] text-stone-400 dark:text-stone-500">
                        {{ s.score }}
                      </span>
                    </div>
                  </button>
                </div>
              </template>

              <!-- Standard-Vorschläge -->
              <template v-else>
                <p v-if="!swapModal.suggestions.length" class="py-8 text-stone-400 text-sm text-center">
                  Keine passenden Rezepte für diesen Slot gefunden.<br>
                  <span class="text-xs">Lege mehr Rezepte mit passenden Kategorien an.</span>
                </p>
                <div v-else class="space-y-2">
                  <button v-for="s in swapModal.suggestions" :key="s.id"
                    @click="doSwap(s.id)"
                    data-testid="swap-suggestion"
                    class="group swap-suggestion">
                    <div class="relative rounded-lg w-16 h-12 overflow-hidden shrink-0">
                      <img v-if="s.image_url" :src="s.image_url" class="w-full h-full object-cover" loading="lazy" />
                      <div v-else class="flex justify-center items-center bg-stone-100 dark:bg-stone-800 w-full h-full">
                        <UtensilsCrossed class="w-4 h-4 text-stone-300" />
                      </div>
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="font-medium text-stone-800 dark:text-stone-200 text-sm truncate">{{ s.title }}</div>
                      <div class="flex items-center gap-2 text-stone-400 text-xs">
                        <span v-if="s.total_time"><Clock class="inline w-3 h-3" /> {{ s.total_time }} min</span>
                        <span v-if="s.difficulty">{{ s.difficulty }}</span>
                      </div>
                      <div v-if="s.hints?.length" class="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-1">
                        <span v-for="(h, hi) in s.hints.slice(0, 3)" :key="hi"
                          class="text-[0.65rem] text-stone-500 dark:text-stone-400 whitespace-nowrap">
                          {{ h.icon }} {{ h.text }}
                        </span>
                      </div>
                    </div>
                    <div class="flex flex-col items-end gap-1 shrink-0">
                      <Star v-if="s.is_favorite" class="fill-amber-400 w-4 h-4 text-amber-400" />
                      <span class="bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded font-mono text-[0.6rem] text-stone-400 dark:text-stone-500">
                        {{ s.score }}
                      </span>
                    </div>
                  </button>
                </div>
              </template>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ═══════════════════ MEAL DETAIL POPUP (Wochen-Klick) ═══════════════════ -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="selectedMeal" class="z-50 fixed inset-0 flex justify-center items-center bg-black/40 p-4" @click.self="selectedMeal = null">
          <div class="bg-white dark:bg-stone-900 shadow-2xl border border-stone-200 dark:border-stone-700 rounded-2xl w-full max-w-xl overflow-hidden">
            <!-- Bild -->
            <div class="relative bg-stone-100 dark:bg-stone-800 h-56">
              <img v-if="selectedMeal.image_url" :src="selectedMeal.image_url"
                class="w-full h-full object-cover" />
              <div v-else class="flex justify-center items-center w-full h-full">
                <UtensilsCrossed class="w-12 h-12 text-stone-300 dark:text-stone-600" />
              </div>
              <button @click="selectedMeal = null"
                class="top-3 right-3 absolute bg-black/40 hover:bg-black/60 p-1.5 rounded-full text-white transition-colors">
                <X class="w-4 h-4" />
              </button>
            </div>
            <div class="space-y-3 p-5">
              <h3 class="font-bold text-stone-800 dark:text-stone-100 text-lg">{{ selectedMeal.recipe_title }}</h3>
              <div class="flex flex-wrap items-center gap-3 text-stone-500 text-sm">
                <span class="flex items-center gap-1"
                  :class="{ 'cursor-pointer hover:text-stone-700 dark:hover:text-stone-200': !isLocked }"
                  @click.stop="!isLocked && openServingsPopup(selectedMeal, $event)">
                  <Users class="w-4 h-4" /> {{ selectedMeal.servings }} Personen
                </span>
                <span v-if="selectedMeal.total_time" class="flex items-center gap-1">
                  <Clock class="w-4 h-4" /> {{ selectedMeal.total_time }} min
                </span>
                <span v-if="selectedMeal.difficulty" class="flex items-center gap-1">
                  <ChefHat class="w-4 h-4" /> {{ selectedMeal.difficulty }}
                </span>
              </div>
              <div class="gap-2 grid grid-cols-2 pt-2">
                <button @click="toggleCooked(selectedMeal); selectedMeal = null;"
                  class="action-pill" :class="selectedMeal.is_cooked ? 'action-pill--active' : ''">
                  <Check class="w-4 h-4" /> {{ selectedMeal.is_cooked ? 'Rückgängig' : 'Gekocht' }}
                </button>
                <template v-if="!isLocked">
                  <button @click="openSwapModal(selectedMeal); selectedMeal = null;" class="action-pill">
                    <RefreshCw class="w-4 h-4" /> Tauschen
                  </button>
                  <router-link :to="`/recipes/${selectedMeal.recipe_id}`" class="action-pill" @click="selectedMeal = null">
                    <Eye class="w-4 h-4" /> Rezept
                  </router-link>
                  <button @click="removeEntry(selectedMeal); selectedMeal = null;" class="action-pill action-pill--danger">
                    <X class="w-4 h-4" /> Entfernen
                  </button>
                  <button @click="openBlockDialog(selectedMeal)" class="action-pill action-pill--danger">
                    <Ban class="w-4 h-4" /> Sperren
                  </button>
                </template>
                <router-link v-else :to="`/recipes/${selectedMeal.recipe_id}`" class="action-pill" @click="selectedMeal = null">
                  <Eye class="w-4 h-4" /> Rezept
                </router-link>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ═══════════════════ SPERR-DIALOG ═══════════════════ -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="blockDialog.show" class="z-50 fixed inset-0 flex justify-center items-center bg-black/40 p-4" @click.self="blockDialog.show = false">
          <div class="bg-white dark:bg-stone-900 shadow-2xl p-6 border border-stone-200 dark:border-stone-700 rounded-2xl w-full max-w-sm">
            <h2 class="flex items-center gap-2 mb-1 font-bold text-stone-800 dark:text-stone-100 text-lg">
              <Ban class="w-5 h-5 text-red-500" /> Rezept sperren
            </h2>
            <p class="mb-5 text-stone-500 dark:text-stone-400 text-sm">
              „{{ blockDialog.recipeTitle }}" wird für die Wochenplan-Generierung ausgeschlossen.
            </p>

            <!-- Wochen-Auswahl -->
            <div class="mb-4">
              <label class="block mb-2 font-medium text-stone-700 dark:text-stone-300 text-sm">Wie lange sperren?</label>
              <div class="flex flex-wrap gap-2">
                <button v-for="w in [1, 2, 4, 8, 12, 26]" :key="w" @click="blockWeeks = w"
                  :class="['px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border',
                    blockWeeks === w
                      ? 'bg-red-50 dark:bg-red-950 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300'
                      : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800']">
                  {{ w }} {{ w === 1 ? 'Woche' : 'Wochen' }}
                </button>
              </div>
            </div>

            <!-- Optionaler Grund -->
            <div class="mb-5">
              <label class="block mb-1.5 font-medium text-stone-700 dark:text-stone-300 text-sm">Grund (optional)</label>
              <input v-model="blockReason" type="text" maxlength="200"
                placeholder="z.B. Kürbis hat keine Saison"
                class="dark:bg-stone-800 px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-lg outline-none focus:ring-2 focus:ring-red-300 dark:focus:ring-red-800 w-full dark:text-stone-200 placeholder:text-stone-400 text-sm" />
            </div>

            <div class="flex justify-end gap-2">
              <button @click="blockDialog.show = false"
                class="hover:bg-stone-100 dark:hover:bg-stone-800 px-4 py-2 rounded-xl text-stone-600 dark:text-stone-400 text-sm transition-colors">
                Abbrechen
              </button>
              <button @click="doBlockRecipe"
                class="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-xl font-medium text-white text-sm transition-colors">
                <Ban class="w-4 h-4" /> Sperren
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Plan-Laden-Dialog -->
    <LoadPlanDialog
      :show="showLoadDialog"
      :current-week-start="currentWeekStart"
      @close="showLoadDialog = false"
      @navigate-to-week="navigateToWeek"
      @plan-copied="onPlanCopied"
      @plan-deleted="onPlanDeleted"
    />

    <!-- Portionen-Popup -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="servingsPopup" class="z-110 fixed inset-0" @click="closeServingsPopup">
          <div class="servings-popup" :style="{ left: servingsPopup.x + 'px', top: servingsPopup.y + 'px' }"
            @click.stop>
            <button class="servings-popup-btn" :disabled="servingsPopup.meal.servings <= 1"
              @click="changeServings(-1)">
              <Minus class="w-4 h-4" />
            </button>
            <div class="servings-popup-value">
              <Users class="w-4 h-4" />
              <span class="font-semibold tabular-nums text-base">{{ servingsPopup.meal.servings }}</span>
            </div>
            <button class="servings-popup-btn" @click="changeServings(1)">
              <Plus class="w-4 h-4" />
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Bestätigungs-Dialog: Fixierten Plan überschreiben -->
    <ConfirmDialog
      v-model="showOverwriteLockedConfirm"
      variant="warning"
      title="Fixierten Plan überschreiben?"
      message="Der aktuelle Plan ist fixiert (bereits eingekauft). Trotzdem überschreiben?"
      confirm-text="Überschreiben"
      cancel-text="Abbrechen"
      @confirm="executeGenerate"
    />

    <!-- Bestätigungs-Dialog: Wochenplan löschen -->
    <ConfirmDialog
      v-model="showDeletePlanConfirm"
      variant="danger"
      title="Wochenplan löschen?"
      message="Wochenplan wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden."
      confirm-text="Löschen"
      cancel-text="Abbrechen"
      @confirm="executeDeletePlan"
    />

    <!-- ═══════════════════ KONFLIKT-MODAL (Drop auf belegten Slot) ═══════════════════ -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showConflictModal && conflictData" class="z-50 fixed inset-0 flex justify-center items-center p-4" @mousedown.self="conflictCancel">
          <div class="fixed inset-0 bg-black/40" />
          <div class="z-10 relative bg-white dark:bg-stone-900 shadow-2xl p-6 rounded-2xl w-full max-w-md">
            <h3 class="mb-1 font-semibold text-stone-800 dark:text-stone-100 text-lg">Slot bereits belegt</h3>
            <p class="mb-5 text-stone-500 dark:text-stone-400 text-sm">
              An <strong class="text-stone-700 dark:text-stone-200">{{ weekDays[conflictData.targetDay]?.fullDate }}</strong>
              ist bereits <strong class="text-stone-700 dark:text-stone-200">{{ conflictData.existingEntry.recipe_title }}</strong> geplant.
            </p>

            <div class="flex flex-col gap-2.5">
              <!-- Ersetzen -->
              <button @click="conflictReplace"
                class="flex items-center gap-3 bg-primary-50 hover:bg-primary-100 dark:bg-primary-950/50 dark:hover:bg-primary-900/50 px-4 py-3 border border-primary-200 dark:border-primary-800 rounded-xl text-left transition-colors">
                <div class="flex justify-center items-center bg-primary-100 dark:bg-primary-900 rounded-lg w-9 h-9 shrink-0">
                  <RefreshCw class="w-4 h-4 text-primary-600 dark:text-primary-400" />
                </div>
                <div class="min-w-0">
                  <p class="font-medium text-stone-800 dark:text-stone-100 text-sm">Ersetzen</p>
                  <p class="text-stone-500 dark:text-stone-400 text-xs">Durch <em>{{ conflictData.recipeTitle }}</em> ersetzen</p>
                </div>
              </button>

              <!-- Verschieben -->
              <button @click="conflictMove"
                :disabled="getFreeDays(conflictData.targetMeal).length === 0"
                class="flex items-center gap-3 bg-stone-50 hover:bg-stone-100 disabled:hover:bg-stone-50 dark:bg-stone-800/50 dark:hover:bg-stone-800 dark:disabled:hover:bg-stone-800/50 disabled:opacity-40 px-4 py-3 border border-stone-200 dark:border-stone-700 rounded-xl text-left transition-colors disabled:cursor-not-allowed">
                <div class="flex justify-center items-center bg-stone-100 dark:bg-stone-800 rounded-lg w-9 h-9 shrink-0">
                  <ChevronRight class="w-4 h-4 text-stone-500 dark:text-stone-400" />
                </div>
                <div class="min-w-0">
                  <p class="font-medium text-stone-800 dark:text-stone-100 text-sm">Bestehendes verschieben</p>
                  <p v-if="getFreeDays(conflictData.targetMeal).length" class="text-stone-500 dark:text-stone-400 text-xs">
                    Auf {{ weekDays[getFreeDays(conflictData.targetMeal)[0]]?.short }} verschieben, neues hier einfügen
                  </p>
                  <p v-else class="text-stone-400 dark:text-stone-500 text-xs">Kein freier Tag verfügbar</p>
                </div>
              </button>

              <!-- Löschen -->
              <button @click="conflictDelete"
                class="flex items-center gap-3 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-900/30 px-4 py-3 border border-red-200 dark:border-red-800/50 rounded-xl text-left transition-colors">
                <div class="flex justify-center items-center bg-red-100 dark:bg-red-900/50 rounded-lg w-9 h-9 shrink-0">
                  <Trash2 class="w-4 h-4 text-red-500 dark:text-red-400" />
                </div>
                <div class="min-w-0">
                  <p class="font-medium text-stone-800 dark:text-stone-100 text-sm">Bestehendes löschen</p>
                  <p class="text-stone-500 dark:text-stone-400 text-xs">{{ conflictData.existingEntry.recipe_title }} entfernen</p>
                </div>
              </button>
            </div>

            <button @click="conflictCancel" class="mt-4 w-full text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 text-sm text-center transition-colors">
              Abbrechen
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
  </div><!-- /overflow-y-auto -->

  <!-- ═══════════════════ REZEPT-BROWSER PANEL ═══════════════════ -->
  <RecipeBrowserPanel
    :visible="showRecipeBrowser"
    @close="showRecipeBrowser = false"
    @recipe-drag-start="onRecipeBrowserDragStart"
    @recipe-drag-end="onRecipeBrowserDragEnd"
  />
  </div><!-- /flex -->
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useMealPlanStore } from '@/stores/mealplan.js';
import { useRecipesStore } from '@/stores/recipes.js';
import { useCollectionsStore } from '@/stores/collections.js';
import { useRecipeBlocksStore } from '@/stores/recipe-blocks.js';
import { useNotification } from '@/composables/useNotification.js';
import { useNetworkStatus } from '@/composables/useNetworkStatus.js';
import { useHouseholdStore } from '@/stores/household.js';
import { apiRaw } from '@/composables/useApi.js';
import { offlineQueue } from '@/services/offlineQueue.js';
import LoadPlanDialog from '@/components/mealplan/LoadPlanDialog.vue';
import SuggestionBox from '@/components/mealplan/SuggestionBox.vue';
import RecipeBrowserPanel from '@/components/mealplan/RecipeBrowserPanel.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import {
  Sparkles, ChevronLeft, ChevronRight, Check, Eye, RefreshCw,
  X, Clock, ChefHat, UtensilsCrossed, Plus, Minus, Star, Trash2,
  LayoutGrid, CalendarDays, Settings, Settings2, FolderOpen, Info,
  Ban, ShieldOff, Lock, Unlock, Users, ChevronDown, FolderSearch, EllipsisVertical, Search, Flame, RotateCcw, Home,
  ArrowRightLeft, Replace, Move, Trash, List, EyeOff, BookOpen,
} from 'lucide-vue-next';

const router = useRouter();
const store = useMealPlanStore();
const recipesStore = useRecipesStore();
const collectionsStore = useCollectionsStore();

// Schwierigkeitsgrad-Farben (identisch mit RecipeCard)
const difficultyClasses = {
  leicht: 'bg-green-100 dark:bg-green-900/60 text-green-700 dark:text-green-300',
  mittel: 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300',
  schwer: 'bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300',
};
const blocksStore = useRecipeBlocksStore();
const householdStore = useHouseholdStore();
const { showSuccess } = useNotification();
const { isOnline } = useNetworkStatus();

// ─── State ───
const weekOffset = ref(0);
const VIEW_MODE_KEY = 'mealplan-view-mode';
const RECIPE_BROWSER_KEY = 'mealplan-recipe-browser';
const viewMode = ref((() => {
  try { return localStorage.getItem(VIEW_MODE_KEY) || 'plan'; } catch { return 'plan'; }
})());
const showRecipeBrowser = ref((() => {
  try { return localStorage.getItem(RECIPE_BROWSER_KEY) === 'true'; } catch { return false; }
})());
const selectedDayIdx = ref(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1); // heute
const selectedMeal = ref(null);
const showGenerateModal = ref(false);
const showGenSettings = ref(false);
const showLoadDialog = ref(false);
const showOverwriteLockedConfirm = ref(false);
const showDeletePlanConfirm = ref(false);
const servingsPopup = ref(null); // { meal, x, y }

// Gespeicherte Präferenzen aus localStorage laden
const STORAGE_KEY = 'mealplan-gen-prefs';
const savedPrefs = (() => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
})();

// Migration: alte String-Keys (z.B. 'fruehstueck') → category IDs
const _needsMigration = savedPrefs.mealTypes?.some(v => typeof v === 'string')
  || savedPrefs.visibleSlots?.some(v => typeof v === 'string');
const _defaultCatIds = () => recipesStore.mealTimeCategories.map(c => c.id);
const _defaultGenIds = () => {
  const cats = recipesStore.mealTimeCategories;
  return cats.length > 1 ? cats.slice(0, -1).map(c => c.id) : cats.map(c => c.id);
};

const genMealTypes = ref(_needsMigration ? _defaultGenIds() : (savedPrefs.mealTypes ?? _defaultGenIds()));
const genPersons = ref(savedPrefs.personCount ?? 4);
const visibleSlots = ref(_needsMigration ? _defaultCatIds() : (savedPrefs.visibleSlots ?? _defaultCatIds()));
const genSourceMode = ref(
  savedPrefs.sourceMode === 'household' && !householdStore.isInHousehold
    ? 'all'
    : (savedPrefs.sourceMode ?? 'all')
);
const genCollectionIds = ref(savedPrefs.collectionIds ?? []);
const genDeduplicate = ref(savedPrefs.deduplicate ?? true);
const genAiReasoning = ref(savedPrefs.aiReasoning ?? false);
const genActiveDays = ref(savedPrefs.activeDays ?? [0, 1, 2, 3, 4, 5, 6]);
const showSlotSettings = ref(false);
const showPastDays = ref(false);
const reasoningCollapsed = ref(true);

// ─── Datums-Hilfsfunktionen ───
function formatDateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0); // T12:00 to avoid timezone shift
  dt.setDate(dt.getDate() + n);
  return formatDateLocal(dt);
}
function getMondayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  const day = dt.getDay();
  dt.setDate(dt.getDate() - day + (day === 0 ? -6 : 1));
  return formatDateLocal(dt);
}
function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const da = new Date(ay, am - 1, ad, 12, 0, 0);
  const db = new Date(by, bm - 1, bd, 12, 0, 0);
  return Math.round((db - da) / 86400000);
}

// ─── Generierungs-Datumsbereich ───
const genStartDate = ref(formatDateLocal(new Date()));
const genEndDate = ref(addDays(formatDateLocal(new Date()), 6));

/** Generierungs-Datumsbereich-Validation */
const genDateRangeValid = computed(() => {
  if (!genStartDate.value || !genEndDate.value) return false;
  const diff = daysBetween(genStartDate.value, genEndDate.value);
  return diff >= 0 && diff <= 27; // max 28 Tage (0-27 = 28 Tage)
});
const genDateRangeDays = computed(() => {
  if (!genStartDate.value || !genEndDate.value) return 0;
  return daysBetween(genStartDate.value, genEndDate.value) + 1;
});

/** Modal öffnen mit frischen Defaults */
function openGenerateModal() {
  genStartDate.value = formatDateLocal(new Date());
  genEndDate.value = addDays(formatDateLocal(new Date()), 6);
  showGenerateModal.value = true;
}

/** Quick-Button Helfer */
function setGenThisWeek() {
  const today = formatDateLocal(new Date());
  const monday = getMondayOfWeek(today);
  genStartDate.value = monday;
  genEndDate.value = addDays(monday, 6);
}
function setGenNextWeek() {
  const today = formatDateLocal(new Date());
  const monday = getMondayOfWeek(today);
  const nextMonday = addDays(monday, 7);
  genStartDate.value = nextMonday;
  genEndDate.value = addDays(nextMonday, 6);
}
function setGenNext14Days() {
  genStartDate.value = formatDateLocal(new Date());
  genEndDate.value = addDays(formatDateLocal(new Date()), 13);
}
function setGenTodayPlus6() {
  genStartDate.value = formatDateLocal(new Date());
  genEndDate.value = addDays(formatDateLocal(new Date()), 6);
}

// ─── Plan-Ansicht State ───
const selectedPlanId = ref(null);
const hidePastDays = ref(true); // Vergangene Tage standardmäßig ausblenden
const showPlanDropdown = ref(false);

/** Tage des aktuellen Plans (für Plan-Ansicht) */
const planDays = computed(() => {
  if (viewMode.value !== 'plan' || !currentPlan.value) return [];
  const startDate = currentPlan.value.start_date;
  const endDate = currentPlan.value.end_date;
  if (!startDate || !endDate) return [];

  const days = [];
  let current = startDate;
  while (current <= endDate) {
    const [y, m, d] = current.split('-').map(Number);
    const dt = new Date(y, m - 1, d, 12, 0, 0);
    days.push({
      dateStr: current,
      short: dt.toLocaleDateString('de-DE', { weekday: 'short' }),
      date: dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
      fullDate: dt.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }),
      dateObj: dt,
    });
    current = addDays(current, 1);
  }
  return days;
});

/** Gefilterte Tage (vergangene optional ausblenden) */
const filteredPlanDays = computed(() => {
  if (!hidePastDays.value) return planDays.value;
  const today = formatDateLocal(new Date());
  return planDays.value.filter(d => d.dateStr >= today);
});

/** Nur ein sichtbarer Slot → horizontales Layout (wie Wochenansicht) */
const isSingleSlot = computed(() => mealTypes.value.length === 1);
function planLabel(plan) {
  if (!plan) return '';
  const start = plan.start_date || plan.week_start;
  const end = plan.end_date;
  if (start && end) {
    const [sy, sm, sd] = start.split('-').map(Number);
    const [ey, em, ed] = end.split('-').map(Number);
    const startDt = new Date(sy, sm - 1, sd, 12, 0, 0);
    const endDt = new Date(ey, em - 1, ed, 12, 0, 0);
    const s = startDt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    const e = endDt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
    return `${s} – ${e} (${plan.meal_count || 0} Rezepte)`;
  }
  return start || 'Plan';
}

function planDateRange(plan) {
  if (!plan) return '';
  const start = plan.start_date || plan.week_start;
  const end = plan.end_date;
  if (start && end) {
    const [sy, sm, sd] = start.split('-').map(Number);
    const [ey, em, ed] = end.split('-').map(Number);
    const startDt = new Date(sy, sm - 1, sd, 12, 0, 0);
    const endDt = new Date(ey, em - 1, ed, 12, 0, 0);
    const s = startDt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    const e = endDt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
    return `${s} – ${e}`;
  }
  return start || 'Plan';
}

function planDaysCount(plan) {
  if (!plan) return 0;
  const start = plan.start_date || plan.week_start;
  const end = plan.end_date;
  if (!start || !end) return 0;
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const startDt = new Date(sy, sm - 1, sd, 12, 0, 0);
  const endDt = new Date(ey, em - 1, ed, 12, 0, 0);
  return Math.round((endDt - startDt) / (1000 * 60 * 60 * 24)) + 1;
}

function getMealByDate(dateStr, categoryId) {
  if (!currentPlan.value?.entries) return null;
  return currentPlan.value.entries.find(e => e.plan_date === dateStr && e.category_id === categoryId);
}

function dayHasMealsByDate(dateStr) {
  if (!currentPlan.value?.entries) return false;
  return currentPlan.value.entries.some(e => e.plan_date === dateStr);
}

/** Farben für verschiedene Pläne in der Wochenansicht */
const PLAN_BORDER_COLORS = [
  'border-primary-400 dark:border-primary-500',
  'border-emerald-400 dark:border-emerald-500',
  'border-amber-400 dark:border-amber-500',
  'border-rose-400 dark:border-rose-500',
];

const planColorMap = computed(() => {
  const map = {};
  const plans = store.weekViewData?.plans || [];
  plans.forEach((p, i) => {
    map[p.id] = PLAN_BORDER_COLORS[i % PLAN_BORDER_COLORS.length];
  });
  return map;
});

function getPlanBorderColor(planId) {
  return planColorMap.value[planId] || '';
}

/** Bestimmt den Plan, der einen bestimmten Tag in der Woche abdeckt */
function getPlanForDay(dayIdx) {
  const dateStr = weekDays.value[dayIdx]?.dateStr;
  if (!dateStr || !store.weekViewData?.plans) return null;
  return store.weekViewData.plans.find(p =>
    p.start_date <= dateStr && p.end_date >= dateStr
  );
}

function isDateToday(dateStr) {
  return dateStr === formatDateLocal(new Date());
}

function isDatePast(dateStr) {
  return dateStr < formatDateLocal(new Date());
}

function getDayNutritionByDate(dateStr) {
  if (!currentPlan.value?.entries) return null;
  const dayEntries = currentPlan.value.entries.filter(e => e.plan_date === dateStr);
  if (!dayEntries.length) return null;
  let hasAny = false;
  let totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const entry of dayEntries) {
    if (!entry.calories) continue;
    hasAny = true;
    const factor = (entry.servings || entry.original_servings || 1) / (entry.original_servings || 1);
    totals.calories += Math.round((entry.calories || 0) * factor);
    totals.protein += Math.round((entry.protein || 0) * factor * 10) / 10;
    totals.carbs += Math.round((entry.carbs || 0) * factor * 10) / 10;
    totals.fat += Math.round((entry.fat || 0) * factor * 10) / 10;
  }
  if (!hasAny) return null;
  return {
    calories: Math.round(totals.calories),
    protein: Math.round(totals.protein),
    carbs: Math.round(totals.carbs),
    fat: Math.round(totals.fat),
  };
}

/** Ansichtsmodus wechseln */
async function switchToViewMode(mode) {
  viewMode.value = mode;
  try { localStorage.setItem(VIEW_MODE_KEY, mode); } catch {}
  if (mode === 'plan') {
    // Pläne laden falls nötig
    if (!store.plans.length) {
      await store.fetchPlans();
    }
    // Wenn kein Plan ausgewählt → neuesten Plan wählen
    if (!selectedPlanId.value && store.plans.length) {
      selectedPlanId.value = store.plans[0].id;
    }
    // Plan laden
    if (selectedPlanId.value) {
      await store.fetchPlanById(selectedPlanId.value);
    }
  } else if (mode === 'week' || mode === 'day') {
    // Wochenansicht: plan-übergreifende Entries laden
    const ws = currentWeekStart.value;
    const [y, m, d] = ws.split('-').map(Number);
    const monday = new Date(y, m - 1, d);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    await store.fetchWeekEntries(ws, formatDateLocal(sunday));
  }
}

/** Plan aus Dropdown wechseln */
async function onPlanSelect(planId) {
  selectedPlanId.value = planId;
  await store.fetchPlanById(planId);
}

// Rezept-Vorschläge aus dem Haushalt
const suggestions = ref([]);

async function fetchSuggestions() {
  if (!householdStore.isInHousehold) return;
  try {
    const data = await apiRaw(`/households/${householdStore.activeHouseholdId}/suggestions?limit=6`);
    suggestions.value = data.suggestions || [];
  } catch { /* silent */ }
}

// Kalorien-Optimierung
const CALORIE_PRESETS = {
  light: { label: 'Leicht', kcal: 1500, description: '~1500 kcal/Tag' },
  balanced: { label: 'Ausgewogen', kcal: 2000, description: '~2000 kcal/Tag' },
  active: { label: 'Sportlich', kcal: 2500, description: '~2500 kcal/Tag' },
};
const DEFAULT_CALORIE_SHARES = [25, 35, 30, 10];
/** Default-Verteilung aus Kategorien-Reihenfolge aufbauen */
function buildDefaultDistribution() {
  const dist = {};
  recipesStore.mealTimeCategories.forEach((c, i) => {
    dist[c.id] = DEFAULT_CALORIE_SHARES[i] ?? Math.round(100 / recipesStore.mealTimeCategories.length);
  });
  return dist;
}
const calorieEnabled = ref(savedPrefs.calorieEnabled ?? false);
const caloriePreset = ref(savedPrefs.caloriePreset ?? 'balanced');
const calorieTarget = ref(savedPrefs.calorieTarget ?? 2000);
const calorieDistribution = ref(
  (_needsMigration || !savedPrefs.calorieDistribution)
    ? buildDefaultDistribution()
    : savedPrefs.calorieDistribution
);
const calorieStrictness = ref(savedPrefs.calorieStrictness ?? 'moderate');
const showCalorieDistribution = ref(false);



// Bei Änderung automatisch in localStorage speichern
watch([genMealTypes, genPersons, visibleSlots, genSourceMode, genCollectionIds, genDeduplicate, genAiReasoning, genActiveDays, calorieEnabled, caloriePreset, calorieTarget, calorieDistribution, calorieStrictness], () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    mealTypes: genMealTypes.value,
    personCount: genPersons.value,
    visibleSlots: visibleSlots.value,
    sourceMode: genSourceMode.value,
    collectionIds: genCollectionIds.value,
    deduplicate: genDeduplicate.value,
    aiReasoning: genAiReasoning.value,
    activeDays: genActiveDays.value,
    calorieEnabled: calorieEnabled.value,
    caloriePreset: caloriePreset.value,
    calorieTarget: calorieTarget.value,
    calorieDistribution: calorieDistribution.value,
    calorieStrictness: calorieStrictness.value,
  }));
}, { deep: true });

// Preset → Target synchronisieren
watch(caloriePreset, (preset) => {
  if (preset !== 'custom' && CALORIE_PRESETS[preset]) {
    calorieTarget.value = CALORIE_PRESETS[preset].kcal;
  }
});

// Wenn Kategorien geladen werden und visibleSlots/genMealTypes leer sind → initialisieren
watch(() => recipesStore.mealTimeCategories, (cats) => {
  if (!cats.length) return;
  if (!visibleSlots.value.length) {
    visibleSlots.value = cats.map(c => c.id);
  }
  if (!genMealTypes.value.length) {
    genMealTypes.value = cats.length > 1 ? cats.slice(0, -1).map(c => c.id) : cats.map(c => c.id);
  }
  // calorieDistribution: fehlende Kategorien ergänzen
  const dist = calorieDistribution.value;
  let hasAll = true;
  for (const c of cats) {
    if (dist[c.id] === undefined) hasAll = false;
  }
  if (!hasAll) {
    calorieDistribution.value = buildDefaultDistribution();
  }
});

// Bei manueller Target-Änderung: Preset auf 'custom' setzen
function onCalorieTargetInput(val) {
  const num = parseInt(val);
  if (!isNaN(num) && num >= 800 && num <= 5000) {
    calorieTarget.value = num;
    // Prüfen ob Wert einem Preset entspricht
    const matchingPreset = Object.entries(CALORIE_PRESETS).find(([, p]) => p.kcal === num);
    caloriePreset.value = matchingPreset ? matchingPreset[0] : 'custom';
  }
}

// Verteilungs-Berechnung: Slot-kcal aus Prozent
function slotKcal(slot) {
  return Math.round(calorieTarget.value * (calorieDistribution.value[slot] || 0) / 100);
}
function distributionSum() {
  return Object.values(calorieDistribution.value).reduce((s, v) => s + v, 0);
}
function resetDistribution() {
  calorieDistribution.value = buildDefaultDistribution();
}

const swapModal = ref({ show: false, entry: null, suggestions: [], loading: false });
const swapSearch = ref('');
const swapSearchResults = ref([]);
const swapSearchLoading = ref(false);
let swapSearchTimer = null;
const dragSource = ref(null);
const dragTarget = ref(null);
const dragOverEmpty = ref(false);
const suggestionDragData = ref(null); // { recipeId, recipeTitle, source: 'suggestion' }

// Konflikt-Modal für Drop auf belegten Slot
const showConflictModal = ref(false);
const conflictData = ref(null); // { recipeId, recipeTitle, existingEntry, targetDay, targetMeal }

// Sperr-Dialog
const blockDialog = ref({ show: false, recipeId: null, recipeTitle: '' });
const blockWeeks = ref(4);
const blockReason = ref('');

// ─── Meal-Types (dynamisch aus Kategorien-Store) ───
const allMealTypes = computed(() =>
  recipesStore.mealTimeCategories.map(c => ({
    id: c.id,
    name: c.name,
    icon: c.icon || '',
    color: c.color || '',
  }))
);
const mealTypes = computed(() => allMealTypes.value.filter(mt => visibleSlots.value.includes(mt.id)));

/** Bei 1-2 sichtbaren Slots → große Karten, bei 3+ → kompaktes 7-Spalten-Grid */
const isCompactGrid = computed(() => mealTypes.value.length >= 3);

// ─── Computed ───
const currentPlan = computed(() => store.currentPlan);

/** Montag der aktuellen Anzeige-Woche als YYYY-MM-DD */
const currentWeekStart = computed(() => {
  const today = new Date();
  const monday = new Date(today);
  const day = today.getDay();
  monday.setDate(today.getDate() - day + (day === 0 ? -6 : 1) + weekOffset.value * 7);
  // Lokales Datum verwenden (toISOString() konvertiert nach UTC und kann das Datum verschieben)
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const d = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
});

const weekDays = computed(() => {
  const [y, m, d] = currentWeekStart.value.split('-').map(Number);
  const monday = new Date(y, m - 1, d);
  return ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((short, i) => {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    return {
      short,
      dateStr: formatDateLocal(dt),
      date: dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
      fullDate: dt.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }),
      dateObj: dt,
    };
  });
});

const weekLabel = computed(() => {
  if (!weekDays.value.length) return '';
  const monday = weekDays.value[0].dateObj;
  // ISO-Kalenderwoche berechnen
  const d = new Date(Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const kw = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `KW ${kw}: ${weekDays.value[0].date} – ${weekDays.value[6].date}`;
});

// ─── Wochen-Navigation: Daten laden bei Wechsel ───
watch(currentWeekStart, async (ws) => {
  showPastDays.value = false;
  if (viewMode.value === 'week' || viewMode.value === 'day') {
    // Wochenansicht: alle Entries von Montag bis Sonntag laden (plan-übergreifend)
    const [y, m, d] = ws.split('-').map(Number);
    const monday = new Date(y, m - 1, d);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    await store.fetchWeekEntries(ws, formatDateLocal(sunday));
  } else if (viewMode.value === 'plan') {
    // Plan-Ansicht: wird separat in switchToViewMode / onPlanSelect geladen
  }
}, { immediate: false });

function changeWeek(offset) {
  weekOffset.value += offset;
}
function goToToday() {
  weekOffset.value = 0;
  selectedDayIdx.value = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
}

/** Zu einer bestimmten Woche navigieren (von LoadPlanDialog) */
function navigateToWeek(weekStart) {
  // weekOffset berechnen: Differenz zur aktuellen "echten" Woche
  const today = new Date();
  const day = today.getDay();
  const todayMonday = new Date(today);
  todayMonday.setDate(today.getDate() - day + (day === 0 ? -6 : 1));
  todayMonday.setHours(0, 0, 0, 0);

  const [y, m, d] = weekStart.split('-').map(Number);
  const targetMonday = new Date(y, m - 1, d);
  targetMonday.setHours(0, 0, 0, 0);

  const diffWeeks = Math.round((targetMonday - todayMonday) / (7 * 86400000));
  weekOffset.value = diffWeeks;
}

/** Nach Plan-Kopie: Daten neu laden */
async function onPlanCopied() {
  await store.fetchCurrentPlan(currentWeekStart.value);
  store.fetchHistory();
}

/** Nach Plan-Löschung: Daten neu laden */
async function onPlanDeleted(deletedPlan) {
  // Wenn der gelöschte Plan der aktuell angezeigte ist → View zurücksetzen
  if (deletedPlan && deletedPlan.week_start === currentWeekStart.value) {
    store.currentPlan = null;
  }
  await store.fetchCurrentPlan(currentWeekStart.value);
  store.fetchHistory();
}

// ─── Helpers ───
function isToday(dayIdx) {
  return weekDays.value[dayIdx]?.dateObj.toDateString() === new Date().toDateString();
}

function isDayPast(dayIdx) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayDate = weekDays.value[dayIdx]?.dateObj;
  if (!dayDate) return false;
  const d = new Date(dayDate);
  d.setHours(0, 0, 0, 0);
  return d < today;
}

const pastDaysCount = computed(() => weekDays.value.filter((_, idx) => isDayPast(idx)).length);

function getMeal(dayIdx, categoryId) {
  if (viewMode.value === 'week' || viewMode.value === 'day') {
    // Wochenansicht: plan-übergreifend per plan_date suchen
    if (!store.weekViewData?.entries) return null;
    const dateStr = weekDays.value[dayIdx]?.dateStr;
    return store.weekViewData.entries.find(e => e.plan_date === dateStr && e.category_id === categoryId);
  }
  // Plan-Ansicht: innerhalb currentPlan per day_of_week suchen (Legacy)
  if (!currentPlan.value?.entries) return null;
  return currentPlan.value.entries.find(e => e.day_of_week === dayIdx && e.category_id === categoryId);
}

/** Prüft ob ein Tag mindestens ein Rezept in irgendeinem Slot hat */
function dayHasMeals(dayIdx) {
  if (viewMode.value === 'week' || viewMode.value === 'day') {
    if (!store.weekViewData?.entries) return false;
    const dateStr = weekDays.value[dayIdx]?.dateStr;
    return store.weekViewData.entries.some(e => e.plan_date === dateStr);
  }
  if (!currentPlan.value?.entries) return false;
  return currentPlan.value.entries.some(e => e.day_of_week === dayIdx);
}

/** Nährwerte pro Tag aggregiert (portionsskaliert) */
function getDayNutrition(dayIdx) {
  if (!currentPlan.value?.entries) return null;
  const dayEntries = currentPlan.value.entries.filter(e => e.day_of_week === dayIdx);
  if (!dayEntries.length) return null;
  let hasAny = false;
  let totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const entry of dayEntries) {
    if (!entry.calories) continue;
    hasAny = true;
    const factor = (entry.servings || entry.original_servings || 1) / (entry.original_servings || 1);
    totals.calories += Math.round((entry.calories || 0) * factor);
    totals.protein += Math.round((entry.protein || 0) * factor * 10) / 10;
    totals.carbs += Math.round((entry.carbs || 0) * factor * 10) / 10;
    totals.fat += Math.round((entry.fat || 0) * factor * 10) / 10;
  }
  if (!hasAny) return null;
  return {
    calories: Math.round(totals.calories),
    protein: Math.round(totals.protein),
    carbs: Math.round(totals.carbs),
    fat: Math.round(totals.fat),
  };
}

/** Ist der aktuelle Plan fixiert? */
const isLocked = computed(() => !!currentPlan.value?.is_locked);

function dayHeaderClass(dayIdx) {
  const base = 'w-full text-center py-2 rounded-lg transition-colors cursor-pointer';
  const hasMeals = dayHasMeals(dayIdx);
  if (isToday(dayIdx)) return `${base} bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/60${!hasMeals ? ' opacity-50' : ''}`;
  if (!hasMeals) return `${base} bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-600 opacity-50`;
  return `${base} bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700`;
}

function viewToggleClass(mode) {
  const base = 'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors';
  if (viewMode.value === mode) return `${base} bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 shadow-sm rounded-lg`;
  return `${base} text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300`;
}

function openDayView(dayIdx) {
  selectedDayIdx.value = dayIdx;
  viewMode.value = 'day';
}

function selectMeal(meal) {
  selectedMeal.value = meal;
}

/** Favoriten-Status eines Rezepts im Wochenplan umschalten */
async function toggleMealFavorite(meal) {
  await recipesStore.toggleFavorite(meal.recipe_id);
  // Status im lokalen Meal-Entry aktualisieren
  meal.is_favorite = !meal.is_favorite;
}

// ─── Generierung ───
async function doGenerate() {
  // Warnung wenn fixierter Plan überschrieben wird
  if (isLocked.value) {
    showGenerateModal.value = false;
    showOverwriteLockedConfirm.value = true;
    return;
  }
  executeGenerate();
}

async function executeGenerate() {
  showOverwriteLockedConfirm.value = false;
  showGenerateModal.value = false;
  try {
    const options = {
      startDate: genStartDate.value,
      endDate: genEndDate.value,
      categoryIds: genMealTypes.value,
      personCount: genPersons.value,
      enableAiReasoning: genAiReasoning.value,
    };
    // Sammlungs-Filter nur wenn explizit Sammlungen gewählt
    if (genSourceMode.value === 'collections' && genCollectionIds.value.length > 0) {
      options.collectionIds = genCollectionIds.value;
      options.deduplicateCollections = genDeduplicate.value;
    }
    // Haushalt-Only-Filter
    if (genSourceMode.value === 'household') {
      options.householdOnly = true;
    }
    // Kalorien-Optimierung nur wenn aktiviert
    if (calorieEnabled.value) {
      options.calorieTarget = calorieTarget.value;
      options.calorieDistribution = calorieDistribution.value;
      options.calorieStrictness = calorieStrictness.value;
    }
    const data = await store.generatePlan(options);
    let msg = 'Plan erstellt! 🗓️';
    if (data.nutritionEstimatedCount > 0) {
      msg += ` (${data.nutritionEstimatedCount} Rezepte mit Nährwerten ergänzt)`;
    }
    showSuccess(msg);

    // Nach Generierung: zum generierten Plan navigieren
    if (viewMode.value === 'plan' && data.planId) {
      // Plan-Ansicht: zum neuen Plan wechseln
      selectedPlanId.value = data.planId;
      await store.fetchPlanById(data.planId);
      await store.fetchPlans(); // Plan-Liste aktualisieren
    } else {
      // Wochen-Ansicht: zur Startwoche navigieren
      const planStart = genStartDate.value;
      const monday = getMondayOfWeek(planStart);
      viewMode.value = 'week';
      navigateToWeek(monday);
    }

    // KI-Reasoning im Hintergrund polled (blockiert UI nicht)
    if (genAiReasoning.value && data.planId) {
      store.pollReasoning(data.planId);
    }
  } catch {
    // Fehler von useApi
  }
}

// ─── Gekocht-Toggle ───
async function toggleCooked(meal) {
  try {
    const data = await store.markCooked(meal.meal_plan_id, meal.id);
    if (data.is_cooked) {
      const pantryMsg = data.pantryUpdated ? ` (${data.pantryUpdated} Vorräte angepasst)` : '';
      const swapMsg = data.swapped ? ' und auf heute verschoben' : '';
      showSuccess(`Als gekocht markiert${swapMsg} ✅${pantryMsg}`);
    } else {
      const pantryMsg = data.pantryUpdated ? ` (${data.pantryUpdated} Vorräte wiederhergestellt)` : '';
      showSuccess(`Markierung entfernt${pantryMsg}`);
    }
  } catch { /* useApi */ }
}

// ─── Tausch ───
async function openSwapModal(entry) {
  swapModal.value = { show: true, entry, suggestions: [], loading: true };
  try {
    // Nur das aktuelle Rezept ausschließen (nicht alle im Plan), damit es Vorschläge gibt
    const excludeIds = entry.recipe_id ? [entry.recipe_id] : [];
    const suggestions = await store.fetchSuggestions({
      dayIdx: entry.day_of_week,
      categoryId: entry.category_id,
      excludeRecipeIds: excludeIds,
      planId: currentPlan.value?.id,
    });
    swapModal.value.suggestions = suggestions || [];
  } finally {
    swapModal.value.loading = false;
  }
}

function closeSwapModal() {
  swapModal.value = { show: false, entry: null, suggestions: [], loading: false };
  swapSearch.value = '';
  swapSearchResults.value = [];
  swapSearchLoading.value = false;
  if (swapSearchTimer) { clearTimeout(swapSearchTimer); swapSearchTimer = null; }
}

function onSwapSearchInput(val) {
  swapSearch.value = val;
  if (swapSearchTimer) clearTimeout(swapSearchTimer);
  if (!val.trim()) {
    swapSearchResults.value = [];
    swapSearchLoading.value = false;
    return;
  }
  swapSearchLoading.value = true;
  swapSearchTimer = setTimeout(async () => {
    try {
      const entry = swapModal.value.entry;
      const excludeIds = entry?.recipe_id ? [entry.recipe_id] : [];
      const results = await store.fetchSuggestions({
        dayIdx: entry?.day_of_week ?? 0,
        categoryId: entry?.category_id,
        excludeRecipeIds: excludeIds,
        planId: currentPlan.value?.id,
        search: val.trim(),
      });
      swapSearchResults.value = results || [];
    } finally {
      swapSearchLoading.value = false;
    }
  }, 300);
}

async function doSwap(newRecipeId) {
  const entry = swapModal.value.entry;
  closeSwapModal();
  try {
    if (entry._isNew) {
      // Neuen Eintrag in leerem Slot erstellen
      // In Wochenansicht: Plan für den Tag bestimmen
      const targetPlan = viewMode.value === 'week' || viewMode.value === 'day'
        ? getPlanForDay(entry.day_of_week)
        : null;
      const planId = targetPlan?.id || currentPlan.value?.id;
      if (!planId) {
        showSuccess('Für diesen Tag existiert noch kein Plan.');
        return;
      }
      await store.addEntry(planId, newRecipeId, entry.day_of_week, entry.category_id);
      showSuccess('Rezept hinzugefügt! ✨');
    } else {
      // Bestehendes Rezept tauschen
      await store.swapRecipe(entry.meal_plan_id, entry.id, newRecipeId);
      showSuccess('Rezept getauscht! 🔄');
    }
  } catch { /* useApi */ }
}

// ─── Portionen ändern ───
function openServingsPopup(meal, event) {
  if (isLocked.value) return;
  event.stopPropagation();
  const rect = event.currentTarget.getBoundingClientRect();
  const popupWidth = 148; // 2rem+3rem+2rem + gaps + padding
  const margin = 8;
  let x = rect.left + rect.width / 2;
  // Viewport-Clamping: Popup nie links/rechts abschneiden
  x = Math.max(popupWidth / 2 + margin, Math.min(x, window.innerWidth - popupWidth / 2 - margin));
  servingsPopup.value = {
    meal,
    x,
    y: rect.bottom + 6,
  };
}
function closeServingsPopup() {
  servingsPopup.value = null;
}
async function changeServings(delta) {
  if (!servingsPopup.value) return;
  const meal = servingsPopup.value.meal;
  const newServings = Math.max(1, (meal.servings || 4) + delta);
  if (newServings === meal.servings) return;
  try {
    await store.updateServings(meal.meal_plan_id, meal.id, newServings);
    // Lokalen Popup-State aktualisieren
    servingsPopup.value.meal = { ...meal, servings: newServings };
    // Falls das Detail-Popup offen ist, dort auch aktualisieren
    if (selectedMeal.value?.id === meal.id) {
      selectedMeal.value = { ...selectedMeal.value, servings: newServings };
    }
  } catch { /* useApi */ }
}

// ─── Entfernen ───
async function removeEntry(meal) {
  try {
    await store.removeEntry(meal.meal_plan_id, meal.id);
    showSuccess('Eintrag entfernt');
  } catch { /* useApi */ }
}

// ─── Plan löschen ───
async function confirmDeletePlan() {
  if (!currentPlan.value) return;
  if (isLocked.value) return;
  showDeletePlanConfirm.value = true;
}

async function executeDeletePlan() {
  showDeletePlanConfirm.value = false;
  if (!currentPlan.value?.id) return; // Nur in Plan-Ansicht erlaubt
  try {
    await store.deletePlan(currentPlan.value.id);
    showSuccess('Wochenplan gelöscht');
  } catch { /* useApi */ }
}

// ─── Fixieren ───
async function toggleLockPlan() {
  if (!currentPlan.value?.id) return; // Nur in Plan-Ansicht erlaubt
  try {
    const data = await store.toggleLock(currentPlan.value.id);
    showSuccess(data.message);
  } catch { /* useApi */ }
}

// ─── Drag & Drop ───
// Rezept-Browser Panel: State persistieren
watch(showRecipeBrowser, (v) => {
  try { localStorage.setItem(RECIPE_BROWSER_KEY, v ? 'true' : 'false'); } catch {}
});
function onRecipeBrowserDragStart(data) {
  suggestionDragData.value = data; // Gleicher Mechanismus wie SuggestionBox
  dragSource.value = null;
}
function onRecipeBrowserDragEnd() {
  suggestionDragData.value = null;
  dragTarget.value = null;
}

function onDragStart(event, meal) {
  dragSource.value = meal;
  suggestionDragData.value = null;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', meal.id.toString());
}
function onDragEnd() {
  dragSource.value = null;
  dragTarget.value = null;
  suggestionDragData.value = null;
}
function onSuggestionDragStart(data) {
  suggestionDragData.value = data;
  dragSource.value = null;
}
function onSuggestionDragEnd() {
  suggestionDragData.value = null;
  dragTarget.value = null;
}

// ─── Vergangene Wochen Slider ───
async function onPastWeekChange({ index, weekStart }) {
  store.pastWeekIndex = index;
  await store.fetchPastWeekRecipes(weekStart);
}

// ─── Mobile: Rezept auf Tag planen (aus SuggestionBox) ───
async function onAssignRecipe({ recipeId, recipeTitle, dayOfWeek, categoryId }) {
  const existingMeal = getMeal(dayOfWeek, categoryId);
  const planDate = weekDays.value[dayOfWeek]?.dateStr;

  // Kein Plan vorhanden → automatisch erstellen
  if (!currentPlan.value) {
    try {
      const data = await store.addRecipeToPlan(recipeId, dayOfWeek, categoryId, currentWeekStart.value);
      if (data.plan) currentPlan.value = data.plan;
      showSuccess('Wochenplan erstellt & Rezept hinzugefügt! 🎉');
    } catch { /* useApi */ }
    return;
  }

  // Slot frei → direkt hinzufügen
  if (!existingMeal) {
    try {
      await store.addEntry(currentPlan.value.id, recipeId, dayOfWeek, categoryId, undefined, planDate);
      showSuccess('Rezept hinzugefügt! ✓');
    } catch { /* useApi */ }
    return;
  }

  // Slot belegt → Konflikt-Modal
  conflictData.value = {
    recipeId,
    recipeTitle,
    existingEntry: existingMeal,
    targetDay: dayOfWeek,
    targetMeal: categoryId,
  };
  showConflictModal.value = true;
}

function onDragOver(dayIdx, categoryId) {
  dragTarget.value = { day: dayIdx, meal: categoryId };
}
function onDragLeave() {
  dragTarget.value = null;
}

// ─── Plan-Ansicht Drag & Drop (arbeitet mit dateStr statt dayIdx) ───
function onPlanDragOver(dateStr, categoryId) {
  dragTarget.value = { day: dateStr, meal: categoryId };
}

async function onPlanDrop(dateStr, categoryId) {
  dragTarget.value = null;

  // Fall 1: Interner Tausch (bestehendes Rezept im Plan ziehen)
  const source = dragSource.value;
  if (source) {
    dragSource.value = null;
    if (!currentPlan.value) return;
    // Gleicher Slot? Abbrechen
    if (source.plan_date === dateStr && source.category_id === categoryId) return;
    // day_of_week aus dateStr berechnen (0=Mo, 6=So)
    const dt = new Date(dateStr + 'T12:00:00');
    const dayOfWeek = (dt.getDay() + 6) % 7;
    try {
      await store.moveEntry(currentPlan.value.id, source.id, dayOfWeek, categoryId, dateStr);
      showSuccess('Mahlzeit verschoben! ↕️');
    } catch { /* useApi */ }
    return;
  }

  // Fall 2: Externer Drop (SuggestionBox oder Rezept-Browser)
  const suggestion = suggestionDragData.value;
  if (!suggestion) return;
  suggestionDragData.value = null;

  const dt = new Date(dateStr + 'T12:00:00');
  const dayOfWeek = (dt.getDay() + 6) % 7;
  const existingMeal = getMealByDate(dateStr, categoryId);

  // Fall 2a: Kein Plan vorhanden → Plan automatisch erstellen
  if (!currentPlan.value) {
    try {
      // weekStart aus dateStr berechnen (Montag der Woche)
      const d = new Date(dateStr + 'T12:00:00');
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const weekStart = new Date(d.setDate(diff)).toISOString().split('T')[0];
      const data = await store.addRecipeToPlan(suggestion.recipeId, dayOfWeek, categoryId, weekStart);
      if (data.plan) currentPlan.value = data.plan;
      showSuccess('Wochenplan erstellt & Rezept hinzugefügt! 🎉');
    } catch { /* useApi */ }
    return;
  }

  // Fall 2b: Slot ist frei → direkt hinzufügen
  if (!existingMeal) {
    try {
      await store.addEntry(currentPlan.value.id, suggestion.recipeId, dayOfWeek, categoryId, undefined, dateStr);
      showSuccess('Rezept hinzugefügt! ✓');
    } catch { /* useApi */ }
    return;
  }

  // Fall 2c: Slot belegt → Konflikt-Modal öffnen
  conflictData.value = {
    recipeId: suggestion.recipeId,
    recipeTitle: suggestion.recipeTitle,
    existingEntry: existingMeal,
    targetDay: dayOfWeek,
    targetMeal: categoryId,
  };
  showConflictModal.value = true;
}

/** Freie Slots einer bestimmten Kategorie ermitteln (Wochenansicht: plan-übergreifend) */
function getFreeDays(categoryId) {
  return [0, 1, 2, 3, 4, 5, 6].filter(day => !getMeal(day, categoryId));
}

async function onDrop(dayIdx, categoryId) {
  dragTarget.value = null;
  const targetPlan = getPlanForDay(dayIdx);
  const planDate = weekDays.value[dayIdx]?.dateStr;

  // Fall 1: Interner Tausch (bestehendes Rezept im Plan ziehen)
  const source = dragSource.value;
  if (source) {
    dragSource.value = null;
    if (source.day_of_week === dayIdx && source.category_id === categoryId) return;

    // Cross-Plan-Move: nur erlauben wenn Ziel im selben Plan liegt
    if (targetPlan && source.meal_plan_id !== targetPlan.id) {
      showSuccess('Verschieben zwischen verschiedenen Plänen ist noch nicht unterstützt.');
      return;
    }
    // Wenn kein Zielplan existiert → Move nicht erlauben (kein Plan zum Ziel-Tag)
    if (!targetPlan) {
      showSuccess('Für diesen Tag existiert noch kein Plan. Bitte generiere zuerst einen Plan.');
      return;
    }
    try {
      await store.moveEntry(source.meal_plan_id, source.id, dayIdx, categoryId, planDate);
      showSuccess('Mahlzeit verschoben! ↕️');
    } catch { /* useApi */ }
    return;
  }

  // Fall 2: Externer Drop aus SuggestionBox
  const suggestion = suggestionDragData.value;
  if (!suggestion) return;
  suggestionDragData.value = null;

  const existingMeal = getMeal(dayIdx, categoryId);

  if (targetPlan) {
    // Tag gehört zu einem existierenden Plan
    if (!existingMeal) {
      try {
        await store.addEntry(targetPlan.id, suggestion.recipeId, dayIdx, categoryId, undefined, planDate);
        showSuccess('Rezept hinzugefügt! ✓');
      } catch { /* useApi */ }
      return;
    }
    // Slot belegt → Konflikt-Modal öffnen
    conflictData.value = {
      recipeId: suggestion.recipeId,
      recipeTitle: suggestion.recipeTitle,
      existingEntry: existingMeal,
      targetDay: dayIdx,
      targetMeal: categoryId,
    };
    showConflictModal.value = true;
  } else {
    // Kein Plan für diesen Tag → neuen Plan erstellen (1-Tages-Plan)
    try {
      const data = await store.addRecipeToPlan(suggestion.recipeId, dayIdx, categoryId, planDate, undefined, planDate);
      if (data.plan) {
        // Wochenansicht neu laden, damit der neue Plan sichtbar wird
        const ws = currentWeekStart.value;
        const [y, m, d] = ws.split('-').map(Number);
        const monday = new Date(y, m - 1, d);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        await store.fetchWeekEntries(ws, formatDateLocal(sunday));
      }
      showSuccess('Plan erstellt & Rezept hinzugefügt! 🎉');
    } catch { /* useApi */ }
  }
}

// ─── Konflikt-Auflösung ───
async function conflictReplace() {
  const { recipeId, existingEntry } = conflictData.value;
  showConflictModal.value = false;
  try {
    await store.swapRecipe(existingEntry.meal_plan_id, existingEntry.id, recipeId);
    showSuccess('Rezept ersetzt! 🔄');
  } catch { /* useApi */ }
  conflictData.value = null;
}

async function conflictMove() {
  const { recipeId, existingEntry, targetDay, targetMeal } = conflictData.value;
  showConflictModal.value = false;
  const freeDays = getFreeDays(targetMeal);
  if (!freeDays.length) return;
  const freeDay = freeDays[0];
  const freePlanDate = weekDays.value[freeDay]?.dateStr;
  const targetPlanDate = weekDays.value[targetDay]?.dateStr;
  const planId = existingEntry.meal_plan_id;
  try {
    // Bestehendes auf freien Tag verschieben
    await store.moveEntry(planId, existingEntry.id, freeDay, targetMeal, freePlanDate);
    // Neues Rezept auf den Ziel-Slot setzen
    await store.addEntry(planId, recipeId, targetDay, targetMeal, undefined, targetPlanDate);
    const dayName = weekDays.value[freeDay]?.short || freeDay;
    showSuccess(`Bestehendes nach ${dayName} verschoben, neues Rezept eingefügt! ↕️`);
  } catch { /* useApi */ }
  conflictData.value = null;
}

async function conflictDelete() {
  const { recipeId, existingEntry, targetDay, targetMeal } = conflictData.value;
  showConflictModal.value = false;
  const targetPlanDate = weekDays.value[targetDay]?.dateStr;
  const planId = existingEntry.meal_plan_id;
  try {
    await store.removeEntry(planId, existingEntry.id);
    await store.addEntry(planId, recipeId, targetDay, targetMeal, undefined, targetPlanDate);
    showSuccess('Bestehendes gelöscht, neues Rezept eingefügt! 🗑️');
  } catch { /* useApi */ }
  conflictData.value = null;
}

function conflictCancel() {
  showConflictModal.value = false;
  conflictData.value = null;
}

// ─── Drop auf "Kein Plan"-Bereich ───
function onDragOverEmpty(event) {
  dragOverEmpty.value = true;
  event.dataTransfer.dropEffect = 'copy';
}
async function onDropEmpty() {
  dragOverEmpty.value = false;
  const suggestion = suggestionDragData.value;
  if (!suggestion) return;
  suggestionDragData.value = null;
  try {
    // Auf den ersten sichtbaren Meal-Type und Montag (Tag 0) legen
    const defaultCategoryId = mealTypes.value[0]?.id;
    if (!defaultCategoryId) return;
    const data = await store.addRecipeToPlan(suggestion.recipeId, 0, defaultCategoryId, currentWeekStart.value);
    if (data.plan) store.currentPlan = data.plan;
    showSuccess('Wochenplan erstellt & Rezept hinzugefügt! 🎉');
  } catch { /* useApi */ }
}

// ─── Sperren ───
function openBlockDialog(meal) {
  blockDialog.value = { show: true, recipeId: meal.recipe_id, recipeTitle: meal.recipe_title };
  blockWeeks.value = 4;
  blockReason.value = '';
  selectedMeal.value = null;
}

async function doBlockRecipe() {
  const { recipeId } = blockDialog.value;
  try {
    const data = await blocksStore.blockRecipe(recipeId, blockWeeks.value, blockReason.value);
    showSuccess(data.message);
    blockDialog.value.show = false;
  } catch { /* useApi */ }
}

async function doUnblockRecipe(blockId) {
  try {
    await blocksStore.unblockById(blockId);
    showSuccess('Sperre aufgehoben');
  } catch { /* useApi */ }
}

// ─── Init ───
onMounted(async () => {
  recipesStore.fetchCategories();
  store.fetchHistory();
  store.fetchAvailableWeeks();
  collectionsStore.fetchCollections();
  blocksStore.fetchBlocks();
  fetchSuggestions();
  store.fetchLastWeekRecipes();

  const ws = currentWeekStart.value;
  if (viewMode.value === 'week' || viewMode.value === 'day') {
    // Wochenansicht: plan-übergreifende Entries laden
    const [y, m, d] = ws.split('-').map(Number);
    const monday = new Date(y, m - 1, d);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    await store.fetchWeekEntries(ws, formatDateLocal(sunday));
  } else if (viewMode.value === 'plan') {
    // Plan-Ansicht: aktuellen Plan oder Pläne laden
    await store.fetchPlans();
    if (store.plans.length && !selectedPlanId.value) {
      selectedPlanId.value = store.plans[0].id;
    }
    if (selectedPlanId.value) {
      await store.fetchPlanById(selectedPlanId.value);
    }
  }
});
</script>

<style scoped>
/* ─── Meal Slot ─── */
.meal-slot {
  display: flex;
  flex-direction: column;
  padding: calc(var(--spacing) * 1.5);
  border-radius: var(--radius-lg);
  background-color: var(--color-stone-50);
  transition: background-color 0.15s ease;
}
:is(.dark .meal-slot) {
  background-color: var(--color-stone-950);
}
.meal-slot-dragover {
  background-color: var(--color-primary-50);
  outline: 2px dashed var(--color-primary-400);
  outline-offset: -2px;
}

/* ─── Drop auf "Kein Plan" ─── */
.no-plan-drop-target {
  outline: 2px dashed var(--color-primary-400);
  outline-offset: -2px;
  border-radius: var(--radius-xl);
  background-color: var(--color-primary-50);
  transition: background-color 0.15s ease, outline-color 0.15s ease;
}
:is(.dark .no-plan-drop-target) {
  background-color: color-mix(in srgb, var(--color-primary-900) 30%, transparent);
}
:is(.dark .meal-slot-dragover) {
  background-color: color-mix(in srgb, var(--color-primary-900) 30%, transparent);
}

/* Tage ohne Rezepte  */
.meal-slot--inactive {
  opacity: 0.4;
}

/* ─── Mobile Meal Card ─── */
.mobile-meal-card {
  background: white;
  border: 1px solid var(--color-stone-200);
  border-radius: var(--radius-xl);
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.mobile-meal-card:active {
  border-color: var(--color-primary-400);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary-400) 25%, transparent);
}
:is(.dark .mobile-meal-card) {
  background: var(--color-stone-900);
  border-color: var(--color-stone-800);
}
:is(.dark .mobile-meal-card:active) {
  border-color: var(--color-primary-600);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary-600) 25%, transparent);
}

/* ─── Servings Popup ─── */
.servings-popup {
  position: fixed;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.25rem;
  background: white;
  border: 1px solid var(--color-stone-200);
  border-radius: var(--radius-xl);
  padding: 0.25rem;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  z-index: 111;
}
:is(.dark .servings-popup) {
  background: var(--color-stone-800);
  border-color: var(--color-stone-700);
}
.servings-popup-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: background-color 0.15s ease;
  color: var(--color-stone-600);
}
:is(.dark .servings-popup-btn) { color: var(--color-stone-300); }
.servings-popup-btn:hover { background-color: var(--color-stone-100); }
:is(.dark .servings-popup-btn:hover) { background-color: var(--color-stone-700); }
.servings-popup-btn:disabled { opacity: 0.3; cursor: default; }
.servings-popup-btn:disabled:hover { background-color: transparent; }
.servings-popup-value {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0 0.5rem;
  color: var(--color-stone-800);
  min-width: 3rem;
  justify-content: center;
}
:is(.dark .servings-popup-value) { color: var(--color-stone-100); }

/* ─── Meal Card (Wochenansicht kompakt) ─── */
.meal-card {
  cursor: grab;
  border-radius: var(--radius-lg);
  transition: transform 0.1s ease, box-shadow 0.15s ease;
}
.meal-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
.meal-card:active { cursor: grabbing; }
.meal-card--cooked { opacity: 0.55; }

/* ─── Meal Card (große Kartenansicht) ─── */
.meal-card-large {
  cursor: grab;
  background-color: white;
  border: 1px solid var(--color-stone-200);
  border-radius: var(--radius-xl);
  overflow: hidden;
  transition: transform 0.15s ease, box-shadow 0.2s ease, border-color 0.15s ease;
}
.meal-card-large:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  border-color: var(--color-primary-300);
}
.meal-card-large:active { cursor: grabbing; }
.meal-card-large--cooked { opacity: 0.55; }
:is(.dark .meal-card-large) {
  background-color: var(--color-stone-900);
  border-color: var(--color-stone-800);
}
:is(.dark .meal-card-large:hover) {
  border-color: var(--color-primary-700);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

/* ─── Leerer Slot (große Karten) ─── */
.meal-card-large-empty {
  display: flex;
  width: 100%;
  min-height: 280px;
  justify-content: center;
  align-items: center;
  border: 2px dashed var(--color-stone-200);
  border-radius: var(--radius-xl);
  transition: border-color 0.15s ease, background-color 0.15s ease;
  flex: 1;
}
:is(.dark .meal-card-large-empty) { border-color: var(--color-stone-800); }
.meal-card-large-empty:hover {
  border-color: var(--color-primary-300);
  background-color: var(--color-primary-50);
}
:is(.dark .meal-card-large-empty:hover) {
  border-color: var(--color-primary-700);
  background-color: color-mix(in srgb, var(--color-primary-900) 20%, transparent);
}

/* ─── Leerer Slot (kompakt) ─── */
.meal-card-empty {
  display: flex;
  flex: 1;
  justify-content: center;
  align-items: center;
  min-height: calc(var(--spacing) * 14);
  border: 2px dashed var(--color-stone-200);
  border-radius: var(--radius-lg);
  transition: border-color 0.15s ease, background-color 0.15s ease;
}
:is(.dark .meal-card-empty) { border-color: var(--color-stone-800); }
.meal-card-empty:hover {
  border-color: var(--color-primary-300);
  background-color: var(--color-primary-50);
}
:is(.dark .meal-card-empty:hover) {
  border-color: var(--color-primary-700);
  background-color: color-mix(in srgb, var(--color-primary-900) 20%, transparent);
}

/* ─── Tages-Ansicht Karten ─── */
.day-meal-card {
  background-color: white;
  padding: calc(var(--spacing) * 4);
  border: 1px solid var(--color-stone-200);
  border-radius: var(--radius-xl);
  transition: border-color 0.15s ease;
}
.day-meal-card:hover { border-color: var(--color-primary-300); }
:is(.dark .day-meal-card) { background-color: var(--color-stone-900); border-color: var(--color-stone-800); }
:is(.dark .day-meal-card:hover) { border-color: var(--color-primary-700); }
.day-meal-card--cooked { opacity: 0.6; }

.day-meal-empty {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: calc(var(--spacing) * 6) 0;
  border: 2px dashed var(--color-stone-200);
  border-radius: var(--radius-xl);
}
:is(.dark .day-meal-empty) { border-color: var(--color-stone-800); }

/* ─── Tages-Aktions-Buttons ─── */
.day-action-btn {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 1);
  padding: calc(var(--spacing) * 1.5) calc(var(--spacing) * 2.5);
  border-radius: var(--radius-lg);
  font-size: 0.75rem;
  font-weight: 500;
  background-color: var(--color-stone-100);
  color: var(--color-stone-600);
  transition: background-color 0.15s ease, color 0.15s ease;
  text-decoration: none;
}
.day-action-btn:hover { background-color: var(--color-stone-200); color: var(--color-stone-800); }
:is(.dark .day-action-btn) { background-color: var(--color-stone-800); color: var(--color-stone-400); }
:is(.dark .day-action-btn:hover) { background-color: var(--color-stone-700); color: var(--color-stone-200); }
.day-action-btn--active { background-color: var(--color-accent-100); color: var(--color-accent-700); }
:is(.dark .day-action-btn--active) { background-color: color-mix(in srgb, var(--color-accent-900) 40%, transparent); color: var(--color-accent-400); }
.day-action-btn--danger:hover { background-color: var(--color-red-100); color: var(--color-red-600); }
:is(.dark .day-action-btn--danger:hover) { background-color: color-mix(in srgb, var(--color-red-900) 40%, transparent); color: var(--color-red-400); }

/* ─── Action Pills (Popup) ─── */
.action-pill {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: calc(var(--spacing) * 1.5);
  padding: calc(var(--spacing) * 2.5) calc(var(--spacing) * 3);
  border-radius: var(--radius-xl);
  font-size: 0.8rem;
  font-weight: 500;
  background-color: var(--color-stone-100);
  color: var(--color-stone-600);
  transition: background-color 0.15s ease, color 0.15s ease;
  text-decoration: none;
}
.action-pill:hover { background-color: var(--color-stone-200); color: var(--color-stone-800); }
:is(.dark .action-pill) { background-color: var(--color-stone-800); color: var(--color-stone-400); }
:is(.dark .action-pill:hover) { background-color: var(--color-stone-700); color: var(--color-stone-200); }
.action-pill--active { background-color: var(--color-accent-100); color: var(--color-accent-700); }
:is(.dark .action-pill--active) { background-color: color-mix(in srgb, var(--color-accent-900) 40%, transparent); color: var(--color-accent-400); }
.action-pill--danger:hover { background-color: var(--color-red-100); color: var(--color-red-600); }
:is(.dark .action-pill--danger:hover) { background-color: color-mix(in srgb, var(--color-red-900) 40%, transparent); color: var(--color-red-400); }

/* ─── Swap Vorschlag ─── */
.swap-suggestion {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 3);
  padding: calc(var(--spacing) * 2.5);
  border: 1px solid var(--color-stone-200);
  border-radius: var(--radius-lg);
  width: 100%;
  text-align: left;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}
.swap-suggestion:hover {
  border-color: var(--color-primary-400);
  background-color: var(--color-primary-50);
}
:is(.dark .swap-suggestion) { border-color: var(--color-stone-800); }
:is(.dark .swap-suggestion:hover) {
  border-color: var(--color-primary-700);
  background-color: color-mix(in srgb, var(--color-primary-900) 20%, transparent);
}

/* ─── Modal Transition ─── */
.modal-enter-active { transition: opacity 0.2s ease; }
.modal-leave-active { transition: opacity 0.15s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>
