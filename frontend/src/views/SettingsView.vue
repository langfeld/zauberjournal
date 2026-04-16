<!--
  ============================================
  SettingsView - Benutzereinstellungen
  ============================================
  Kategorie-Verwaltung (CRUD mit is_meal_time Toggle).
  Erweiterbar für Passwort-Änderung, Profil etc.
-->
<template>
  <div class="mx-auto max-w-3xl">
    <!-- Header -->
    <div class="mb-6 sm:mb-8">
      <h1 class="font-display font-bold text-stone-800 dark:text-stone-100 text-2xl sm:text-3xl">
        Einstellungen
      </h1>
      <p class="mt-1 text-stone-500 dark:text-stone-400 text-sm">
        Verwalte deine Kategorien und Einstellungen
      </p>
    </div>

    <!-- ============================================ -->
    <!-- Kategorien-Verwaltung -->
    <!-- ============================================ -->
    <div class="bg-white dark:bg-stone-800 p-5 sm:p-6 border border-stone-200 dark:border-stone-700 rounded-2xl">
      <div class="flex items-center justify-between mb-5">
        <h2 class="flex items-center gap-2 font-display font-bold text-stone-800 dark:text-stone-100 text-lg">
          <Tag class="w-5 h-5 text-primary-600" />
          Kategorien
        </h2>
        <button
          @click="startCreate"
          class="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 px-3 py-1.5 rounded-lg font-medium text-white text-sm transition-colors"
        >
          <Plus class="w-4 h-4" />
          Neue Kategorie
        </button>
      </div>

      <p class="mb-4 text-stone-500 dark:text-stone-400 text-sm">
        Kategorien helfen dir, Rezepte zu ordnen. Aktiviere "Tageszeit", damit die Kategorie in der
        Tageszeit-Gruppierung der Rezeptansicht erscheint.
      </p>

      <!-- Loading -->
      <div v-if="loading" class="flex justify-center py-10">
        <Loader2 class="w-6 h-6 text-primary-600 animate-spin" />
      </div>

      <!-- Kategorie-Liste -->
      <div v-else class="space-y-2">
        <!-- Inline-Formular: Neue Kategorie -->
        <div
          v-if="showCreateForm"
          class="flex flex-wrap items-center gap-2 bg-primary-50 dark:bg-primary-950/30 p-3 border border-primary-200 dark:border-primary-800 rounded-xl"
        >
          <input
            ref="createNameInput"
            v-model="newCat.name"
            type="text"
            placeholder="Name"
            maxlength="50"
            class="flex-1 min-w-[120px] bg-white dark:bg-stone-900 px-3 py-2 border border-stone-200 dark:border-stone-700 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            @keyup.enter="saveNewCategory"
            @keyup.escape="showCreateForm = false"
          />
          <input
            v-model="newCat.icon"
            type="text"
            placeholder="Icon"
            maxlength="4"
            class="w-16 bg-white dark:bg-stone-900 px-3 py-2 border border-stone-200 dark:border-stone-700 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 text-sm text-center"
          />
          <input
            v-model="newCat.color"
            type="color"
            class="w-10 h-9 bg-transparent border border-stone-200 dark:border-stone-700 rounded-lg cursor-pointer"
          />
          <label class="flex items-center gap-1.5 text-sm text-stone-600 dark:text-stone-400 cursor-pointer select-none">
            <input
              type="checkbox"
              v-model="newCat.is_meal_time"
              class="rounded border-stone-300 dark:border-stone-600 text-primary-600 focus:ring-primary-500"
            />
            <Clock class="w-3.5 h-3.5" />
            Tageszeit
          </label>
          <div class="flex gap-1.5">
            <button
              @click="saveNewCategory"
              :disabled="!newCat.name.trim() || saving"
              class="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-3 py-2 rounded-lg text-white text-sm transition-colors"
            >
              <Loader2 v-if="saving" class="w-4 h-4 animate-spin" />
              <Check v-else class="w-4 h-4" />
            </button>
            <button
              @click="showCreateForm = false"
              class="bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 px-3 py-2 rounded-lg text-stone-600 dark:text-stone-300 text-sm transition-colors"
            >
              <X class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Bestehende Kategorien -->
        <div
          v-for="(cat, index) in sortedCategories"
          :key="cat.id"
          :draggable="editingId !== cat.id"
          class="group flex flex-wrap items-center gap-2 p-3 border rounded-xl transition-all duration-150"
          :class="[
            editingId === cat.id
              ? 'bg-primary-50 dark:bg-primary-950/30 border-primary-200 dark:border-primary-800'
              : dragOverId === cat.id && dragId !== cat.id
                ? 'border-primary-400 dark:border-primary-500 bg-primary-50/50 dark:bg-primary-950/20'
                : dragId === cat.id
                  ? 'opacity-40 border-stone-200 dark:border-stone-600'
                  : 'border-stone-100 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-750',
          ]"
          @dragstart="onDragStart($event, cat, index)"
          @dragend="onDragEnd"
          @dragover.prevent="onDragOver($event, cat, index)"
          @dragenter.prevent="onDragEnter(cat)"
          @dragleave="onDragLeave(cat)"
          @drop.prevent="onDrop(index)"
        >
          <!-- Edit-Mode -->
          <template v-if="editingId === cat.id">
            <input
              ref="editNameInput"
              v-model="editData.name"
              type="text"
              maxlength="50"
              class="flex-1 min-w-[120px] bg-white dark:bg-stone-900 px-3 py-2 border border-stone-200 dark:border-stone-700 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              @keyup.enter="saveEdit"
              @keyup.escape="cancelEdit"
            />
            <input
              v-model="editData.icon"
              type="text"
              maxlength="4"
              class="w-16 bg-white dark:bg-stone-900 px-3 py-2 border border-stone-200 dark:border-stone-700 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 text-sm text-center"
            />
            <input
              v-model="editData.color"
              type="color"
              class="w-10 h-9 bg-transparent border border-stone-200 dark:border-stone-700 rounded-lg cursor-pointer"
            />
            <label class="flex items-center gap-1.5 text-sm text-stone-600 dark:text-stone-400 cursor-pointer select-none">
              <input
                type="checkbox"
                v-model="editData.is_meal_time"
                class="rounded border-stone-300 dark:border-stone-600 text-primary-600 focus:ring-primary-500"
              />
              <Clock class="w-3.5 h-3.5" />
              Tageszeit
            </label>
            <div class="flex gap-1.5">
              <button
                @click="saveEdit"
                :disabled="!editData.name.trim() || saving"
                class="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-3 py-2 rounded-lg text-white text-sm transition-colors"
              >
                <Loader2 v-if="saving" class="w-4 h-4 animate-spin" />
                <Check v-else class="w-4 h-4" />
              </button>
              <button
                @click="cancelEdit"
                class="bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 px-3 py-2 rounded-lg text-stone-600 dark:text-stone-300 text-sm transition-colors"
              >
                <X class="w-4 h-4" />
              </button>
            </div>
          </template>

          <!-- Display-Mode -->
          <template v-else>
            <!-- Drag Handle -->
            <div
              class="flex items-center cursor-grab active:cursor-grabbing p-1 -ml-1 text-stone-300 dark:text-stone-600 hover:text-stone-500 dark:hover:text-stone-400 transition-colors touch-none"
              title="Ziehen zum Sortieren"
            >
              <GripVertical class="w-4 h-4" />
            </div>

            <!-- Icon + Color Badge -->
            <span
              class="flex items-center justify-center w-8 h-8 rounded-lg text-base"
              :style="{ backgroundColor: cat.color + '20', color: cat.color }"
            >
              {{ cat.icon || '🍽️' }}
            </span>

            <!-- Name -->
            <span class="flex-1 font-medium text-stone-800 dark:text-stone-100 text-sm">
              {{ cat.name }}
            </span>

            <!-- Tageszeit-Badge -->
            <span
              v-if="cat.is_meal_time"
              class="flex items-center gap-1 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full text-amber-700 dark:text-amber-300 text-xs"
            >
              <Clock class="w-3 h-3" />
              Tageszeit
            </span>

            <!-- Rezept-Count -->
            <span class="text-stone-400 dark:text-stone-500 text-xs tabular-nums">
              {{ cat.recipe_count || 0 }} Rezepte
            </span>

            <!-- Action-Buttons -->
            <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                @click="startEdit(cat)"
                class="p-1.5 text-stone-400 hover:text-primary-600 dark:hover:text-primary-400 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
                title="Bearbeiten"
              >
                <Pencil class="w-4 h-4" />
              </button>
              <button
                @click="confirmDelete(cat)"
                class="p-1.5 text-stone-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
                title="Löschen"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </template>
        </div>

        <!-- Leer-Zustand -->
        <div v-if="sortedCategories.length === 0 && !showCreateForm" class="py-8 text-center">
          <Tag class="mx-auto mb-2 w-8 h-8 text-stone-300 dark:text-stone-600" />
          <p class="text-stone-500 dark:text-stone-400 text-sm">Noch keine Kategorien vorhanden</p>
          <button
            @click="startCreate"
            class="mt-2 text-primary-600 hover:text-primary-700 dark:text-primary-400 text-sm font-medium"
          >
            Erste Kategorie erstellen
          </button>
        </div>
      </div>
    </div>

    <!-- ============================================ -->
    <!-- Löschen-Bestätigung (Modal) -->
    <!-- ============================================ -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="deletingCat"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          @click.self="deletingCat = null"
        >
          <div class="bg-white dark:bg-stone-800 p-6 rounded-2xl shadow-xl max-w-sm w-full">
            <h3 class="font-display font-bold text-stone-800 dark:text-stone-100 text-lg mb-2">
              Kategorie löschen?
            </h3>
            <p class="text-stone-600 dark:text-stone-400 text-sm mb-1">
              Soll die Kategorie <strong>"{{ deletingCat.name }}"</strong> wirklich gelöscht werden?
            </p>
            <p class="text-stone-500 dark:text-stone-500 text-xs mb-5">
              Die Zuordnung zu {{ deletingCat.recipe_count || 0 }} Rezept(en) wird aufgehoben. Rezepte werden nicht gelöscht.
            </p>
            <div class="flex gap-3 justify-end">
              <button
                @click="deletingCat = null"
                class="px-4 py-2 bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 rounded-lg text-stone-700 dark:text-stone-300 text-sm transition-colors"
              >
                Abbrechen
              </button>
              <button
                @click="executeDelete"
                :disabled="saving"
                class="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg text-white text-sm font-medium transition-colors"
              >
                {{ saving ? 'Lösche...' : 'Löschen' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue';
import { Tag, Plus, Check, X, Clock, Pencil, Trash2, Loader2, GripVertical } from 'lucide-vue-next';
import { useRecipesStore } from '@/stores/recipes.js';
import { useNotification } from '@/composables/useNotification.js';

const recipesStore = useRecipesStore();
const { showSuccess, showError } = useNotification();

// --- State ---
const loading = ref(false);
const saving = ref(false);
const showCreateForm = ref(false);
const editingId = ref(null);
const deletingCat = ref(null);

const newCat = ref({ name: '', icon: '🍽️', color: '#6366f1', is_meal_time: false });
const editData = ref({ name: '', icon: '', color: '', is_meal_time: false });

const createNameInput = ref(null);
const editNameInput = ref(null);

// --- Computed ---
const sortedCategories = computed(() =>
  [...recipesStore.categories].sort((a, b) => a.sort_order - b.sort_order)
);

// --- Lifecycle ---
onMounted(async () => {
  loading.value = true;
  await recipesStore.fetchCategories();
  loading.value = false;
});

// --- Neue Kategorie ---
function startCreate() {
  showCreateForm.value = true;
  newCat.value = { name: '', icon: '🍽️', color: '#6366f1', is_meal_time: false };
  nextTick(() => createNameInput.value?.focus());
}

async function saveNewCategory() {
  if (!newCat.value.name.trim() || saving.value) return;
  saving.value = true;
  try {
    await recipesStore.createCategory({
      name: newCat.value.name.trim(),
      icon: newCat.value.icon || '🍽️',
      color: newCat.value.color,
      is_meal_time: newCat.value.is_meal_time,
    });
    showSuccess(`Kategorie "${newCat.value.name}" erstellt`);
    showCreateForm.value = false;
  } catch (err) {
    showError(err?.response?.error || err?.message || 'Fehler beim Erstellen');
  } finally {
    saving.value = false;
  }
}

// --- Bearbeiten ---
function startEdit(cat) {
  editingId.value = cat.id;
  editData.value = {
    name: cat.name,
    icon: cat.icon || '🍽️',
    color: cat.color || '#6366f1',
    is_meal_time: !!cat.is_meal_time,
  };
  nextTick(() => {
    const el = Array.isArray(editNameInput.value) ? editNameInput.value[0] : editNameInput.value;
    el?.focus();
  });
}

function cancelEdit() {
  editingId.value = null;
}

async function saveEdit() {
  if (!editData.value.name.trim() || saving.value) return;
  saving.value = true;
  try {
    await recipesStore.updateCategory(editingId.value, {
      name: editData.value.name.trim(),
      icon: editData.value.icon,
      color: editData.value.color,
      is_meal_time: editData.value.is_meal_time,
    });
    showSuccess('Kategorie aktualisiert');
    editingId.value = null;
  } catch (err) {
    showError(err?.response?.error || err?.message || 'Fehler beim Aktualisieren');
  } finally {
    saving.value = false;
  }
}

// --- Löschen ---
function confirmDelete(cat) {
  deletingCat.value = cat;
}

async function executeDelete() {
  if (!deletingCat.value || saving.value) return;
  saving.value = true;
  try {
    await recipesStore.deleteCategory(deletingCat.value.id);
    showSuccess(`Kategorie "${deletingCat.value.name}" gelöscht`);
    deletingCat.value = null;
  } catch (err) {
    showError(err?.response?.error || err?.message || 'Fehler beim Löschen');
  } finally {
    saving.value = false;
  }
}

// --- Drag & Drop Reihenfolge ---
const dragId = ref(null);
const dragIndex = ref(null);
const dragOverId = ref(null);

function onDragStart(event, cat, index) {
  if (editingId.value === cat.id) {
    event.preventDefault();
    return;
  }
  dragId.value = cat.id;
  dragIndex.value = index;
  event.dataTransfer.effectAllowed = 'move';
  // Minimales drag image – das native ghost reicht
  event.dataTransfer.setData('text/plain', String(cat.id));
}

function onDragEnd() {
  dragId.value = null;
  dragIndex.value = null;
  dragOverId.value = null;
}

function onDragOver(event, cat, index) {
  if (dragId.value === null || dragId.value === cat.id) return;
  event.dataTransfer.dropEffect = 'move';
}

function onDragEnter(cat) {
  if (dragId.value !== null && dragId.value !== cat.id) {
    dragOverId.value = cat.id;
  }
}

function onDragLeave(cat) {
  if (dragOverId.value === cat.id) {
    dragOverId.value = null;
  }
}

async function onDrop(targetIndex) {
  const sourceIndex = dragIndex.value;
  dragOverId.value = null;

  if (sourceIndex === null || sourceIndex === targetIndex) {
    onDragEnd();
    return;
  }

  // Neue Reihenfolge berechnen: Element verschieben
  const items = sortedCategories.value.map(c => c.id);
  const [movedId] = items.splice(sourceIndex, 1);
  items.splice(targetIndex, 0, movedId);

  // sort_order = Index in der neuen Reihenfolge
  const order = items.map((id, i) => ({ id, sort_order: i }));

  onDragEnd();

  try {
    await recipesStore.reorderCategories(order);
  } catch {
    showError('Fehler beim Sortieren');
  }
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
