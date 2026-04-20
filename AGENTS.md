# AGENTS.md

## Project overview

Zauberjournal is a self-hosted AI-powered recipe manager with meal planning, shopping lists, pantry tracking, and REWE/Bring! grocery integrations. German-language app throughout (UI text, comments, variable names, error messages).

Three independent packages — no monorepo tooling, no shared root `package.json`. Each has its own `node_modules` and lockfile:

| Package | Stack | Purpose |
|---|---|---|
| `backend/` | Fastify 5, better-sqlite3, Node 22+ (ESM) | REST API + serves frontend in production |
| `frontend/` | Vue 3.5, Pinia, Tailwind CSS 4, Vite 6, PWA | SPA, offline-first with service worker |
| `landingpage/` | Astro 5 + Starlight | Docs site, deployed to GitHub Pages |

## Dev commands

**Always run from the package directory, not root.**

```bash
# Backend
cd backend
npm install
npm run dev          # node --watch --env-file=../.env src/server.js → :3001
npm run migrate      # run migrations standalone (also runs on server start)

# Frontend
cd frontend
npm install
npm run dev          # vite → :5173, proxies /api → :3001

# Landing page
cd landingpage
npm install
npm run dev          # astro dev
```

The backend reads `.env` from **project root** (`../.env` relative to `backend/`), not from `backend/.env`. The root `.env.example` is the template.

There is no lint, typecheck, or test runner configured in any package.

## Architecture notes

### Backend

- **Entrypoint:** `backend/src/server.js` — registers Fastify plugins and all route modules under `/api/*`.
- **Routes:** `backend/src/routes/` — one file per domain (auth, recipes, mealplan, shopping, pantry, rewe, bring, admin, households, etc.). Routes use preHandler hooks for auth.
- **Auth:** Three Fastify decorators — `app.authenticate` (JWT or API key), `app.requireAdmin`, `app.resolveHousehold` (resolves `X-Household-Id` header for multi-tenant queries).
- **Database:** SQLite (WAL mode) via `better-sqlite3`. Path: `./data/cookbook.db` relative to backend. No migration framework — `backend/src/config/database.js` has idempotent `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN` migrations that run on startup.
- **Household multi-tenancy:** Most tables have `household_id`. A `householdWhereClause()` helper in `database.js` builds SQL WHERE conditions scoping data to household or personal.
- **AI services:** `backend/src/services/ai/` — supports Kimi/Moonshot, OpenAI, Anthropic, Ollama. Used for recipe parsing, meal planning, pantry deduction, shopping list review. Provider configurable via admin settings or env vars.
- **Static serving:** In production (when `public/` dir exists), backend serves the frontend build and has SPA fallback for non-`/api/` routes.
- **Swagger:** Available at `/docs` in dev mode only.

### Frontend

- **Path alias:** `@/` maps to `frontend/src/`.
- **API layer:** `frontend/src/composables/useApi.js` — thin `fetch` wrapper (no Axios). Auto-injects JWT Bearer token and `X-Household-Id` header. Auto-retries on 429, logs out on 401.
- **Stores:** Pinia composition API style in `frontend/src/stores/`. Auth token stored in localStorage key `zauberjournal-token`.
- **Offline-first:** `frontend/src/services/` has an offline queue (`offlineQueue.js`, `syncManager.js`) that replays actions when connectivity returns.
- **Routes:** All lazy-loaded with retry logic for stale chunk hashes after deployments. Navigation guard checks `meta.requiresAuth` / `meta.requiresAdmin`.
- **Components:** Organized by domain (`recipes/`, `mealplan/`, `shopping/`, `pantry/`, `admin/`, `rewe/`) plus `ui/` (shared) and `layout/` (shell).

## Docker

Single-container build. Dockerfile is a two-stage build: frontend Vite build, then Node 22 Alpine with backend + frontend assets. Backend serves everything on port 3001. Docker Compose maps 8080→3001.

## CI

- **`docker-build.yml`**: Builds multi-arch (amd64+arm64) Docker image on push to main or version tags, pushes to ghcr.io.
- **`landing-page.yml`**: Builds and deploys `landingpage/` to GitHub Pages on changes to `landingpage/**`.

No CI test or lint steps exist.

## Conventions

- All user-facing text is **German**. Keep new UI text, comments, and error messages in German.
- The first registered user automatically becomes admin.
- Backend uses **ESM** (`"type": "module"`) with `node --env-file` flag (Node 22+).
- No TypeScript anywhere — plain JavaScript in all three packages.
- Tailwind CSS 4 uses the Vite plugin approach (`@tailwindcss/vite`), not PostCSS config.

## Behavioral guidelines for code changes

Behavioral guidelines to reduce common LLM coding mistakes. **Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Existing instruction files

- `.github/instructions/local-dev.instructions.md` — detailed local dev setup, test credentials, Playwright MCP usage (gitignored, local only).
