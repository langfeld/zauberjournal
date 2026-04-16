<!--
  ============================================
  RecipeFormView - Rezept erstellen/bearbeiten
  ============================================
  Formular für neue Rezepte oder zum Bearbeiten
  bestehender Rezepte mit:
  - Grunddaten (Titel, Beschreibung, Bild)
  - Zutaten mit Gruppen
  - Kochschritte
  - Kategorie-Auswahl
-->
<template>
  <div class="space-y-6 mx-auto max-w-7xl animate-fade-in">
    <h1 class="font-display font-bold text-stone-800 dark:text-stone-100 text-2xl">
      {{ isEdit ? 'Rezept bearbeiten' : 'Neues Rezept' }}
    </h1>

    <form id="recipe-form" @submit.prevent="saveRecipe" class="space-y-6">
      <!-- Grunddaten -->
      <section class="space-y-4 card">
        <h2 class="font-semibold text-stone-800 dark:text-stone-100 text-lg">📝 Grunddaten</h2>

        <div>
          <label class="form-label">Titel *</label>
          <input v-model="form.title" type="text" class="form-input" placeholder="z.B. Spaghetti Carbonara" required />
        </div>

        <div>
          <label class="form-label">Beschreibung</label>
          <textarea v-model="form.description" class="form-input" rows="3" placeholder="Kurze Beschreibung des Rezepts..." />
        </div>

        <div class="gap-4 grid grid-cols-1 sm:grid-cols-3">
          <div>
            <label class="form-label">Zubereitungszeit (Min.)</label>
            <input v-model.number="form.prep_time" type="number" min="0" class="form-input" />
          </div>
          <div>
            <label class="form-label">Kochzeit (Min.)</label>
            <input v-model.number="form.cook_time" type="number" min="0" class="form-input" />
          </div>
          <div>
            <label class="form-label">Portionen</label>
            <input v-model.number="form.servings" type="number" min="1" class="form-input" />
          </div>
        </div>

        <div>
          <label class="form-label">Schwierigkeitsgrad</label>
          <select v-model="form.difficulty" class="form-input">
            <option value="leicht">🟢 Leicht</option>
            <option value="mittel">🟡 Mittel</option>
            <option value="schwer">🔴 Schwer</option>
          </select>
        </div>

        <!-- Bild-Upload -->
        <div>
          <label class="form-label">Bild</label>
          <div
            class="relative p-6 border-2 border-stone-300 hover:border-primary-400 dark:border-stone-600 dark:hover:border-primary-500 border-dashed rounded-xl text-center transition-colors cursor-pointer"
            @click="$refs.imageInput.click()"
          >
            <img v-if="imagePreview" :src="imagePreview" class="mb-3 rounded-lg w-full h-48 object-cover" />
            <div v-else class="text-stone-400">
              <ImageIcon class="mx-auto mb-2 w-8 h-8" />
              <p class="text-sm">Bild hochladen</p>
            </div>
            <input ref="imageInput" type="file" accept="image/*" @change="onImageChange" class="hidden" />
          </div>
          <!-- Zuschneiden-Button (nur wenn Bild vorhanden) -->
          <button
            v-if="imagePreview"
            type="button"
            @click="openCropper"
            class="flex items-center gap-2 mt-2 text-primary-600 hover:text-primary-700 dark:hover:text-primary-300 dark:text-primary-400 text-sm transition-colors"
          >
            <CropIcon class="w-4 h-4" />
            Bild zuschneiden
          </button>
        </div>
      </section>

      <!-- Kategorien -->
      <section class="space-y-4 card">
        <h2 class="font-semibold text-stone-800 dark:text-stone-100 text-lg">🏷️ Kategorien</h2>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="cat in recipesStore.visibleCategories"
            :key="cat.id"
            type="button"
            @click="toggleCategory(cat.id)"
            :class="[
              'px-3 py-1.5 rounded-full text-sm border transition-all',
              form.category_ids.includes(cat.id)
                ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                : 'border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:border-stone-400'
            ]"
          >
            {{ cat.icon }} {{ cat.name }}
          </button>
        </div>
      </section>

      <!-- Nährwerte pro Portion -->
      <section class="space-y-4 card">
        <div class="flex justify-between items-center">
          <h2 class="font-semibold text-stone-800 dark:text-stone-100 text-lg">📊 Nährwerte <span class="font-normal text-stone-400 text-sm">(pro Portion, optional)</span></h2>
          <button type="button" @click="estimateNutritionViaAI" :disabled="estimatingNutrition || flatIngredients.length === 0"
            class="inline-flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 disabled:opacity-40 px-3 py-1.5 border border-indigo-200/60 dark:border-indigo-700/40 rounded-lg font-medium text-indigo-600 dark:text-indigo-400 text-xs transition-colors disabled:cursor-not-allowed">
            <span v-if="estimatingNutrition" class="inline-block border-2 border-indigo-400 border-t-transparent rounded-full w-3.5 h-3.5 animate-spin"></span>
            <span v-else>🤖</span>
            {{ estimatingNutrition ? 'Schätze…' : 'KI-Schätzung' }}
          </button>
        </div>
        <div class="gap-4 grid grid-cols-2 sm:grid-cols-4">
          <div>
            <label class="form-label">Kalorien</label>
            <div class="relative">
              <input v-model.number="form.calories" type="number" step="0.1" min="0" class="pr-14 form-input" placeholder="—" />
              <span class="right-3 absolute inset-y-0 flex items-center text-stone-400 text-sm pointer-events-none">kcal</span>
            </div>
          </div>
          <div>
            <label class="form-label">Eiweiß</label>
            <div class="relative">
              <input v-model.number="form.protein" type="number" step="0.1" min="0" class="pr-8 form-input" placeholder="—" />
              <span class="right-3 absolute inset-y-0 flex items-center text-stone-400 text-sm pointer-events-none">g</span>
            </div>
          </div>
          <div>
            <label class="form-label">Kohlenhydrate</label>
            <div class="relative">
              <input v-model.number="form.carbs" type="number" step="0.1" min="0" class="pr-8 form-input" placeholder="—" />
              <span class="right-3 absolute inset-y-0 flex items-center text-stone-400 text-sm pointer-events-none">g</span>
            </div>
          </div>
          <div>
            <label class="form-label">Fett</label>
            <div class="relative">
              <input v-model.number="form.fat" type="number" step="0.1" min="0" class="pr-8 form-input" placeholder="—" />
              <span class="right-3 absolute inset-y-0 flex items-center text-stone-400 text-sm pointer-events-none">g</span>
            </div>
          </div>
        </div>
        <!-- Nährwert-Aufschlüsselung (Tabelle) -->
        <div v-if="parsedFormNutritionDetails.length" class="mt-2 overflow-x-auto">
          <label class="form-label">Aufschlüsselung pro Zutat (pro Portion)</label>
          <table class="mt-1 w-full text-xs">
            <thead>
              <tr class="border-stone-200 dark:border-stone-700 border-b text-stone-500 dark:text-stone-400">
                <th class="py-1.5 pr-2 font-medium hover:text-stone-700 dark:hover:text-stone-200 text-left cursor-pointer select-none" @click="toggleFormNutritionSort('name')">Zutat{{ formNutritionSortIcon('name') }}</th>
                <th class="px-2 py-1.5 font-medium hover:text-stone-700 dark:hover:text-stone-200 text-right cursor-pointer select-none" @click="toggleFormNutritionSort('amount')">Menge{{ formNutritionSortIcon('amount') }}</th>
                <th class="px-2 py-1.5 font-medium hover:text-stone-700 dark:hover:text-stone-200 text-right cursor-pointer select-none" @click="toggleFormNutritionSort('calories')">kcal{{ formNutritionSortIcon('calories') }}</th>
                <th class="px-2 py-1.5 font-medium hover:text-stone-700 dark:hover:text-stone-200 text-right cursor-pointer select-none" @click="toggleFormNutritionSort('protein')">E{{ formNutritionSortIcon('protein') }}</th>
                <th class="px-2 py-1.5 font-medium hover:text-stone-700 dark:hover:text-stone-200 text-right cursor-pointer select-none" @click="toggleFormNutritionSort('carbs')">KH{{ formNutritionSortIcon('carbs') }}</th>
                <th class="py-1.5 pl-2 font-medium hover:text-stone-700 dark:hover:text-stone-200 text-right cursor-pointer select-none" @click="toggleFormNutritionSort('fat')">F{{ formNutritionSortIcon('fat') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(d, i) in parsedFormNutritionDetails" :key="i" class="border-stone-100 dark:border-stone-800 border-b">
                <td class="py-1 pr-2 text-stone-700 dark:text-stone-300">{{ d.name }}</td>
                <td class="px-2 py-1 text-stone-500 dark:text-stone-400 text-right">{{ d.amount }}</td>
                <td class="px-2 py-1 text-orange-600 dark:text-orange-400 text-right">{{ d.calories }}</td>
                <td class="px-2 py-1 text-blue-600 dark:text-blue-400 text-right">{{ d.protein }}g</td>
                <td class="px-2 py-1 text-amber-600 dark:text-amber-400 text-right">{{ d.carbs }}g</td>
                <td class="py-1 pl-2 text-yellow-600 dark:text-yellow-400 text-right">{{ d.fat }}g</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="font-semibold text-stone-800 dark:text-stone-100">
                <td class="pt-1.5" colspan="2">Summe</td>
                <td class="px-2 pt-1.5 text-orange-700 dark:text-orange-300 text-right">{{ formNutritionDetailsSum.calories }}</td>
                <td class="px-2 pt-1.5 text-blue-700 dark:text-blue-300 text-right">{{ formNutritionDetailsSum.protein }}g</td>
                <td class="px-2 pt-1.5 text-amber-700 dark:text-amber-300 text-right">{{ formNutritionDetailsSum.carbs }}g</td>
                <td class="pt-1.5 pl-2 text-yellow-700 dark:text-yellow-300 text-right">{{ formNutritionDetailsSum.fat }}g</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <!-- Nährwert-Hinweis -->
        <div v-if="form.nutrition_note" class="mt-2">
          <label class="form-label">KI-Hinweis</label>
          <textarea v-model="form.nutrition_note" rows="2" class="text-sm form-input" placeholder="Hinweis zu den Nährwerten…"></textarea>
        </div>
      </section>
      <section class="space-y-4 card">
        <div class="flex justify-between items-center">
          <h2 class="font-semibold text-stone-800 dark:text-stone-100 text-lg">🥕 Zutaten</h2>
          <button type="button" @click="addIngredientGroup" class="text-primary-600 hover:text-primary-700 text-sm">
            + Gruppe hinzufügen
          </button>
        </div>

        <div v-for="(group, gIdx) in form.ingredient_groups" :key="gIdx" class="space-y-3">
          <!-- Gruppenname -->
          <div v-if="gIdx > 0 || group.name" class="flex items-center gap-2">
            <input
              v-model="group.name"
              type="text"
              class="flex-1 text-sm form-input"
              placeholder="Gruppenname (z.B. 'Für die Soße')"
            />
            <button type="button" @click="form.ingredient_groups.splice(gIdx, 1)" class="text-red-400 hover:text-red-500">
              <Trash2 class="w-4 h-4" />
            </button>
          </div>

          <!-- Zutaten in der Gruppe -->
          <div v-for="(ing, iIdx) in group.items" :key="iIdx"
               class="items-start gap-2 grid grid-cols-[1fr_1fr] sm:grid-cols-[5rem_6rem_1fr_8rem_auto_auto]"
          >
            <input v-model.number="ing.amount" type="number" step="0.01" min="0" class="form-input" placeholder="Menge" />
            <UnitInput v-model="ing.unit" placeholder="Einheit" />
            <input v-model="ing.name" type="text" class="col-span-2 sm:col-span-1 form-input" placeholder="Zutat (z.B. Kartoffeln)" required />
            <input v-model="ing.notes" type="text" class="col-span-2 sm:col-span-1 text-stone-400 form-input" placeholder="Hinweis" />
            <label class="flex items-center gap-1 py-2 text-stone-400 text-xs cursor-pointer">
              <input type="checkbox" v-model="ing.is_optional" class="rounded" />
              opt.
            </label>
            <button type="button" @click="group.items.splice(iIdx, 1)" class="py-2 text-red-400 hover:text-red-500">
              <Trash2 class="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            @click="group.items.push({ amount: null, unit: '', name: '', notes: '', is_optional: false })"
            class="flex items-center gap-1 text-primary-600 hover:text-primary-700 text-sm"
          >
            <Plus class="w-3 h-3" /> Zutat hinzufügen
          </button>
        </div>
      </section>

      <!-- Kochschritte -->
      <section class="space-y-4 card">
        <h2 class="font-semibold text-stone-800 dark:text-stone-100 text-lg">👨‍🍳 Zubereitung</h2>

        <div v-for="(step, sIdx) in form.steps" :key="sIdx" class="flex items-start gap-3">
          <!-- Nummer -->
          <div class="flex justify-center items-center bg-primary-100 dark:bg-primary-900/50 mt-2 rounded-full w-8 h-8 shrink-0">
            <span class="font-bold text-primary-700 dark:text-primary-300 text-sm">{{ sIdx + 1 }}</span>
          </div>

          <div class="flex-1 space-y-2">
            <input v-model="step.title" type="text" class="text-sm form-input" placeholder="Schritt-Titel (optional)" />
            <textarea v-model="step.instruction" class="text-sm form-input" rows="3" placeholder="Anweisungen..." required />
            <input v-model.number="step.duration_minutes" type="number" min="0" class="w-32 text-sm form-input" placeholder="Dauer (Min.)" />
          </div>

          <button type="button" @click="form.steps.splice(sIdx, 1)" class="mt-2 text-red-400 hover:text-red-500">
            <Trash2 class="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          @click="form.steps.push({ title: '', instruction: '', duration_minutes: null })"
          class="flex items-center gap-1 text-primary-600 hover:text-primary-700 text-sm"
        >
          <Plus class="w-3 h-3" /> Schritt hinzufügen
        </button>
      </section>

      <!-- Spacer für floating Buttons -->
      <div class="h-20"></div>
    </form>

    <!-- Floating Speichern/Abbrechen -->
    <Teleport to="body">
      <div class="right-0 bottom-0 left-0 z-40 fixed flex justify-center items-center gap-2 sm:gap-3 bg-white/95 dark:bg-stone-950/95 shadow-[0_-4px_24px_rgba(0,0,0,0.12)] backdrop-blur-sm px-3 sm:px-6 py-3 sm:py-4 border-stone-200 dark:border-stone-800 border-t">
        <button
          type="submit"
          form="recipe-form"
          :disabled="saving"
          class="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-3 sm:px-4 py-1.5 rounded-lg font-medium text-white text-sm transition-colors"
        >
          <Save class="w-4 h-4" />
          {{ saving ? 'Wird gespeichert…' : 'Rezept speichern' }}
        </button>
        <router-link
          to="/recipes"
          class="flex items-center gap-1.5 hover:bg-stone-50 dark:hover:bg-stone-800 px-3 sm:px-4 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg text-stone-600 dark:text-stone-300 text-sm transition-colors"
        >
          Abbrechen
        </router-link>
      </div>
    </Teleport>

    <!-- Bild-Zuschnitt Modal -->
    <ImageCropModal
      v-if="showCropper"
      :image-src="cropperImageSrc"
      :file-name="cropperFileName"
      @cropped="onCropped"
      @cancel="showCropper = false"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useRecipesStore } from '@/stores/recipes.js';
import { useNotification } from '@/composables/useNotification.js';
import { useApi } from '@/composables/useApi.js';
import { Plus, Trash2, Save, Image as ImageIcon, Crop as CropIcon, Sparkles } from 'lucide-vue-next';
import ImageCropModal from '@/components/ui/ImageCropModal.vue';
import UnitInput from '@/components/ui/UnitInput.vue';

const route = useRoute();
const router = useRouter();
const recipesStore = useRecipesStore();
const { showSuccess } = useNotification();
const api = useApi();

const saving = ref(false);
const estimatingNutrition = ref(false);
const imageFile = ref(null);
const imagePreview = ref(null);

// Cropper State
const showCropper = ref(false);
const cropperImageSrc = ref('');
const cropperFileName = ref('recipe.jpg');
// Das originale unkomprimierte Bild für erneutes Zuschneiden
const originalImageSrc = ref(null);

const editId = computed(() => route.query.edit);
const isEdit = computed(() => !!editId.value);

const form = reactive({
  title: '',
  description: '',
  prep_time: 15,
  cook_time: 30,
  servings: 4,
  difficulty: 'mittel',
  calories: null,
  protein: null,
  carbs: null,
  fat: null,
  nutrition_note: null,
  nutrition_details: null,
  category_ids: [],
  ingredient_groups: [
    { name: '', items: [{ amount: null, unit: '', name: '', notes: '', is_optional: false }] }
  ],
  steps: [
    { title: '', instruction: '', duration_minutes: null }
  ],
});

function toggleCategory(id) {
  const idx = form.category_ids.indexOf(id);
  if (idx >= 0) form.category_ids.splice(idx, 1);
  else form.category_ids.push(id);
}

function addIngredientGroup() {
  form.ingredient_groups.push({
    name: '',
    items: [{ amount: null, unit: '', name: '', is_optional: false }],
  });
}

// Alle Zutaten flach aus allen Gruppen
const flatIngredients = computed(() => {
  const items = [];
  for (const group of form.ingredient_groups) {
    for (const ing of group.items) {
      if (ing.name) items.push({ name: ing.name, amount: ing.amount, unit: ing.unit });
    }
  }
  return items;
});

const formNutritionSortKey = ref('name');
const formNutritionSortAsc = ref(true);

function toggleFormNutritionSort(key) {
  if (formNutritionSortKey.value === key) {
    formNutritionSortAsc.value = !formNutritionSortAsc.value;
  } else {
    formNutritionSortKey.value = key;
    formNutritionSortAsc.value = key === 'name';
  }
}

function formNutritionSortIcon(key) {
  if (formNutritionSortKey.value !== key) return '';
  return formNutritionSortAsc.value ? ' ↑' : ' ↓';
}

const parsedFormNutritionDetails = computed(() => {
  const raw = form.nutrition_details;
  if (!raw) return [];
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return [];
    const key = formNutritionSortKey.value;
    const dir = formNutritionSortAsc.value ? 1 : -1;
    return [...arr].sort((a, b) => {
      if (key === 'name') return dir * (a.name || '').localeCompare(b.name || '', 'de');
      const aNum = key === 'amount' ? parseFloat(a.amount) || 0 : (a[key] || 0);
      const bNum = key === 'amount' ? parseFloat(b.amount) || 0 : (b[key] || 0);
      return dir * (aNum - bNum);
    });
  } catch { return []; }
});

const formNutritionDetailsSum = computed(() => {
  const details = parsedFormNutritionDetails.value;
  if (!details.length) return { calories: 0, protein: 0, carbs: 0, fat: 0 };
  return {
    calories: Math.round(details.reduce((s, d) => s + (d.calories || 0), 0)),
    protein: Math.round(details.reduce((s, d) => s + (d.protein || 0), 0)),
    carbs: Math.round(details.reduce((s, d) => s + (d.carbs || 0), 0)),
    fat: Math.round(details.reduce((s, d) => s + (d.fat || 0), 0)),
  };
});

async function estimateNutritionViaAI() {
  if (flatIngredients.value.length === 0) return;
  estimatingNutrition.value = true;
  try {
    const result = await api.post('/recipes/estimate-nutrition', {
      ingredients: flatIngredients.value,
      servings: form.servings || 4,
    });
    if (result.note) form.nutrition_note = result.note;
    if (result.details) {
      form.nutrition_details = result.details;
      // Summen aus Details berechnen statt KI-Gesamtwerte zu verwenden (garantiert konsistent)
      const details = Array.isArray(result.details) ? result.details : [];
      if (details.length) {
        form.calories = Math.round(details.reduce((s, d) => s + (d.calories || 0), 0));
        form.protein = Math.round(details.reduce((s, d) => s + (d.protein || 0), 0));
        form.carbs = Math.round(details.reduce((s, d) => s + (d.carbs || 0), 0));
        form.fat = Math.round(details.reduce((s, d) => s + (d.fat || 0), 0));
      }
    } else {
      if (result.calories != null) form.calories = result.calories;
      if (result.protein != null) form.protein = result.protein;
      if (result.carbs != null) form.carbs = result.carbs;
      if (result.fat != null) form.fat = result.fat;
    }
  } catch {
    // Fehler wird von useApi angezeigt
  } finally {
    estimatingNutrition.value = false;
  }
}

function onImageChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  // Original-URL speichern für erneutes Zuschneiden
  const objectUrl = URL.createObjectURL(file);
  originalImageSrc.value = objectUrl;
  cropperImageSrc.value = objectUrl;
  cropperFileName.value = file.name;
  showCropper.value = true;
  // Input zurücksetzen (damit dasselbe Bild nochmal gewählt werden kann)
  e.target.value = '';
}

function openCropper() {
  // Cropper erneut öffnen (mit Original oder aktuellem Bild)
  if (originalImageSrc.value) {
    cropperImageSrc.value = originalImageSrc.value;
  } else if (imagePreview.value) {
    cropperImageSrc.value = imagePreview.value;
  }
  showCropper.value = true;
}

function onCropped(file, previewUrl) {
  imageFile.value = file;
  imagePreview.value = previewUrl;
  showCropper.value = false;
}

async function saveRecipe() {
  saving.value = true;
  try {
    // Zutaten flach machen mit Gruppeninfo
    const ingredients = [];
    for (const group of form.ingredient_groups) {
      for (const ing of group.items) {
        if (!ing.name) continue;
        ingredients.push({
          ...ing,
          group_name: group.name || null,
        });
      }
    }

    const payload = {
      title: form.title,
      description: form.description,
      prep_time: form.prep_time,
      cook_time: form.cook_time,
      total_time: (form.prep_time || 0) + (form.cook_time || 0),
      servings: form.servings,
      difficulty: form.difficulty,
      category_ids: form.category_ids,
      calories: form.calories || null,
      protein: form.protein || null,
      carbs: form.carbs || null,
      fat: form.fat || null,
      nutrition_note: form.nutrition_note || null,
      nutrition_details: form.nutrition_details || null,
      ingredients,
      steps: form.steps.filter(s => s.instruction).map((s, i) => ({ ...s, step_number: i + 1 })),
    };

    let recipeId;
    if (isEdit.value) {
      await api.put(`/recipes/${editId.value}`, payload);
      recipeId = editId.value;
      showSuccess('Rezept aktualisiert! ✨');
    } else {
      const result = await api.post('/recipes', payload);
      recipeId = result.id;
      showSuccess('Rezept erstellt! 🎉');
    }

    // Bild hochladen (falls vorhanden)
    if (imageFile.value && recipeId) {
      const formData = new FormData();
      formData.append('image', imageFile.value);
      await api.upload(`/recipes/${recipeId}/image`, formData);
    }

    router.push(`/recipes/${recipeId}`);
  } catch {
    // Fehler wird von useApi angezeigt
  } finally {
    saving.value = false;
  }
}

// Beim Bearbeiten: bestehende Daten laden
onMounted(async () => {
  await recipesStore.fetchCategories();

  if (editId.value) {
    await recipesStore.fetchRecipe(editId.value);
    const r = recipesStore.currentRecipe;
    if (r) {
      Object.assign(form, {
        title: r.title,
        description: r.description || '',
        prep_time: r.prep_time,
        cook_time: r.cook_time,
        servings: r.servings,
        difficulty: r.difficulty,
        calories: r.calories || null,
        protein: r.protein || null,
        carbs: r.carbs || null,
        fat: r.fat || null,
        nutrition_note: r.nutrition_note || null,
        nutrition_details: r.nutrition_details ? (typeof r.nutrition_details === 'string' ? JSON.parse(r.nutrition_details) : r.nutrition_details) : null,
        category_ids: r.categories?.map(c => c.id) || [],
      });

      // Zutaten nach Gruppen sortieren
      const groups = {};
      for (const ing of r.ingredients || []) {
        const gn = ing.group_name || '';
        if (!groups[gn]) groups[gn] = [];
        groups[gn].push({ amount: ing.amount, unit: ing.unit, name: ing.name, notes: ing.notes || '', is_optional: ing.is_optional });
      }
      form.ingredient_groups = Object.entries(groups).map(([name, items]) => ({ name, items }));
      if (!form.ingredient_groups.length) {
        form.ingredient_groups = [{ name: '', items: [{ amount: null, unit: '', name: '', notes: '', is_optional: false }] }];
      }

      // Kochschritte
      form.steps = (r.steps || []).map(s => ({
        title: s.title || '',
        instruction: s.instruction,
        duration_minutes: s.duration_minutes,
      }));
      if (!form.steps.length) {
        form.steps = [{ title: '', instruction: '', duration_minutes: null }];
      }

      if (r.image_url) imagePreview.value = r.image_url;
    }
  }
});
</script>

<style scoped>
.card {
  background-color: white;
  padding: calc(var(--spacing) * 4);
  border: 1px solid var(--color-stone-200);
  border-radius: var(--radius-xl);
}
@media (min-width: 640px) {
  .card {
    padding: calc(var(--spacing) * 6);
  }
}
:is(.dark .card) {
  background-color: var(--color-stone-900);
  border-color: var(--color-stone-800);
}

.form-label {
  display: block;
  margin-bottom: calc(var(--spacing) * 1);
  font-weight: 500;
  color: var(--color-stone-700);
  font-size: var(--text-sm);
  line-height: var(--text-sm--line-height);
}
:is(.dark .form-label) {
  color: var(--color-stone-300);
}

.form-input {
  width: 100%;
  padding-inline: calc(var(--spacing) * 3);
  padding-block: calc(var(--spacing) * 2);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-stone-200);
  background-color: white;
  color: var(--color-stone-800);
  font-size: var(--text-sm);
  line-height: var(--text-sm--line-height);
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.form-input:focus {
  border-color: var(--color-primary-400);
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--color-primary-500) 30%, transparent);
}
:is(.dark .form-input) {
  border-color: var(--color-stone-700);
  background-color: var(--color-stone-800);
  color: var(--color-stone-200);
}
</style>
