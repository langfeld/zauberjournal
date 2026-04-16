/**
 * ============================================
 * Vue Router Konfiguration
 * ============================================
 * Definiert alle Seiten/Routen der Anwendung.
 * Geschützte Routen leiten auf Login um.
 */

import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';

/**
 * Lazy-Import mit Retry-Logik.
 * Fängt fehlgeschlagene Chunk-Loads ab (z.B. nach Deployment oder Rate-Limit)
 * und versucht es erneut, bevor als letzter Ausweg die Seite neu geladen wird.
 */
function lazyLoad(importFn, retries = 2) {
  return () => {
    return importFn().catch((err) => {
      if (retries > 0) {
        return new Promise((resolve) => setTimeout(resolve, 1000)).then(() =>
          lazyLoad(importFn, retries - 1)()
        );
      }

      // Letzter Versuch fehlgeschlagen → Seite neu laden (einmalig)
      const reloadKey = 'chunk-reload';
      if (!sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, '1');
        window.location.reload();
        // Promise, das nie resolved, damit Router nicht weitermacht
        return new Promise(() => {});
      }
      sessionStorage.removeItem(reloadKey);
      throw err;
    });
  };
}

const routes = [
  {
    path: '/login',
    name: 'login',
    component: lazyLoad(() => import('@/views/LoginView.vue')),
    meta: { requiresAuth: false, title: 'Anmelden' },
  },
  {
    path: '/',
    name: 'dashboard',
    component: lazyLoad(() => import('@/views/DashboardView.vue')),
    meta: { requiresAuth: true, title: 'Dashboard' },
  },
  {
    path: '/recipes',
    name: 'recipes',
    component: lazyLoad(() => import('@/views/RecipesView.vue')),
    meta: { requiresAuth: true, title: 'Rezepte' },
  },
  {
    path: '/recipes/:id',
    name: 'recipe-detail',
    component: lazyLoad(() => import('@/views/RecipeDetailView.vue')),
    meta: { requiresAuth: true, title: 'Rezeptdetails' },
  },
  {
    path: '/recipes/new',
    name: 'recipe-new',
    component: lazyLoad(() => import('@/views/RecipeFormView.vue')),
    meta: { requiresAuth: true, title: 'Neues Rezept' },
  },
  {
    path: '/mealplan',
    name: 'mealplan',
    component: lazyLoad(() => import('@/views/MealPlanView.vue')),
    meta: { requiresAuth: true, title: 'Wochenplan' },
  },
  {
    path: '/shopping',
    name: 'shopping',
    component: lazyLoad(() => import('@/views/ShoppingView.vue')),
    meta: { requiresAuth: true, title: 'Einkaufsliste' },
  },
  {
    path: '/pantry',
    name: 'pantry',
    component: lazyLoad(() => import('@/views/PantryView.vue')),
    meta: { requiresAuth: true, title: 'Vorratsschrank' },
  },
  {
    path: '/my-data',
    name: 'my-data',
    component: lazyLoad(() => import('@/views/UserDataManagementView.vue')),
    meta: { requiresAuth: true, title: 'Meine Daten' },
  },
  {
    path: '/household',
    name: 'household',
    component: lazyLoad(() => import('@/views/HouseholdView.vue')),
    meta: { requiresAuth: true, title: 'Haushalt' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: lazyLoad(() => import('@/views/SettingsView.vue')),
    meta: { requiresAuth: true, title: 'Einstellungen' },
  },
  {
    path: '/shared/:token',
    name: 'shared-recipe',
    component: lazyLoad(() => import('@/views/SharedRecipeView.vue')),
    meta: { requiresAuth: false, title: 'Geteiltes Rezept' },
  },
  // --- Admin-Routen ---
  {
    path: '/admin',
    name: 'admin-dashboard',
    component: lazyLoad(() => import('@/views/admin/AdminDashboardView.vue')),
    meta: { requiresAuth: true, requiresAdmin: true, title: 'Admin Dashboard' },
  },
  {
    path: '/admin/users',
    name: 'admin-users',
    component: lazyLoad(() => import('@/views/admin/AdminUsersView.vue')),
    meta: { requiresAuth: true, requiresAdmin: true, title: 'Benutzerverwaltung' },
  },
  {
    path: '/admin/settings',
    name: 'admin-settings',
    component: lazyLoad(() => import('@/views/admin/AdminSettingsView.vue')),
    meta: { requiresAuth: true, requiresAdmin: true, title: 'Systemeinstellungen' },
  },
  {
    path: '/admin/ingredient-icons',
    name: 'admin-ingredient-icons',
    component: lazyLoad(() => import('@/views/admin/AdminIngredientIconsView.vue')),
    meta: { requiresAuth: true, requiresAdmin: true, title: 'Zutaten-Icons' },
  },
  {
    path: '/admin/data',
    name: 'admin-data',
    component: lazyLoad(() => import('@/views/admin/AdminDataManagementView.vue')),
    meta: { requiresAuth: true, requiresAdmin: true, title: 'Datenverwaltung' },
  },
  // Fallback: 404
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  },
});

// Navigation Guard: Auth-Prüfung
router.beforeEach((to) => {
  const authStore = useAuthStore();

  // Geschützte Route ohne Login -> Login-Seite
  if (to.meta.requiresAuth && !authStore.isLoggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }

  // Admin-Route ohne Admin-Rolle -> Dashboard
  if (to.meta.requiresAdmin && !authStore.isAdmin) {
    return { name: 'dashboard' };
  }

  // Bereits eingeloggt -> Dashboard statt Login
  if (to.name === 'login' && authStore.isLoggedIn) {
    return { name: 'dashboard' };
  }

  // Seitentitel setzen
  document.title = `${to.meta.title || 'Zauberjournal'} | Zauberjournal 🍳`;
});

// Chunk-Load-Fehler abfangen (z.B. veraltete Hashes nach Deployment oder gecachte Fehler-Responses)
router.onError((err, to) => {
  const isChunkError =
    err.message?.includes('dynamically imported module') ||
    err.message?.includes('Failed to fetch') ||
    err.message?.includes('Unable to preload CSS') ||
    err.message?.includes('Loading chunk');

  if (isChunkError) {
    const reloadKey = 'chunk-reload';
    if (!sessionStorage.getItem(reloadKey)) {
      sessionStorage.setItem(reloadKey, '1');
      window.location.assign(to?.fullPath || window.location.href);
    } else {
      sessionStorage.removeItem(reloadKey);
    }
  }
});

export default router;
