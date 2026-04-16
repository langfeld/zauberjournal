<!--
  ============================================
  RecipeCard - Rezept-Vorschaukarte
  ============================================
  Kompakte Darstellung eines Rezepts im Grid.
-->
<template>
  <component
    :is="draggable ? 'div' : 'router-link'"
    v-bind="draggable ? {} : { to: `/recipes/${recipe.id}` }"
    class="group flex flex-col h-full bg-white dark:bg-stone-900 hover:shadow-lg border border-stone-200 hover:border-primary-300 dark:border-stone-800 dark:hover:border-primary-700 rounded-xl overflow-hidden transition-all"
    :class="{ 'cursor-grab active:cursor-grabbing': draggable }"
    :draggable="draggable"
    @dragstart="draggable && onDragStart($event)"
    @dragend="draggable && onDragEnd($event)"
  >
    <!-- Bild -->
    <div class="relative bg-stone-100 dark:bg-stone-800 aspect-4/3 overflow-hidden">
      <img
        v-if="recipe.image_url"
        :src="recipe.image_url"
        :alt="recipe.title"
        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
      />
      <div v-else class="flex justify-center items-center opacity-50 w-full h-full text-5xl">
        🍽️
      </div>

      <!-- Favorit-Button -->
      <button
        @click.prevent="$emit('toggle-favorite')"
        class="top-2 right-2 absolute bg-white/80 hover:bg-white dark:bg-stone-900/80 dark:hover:bg-stone-900 backdrop-blur-sm p-1.5 rounded-full transition-colors"
      >
        <Star
          class="w-4 h-4"
          :class="recipe.is_favorite ? 'fill-amber-400 text-amber-400' : 'text-stone-400'"
        />
      </button>

      <!-- Schwierigkeitsgrad-Badge -->
      <span
        :class="[
          'absolute bottom-2 left-2 px-2 py-0.5 text-xs font-medium rounded-full',
          difficultyClasses[recipe.difficulty] || difficultyClasses.mittel,
        ]"
      >
        {{ recipe.difficulty }}
      </span>

      <!-- KI-Badge -->
      <span
        v-if="recipe.ai_generated"
        class="right-2 bottom-2 absolute bg-indigo-100 dark:bg-indigo-900/60 px-2 py-0.5 rounded-full font-medium text-indigo-700 dark:text-indigo-300 text-xs"
      >
        🤖 KI
      </span>

      <!-- Haushalt-Badge -->
      <span
        v-if="recipe.household_id"
        class="top-2 left-2 absolute flex items-center gap-1 bg-primary-100/90 dark:bg-primary-900/80 backdrop-blur-sm px-1.5 py-0.5 rounded-full text-primary-700 dark:text-primary-300 text-xs"
        title="Im Haushalt geteilt"
      >
        <Home class="w-3 h-3" />
      </span>
    </div>

    <!-- Info -->
    <div class="flex flex-col flex-1 p-4">
      <h3 class="font-semibold text-stone-800 dark:group-hover:text-primary-400 dark:text-stone-100 group-hover:text-primary-600 truncate transition-colors">
        {{ recipe.title }}
      </h3>
      <p v-if="recipe.description" class="mt-1 text-stone-500 dark:text-stone-400 text-sm line-clamp-2">
        {{ recipe.description }}
      </p>

      <!-- Meta-Infos -->
      <div class="flex items-center gap-3 mt-3 text-stone-500 dark:text-stone-400 text-xs">
        <span class="flex items-center gap-1" v-if="recipe.total_time">
          <Clock class="w-3.5 h-3.5" />
          {{ recipe.total_time }} Min.
        </span>
        <span class="flex items-center gap-1" v-if="recipe.servings">
          <Users class="w-3.5 h-3.5" />
          {{ recipe.servings }} Port.
        </span>
        <span class="flex items-center gap-1" v-if="recipe.times_cooked">
          <ChefHat class="w-3.5 h-3.5" />
          {{ recipe.times_cooked }}x
        </span>
        <span class="flex items-center gap-1 text-orange-500 dark:text-orange-400" v-if="recipe.calories">
          <Flame class="w-3.5 h-3.5" />
          {{ Math.round(recipe.calories) }} kcal
        </span>
      </div>

      <!-- Kategorien -->
      <div v-if="recipe.category_names" class="flex flex-wrap gap-1 mt-auto pt-3">
        <span
          v-for="cat in recipe.category_names.split(',')"
          :key="cat"
          class="bg-stone-100 dark:bg-stone-800 px-2 py-0.5 rounded-full text-stone-600 dark:text-stone-400 text-xs"
        >
          {{ cat.trim() }}
        </span>
      </div>
    </div>
  </component>
</template>

<script setup>
import { Star, Clock, Users, ChefHat, Flame, Home } from 'lucide-vue-next';

const props = defineProps({
  recipe: { type: Object, required: true },
  draggable: { type: Boolean, default: false },
});
const emit = defineEmits(['toggle-favorite', 'recipe-drag-start', 'recipe-drag-end']);

function onDragStart(event) {
  const data = {
    recipeId: props.recipe.id,
    recipeTitle: props.recipe.title,
    source: 'recipe-browser',
  };
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('application/json', JSON.stringify(data));
  event.dataTransfer.setData('text/plain', props.recipe.id.toString());
  if (event.target) event.target.style.opacity = '0.5';
  emit('recipe-drag-start', data);
}

function onDragEnd(event) {
  if (event?.target) event.target.style.opacity = '';
  emit('recipe-drag-end');
}

const difficultyClasses = {
  leicht: 'bg-green-100 dark:bg-green-900/60 text-green-700 dark:text-green-300',
  mittel: 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300',
  schwer: 'bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300',
};
</script>
