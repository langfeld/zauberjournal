---
title: Projektstruktur
description: Kommentierter Dateibaum des Zauberjournal-Projekts.
---

```
zauberjournal/
├── Dockerfile                  # Single-Container Build (Frontend + Backend)
├── docker-compose.yml          # Compose für NAS / einfaches Deployment
├── entrypoint.sh               # PUID/PGID-Handling für NAS-Berechtigungen
├── .env.example                # Umgebungsvariablen-Vorlage
├── .github/workflows/
│   └── docker-build.yml        # GitHub Actions → ghcr.io
│
├── backend/
│   ├── package.json
│   └── src/
│       ├── server.js           # Fastify Server + Frontend-Serving + SPA-Fallback
│       ├── config/
│       │   ├── env.js          # Zentrale Config aus Umgebungsvariablen
│       │   ├── database.js     # SQLite-Initialisierung (WAL, FK, CASCADE)
│       │   └── settings.js     # Runtime-Einstellungen (DB + Env-Fallback)
│       ├── routes/
│       │   ├── auth.js         # Registrierung, Login, Token-Refresh, API-Key
│       │   ├── recipes.js      # CRUD + Foto-Import + Text-Import + Export/Import
│       │   ├── categories.js   # Kategorien CRUD
│       │   ├── collections.js  # Sammlungen CRUD + Rezept-Zuordnungen
│       │   ├── mealplan.js     # Wochenplaner (Algorithmus + KI-Reasoning)
│       │   ├── shopping.js     # Einkaufsliste: Generierung, Items, REWE, Pantry
│       │   ├── pantry.js       # Vorratsschrank CRUD + Verbrauch + Import
│       │   ├── rewe.js         # REWE: Produktsuche, SSE-Matching, Markt, Cart
│       │   ├── rewe-userscript.js # Tampermonkey Userscript-Generator
│       │   ├── bring.js        # Bring!: Account, Listen, Senden, Trennen
│       │   ├── ingredient-icons.js # Zutaten-Emoji-Mappings
│       │   ├── ingredient-aliases.js # Aliase, Blockierungen, Export/Import
│       │   ├── recipe-blocks.js # Rezept-Sperren CRUD
│       │   ├── backup.js       # Komplett-Backup pro Benutzer
│       │   ├── admin.js        # Admin: Stats, Users, Settings, Logs, Export
│       │   ├── households.js   # Haushalt CRUD, Einladungen, Migration
│       │   ├── household-events.js # SSE-Stream für Echtzeit-Sync
│       │   ├── shared-recipes.js # Öffentliche Rezept-Links (kein Auth)
│       │   └── user-settings.js # Benutzer-Einstellungen CRUD
│       ├── services/
│       │   ├── ai/
│       │   │   ├── base.js     # BaseAIProvider (Chat, JSON-Parse, Bild)
│       │   │   ├── kimi.js     # Kimi / Moonshot AI Provider
│       │   │   ├── openai.js   # OpenAI Provider (GPT-4o etc.)
│       │   │   ├── anthropic.js # Anthropic Provider (Claude)
│       │   │   ├── ollama.js   # Ollama Provider (lokal)
│       │   │   └── provider.js # Provider-Factory
│       │   ├── meal-planner.js # Wochenplan-Algorithmus
│       │   ├── pantry-allocation.js # Vorratsabgleich für Einkaufsliste
│       │   ├── pantry-deduction-ai.js # KI-Vorratsabzug beim Kochen
│       │   ├── pantry-transfer-ai.js # KI-Vorrats-Transfer aus Einkaufsliste
│       │   ├── recipe-parser.js # Multi-Bild-Rezeptanalyse
│       │   ├── rewe-api.js     # REWE API-Client + Batch-Matching
│       │   ├── shopping-list.js # Einkaufslisten-Service + Heuristik-Dedup
│       │   └── shopping-review.js # KI-Einkaufslisten-Review (Qualitätsprüfung)
│       └── utils/
│           ├── errors.js       # Fehlerbehandlung
│           ├── helpers.js      # normalizeUnit, Konvertierungen
│           └── ingredient-weights.js # Gewichtstabelle (Stück→g, Subunit-Konvertierung)
│
├── frontend/
│   ├── package.json
│   ├── vite.config.js          # Vite 6 + Vue + Tailwind
│   └── src/
│       ├── main.js             # App-Einstieg + Pinia + Router
│       ├── App.vue             # Layout-Shell (Sidebar, Header, Transition)
│       ├── assets/styles/
│       │   └── main.css        # Tailwind 4 (@theme, @custom-variant)
│       ├── components/
│       │   ├── layout/         # Sidebar, Header, ThemeToggle, Notifications
│       │   ├── ui/             # ConfirmDialog, ImageCropModal
│       │   ├── recipes/        # RecipeCard, ImportModal, ExportModal
│       │   ├── collections/    # CollectionManager, AddToCollection
│       │   ├── mealplan/       # MealPlanView-Komponenten
│       │   ├── pantry/         # PantryImportExportModal
│       │   ├── shopping/       # Einkaufslisten-Komponenten
│       │   ├── rewe/           # REWE-Panel-Komponenten
│       │   ├── admin/          # Admin-spezifische Komponenten
│       │   └── dashboard/      # StatCard
│       ├── views/
│       │   ├── LoginView.vue
│       │   ├── DashboardView.vue
│       │   ├── RecipesView.vue / RecipeDetailView.vue / RecipeFormView.vue
│       │   ├── MealPlanView.vue
│       │   ├── ShoppingView.vue
│       │   ├── PantryView.vue
│       │   ├── UserDataManagementView.vue  # Meine Daten
│       │   ├── HouseholdView.vue
│       │   ├── SharedRecipeView.vue
│       │   └── admin/
│       │       ├── AdminDashboardView.vue  # Admin-Übersicht & Statistiken
│       │       ├── AdminDataManagementView.vue # Datenmanagement & Export
│       │       ├── AdminIngredientIconsView.vue # Zutaten-Emoji-Verwaltung
│       │       ├── AdminSettingsView.vue   # Admin-Einstellungen & KI-Konfiguration
│       │       └── AdminUsersView.vue      # Benutzerverwaltung
│       ├── stores/             # Pinia Stores (mit Offline-Persistenz)
│       │   ├── auth.js              # Auth-Store (Login, Token, User)
│       │   ├── collections.js       # Sammlungen-Store
│       │   ├── household.js         # Haushalt-Store mit SSE-Management
│       │   ├── ingredient-aliases.js # Zutaten-Alias-Store
│       │   ├── mealplan.js          # Wochenplan-Store
│       │   ├── pantry.js            # Vorratsschrank-Store
│       │   ├── recipe-blocks.js     # Rezept-Sperren-Store
│       │   ├── recipes.js           # Rezepte-Store
│       │   └── shopping.js          # Einkaufslisten-Store
│       ├── services/
│       │   ├── offlineQueue.js  # IndexedDB-basierte Action-Queue (idb-keyval)
│       │   ├── syncManager.js   # Queue-Abarbeitung bei Netzwerkrückkehr
│       │   └── syncHandlers.js  # Handler für jeden offline-fähigen Action-Typ
│       ├── composables/
│       │   ├── useApi.js        # API-Client (apiFetch + Convenience-Methoden)
│       │   ├── useAppUpdate.js  # PWA Service-Worker-Update-Flow
│       │   ├── useIngredientIcons.js # Zutaten-Emoji-Caching
│       │   ├── useInstallPrompt.js # PWA-Installationsdialog
│       │   ├── useNetworkStatus.js # Reaktiver Online/Offline-Status
│       │   ├── useNotification.js # Toast-Benachrichtigungen
│       │   ├── useTheme.js      # Dark-Mode-Verwaltung
│       │   └── useWakeLock.js   # Wake Lock für Kochmodus
│       └── router/index.js
│
└── landingpage/                # Astro 5 Landing Page + Starlight Docs
    ├── astro.config.mjs
    ├── package.json
    └── src/
        ├── components/         # Header, Hero, Features, Showcase, etc.
        ├── content/docs/       # Starlight Dokumentation (Markdown)
        ├── layouts/            # Layout.astro
        ├── pages/              # index.astro (Landing Page)
        └── styles/             # global.css (Tailwind 4)
```
