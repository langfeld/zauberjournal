<!--
  ============================================
  HouseholdView - Haushaltsverwaltung
  ============================================
  Erstellen, Verwalten, Einladen und Beitreten
  von Haushalten für gemeinsame Nutzung.
-->
<template>
  <div class="mx-auto max-w-7xl">
    <!-- Header -->
    <div class="mb-6 sm:mb-8">
      <h1 class="font-display font-bold text-stone-800 dark:text-stone-100 text-2xl sm:text-3xl">
        🏠 Haushalt
      </h1>
      <p class="mt-1 text-stone-500 dark:text-stone-400 text-sm">
        Teile Rezepte, Einkaufslisten und Wochenpläne mit deinem Haushalt
      </p>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-20">
      <div class="border-4 border-primary-200 dark:border-primary-800 border-t-primary-600 rounded-full w-8 h-8 animate-spin"></div>
    </div>

    <template v-else>
      <!-- Kein Haushalt: Erstellen oder Beitreten -->
      <div v-if="!householdStore.hasHousehold" class="space-y-6">
        <!-- Beitreten -->
        <div class="bg-white dark:bg-stone-800 p-6 border border-stone-200 dark:border-stone-700 rounded-2xl">
          <h2 class="flex items-center gap-2 mb-4 font-display font-bold text-stone-800 dark:text-stone-100 text-lg">
            <UserPlus class="w-5 h-5 text-primary-600" />
            Haushalt beitreten
          </h2>
          <p class="mb-4 text-stone-500 dark:text-stone-400 text-sm">
            Hast du einen Einladungscode erhalten? Gib ihn hier ein:
          </p>
          <div class="flex gap-3">
            <input
              v-model="joinCode"
              type="text"
              placeholder="Einladungscode eingeben"
              maxlength="8"
              class="flex-1 bg-stone-50 dark:bg-stone-900 px-4 py-3 border border-stone-200 dark:border-stone-700 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              @keyup.enter="handleJoin"
            />
            <button
              @click="handleJoin"
              :disabled="!joinCode.trim() || joining"
              class="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-5 py-3 rounded-xl font-medium text-white text-sm transition-colors"
            >
              {{ joining ? 'Beitritt...' : 'Beitreten' }}
            </button>
          </div>
        </div>

        <!-- Erstellen -->
        <div class="bg-white dark:bg-stone-800 p-6 border border-stone-200 dark:border-stone-700 rounded-2xl">
          <h2 class="flex items-center gap-2 mb-4 font-display font-bold text-stone-800 dark:text-stone-100 text-lg">
            <Plus class="w-5 h-5 text-primary-600" />
            Neuen Haushalt erstellen
          </h2>
          <p class="mb-4 text-stone-500 dark:text-stone-400 text-sm">
            Erstelle einen Haushalt und lade andere Personen ein.
          </p>
          <div class="flex gap-3">
            <input
              v-model="newHouseholdName"
              type="text"
              placeholder="Name des Haushalts (z.B. Familie Müller)"
              maxlength="100"
              class="flex-1 bg-stone-50 dark:bg-stone-900 px-4 py-3 border border-stone-200 dark:border-stone-700 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              @keyup.enter="handleCreate"
            />
            <button
              @click="handleCreate"
              :disabled="!newHouseholdName.trim() || creating"
              class="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-5 py-3 rounded-xl font-medium text-white text-sm transition-colors"
            >
              {{ creating ? 'Erstelle...' : 'Erstellen' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Haushalt vorhanden -->
      <template v-else>
        <!-- Haushalt-Auswahl (wenn mehrere) -->
        <div v-if="householdStore.households.length > 1" class="flex flex-wrap gap-2 mb-6">
          <button
            v-for="hh in householdStore.households"
            :key="hh.id"
            @click="switchHousehold(hh.id)"
            :class="[
              'px-4 py-2 rounded-xl text-sm font-medium transition-colors border',
              hh.id === householdStore.activeHouseholdId
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:border-primary-300'
            ]"
          >
            {{ hh.name }}
          </button>
        </div>

        <!-- Aktiver Haushalt Details -->
        <div v-if="details" class="space-y-6">
          <!-- Header Card -->
          <div class="bg-linear-to-r from-primary-50 dark:from-primary-900/20 to-amber-50 dark:to-amber-900/10 p-5 sm:p-6 border border-primary-200 dark:border-primary-800/50 rounded-2xl">
            <div class="flex sm:flex-row flex-col sm:items-center gap-4">
              <div class="flex flex-1 items-center gap-3">
                <div class="flex justify-center items-center bg-primary-100 dark:bg-primary-900/40 rounded-xl w-12 h-12 shrink-0">
                  <Home class="w-6 h-6 text-primary-600 dark:text-primary-400" />
                </div>
                <div>
                  <h2 class="font-display font-bold text-stone-800 dark:text-stone-100 text-lg">
                    {{ details.name }}
                  </h2>
                  <p class="text-stone-500 dark:text-stone-400 text-sm">
                    {{ details.members?.length || 0 }} Mitglied{{ (details.members?.length || 0) !== 1 ? 'er' : '' }}
                    · Erstellt {{ formatDate(details.created_at) }}
                  </p>
                </div>
              </div>
              <div class="flex gap-2">
                <button
                  @click="showInviteModal = true"
                  class="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 px-4 py-2.5 rounded-xl font-medium text-white text-sm transition-colors"
                >
                  <UserPlus class="w-4 h-4" />
                  Einladen
                </button>
                <button
                  @click="showSettingsModal = true"
                  class="flex items-center gap-2 bg-white hover:bg-stone-50 dark:bg-stone-800 dark:hover:bg-stone-700 px-4 py-2.5 border border-stone-200 dark:border-stone-700 rounded-xl text-stone-600 dark:text-stone-300 text-sm transition-colors"
                >
                  <Settings class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <!-- Mitglieder -->
          <div class="bg-white dark:bg-stone-800 p-5 border border-stone-200 dark:border-stone-700 rounded-2xl">
            <h3 class="flex items-center gap-2 mb-4 font-display font-semibold text-stone-800 dark:text-stone-100">
              <Users class="w-5 h-5 text-primary-600" />
              Mitglieder
            </h3>
            <div class="space-y-3">
              <div
                v-for="member in details.members"
                :key="member.id"
                class="flex items-center gap-3 hover:bg-stone-50 dark:hover:bg-stone-700/50 p-3 rounded-xl transition-colors"
              >
                <div class="flex justify-center items-center bg-primary-100 dark:bg-primary-900/40 rounded-full w-10 h-10 shrink-0">
                  <span class="font-semibold text-primary-600 dark:text-primary-400 text-sm">
                    {{ (member.username || '?').charAt(0).toUpperCase() }}
                  </span>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-stone-800 dark:text-stone-100 text-sm truncate">
                      {{ member.display_name || member.username }}
                    </span>
                    <span v-if="member.id === details.created_by" class="bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-full text-amber-700 dark:text-amber-400 text-xs">
                      Ersteller
                    </span>
                  </div>
                  <span class="text-stone-400 dark:text-stone-500 text-xs">
                    Beigetreten {{ formatDate(member.joined_at) }}
                  </span>
                </div>
                <!-- Entfernen-Button nur für Creator und nicht sich selbst -->
                <button
                  v-if="isCreator && member.id !== currentUserId"
                  @click="confirmRemoveMember(member)"
                  class="p-2 rounded-lg text-stone-400 hover:text-red-500 transition-colors"
                  title="Mitglied entfernen"
                >
                  <UserMinus class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <!-- Haushalt-Statistiken -->
          <div v-if="householdStats" class="bg-white dark:bg-stone-800 p-5 border border-stone-200 dark:border-stone-700 rounded-2xl">
            <h3 class="flex items-center gap-2 mb-4 font-display font-semibold text-stone-800 dark:text-stone-100">
              <BarChart3 class="w-5 h-5 text-primary-600" />
              Statistiken
            </h3>

            <!-- Übersicht-Karten -->
            <div class="gap-3 grid grid-cols-2 sm:grid-cols-4 mb-5">
              <div class="bg-stone-50 dark:bg-stone-900/50 p-3 rounded-xl text-center">
                <p class="font-bold text-primary-600 text-xl">{{ householdStats.recipes }}</p>
                <p class="text-stone-500 text-xs">Rezepte</p>
              </div>
              <div class="bg-stone-50 dark:bg-stone-900/50 p-3 rounded-xl text-center">
                <p class="font-bold text-amber-600 text-xl">{{ householdStats.cooked_total }}</p>
                <p class="text-stone-500 text-xs">Mal gekocht</p>
              </div>
              <div class="bg-stone-50 dark:bg-stone-900/50 p-3 rounded-xl text-center">
                <p class="font-bold text-xl text-accent-600">{{ householdStats.completed_shops }}</p>
                <p class="text-stone-500 text-xs">Einkäufe</p>
              </div>
              <div class="bg-stone-50 dark:bg-stone-900/50 p-3 rounded-xl text-center">
                <p class="font-bold text-indigo-600 text-xl">{{ householdStats.streak }}🔥</p>
                <p class="text-stone-500 text-xs">Wochen-Streak</p>
              </div>
            </div>

            <!-- Top-Rezepte -->
            <div v-if="householdStats.top_recipes?.length" class="mb-4">
              <h4 class="mb-2 font-medium text-stone-600 dark:text-stone-400 text-sm">🏆 Beliebte Rezepte</h4>
              <div class="space-y-2">
                <router-link
                  v-for="(recipe, i) in householdStats.top_recipes"
                  :key="recipe.id"
                  :to="`/recipes/${recipe.id}`"
                  class="flex items-center gap-3 hover:bg-stone-50 dark:hover:bg-stone-700/50 p-2 rounded-lg transition-colors"
                >
                  <span class="w-5 font-medium text-stone-400 text-sm">{{ i + 1 }}.</span>
                  <div class="bg-stone-100 dark:bg-stone-700 rounded-lg w-8 h-8 overflow-hidden shrink-0">
                    <img v-if="recipe.image_url" :src="recipe.image_url" :alt="recipe.title" class="w-full h-full object-cover" />
                    <div v-else class="flex justify-center items-center w-full h-full text-xs">🍽️</div>
                  </div>
                  <span class="flex-1 text-stone-700 dark:text-stone-300 text-sm truncate">{{ recipe.title }}</span>
                  <span class="text-stone-400 text-xs">{{ recipe.cook_count }}×</span>
                </router-link>
              </div>
            </div>

            <!-- Mitglieder-Stats -->
            <div v-if="householdStats.member_stats?.length">
              <h4 class="mb-2 font-medium text-stone-600 dark:text-stone-400 text-sm">👩‍🍳 Koch-Rangliste</h4>
              <div class="space-y-2">
                <div
                  v-for="member in householdStats.member_stats"
                  :key="member.id"
                  class="flex items-center gap-3 p-2"
                >
                  <div class="flex justify-center items-center bg-primary-100 dark:bg-primary-900/40 rounded-full w-7 h-7 shrink-0">
                    <span class="font-semibold text-primary-600 dark:text-primary-400 text-xs">
                      {{ (member.username || '?').charAt(0).toUpperCase() }}
                    </span>
                  </div>
                  <span class="flex-1 text-stone-700 dark:text-stone-300 text-sm">{{ member.display_name || member.username }}</span>
                  <div class="flex items-center gap-2">
                    <div class="bg-stone-100 dark:bg-stone-700 rounded-full w-24 h-2 overflow-hidden">
                      <div
                        class="bg-primary-500 rounded-full h-full transition-all"
                        :style="{ width: `${maxCookCount > 0 ? (member.cook_count / maxCookCount) * 100 : 0}%` }"
                      ></div>
                    </div>
                    <span class="w-10 text-stone-400 text-xs text-right">{{ member.cook_count }}×</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Aktivitäts-Feed -->
          <div class="bg-white dark:bg-stone-800 p-5 border border-stone-200 dark:border-stone-700 rounded-2xl">
            <h3 class="flex items-center gap-2 mb-4 font-display font-semibold text-stone-800 dark:text-stone-100">
              <Activity class="w-5 h-5 text-primary-600" />
              Letzte Aktivitäten
            </h3>
            <div v-if="activities.length === 0" class="py-4 text-stone-400 dark:text-stone-500 text-sm text-center">
              Noch keine Aktivitäten
            </div>
            <div v-else class="space-y-2 max-h-64 overflow-y-auto">
              <div
                v-for="act in activities"
                :key="act.id"
                class="flex items-start gap-3 p-2 text-sm"
              >
                <div class="bg-stone-100 dark:bg-stone-700 mt-0.5 rounded-full w-2 h-2 shrink-0"></div>
                <div>
                  <span class="text-stone-700 dark:text-stone-300">{{ act.action }}</span>
                  <span class="ml-2 text-stone-400 dark:text-stone-500 text-xs">
                    {{ formatDate(act.created_at) }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Kategorien synchronisieren -->
          <div v-if="details?.members?.length > 1" class="bg-white dark:bg-stone-800 p-5 border border-stone-200 dark:border-stone-700 rounded-2xl">
            <h3 class="flex items-center gap-2 mb-4 font-display font-semibold text-stone-800 dark:text-stone-100">
              <Layers class="w-5 h-5 text-primary-600" />
              Kategorien synchronisieren
            </h3>

            <p class="mb-4 text-stone-500 dark:text-stone-400 text-sm">
              Vergleiche die Kategorien aller Mitglieder und fasse abweichende zusammen.
            </p>

            <!-- Laden -->
            <div v-if="categoryCompareLoading" class="flex justify-center py-6">
              <div class="border-4 border-primary-200 dark:border-primary-800 border-t-primary-600 rounded-full w-6 h-6 animate-spin"></div>
            </div>

            <!-- Noch nicht geladen -->
            <button
              v-else-if="!categoryGroups"
              @click="loadCategoryCompare"
              class="flex items-center gap-2 bg-primary-50 hover:bg-primary-100 dark:bg-primary-900/20 dark:hover:bg-primary-900/30 px-4 py-2.5 border border-primary-200 dark:border-primary-800 rounded-xl text-primary-700 dark:text-primary-300 text-sm transition-colors"
            >
              <Layers class="w-4 h-4" />
              Kategorien vergleichen
            </button>

            <!-- Ergebnisse -->
            <template v-else>
              <!-- Erfolgs-Banner -->
              <div v-if="mergeFeedback" class="flex items-start gap-2.5 bg-emerald-50 dark:bg-emerald-950/30 mb-4 p-3 border border-emerald-200 dark:border-emerald-900/50 rounded-xl">
                <CheckCircle2 class="mt-0.5 w-4 h-4 text-emerald-500 shrink-0" />
                <p class="text-emerald-700 dark:text-emerald-300 text-sm">{{ mergeFeedback }}</p>
              </div>

              <!-- Alles synchron -->
              <div v-if="unsyncedGroups.length === 0" class="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/30 p-4 border border-emerald-200 dark:border-emerald-900/50 rounded-xl">
                <CheckCircle2 class="w-5 h-5 text-emerald-500" />
                <p class="text-emerald-700 dark:text-emerald-300 text-sm">
                  Alle Kategorien sind synchron!
                </p>
              </div>

              <!-- Gruppen-Liste -->
              <div v-else class="space-y-3">
                <div
                  v-for="group in unsyncedGroups"
                  :key="group.canonical_name"
                  class="bg-stone-50 dark:bg-stone-900/50 p-4 border border-stone-200 dark:border-stone-700 rounded-xl"
                >
                  <!-- Gruppen-Header -->
                  <div class="flex items-center justify-between gap-2 mb-3">
                    <div class="flex items-center gap-2">
                      <span class="text-amber-500">
                        <AlertTriangle class="w-4 h-4" />
                      </span>
                      <span class="font-medium text-stone-800 dark:text-stone-100 text-sm">
                        {{ group.categories.map(c => c.name).filter((v, i, a) => a.indexOf(v) === i).join(' / ') }}
                      </span>
                    </div>
                    <span class="bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-full text-amber-700 dark:text-amber-400 text-xs">
                      {{ group.has_name_conflict ? 'Unterschiedliche Namen' : group.has_duplicates ? 'Doppelte Einträge' : 'Unterschiedlicher Stil' }}
                    </span>
                  </div>

                  <!-- Einzelne Kategorien pro Mitglied -->
                  <div class="space-y-2 mb-3">
                    <div
                      v-for="cat in group.categories"
                      :key="cat.id"
                      class="flex items-center gap-3 text-sm"
                    >
                      <div class="flex justify-center items-center bg-white dark:bg-stone-800 rounded-lg w-8 h-8 shrink-0 border border-stone-200 dark:border-stone-700">
                        <span>{{ cat.icon }}</span>
                      </div>
                      <span class="text-stone-700 dark:text-stone-300 font-medium">{{ cat.name }}</span>
                      <span :class="[
                        'text-xs px-1.5 py-0.5 rounded-full',
                        cat.is_meal_time ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'bg-stone-100 dark:bg-stone-700 text-stone-500 dark:text-stone-400'
                      ]">
                        {{ cat.is_meal_time ? 'Tageszeit' : 'Kategorie' }}
                      </span>
                      <span class="ml-auto text-stone-400 dark:text-stone-500 text-xs">
                        {{ cat.owner_name }}
                      </span>
                    </div>
                  </div>

                  <!-- Fehlend bei -->
                  <div v-if="group.missing_for.length" class="mb-3">
                    <p class="text-stone-400 dark:text-stone-500 text-xs">
                      Fehlt bei: {{ group.missing_for.map(uid => getMemberName(uid)).join(', ') }}
                    </p>
                  </div>

                  <!-- Merge-Buttons -->
                  <div class="flex flex-wrap gap-2">
                    <!-- Duplikate: ein einzelner "Zusammenführen" Button -->
                    <button
                      v-if="group.has_duplicates && !group.has_name_conflict"
                      @click="handleMergeGroup(group, { name: group.categories[0].name, icon: group.categories[0].icon, color: group.categories[0].color })"
                      :disabled="merging"
                      class="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 px-3 py-1.5 rounded-lg text-white text-sm transition-colors disabled:opacity-50"
                    >
                      <span>{{ group.categories[0].icon }}</span>
                      <span>Duplikate zusammenführen</span>
                    </button>
                    <!-- Unterschiedliche Namen: ein Button pro Variante -->
                    <template v-else>
                      <button
                        v-for="option in getMergeOptions(group)"
                        :key="option.name"
                        @click="handleMergeGroup(group, option)"
                        :disabled="merging"
                        class="flex items-center gap-1.5 bg-white hover:bg-primary-50 dark:bg-stone-800 dark:hover:bg-primary-900/20 px-3 py-1.5 border border-stone-200 dark:border-stone-700 hover:border-primary-300 dark:hover:border-primary-700 rounded-lg text-sm transition-colors disabled:opacity-50"
                      >
                        <span>{{ option.icon }}</span>
                        <span class="text-stone-700 dark:text-stone-300">Alle auf &laquo;{{ option.name }}&raquo;</span>
                      </button>
                    </template>
                  </div>
                </div>
              </div>

              <!-- Sync-Übersicht -->
              <div v-if="syncedGroups.length > 0" class="mt-4">
                <button
                  @click="showSyncedCategories = !showSyncedCategories"
                  class="flex items-center gap-2 text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 text-sm transition-colors"
                >
                  <ChevronDown class="w-4 h-4 transition-transform duration-200" :class="{ 'rotate-180': showSyncedCategories }" />
                  <span>{{ syncedGroups.length }} synchronisierte Kategorie{{ syncedGroups.length !== 1 ? 'n' : '' }}</span>
                </button>
                <Transition name="fade">
                  <div v-if="showSyncedCategories" class="flex flex-wrap gap-2 mt-2">
                    <div
                      v-for="group in syncedGroups"
                      :key="group.canonical_name"
                      class="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/20 px-2.5 py-1 rounded-lg text-sm"
                    >
                      <span>{{ group.categories[0]?.icon }}</span>
                      <span class="text-emerald-700 dark:text-emerald-300">{{ group.canonical_name }}</span>
                      <CheckCircle2 class="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                  </div>
                </Transition>
              </div>

              <!-- Neu laden -->
              <button
                @click="loadCategoryCompare"
                class="flex items-center gap-1.5 mt-4 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 text-xs transition-colors"
              >
                <RefreshCw class="w-3.5 h-3.5" />
                Aktualisieren
              </button>
            </template>
          </div>

          <!-- Datenmigration -->
          <div class="bg-white dark:bg-stone-800 p-5 border border-stone-200 dark:border-stone-700 rounded-2xl">
            <h3 class="flex items-center gap-2 mb-3 font-display font-semibold text-stone-800 dark:text-stone-100">
              <FolderSync class="w-5 h-5 text-primary-600" />
              Daten in den Haushalt übernehmen
            </h3>

            <!-- Erklärung -->
            <div class="flex items-start gap-2.5 bg-blue-50 dark:bg-blue-950/30 mb-4 p-3 border border-blue-100 dark:border-blue-900/50 rounded-xl">
              <Info class="mt-0.5 w-4 h-4 text-blue-500 shrink-0" />
              <div class="text-blue-700 dark:text-blue-300 text-xs leading-relaxed">
                <p class="mb-1">Beim Migrieren werden deine <strong>persönlichen Daten</strong> für alle Haushaltsmitglieder sichtbar. Deine Daten gehören weiterhin dir – sie werden nur zusätzlich im Haushalt geteilt.</p>
                <p>Wähle aus, welche Daten du teilen möchtest. Du kannst die Migration jederzeit für weitere Bereiche wiederholen.</p>
              </div>
            </div>

            <!-- Erfolgs-Anzeige -->
            <div v-if="migrateResult" class="flex items-start gap-2.5 bg-emerald-50 dark:bg-emerald-950/30 mb-4 p-3 border border-emerald-200 dark:border-emerald-900/50 rounded-xl">
              <CheckCircle2 class="mt-0.5 w-4 h-4 text-emerald-500 shrink-0" />
              <div class="text-emerald-700 dark:text-emerald-300 text-xs leading-relaxed">
                <p class="mb-1 font-medium">Migration abgeschlossen!</p>
                <ul class="space-y-0.5">
                  <li v-if="migrateResult.recipes != null">📖 {{ migrateResult.recipes }} Rezept{{ migrateResult.recipes !== 1 ? 'e' : '' }}</li>
                  <li v-if="migrateResult.categories != null">🏷️ {{ migrateResult.categories }} Kategorie{{ migrateResult.categories !== 1 ? 'n' : '' }}</li>
                  <li v-if="migrateResult.collections != null">📂 {{ migrateResult.collections }} Sammlung{{ migrateResult.collections !== 1 ? 'en' : '' }}</li>
                  <li v-if="migrateResult.meal_plans != null">📅 {{ migrateResult.meal_plans }} Wochenplan{{ migrateResult.meal_plans !== 1 ? 'pläne' : '' }}</li>
                  <li v-if="migrateResult.shopping_lists != null">🛒 {{ migrateResult.shopping_lists }} Einkaufsliste{{ migrateResult.shopping_lists !== 1 ? 'n' : '' }}</li>
                  <li v-if="migrateResult.pantry != null">🏠 {{ migrateResult.pantry }} Vorrats-Eintrag{{ migrateResult.pantry !== 1 ? 'e' : '' }}</li>
                  <li v-if="migrateResult.ingredient_aliases != null">🔗 {{ migrateResult.ingredient_aliases }} Zutaten-Alias{{ migrateResult.ingredient_aliases !== 1 ? 'e' : '' }}</li>
                  <li v-if="migrateResult.recipe_blocks != null">🚫 {{ migrateResult.recipe_blocks }} Rezept-Sperre{{ migrateResult.recipe_blocks !== 1 ? 'n' : '' }}</li>
                </ul>
              </div>
            </div>

            <!-- Toggle für Details -->
            <button @click="showMigrateDetails = !showMigrateDetails"
              class="flex items-center gap-2 mb-3 text-stone-600 hover:text-stone-800 dark:hover:text-stone-200 dark:text-stone-400 text-sm transition-colors">
              <ChevronDown class="w-4 h-4 transition-transform duration-200" :class="{ 'rotate-180': showMigrateDetails }" />
              <span class="font-medium">Was wird migriert?</span>
              <span class="bg-primary-100 dark:bg-primary-900/40 px-1.5 py-0.5 rounded-full text-primary-600 dark:text-primary-400 text-xs">
                {{ Object.values(migrateOptions).filter(Boolean).length }} von {{ Object.keys(migrateOptions).length }}
              </span>
            </button>

            <Transition name="fade">
              <div v-if="showMigrateDetails" class="space-y-2 mb-4">
                <!-- Rezepte -->
                <label class="flex items-start gap-3 hover:bg-stone-50 dark:hover:bg-stone-750 p-2.5 rounded-xl transition-colors cursor-pointer">
                  <input type="checkbox" v-model="migrateOptions.recipes" class="mt-0.5 accent-primary-600" />
                  <BookOpen class="mt-0.5 w-4 h-4 text-primary-500 shrink-0" />
                  <div class="flex-1">
                    <span class="font-medium text-stone-700 dark:text-stone-300 text-sm">Rezepte</span>
                    <p class="text-stone-400 text-xs">Alle privaten Rezepte werden für den Haushalt sichtbar. Alternativ kannst du Rezepte auch einzeln auf der Rezeptseite freigeben.</p>
                  </div>
                </label>

                <!-- Kategorien -->
                <label class="flex items-start gap-3 hover:bg-stone-50 dark:hover:bg-stone-750 p-2.5 rounded-xl transition-colors cursor-pointer">
                  <input type="checkbox" v-model="migrateOptions.categories" class="mt-0.5 accent-primary-600" />
                  <Tags class="mt-0.5 w-4 h-4 text-amber-500 shrink-0" />
                  <div class="flex-1">
                    <span class="font-medium text-stone-700 dark:text-stone-300 text-sm">Kategorien</span>
                    <p class="text-stone-400 text-xs">Deine Rezept-Kategorien teilen, damit alle im Haushalt dieselben Kategorien sehen und nutzen können.</p>
                  </div>
                </label>

                <!-- Sammlungen -->
                <label class="flex items-start gap-3 hover:bg-stone-50 dark:hover:bg-stone-750 p-2.5 rounded-xl transition-colors cursor-pointer">
                  <input type="checkbox" v-model="migrateOptions.collections" class="mt-0.5 accent-primary-600" />
                  <FolderOpen class="mt-0.5 w-4 h-4 text-violet-500 shrink-0" />
                  <div class="flex-1">
                    <span class="font-medium text-stone-700 dark:text-stone-300 text-sm">Sammlungen</span>
                    <p class="text-stone-400 text-xs">Rezept-Sammlungen (z. B. „Party", „Schnelle Küche") im Haushalt teilen.</p>
                  </div>
                </label>

                <!-- Wochenpläne -->
                <label class="flex items-start gap-3 hover:bg-stone-50 dark:hover:bg-stone-750 p-2.5 rounded-xl transition-colors cursor-pointer">
                  <input type="checkbox" v-model="migrateOptions.mealPlans" class="mt-0.5 accent-primary-600" />
                  <CalendarDays class="mt-0.5 w-4 h-4 text-blue-500 shrink-0" />
                  <div class="flex-1">
                    <span class="font-medium text-stone-700 dark:text-stone-300 text-sm">Wochenpläne</span>
                    <p class="text-stone-400 text-xs">Bestehende Wochenpläne teilen, sodass alle sehen können was geplant ist.</p>
                  </div>
                </label>

                <!-- Einkaufslisten -->
                <label class="flex items-start gap-3 hover:bg-stone-50 dark:hover:bg-stone-750 p-2.5 rounded-xl transition-colors cursor-pointer">
                  <input type="checkbox" v-model="migrateOptions.shoppingLists" class="mt-0.5 accent-primary-600" />
                  <ShoppingCart class="mt-0.5 w-4 h-4 text-emerald-500 shrink-0" />
                  <div class="flex-1">
                    <span class="font-medium text-stone-700 dark:text-stone-300 text-sm">Einkaufslisten</span>
                    <p class="text-stone-400 text-xs">Aktive Einkaufslisten gemeinsam nutzen – ideal zum Aufteilen der Einkäufe.</p>
                  </div>
                </label>

                <!-- Vorratskammer -->
                <label class="flex items-start gap-3 hover:bg-stone-50 dark:hover:bg-stone-750 p-2.5 rounded-xl transition-colors cursor-pointer">
                  <input type="checkbox" v-model="migrateOptions.pantry" class="mt-0.5 accent-primary-600" />
                  <Warehouse class="mt-0.5 w-4 h-4 text-orange-500 shrink-0" />
                  <div class="flex-1">
                    <span class="font-medium text-stone-700 dark:text-stone-300 text-sm">Vorratskammer</span>
                    <p class="text-stone-400 text-xs">Vorräte teilen, damit alle sehen was noch da ist und der Wochenplan darauf aufbauen kann.</p>
                  </div>
                </label>

                <!-- Zutaten-Aliase -->
                <label class="flex items-start gap-3 hover:bg-stone-50 dark:hover:bg-stone-750 p-2.5 rounded-xl transition-colors cursor-pointer">
                  <input type="checkbox" v-model="migrateOptions.aliases" class="mt-0.5 accent-primary-600" />
                  <Tags class="mt-0.5 w-4 h-4 text-teal-500 shrink-0" />
                  <div class="flex-1">
                    <span class="font-medium text-stone-700 dark:text-stone-300 text-sm">Zutaten-Aliase</span>
                    <p class="text-stone-400 text-xs">Zuordnungen wie „Paradeiser → Tomate" teilen, damit die Einkaufsliste für alle korrekt zusammengefasst wird.</p>
                  </div>
                </label>

                <!-- Rezept-Sperren -->
                <label class="flex items-start gap-3 hover:bg-stone-50 dark:hover:bg-stone-750 p-2.5 rounded-xl transition-colors cursor-pointer">
                  <input type="checkbox" v-model="migrateOptions.blocks" class="mt-0.5 accent-primary-600" />
                  <ShieldOff class="mt-0.5 w-4 h-4 text-red-400 shrink-0" />
                  <div class="flex-1">
                    <span class="font-medium text-stone-700 dark:text-stone-300 text-sm">Rezept-Sperren</span>
                    <p class="text-stone-400 text-xs">Gesperrte Rezepte (z. B. „4 Wochen nicht vorschlagen") für den ganzen Haushalt übernehmen.</p>
                  </div>
                </label>
              </div>
            </Transition>

            <!-- Migrate Button -->
            <button
              @click="handleMigrate"
              :disabled="migrating || !Object.values(migrateOptions).some(Boolean)"
              class="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 px-4 py-2.5 rounded-xl font-medium text-white text-sm transition-colors"
            >
              <FolderSync class="w-4 h-4" :class="{ 'animate-spin': migrating }" />
              {{ migrating ? 'Migriere...' : 'Ausgewählte Daten migrieren' }}
            </button>
          </div>
        </div>

        <!-- Noch Beitreten (unterhalb, wenn schon in Haushalt) -->
        <div class="bg-white dark:bg-stone-800 mt-6 p-5 border border-stone-200 dark:border-stone-700 rounded-2xl">
          <h3 class="flex items-center gap-2 mb-3 font-semibold text-stone-800 dark:text-stone-100 text-sm">
            <UserPlus class="w-4 h-4 text-primary-600" />
            Weiterem Haushalt beitreten
          </h3>
          <div class="flex gap-3">
            <input
              v-model="joinCode"
              type="text"
              placeholder="Einladungscode"
              maxlength="8"
              class="flex-1 bg-stone-50 dark:bg-stone-900 px-3 py-2 border border-stone-200 dark:border-stone-700 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              @keyup.enter="handleJoin"
            />
            <button
              @click="handleJoin"
              :disabled="!joinCode.trim() || joining"
              class="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-4 py-2 rounded-lg font-medium text-white text-sm transition-colors"
            >
              Beitreten
            </button>
          </div>
        </div>
      </template>
    </template>

    <!-- Einladungs-Modal -->
    <Teleport to="body">
      <div v-if="showInviteModal" class="z-50 fixed inset-0 flex justify-center items-center bg-black/50 p-4" @click.self="showInviteModal = false">
        <div class="bg-white dark:bg-stone-800 p-6 rounded-2xl w-full max-w-md">
          <h3 class="mb-4 font-display font-bold text-stone-800 dark:text-stone-100 text-lg">
            Einladungscode
          </h3>

          <div v-if="inviteCode" class="space-y-4">
            <div class="bg-stone-50 dark:bg-stone-900 p-4 rounded-xl text-center">
              <p class="font-mono font-bold text-primary-600 text-2xl tracking-wider select-all">
                {{ inviteCode }}
              </p>
              <p class="mt-2 text-stone-400 text-xs">
                Gültig für {{ inviteExpiry }}
              </p>
            </div>

            <!-- QR-Code -->
            <div class="flex justify-center bg-white p-3 rounded-xl">
              <QrCode :value="inviteQrUrl" :size="180" />
            </div>
            <p class="text-stone-400 dark:text-stone-500 text-xs text-center">
              QR-Code scannen oder Code manuell eingeben
            </p>

            <button
              @click="copyInviteCode"
              class="bg-primary-600 hover:bg-primary-700 px-4 py-2.5 rounded-xl w-full font-medium text-white text-sm transition-colors"
            >
              {{ copied ? '✓ Kopiert!' : 'Code kopieren' }}
            </button>
          </div>

          <div v-else>
            <p class="mb-4 text-stone-500 dark:text-stone-400 text-sm">
              Erstelle einen Einladungscode, den andere eingeben können um beizutreten.
            </p>
            <button
              @click="generateInvite"
              :disabled="generatingInvite"
              class="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-4 py-2.5 rounded-xl w-full font-medium text-white text-sm transition-colors"
            >
              {{ generatingInvite ? 'Erstelle...' : 'Code generieren' }}
            </button>
          </div>

          <button
            @click="showInviteModal = false; inviteCode = null"
            class="mt-3 p-2 rounded-lg w-full text-stone-500 hover:text-stone-700 text-sm transition-colors"
          >
            Schließen
          </button>
        </div>
      </div>
    </Teleport>

    <!-- Einstellungen-Modal -->
    <Teleport to="body">
      <div v-if="showSettingsModal" class="z-50 fixed inset-0 flex justify-center items-center bg-black/50 p-4" @click.self="showSettingsModal = false">
        <div class="bg-white dark:bg-stone-800 p-6 rounded-2xl w-full max-w-md">
          <h3 class="mb-4 font-display font-bold text-stone-800 dark:text-stone-100 text-lg">
            Haushalt-Einstellungen
          </h3>

          <div class="space-y-4">
            <!-- Umbenennen -->
            <div>
              <label class="block mb-1 text-stone-600 dark:text-stone-400 text-sm">Name</label>
              <input
                v-model="editName"
                type="text"
                maxlength="100"
                class="bg-stone-50 dark:bg-stone-900 px-3 py-2 border border-stone-200 dark:border-stone-700 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 w-full text-sm"
              />
            </div>

            <button
              @click="handleRename"
              :disabled="!editName.trim() || editName === details?.name"
              class="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-4 py-2.5 rounded-xl w-full font-medium text-white text-sm transition-colors"
            >
              Umbenennen
            </button>

            <hr class="border-stone-200 dark:border-stone-700" />

            <!-- Gefährliche Aktionen -->
            <div class="space-y-3">
              <button
                @click="handleLeave"
                class="flex justify-center items-center gap-2 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 px-4 py-2.5 rounded-xl w-full text-red-600 dark:text-red-400 text-sm transition-colors"
              >
                <LogOut class="w-4 h-4" />
                Haushalt verlassen
              </button>

              <button
                v-if="isCreator"
                @click="handleDelete"
                class="flex justify-center items-center gap-2 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 px-4 py-2.5 rounded-xl w-full text-red-600 dark:text-red-400 text-sm transition-colors"
              >
                <Trash2 class="w-4 h-4" />
                Haushalt auflösen
              </button>
            </div>
          </div>

          <button
            @click="showSettingsModal = false"
            class="mt-3 p-2 rounded-lg w-full text-stone-500 hover:text-stone-700 text-sm transition-colors"
          >
            Schließen
          </button>
        </div>
      </div>
    </Teleport>

    <!-- Confirm Dialog -->
    <ConfirmDialog
      :modelValue="!!confirmAction"
      :title="confirmAction?.title"
      :message="confirmAction?.message"
      :confirmText="confirmAction?.confirmText"
      :variant="confirmAction?.variant || 'danger'"
      @confirm="confirmAction?.onConfirm(); confirmAction = null"
      @update:modelValue="confirmAction = null"
      @cancel="confirmAction = null"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useHouseholdStore } from '@/stores/household.js';
import { useAuthStore } from '@/stores/auth.js';
import { useNotification } from '@/composables/useNotification.js';
import { apiRaw } from '@/composables/useApi.js';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import QrCode from '@/components/ui/QrCode.vue';
import { Home, Users, UserPlus, UserMinus, Plus, Settings, LogOut, Trash2, Activity, FolderSync, BarChart3, BookOpen, FolderOpen, CalendarDays, ShoppingCart, Warehouse, Tags, ShieldOff, ChevronDown, Info, CheckCircle2, Layers, AlertTriangle, RefreshCw } from 'lucide-vue-next';

const householdStore = useHouseholdStore();
const authStore = useAuthStore();
const route = useRoute();
const { showSuccess, showError } = useNotification();

const loading = ref(true);
const details = ref(null);
const activities = ref([]);
const joinCode = ref('');
const joining = ref(false);
const newHouseholdName = ref('');
const creating = ref(false);
const migrating = ref(false);
const showMigrateDetails = ref(false);
const migrateResult = ref(null);
const migrateOptions = ref({
  recipes: true,
  categories: true,
  collections: true,
  mealPlans: true,
  shoppingLists: true,
  pantry: true,
  aliases: true,
  blocks: true,
});
const showInviteModal = ref(false);
const showSettingsModal = ref(false);
const inviteCode = ref(null);
const inviteExpiry = ref('');
const generatingInvite = ref(false);
const copied = ref(false);
const editName = ref('');
const confirmAction = ref(null);
const householdStats = ref(null);

// --- Kategorien synchronisieren ---
const categoryGroups = ref(null);
const categoryMembers = ref([]);
const categoryCompareLoading = ref(false);
const merging = ref(false);
const mergeFeedback = ref('');
const showSyncedCategories = ref(false);

const unsyncedGroups = computed(() => categoryGroups.value?.filter(g => !g.is_synced) || []);
const syncedGroups = computed(() => categoryGroups.value?.filter(g => g.is_synced) || []);

const currentUserId = computed(() => authStore.user?.id);
const isCreator = computed(() => details.value?.created_by === currentUserId.value);
const maxCookCount = computed(() => {
  if (!householdStats.value?.member_stats?.length) return 0;
  return Math.max(...householdStats.value.member_stats.map(m => m.cook_count));
});
const inviteQrUrl = computed(() => {
  if (!inviteCode.value) return '';
  return `${window.location.origin}/household?join=${inviteCode.value}`;
});

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

async function loadDetails() {
  if (!householdStore.activeHouseholdId) {
    details.value = null;
    activities.value = [];
    return;
  }
  try {
    details.value = await householdStore.fetchHouseholdDetails(householdStore.activeHouseholdId);
    editName.value = details.value.name;
    const data = await householdStore.fetchActivity(householdStore.activeHouseholdId);
    activities.value = data?.activities || data || [];

    // Haushalt-Statistiken laden
    try {
      const statsData = await apiRaw(`/households/${householdStore.activeHouseholdId}/stats`);
      householdStats.value = statsData.stats || null;
    } catch { householdStats.value = null; }
  } catch {
    // Fehler wird vom Store gehandelt
  }
}

async function handleCreate() {
  if (!newHouseholdName.value.trim()) return;
  creating.value = true;
  try {
    await householdStore.createHousehold(newHouseholdName.value.trim());
    newHouseholdName.value = '';
    showSuccess('Haushalt erstellt!');
    await loadDetails();
  } catch (err) {
    showError(err.message);
  } finally {
    creating.value = false;
  }
}

async function handleJoin() {
  if (!joinCode.value.trim()) return;
  joining.value = true;
  try {
    await householdStore.joinHousehold(joinCode.value.trim());
    joinCode.value = '';
    showSuccess('Haushalt beigetreten!');
    await loadDetails();
  } catch (err) {
    showError(err.message);
  } finally {
    joining.value = false;
  }
}

function switchHousehold(id) {
  householdStore.setActiveHousehold(id);
  loadDetails();
}

async function generateInvite() {
  generatingInvite.value = true;
  try {
    const result = await householdStore.createInvite(householdStore.activeHouseholdId);
    inviteCode.value = result.invite_code;
    inviteExpiry.value = result.expires_at
      ? `${Math.round((new Date(result.expires_at) - new Date()) / 3600000)} Stunden`
      : 'unbegrenzt';
  } catch (err) {
    showError(err.message);
  } finally {
    generatingInvite.value = false;
  }
}

async function copyInviteCode() {
  if (!inviteCode.value) return;
  try {
    await navigator.clipboard.writeText(inviteCode.value);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  } catch {
    showError('Kopieren fehlgeschlagen');
  }
}

async function handleRename() {
  if (!editName.value.trim() || editName.value === details.value?.name) return;
  try {
    await householdStore.renameHousehold(householdStore.activeHouseholdId, editName.value.trim());
    showSuccess('Haushalt umbenannt');
    showSettingsModal.value = false;
    await householdStore.fetchHouseholds();
    await loadDetails();
  } catch (err) {
    showError(err.message);
  }
}

async function handleMigrate() {
  const selected = Object.entries(migrateOptions.value).filter(([, v]) => v).map(([k]) => k);
  if (!selected.length) return;

  const labels = {
    recipes: 'Rezepte', categories: 'Kategorien', collections: 'Sammlungen',
    mealPlans: 'Wochenpläne', shoppingLists: 'Einkaufslisten', pantry: 'Vorratskammer',
    aliases: 'Zutaten-Aliase', blocks: 'Rezept-Sperren',
  };
  const selectedLabels = selected.map(k => labels[k]).join(', ');

  confirmAction.value = {
    title: 'Daten migrieren',
    message: `Folgende Bereiche werden für den Haushalt freigegeben: ${selectedLabels}. Alle Mitglieder im Haushalt können diese Daten dann sehen und bearbeiten.`,
    confirmText: 'Migrieren',
    variant: 'warning',
    onConfirm: async () => {
      migrating.value = true;
      migrateResult.value = null;
      try {
        const opts = {
          include_recipes: migrateOptions.value.recipes,
          include_categories: migrateOptions.value.categories,
          include_collections: migrateOptions.value.collections,
          include_meal_plans: migrateOptions.value.mealPlans,
          include_shopping_lists: migrateOptions.value.shoppingLists,
          include_pantry: migrateOptions.value.pantry,
          include_aliases: migrateOptions.value.aliases,
          include_blocks: migrateOptions.value.blocks,
        };
        const result = await householdStore.migrateData(householdStore.activeHouseholdId, opts);
        migrateResult.value = result.migrated || {};
        showSuccess(result.message || 'Daten erfolgreich migriert!');
      } catch (err) {
        showError(err.message);
      } finally {
        migrating.value = false;
      }
    },
  };
}

function confirmRemoveMember(member) {
  confirmAction.value = {
    title: 'Mitglied entfernen',
    message: `Möchtest du "${member.display_name || member.username}" wirklich aus dem Haushalt entfernen?`,
    confirmText: 'Entfernen',
    variant: 'danger',
    onConfirm: async () => {
      try {
        await householdStore.removeMember(householdStore.activeHouseholdId, member.id);
        showSuccess('Mitglied entfernt');
        await loadDetails();
      } catch (err) {
        showError(err.message);
      }
    },
  };
}

async function handleLeave() {
  confirmAction.value = {
    title: 'Haushalt verlassen',
    message: 'Möchtest du diesen Haushalt wirklich verlassen? Deine geteilten Daten bleiben im Haushalt erhalten.',
    confirmText: 'Verlassen',
    variant: 'danger',
    onConfirm: async () => {
      try {
        await householdStore.leaveHousehold(householdStore.activeHouseholdId);
        showSuccess('Haushalt verlassen');
        showSettingsModal.value = false;
        details.value = null;
      } catch (err) {
        showError(err.message);
      }
    },
  };
}

async function handleDelete() {
  confirmAction.value = {
    title: 'Haushalt auflösen',
    message: 'Möchtest du diesen Haushalt wirklich auflösen? Alle geteilten Daten werden den einzelnen Benutzern zurückgegeben.',
    confirmText: 'Auflösen',
    variant: 'danger',
    onConfirm: async () => {
      try {
        await householdStore.deleteHousehold(householdStore.activeHouseholdId);
        showSuccess('Haushalt aufgelöst');
        showSettingsModal.value = false;
        details.value = null;
      } catch (err) {
        showError(err.message);
      }
    },
  };
}

// --- Kategorien synchronisieren ---

async function loadCategoryCompare() {
  if (!householdStore.activeHouseholdId) return;
  categoryCompareLoading.value = true;
  mergeFeedback.value = '';
  try {
    const data = await apiRaw(`/households/${householdStore.activeHouseholdId}/categories/compare`);
    categoryGroups.value = data.groups || [];
    categoryMembers.value = data.members || [];
  } catch (err) {
    showError(err.message || 'Fehler beim Laden der Kategorien');
  } finally {
    categoryCompareLoading.value = false;
  }
}

function getMemberName(userId) {
  const m = categoryMembers.value.find(m => m.id === userId);
  return m?.display_name || m?.username || `User ${userId}`;
}

function getMergeOptions(group) {
  // Einzigartige Name+Icon+Color Kombinationen als Merge-Ziele
  const seen = new Map();
  for (const cat of group.categories) {
    if (!seen.has(cat.name)) {
      seen.set(cat.name, { name: cat.name, icon: cat.icon, color: cat.color });
    }
  }
  return [...seen.values()];
}

async function handleMergeGroup(group, option) {
  const idsToMerge = group.categories
    .filter(c => c.name !== option.name || c.icon !== option.icon || c.color !== option.color)
    .map(c => c.id);

  // Wenn keine abweichenden Kategorien, alle IDs senden (für DB-Duplikat-Merge)
  const ids = idsToMerge.length > 0
    ? idsToMerge
    : group.categories.slice(1).map(c => c.id); // alle außer der ersten

  if (ids.length === 0) return;

  merging.value = true;
  mergeFeedback.value = '';
  try {
    const body = {
      categoryIds: ids,
      targetName: option.name,
    };
    if (option.icon) body.targetIcon = option.icon;
    if (option.color) body.targetColor = option.color;

    const result = await apiRaw(`/households/${householdStore.activeHouseholdId}/categories/merge`, {
      method: 'POST',
      body,
    });
    mergeFeedback.value = result.message || 'Kategorien synchronisiert!';
    // Neu laden
    await loadCategoryCompare();
  } catch (err) {
    showError(err.message || 'Fehler beim Zusammenfassen');
  } finally {
    merging.value = false;
  }
}

// Beim Laden der View alle Infos holen
onMounted(async () => {
  await householdStore.fetchHouseholds();
  await loadDetails();
  loading.value = false;

  // Auto-Join via QR-Code Link (?join=CODE)
  const joinParam = route.query.join;
  if (joinParam && typeof joinParam === 'string' && joinParam.length === 8) {
    joinCode.value = joinParam;
    await handleJoin();
  }
});

// Bei Haushaltswechsel Details aktualisieren
watch(() => householdStore.activeHouseholdId, () => {
  if (householdStore.activeHouseholdId) {
    loadDetails();
  }
});
</script>
