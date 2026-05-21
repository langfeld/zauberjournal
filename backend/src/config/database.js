/**
 * ============================================
 * Datenbank-Konfiguration (SQLite)
 * ============================================
 * Verwendet better-sqlite3 für synchrone, performante SQLite-Zugriffe.
 * Die Datenbank wird beim ersten Start automatisch erstellt.
 */

import Database from 'better-sqlite3';
import { config } from './env.js';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

// Pfad wird in env.js absolut aufgelöst (relativ zum backend/-Verzeichnis)
const dbPath = config.database.path;

// Verzeichnis für DB-Datei sicherstellen
const dbDir = dirname(dbPath);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// Datenbank öffnen mit WAL-Modus für bessere Performance
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Datenbank-Schema initialisieren
 * Erstellt alle Tabellen, falls sie nicht existieren.
 */
export function initializeDatabase() {
  // Pre-Migration: Alte ingredient_icons-Tabelle (aus rollback) durch neue ersetzen
  try {
    const iconColumns = db.prepare("PRAGMA table_info(ingredient_icons)").all().map(c => c.name);
    if (iconColumns.length > 0 && !iconColumns.includes('keyword')) {
      db.exec("DROP TABLE IF EXISTS ingredient_icons");
      console.log('  ↳ Pre-Migration: Alte ingredient_icons-Tabelle entfernt');
    }
  } catch { /* Tabelle existiert noch nicht — OK */ }

  // Migration: is_permanent-Spalte zum Vorratsschrank hinzufügen
  try {
    const pantryColumns = db.prepare("PRAGMA table_info(pantry)").all().map(c => c.name);
    if (pantryColumns.length > 0 && !pantryColumns.includes('is_permanent')) {
      db.exec("ALTER TABLE pantry ADD COLUMN is_permanent INTEGER DEFAULT 0");
      console.log('  ↳ Migration: is_permanent-Spalte zu pantry hinzugefügt');
    }
  } catch { /* Tabelle existiert noch nicht — OK */ }

  db.exec(`
    -- ============================================
    -- Benutzer-Tabelle
    -- ============================================
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      role TEXT DEFAULT 'user',            -- 'user' oder 'admin'
      is_active INTEGER DEFAULT 1,         -- Gesperrt?
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ============================================
    -- Kategorien (frei anlegbar)
    -- ============================================
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '🍽️',
      color TEXT DEFAULT '#6366f1',
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- ============================================
    -- Rezepte
    -- ============================================
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      servings INTEGER DEFAULT 4,
      prep_time INTEGER DEFAULT 0,        -- Vorbereitungszeit in Minuten
      cook_time INTEGER DEFAULT 0,        -- Kochzeit in Minuten
      total_time INTEGER DEFAULT 0,       -- Gesamtzeit in Minuten
      difficulty TEXT DEFAULT 'mittel',   -- leicht, mittel, schwer
      image_url TEXT,                      -- Pfad zum Rezeptbild
      source_url TEXT,                     -- Originalquelle (falls importiert)
      is_favorite INTEGER DEFAULT 0,       -- Favorit?
      times_cooked INTEGER DEFAULT 0,      -- Wie oft gekocht
      last_cooked_at DATETIME,             -- Wann zuletzt gekocht
      ai_generated INTEGER DEFAULT 0,      -- Von KI erstellt?
      notes TEXT,                           -- Persönliche Notizen
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- ============================================
    -- Rezept-Kategorie Zuordnung (n:m)
    -- ============================================
    CREATE TABLE IF NOT EXISTS recipe_categories (
      recipe_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      PRIMARY KEY (recipe_id, category_id),
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );

    -- ============================================
    -- Zutaten eines Rezepts
    -- ============================================
    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      amount REAL,                         -- Menge (z.B. 500)
      unit TEXT,                           -- Einheit (z.B. g, ml, Stück)
      group_name TEXT,                     -- Gruppe (z.B. "Für die Sauce")
      sort_order INTEGER DEFAULT 0,
      is_optional INTEGER DEFAULT 0,       -- Optional?
      notes TEXT,                           -- Anmerkungen (z.B. "alternativ Hafermilch")
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    );

    -- ============================================
    -- Kochschritte
    -- ============================================
    CREATE TABLE IF NOT EXISTS cooking_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      step_number INTEGER NOT NULL,
      title TEXT,                           -- Titel des Schritts (z.B. "Vorbereitung")
      instruction TEXT NOT NULL,
      duration_minutes INTEGER,             -- Geschätzte Dauer
      image_url TEXT,                       -- Optionales Bild zum Schritt
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    );

    -- ============================================
    -- Wochenplan
    -- ============================================
    CREATE TABLE IF NOT EXISTS meal_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      week_start DATE NOT NULL,            -- Montag der Woche
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- ============================================
    -- Wochenplan-Einträge (einzelne Mahlzeiten)
    -- ============================================
    CREATE TABLE IF NOT EXISTS meal_plan_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meal_plan_id INTEGER NOT NULL,
      recipe_id INTEGER NOT NULL,
      day_of_week INTEGER NOT NULL,        -- 0=Mo, 1=Di, ... 6=So
      meal_type TEXT NOT NULL,             -- fruehstueck, mittag, abendessen, snack
      servings INTEGER DEFAULT 4,          -- Portionen für diesen Eintrag
      is_cooked INTEGER DEFAULT 0,         -- Schon gekocht?
      FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE CASCADE,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    );

    -- ============================================
    -- Einkaufsliste
    -- ============================================
    CREATE TABLE IF NOT EXISTS shopping_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      meal_plan_id INTEGER,                -- Optional: Verknüpfung zum Wochenplan
      name TEXT DEFAULT 'Einkaufsliste',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE SET NULL
    );

    -- ============================================
    -- Einkaufslisten-Einträge
    -- ============================================
    CREATE TABLE IF NOT EXISTS shopping_list_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shopping_list_id INTEGER NOT NULL,
      ingredient_name TEXT NOT NULL,
      amount REAL,
      unit TEXT,
      is_checked INTEGER DEFAULT 0,        -- Abgehakt?
      recipe_id INTEGER,                   -- Aus welchem Rezept?
      rewe_product_id TEXT,                -- REWE Produkt-ID
      rewe_product_name TEXT,              -- REWE Produktname
      rewe_price REAL,                     -- REWE Preis
      rewe_package_size TEXT,              -- Packungsgröße bei REWE
      pantry_deducted REAL DEFAULT 0,      -- Bereits aus Vorrat abgezogen
      FOREIGN KEY (shopping_list_id) REFERENCES shopping_lists(id) ON DELETE CASCADE,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL
    );

    -- ============================================
    -- Vorratsschrank
    -- ============================================
    CREATE TABLE IF NOT EXISTS pantry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      ingredient_name TEXT NOT NULL,
      amount REAL NOT NULL,
      unit TEXT,
      category TEXT DEFAULT 'Sonstiges',   -- Lebensmittelkategorie
      expiry_date DATE,                     -- Ablaufdatum (optional)
      notes TEXT,
      is_permanent INTEGER DEFAULT 0,       -- Dauerhaft verfügbar (z.B. Wasser, Salz)
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- ============================================
    -- Kochhistorie
    -- ============================================
    CREATE TABLE IF NOT EXISTS cooking_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      recipe_id INTEGER NOT NULL,          -- HINWEIS: NOT NULL kollidiert mit ON DELETE SET NULL,
                                           -- daher wird cooking_history vor Rezept-Löschung explizit bereinigt
      cooked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      servings INTEGER,
      rating INTEGER,                      -- 1-5 Sterne Bewertung
      notes TEXT,                           -- Notizen zum Kochen
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL
    );

    -- ============================================
    -- Indizes für Performance
    -- ============================================
    CREATE INDEX IF NOT EXISTS idx_recipes_user ON recipes(user_id);
    CREATE INDEX IF NOT EXISTS idx_recipes_favorite ON recipes(user_id, is_favorite);
    CREATE INDEX IF NOT EXISTS idx_recipes_last_cooked ON recipes(user_id, last_cooked_at);
    CREATE INDEX IF NOT EXISTS idx_ingredients_recipe ON ingredients(recipe_id);
    CREATE INDEX IF NOT EXISTS idx_cooking_steps_recipe ON cooking_steps(recipe_id);
    CREATE INDEX IF NOT EXISTS idx_meal_plan_entries_plan ON meal_plan_entries(meal_plan_id);
    CREATE INDEX IF NOT EXISTS idx_shopping_items_list ON shopping_list_items(shopping_list_id);
    CREATE INDEX IF NOT EXISTS idx_pantry_user ON pantry(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pantry_user_ingredient ON pantry(user_id, ingredient_name);
    CREATE INDEX IF NOT EXISTS idx_cooking_history_user ON cooking_history(user_id, cooked_at);

    -- ============================================
    -- Systemeinstellungen (Key-Value)
    -- ============================================
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ============================================
    -- Admin-Aktivitätslog
    -- ============================================
    CREATE TABLE IF NOT EXISTS admin_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_logs(created_at DESC);

    -- ============================================
    -- Zutaten-Icons (Emoji-Mapping)
    -- ============================================
    CREATE TABLE IF NOT EXISTS ingredient_icons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL UNIQUE COLLATE NOCASE,
      emoji TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_ingredient_icons_keyword ON ingredient_icons(keyword);

    -- ============================================
    -- REWE Markt-Einstellungen pro User
    -- ============================================
    CREATE TABLE IF NOT EXISTS user_rewe_settings (
      user_id INTEGER PRIMARY KEY,
      market_id TEXT NOT NULL,
      market_name TEXT,
      zip_code TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- ============================================
    -- REWE Produkt-Präferenzen (merkt sich die manuelle Auswahl)
    -- ============================================
    CREATE TABLE IF NOT EXISTS rewe_product_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      ingredient_name TEXT NOT NULL COLLATE NOCASE,   -- normalisiert (z.B. "butter")
      rewe_product_id TEXT NOT NULL,
      rewe_product_name TEXT NOT NULL,
      rewe_price INTEGER,                             -- Cent, letzter bekannter Preis
      rewe_package_size TEXT,
      rewe_image_url TEXT,
      times_selected INTEGER DEFAULT 1,               -- wie oft gewählt (Vertrauen)
      sort_order INTEGER DEFAULT 0,                   -- Reihenfolge der Favoriten
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, ingredient_name, rewe_product_id)
    );
    CREATE INDEX IF NOT EXISTS idx_rewe_prefs_user ON rewe_product_preferences(user_id);
    CREATE INDEX IF NOT EXISTS idx_rewe_prefs_ingredient ON rewe_product_preferences(user_id, ingredient_name);

    -- ============================================
    -- Sammlungen (Collections)
    -- ============================================
    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '📁',
      color TEXT DEFAULT '#6366f1',
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_collections_user ON collections(user_id);

    -- ============================================
    -- Rezept-Sammlungs-Zuordnung (n:m)
    -- ============================================
    CREATE TABLE IF NOT EXISTS recipe_collections (
      recipe_id INTEGER NOT NULL,
      collection_id INTEGER NOT NULL,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (recipe_id, collection_id),
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
      FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_recipe_collections_collection ON recipe_collections(collection_id);
    CREATE INDEX IF NOT EXISTS idx_recipe_collections_recipe ON recipe_collections(recipe_id);

    -- ============================================
    -- Bring! Einkaufslisten-Verbindung
    -- ============================================
    CREATE TABLE IF NOT EXISTS bring_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      email TEXT NOT NULL,
      password_encrypted TEXT NOT NULL,       -- AES-256-GCM verschlüsselt
      default_list_uuid TEXT,                 -- Standard-Bring!-Liste
      default_list_name TEXT,                 -- Name der Liste (zur Anzeige)
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- ============================================
    -- Zutaten-Aliase (Zusammenfassung ähnlicher Zutaten)
    -- ============================================
    CREATE TABLE IF NOT EXISTS ingredient_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      canonical_name TEXT NOT NULL COLLATE NOCASE,  -- Der Hauptname (z.B. "Gurke-Mini")
      alias_name TEXT NOT NULL COLLATE NOCASE,       -- Die Variante (z.B. "Gurke Mini")
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, alias_name)
    );
    CREATE INDEX IF NOT EXISTS idx_ingredient_aliases_user ON ingredient_aliases(user_id);
    CREATE INDEX IF NOT EXISTS idx_ingredient_aliases_lookup ON ingredient_aliases(user_id, alias_name);

    -- ============================================
    -- Geblockte Zutaten (für Einkaufslisten-Generierung)
    -- ============================================
    CREATE TABLE IF NOT EXISTS blocked_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      ingredient_name TEXT NOT NULL COLLATE NOCASE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, ingredient_name)
    );
    CREATE INDEX IF NOT EXISTS idx_blocked_ingredients_user ON blocked_ingredients(user_id);

    -- ingredient_conversions entfernt – KI-Aggregation ersetzt zutat-spezifische Umrechnungen
    -- Tabelle wird in migrateDatabase() per DROP TABLE entfernt

    -- ============================================
    -- Rezept-Sperren (für Wochenplanung)
    -- ============================================
    CREATE TABLE IF NOT EXISTS recipe_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      recipe_id INTEGER NOT NULL,
      blocked_until DATE NOT NULL,           -- Gesperrt bis (Datum)
      reason TEXT,                            -- Optionaler Grund (z.B. "Kein Kürbis verfügbar")
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
      UNIQUE(user_id, recipe_id)
    );
    CREATE INDEX IF NOT EXISTS idx_recipe_blocks_user ON recipe_blocks(user_id);
    CREATE INDEX IF NOT EXISTS idx_recipe_blocks_until ON recipe_blocks(user_id, blocked_until);

    -- ============================================
    -- Haushalte (Mehrbenutzerbetrieb)
    -- ============================================
    CREATE TABLE IF NOT EXISTS households (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,                     -- z.B. "Zuhause", "WG"
      invite_code TEXT UNIQUE,                -- 8-Zeichen, alphanumerisch
      invite_code_expires_at DATETIME,        -- Ablaufzeitpunkt des Invite-Codes
      created_by INTEGER NOT NULL,            -- Ersteller (bleibt auch bei Leave erhalten)
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_households_invite ON households(invite_code) WHERE invite_code IS NOT NULL;

    -- ============================================
    -- Haushalt-Mitglieder
    -- ============================================
    CREATE TABLE IF NOT EXISTS household_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      household_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      is_default INTEGER DEFAULT 0,           -- Standard-Haushalt dieses Users
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(household_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_household_members_user ON household_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_household_members_household ON household_members(household_id);

    -- ============================================
    -- Haushalt-Aktivitäts-Feed
    -- ============================================
    CREATE TABLE IF NOT EXISTS household_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      household_id INTEGER NOT NULL,
      user_id INTEGER,                        -- NULL wenn User gelöscht
      action TEXT NOT NULL,                   -- z.B. 'recipe:created', 'shopping:checked'
      entity_type TEXT,                       -- z.B. 'recipe', 'shopping_item'
      entity_id INTEGER,
      details TEXT,                            -- JSON mit Zusatzinfos
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_household_activity_household ON household_activity(household_id, created_at DESC);

    -- ============================================
    -- Rezept-Share-Links (Link-basiertes Einzelteilen)
    -- ============================================
    CREATE TABLE IF NOT EXISTS recipe_shares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      share_token TEXT NOT NULL UNIQUE,       -- UUID, nicht erratbar
      created_by INTEGER NOT NULL,
      expires_at DATETIME,                    -- NULL = kein Ablauf
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_recipe_shares_token ON recipe_shares(share_token);

    -- ============================================
    -- KI-Vorratsabzug Logs (für Undo-Unterstützung)
    -- ============================================
    CREATE TABLE IF NOT EXISTS pantry_deductions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meal_plan_entry_id INTEGER NOT NULL,
      ingredient_name TEXT NOT NULL,
      pantry_item_id INTEGER NOT NULL,
      deducted_amount REAL NOT NULL,
      deducted_unit TEXT,
      original_pantry_amount REAL,
      original_pantry_unit TEXT,
      ai_reasoning TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (meal_plan_entry_id) REFERENCES meal_plan_entries(id) ON DELETE CASCADE,
      FOREIGN KEY (pantry_item_id) REFERENCES pantry(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_pantry_deductions_entry ON pantry_deductions(meal_plan_entry_id);
  `);

  // ============================================
  // Migrationen für bestehende Datenbanken
  // ============================================
  migrateDatabase();

  console.log('✅ Datenbank-Schema initialisiert');
}

/**
 * Inkrementelle Migrationen für bestehende DBs
 */
function migrateDatabase() {
  // Spalte 'role' in users hinzufügen (falls nicht vorhanden)
  const userColumns = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!userColumns.includes('role')) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
    console.log('  ↳ Migration: users.role hinzugefügt');
  }
  if (!userColumns.includes('is_active')) {
    db.exec("ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1");
    console.log('  ↳ Migration: users.is_active hinzugefügt');
  }

  // Standard-Einstellungen setzen (falls leer)
  const settingsCount = db.prepare("SELECT COUNT(*) as count FROM settings").get().count;
  if (settingsCount === 0) {
    const defaults = {
      registration_enabled: 'true',
      ai_provider: 'kimi',
      max_upload_size: '10',
      maintenance_mode: 'false',
    };
    const stmt = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
    for (const [key, value] of Object.entries(defaults)) {
      stmt.run(key, value);
    }
    console.log('  ↳ Migration: Standard-Einstellungen erstellt');
  }

  // Migration: max_upload_size_mb → max_upload_size umbenennen
  const oldKey = db.prepare("SELECT value FROM settings WHERE key = 'max_upload_size_mb'").get();
  if (oldKey) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('max_upload_size', ?)").run(oldKey.value);
    db.prepare("DELETE FROM settings WHERE key = 'max_upload_size_mb'").run();
    console.log('  ↳ Migration: max_upload_size_mb → max_upload_size umbenannt');
  }

  // Spalte 'recipe_ids' in shopping_list_items hinzufügen (JSON-Array mit Rezept-IDs)
  const sliCols = db.prepare("PRAGMA table_info(shopping_list_items)").all().map(c => c.name);
  if (!sliCols.includes('recipe_ids')) {
    db.exec("ALTER TABLE shopping_list_items ADD COLUMN recipe_ids TEXT DEFAULT '[]'");
    console.log('  ↳ Migration: shopping_list_items.recipe_ids hinzugefügt');
  }

  // Spalte 'rewe_quantity' in shopping_list_items hinzufügen (Anzahl benötigter Packungen)
  if (!sliCols.includes('rewe_quantity')) {
    db.exec("ALTER TABLE shopping_list_items ADD COLUMN rewe_quantity INTEGER DEFAULT 1");
    console.log('  ↳ Migration: shopping_list_items.rewe_quantity hinzugefügt');
  }

  // Spalte 'rewe_image_url' in shopping_list_items hinzufügen (REWE Produktbild-URL)
  if (!sliCols.includes('rewe_image_url')) {
    db.exec("ALTER TABLE shopping_list_items ADD COLUMN rewe_image_url TEXT");
    console.log('  ↳ Migration: shopping_list_items.rewe_image_url hinzugefügt');
  }

  // Spalte 'source' in shopping_list_items hinzufügen (Herkunft: 'recipe', 'manual', 'bring')
  if (!sliCols.includes('source')) {
    db.exec("ALTER TABLE shopping_list_items ADD COLUMN source TEXT DEFAULT 'recipe'");
    // Bestehende Items ohne Rezept-IDs als manuell markieren
    db.exec("UPDATE shopping_list_items SET source = 'manual' WHERE recipe_ids IS NULL OR recipe_ids = '[]'");
    console.log('  ↳ Migration: shopping_list_items.source hinzugefügt');
  }

  // Spalte 'pantry_note' in shopping_list_items hinzufügen
  // (Hinweis bei inkompatiblen Einheiten zwischen Vorrat und Einkaufsliste)
  if (!sliCols.includes('pantry_note')) {
    db.exec("ALTER TABLE shopping_list_items ADD COLUMN pantry_note TEXT");
    console.log('  ↳ Migration: shopping_list_items.pantry_note hinzugefügt');
  }

  // Spalte 'rewe_image_url' in rewe_product_preferences hinzufügen
  const rppCols = db.prepare("PRAGMA table_info(rewe_product_preferences)").all().map(c => c.name);
  if (!rppCols.includes('rewe_image_url')) {
    db.exec("ALTER TABLE rewe_product_preferences ADD COLUMN rewe_image_url TEXT");
    console.log('  ↳ Migration: rewe_product_preferences.rewe_image_url hinzugefügt');
  }

  // Migration: rewe_product_preferences für Multi-Favoriten umbauen
  // (sort_order hinzufügen, UNIQUE von (user_id, ingredient_name) auf (user_id, ingredient_name, rewe_product_id) ändern)
  try {
    const rppCols2 = db.prepare("PRAGMA table_info(rewe_product_preferences)").all().map(c => c.name);
    if (rppCols2.length > 0 && !rppCols2.includes('sort_order')) {
      const migrateRpp = db.transaction(() => {
        db.exec(`
          CREATE TABLE rewe_product_preferences_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            ingredient_name TEXT NOT NULL COLLATE NOCASE,
            rewe_product_id TEXT NOT NULL,
            rewe_product_name TEXT NOT NULL,
            rewe_price INTEGER,
            rewe_package_size TEXT,
            rewe_image_url TEXT,
            times_selected INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, ingredient_name, rewe_product_id)
          );
          CREATE INDEX idx_rewe_prefs_user_new ON rewe_product_preferences_new(user_id);
          CREATE INDEX idx_rewe_prefs_ingredient_new ON rewe_product_preferences_new(user_id, ingredient_name);
        `);
        // Daten migrieren (neuesten updated_at pro user_id + ingredient_name behalten)
        db.exec(`
          INSERT INTO rewe_product_preferences_new
            (user_id, ingredient_name, rewe_product_id, rewe_product_name, rewe_price, rewe_package_size, rewe_image_url, times_selected, sort_order, created_at, updated_at)
          SELECT user_id, ingredient_name, rewe_product_id, rewe_product_name, rewe_price, rewe_package_size, rewe_image_url, times_selected, 0, created_at, updated_at
          FROM rewe_product_preferences
          WHERE id IN (
            SELECT MAX(id) FROM rewe_product_preferences GROUP BY user_id, ingredient_name
          )
        `);
        db.exec(`
          DROP TABLE rewe_product_preferences;
          ALTER TABLE rewe_product_preferences_new RENAME TO rewe_product_preferences;
        `);
      });
      migrateRpp();
      console.log('  ↳ Migration: rewe_product_preferences für Multi-Favoriten umgebaut');
    }
  } catch (err) {
    console.error('  ↳ Migration rewe_product_preferences fehlgeschlagen:', err.message);
  }

  // Spalte 'reasoning' in meal_plans hinzufügen (KI-/Algorithmus-Begründung)
  const mpCols = db.prepare("PRAGMA table_info(meal_plans)").all().map(c => c.name);
  if (!mpCols.includes('reasoning')) {
    db.exec("ALTER TABLE meal_plans ADD COLUMN reasoning TEXT");
    console.log('  ↳ Migration: meal_plans.reasoning hinzugefügt');
  }

  // Spalte 'is_locked' in meal_plans hinzufügen (Woche fixieren)
  if (!mpCols.includes('is_locked')) {
    db.exec("ALTER TABLE meal_plans ADD COLUMN is_locked INTEGER DEFAULT 0");
    console.log('  ↳ Migration: meal_plans.is_locked hinzugefügt');
  }

  // Standard-Zutaten-Icons seeden (nur wenn Tabelle leer)
  const iconsCount = db.prepare("SELECT COUNT(*) as count FROM ingredient_icons").get().count;
  if (iconsCount === 0) {
    const defaultIcons = [
      // Gemüse
      ['tomate', '🍅'], ['kartoffel', '🥔'], ['karotte', '🥕'], ['möhre', '🥕'],
      ['zwiebel', '🧅'], ['knoblauch', '🧄'], ['paprika', '🫑'], ['gurke', '🥒'],
      ['brokkoli', '🥦'], ['mais', '🌽'], ['pilz', '🍄'], ['champignon', '🍄'],
      ['salat', '🥬'], ['spinat', '🥬'], ['aubergine', '🍆'], ['avocado', '🥑'],
      ['erbse', '🫛'], ['bohne', '🫘'], ['chili', '🌶️'], ['ingwer', '🫚'],
      ['olive', '🫒'], ['zucchini', '🥒'], ['kürbis', '🎃'], ['sellerie', '🥬'],
      ['lauch', '🧅'], ['fenchel', '🌿'], ['radieschen', '🔴'], ['rote bete', '🟣'],
      // Obst
      ['apfel', '🍎'], ['birne', '🍐'], ['orange', '🍊'], ['zitrone', '🍋'],
      ['limette', '🍋'], ['banane', '🍌'], ['erdbeere', '🍓'], ['kirsche', '🍒'],
      ['traube', '🍇'], ['weintraube', '🍇'], ['wassermelone', '🍉'], ['pfirsich', '🍑'],
      ['ananas', '🍍'], ['mango', '🥭'], ['kiwi', '🥝'], ['blaubeere', '🫐'],
      ['heidelbeere', '🫐'], ['himbeere', '🍓'], ['kokosnuss', '🥥'], ['pflaume', '🟣'],
      // Fleisch & Fisch
      ['fleisch', '🥩'], ['rindfleisch', '🥩'], ['schweinefleisch', '🥩'],
      ['hähnchen', '🍗'], ['huhn', '🍗'], ['hühnchen', '🍗'], ['pute', '🍗'],
      ['speck', '🥓'], ['schinken', '🥓'], ['wurst', '🌭'], ['hackfleisch', '🥩'],
      ['fisch', '🐟'], ['lachs', '🐟'], ['thunfisch', '🐟'], ['garnele', '🦐'],
      ['shrimp', '🦐'], ['muschel', '🦪'], ['tintenfisch', '🦑'],
      // Milchprodukte & Eier
      ['ei', '🥚'], ['eier', '🥚'], ['butter', '🧈'], ['käse', '🧀'],
      ['milch', '🥛'], ['sahne', '🥛'], ['joghurt', '🥛'], ['quark', '🥛'],
      ['schmand', '🥛'], ['frischkäse', '🧀'], ['parmesan', '🧀'], ['mozzarella', '🧀'],
      // Getreide & Backwaren
      ['brot', '🍞'], ['brötchen', '🍞'], ['toast', '🍞'], ['reis', '🍚'],
      ['nudel', '🍝'], ['pasta', '🍝'], ['spaghetti', '🍝'], ['mehl', '🌾'],
      ['haferflocken', '🌾'], ['couscous', '🌾'], ['semmel', '🍞'], ['tortilla', '🫓'],
      ['croissant', '🥐'], ['brezel', '🥨'], ['pfannkuchen', '🥞'],
      // Gewürze & Saucen
      ['salz', '🧂'], ['pfeffer', '🧂'], ['zucker', '🍬'], ['honig', '🍯'],
      ['senf', '🟡'], ['ketchup', '🍅'], ['sojasauce', '🥫'], ['essig', '🫙'],
      ['basilikum', '🌿'], ['petersilie', '🌿'], ['oregano', '🌿'], ['thymian', '🌿'],
      ['rosmarin', '🌿'], ['dill', '🌿'], ['koriander', '🌿'], ['zimt', '🟤'],
      ['curry', '🟡'], ['paprikapulver', '🟠'], ['muskat', '🟤'], ['vanille', '🟡'],
      // Nüsse & Öle
      ['nuss', '🥜'], ['walnuss', '🥜'], ['mandel', '🥜'], ['erdnuss', '🥜'],
      ['haselnuss', '🥜'], ['cashew', '🥜'], ['pistazie', '🥜'],
      ['olivenöl', '🫒'], ['öl', '🫒'], ['sonnenblumenöl', '🌻'],
      // Getränke
      ['wasser', '💧'], ['wein', '🍷'], ['weißwein', '🍷'], ['rotwein', '🍷'],
      ['bier', '🍺'], ['kaffee', '☕'], ['tee', '🍵'], ['saft', '🧃'],
      // Sonstiges
      ['schokolade', '🍫'], ['kakao', '🍫'], ['tofu', '🟨'], ['hefe', '🟡'],
      ['gelatine', '🟡'], ['tomatenmark', '🍅'], ['kokosmilch', '🥥'],
    ];
    const stmt = db.prepare("INSERT OR IGNORE INTO ingredient_icons (keyword, emoji) VALUES (?, ?)");
    const insertMany = db.transaction((icons) => {
      for (const [keyword, emoji] of icons) {
        stmt.run(keyword, emoji);
      }
    });
    insertMany(defaultIcons);
    console.log(`  ↳ Migration: ${defaultIcons.length} Standard-Zutaten-Icons erstellt`);
  }

  // Spalte 'rewe_matched_by' in shopping_list_items hinzufügen (Matching-Methode: 'ai' oder 'fallback')
  const sliColsLatest = db.prepare("PRAGMA table_info(shopping_list_items)").all().map(c => c.name);
  if (!sliColsLatest.includes('rewe_matched_by')) {
    db.exec("ALTER TABLE shopping_list_items ADD COLUMN rewe_matched_by TEXT");
    console.log('  ↳ Migration: shopping_list_items.rewe_matched_by hinzugefügt');
  }

  // Spalte 'rewe_match_reason' in shopping_list_items hinzufügen (KI-Begründung für Produktwahl)
  if (!sliColsLatest.includes('rewe_match_reason')) {
    db.exec("ALTER TABLE shopping_list_items ADD COLUMN rewe_match_reason TEXT");
    console.log('  ↳ Migration: shopping_list_items.rewe_match_reason hinzugefügt');
  }

  // Spalte 'rewe_search_query' in shopping_list_items hinzufügen (tatsächlich verwendeter Suchbegriff bei Alternativsuche)
  if (!sliColsLatest.includes('rewe_search_query')) {
    db.exec("ALTER TABLE shopping_list_items ADD COLUMN rewe_search_query TEXT");
    console.log('  ↳ Migration: shopping_list_items.rewe_search_query hinzugefügt');
  }

  // Spalte 'api_key' in users hinzufügen (dauerhafter API-Key für Userscript-Auth)
  const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!userCols.includes('api_key')) {
    db.exec("ALTER TABLE users ADD COLUMN api_key TEXT");
    console.log('  ↳ Migration: users.api_key hinzugefügt');
  }

  // UNIQUE Index auf api_key (Performance + Schutz gegen Duplikate)
  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key) WHERE api_key IS NOT NULL");
  } catch { /* Index existiert bereits */ }

  // ingredient_conversions Tabelle entfernen (nicht mehr benötigt – KI-Aggregation ersetzt zutat-spezifische Umrechnungen)
  try {
    db.exec("DROP TABLE IF EXISTS ingredient_conversions");
    console.log('  ↳ Migration: ingredient_conversions Tabelle entfernt');
  } catch { /* Tabelle existiert möglicherweise nicht */ }

  // Nährwert-Spalten in recipes hinzufügen (KI-geschätzt, pro Portion)
  const recipeCols = db.prepare("PRAGMA table_info(recipes)").all().map(c => c.name);
  if (!recipeCols.includes('calories')) {
    db.exec("ALTER TABLE recipes ADD COLUMN calories REAL DEFAULT NULL");
    console.log('  ↳ Migration: recipes.calories hinzugefügt');
  }
  if (!recipeCols.includes('protein')) {
    db.exec("ALTER TABLE recipes ADD COLUMN protein REAL DEFAULT NULL");
    console.log('  ↳ Migration: recipes.protein hinzugefügt');
  }
  if (!recipeCols.includes('carbs')) {
    db.exec("ALTER TABLE recipes ADD COLUMN carbs REAL DEFAULT NULL");
    console.log('  ↳ Migration: recipes.carbs hinzugefügt');
  }
  if (!recipeCols.includes('fat')) {
    db.exec("ALTER TABLE recipes ADD COLUMN fat REAL DEFAULT NULL");
    console.log('  ↳ Migration: recipes.fat hinzugefügt');
  }
  if (!recipeCols.includes('nutrition_note')) {
    db.exec("ALTER TABLE recipes ADD COLUMN nutrition_note TEXT DEFAULT NULL");
    console.log('  ↳ Migration: recipes.nutrition_note hinzugefügt');
  }
  if (!recipeCols.includes('nutrition_details')) {
    db.exec("ALTER TABLE recipes ADD COLUMN nutrition_details TEXT DEFAULT NULL");
    console.log('  ↳ Migration: recipes.nutrition_details hinzugefügt');
  }

  // ============================================
  // Household-Migrationen: household_id-Spalten hinzufügen
  // ============================================

  // recipes.household_id – NULL = privat, gesetzt = Haushalt-Rezept
  if (!recipeCols.includes('household_id')) {
    db.exec("ALTER TABLE recipes ADD COLUMN household_id INTEGER REFERENCES households(id) ON DELETE SET NULL");
    db.exec("CREATE INDEX IF NOT EXISTS idx_recipes_household ON recipes(household_id)");
    console.log('  ↳ Migration: recipes.household_id hinzugefügt');
  }

  // recipes.created_by_user_id – Ersteller (für Haushalt-Kontext, wer hat das Rezept erstellt)
  if (!recipeCols.includes('created_by_user_id')) {
    db.exec("ALTER TABLE recipes ADD COLUMN created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL");
    // Bestehende Rezepte: created_by_user_id = user_id
    db.exec("UPDATE recipes SET created_by_user_id = user_id WHERE created_by_user_id IS NULL");
    console.log('  ↳ Migration: recipes.created_by_user_id hinzugefügt');
  }

  // categories.household_id
  const catCols = db.prepare("PRAGMA table_info(categories)").all().map(c => c.name);
  if (!catCols.includes('household_id')) {
    db.exec("ALTER TABLE categories ADD COLUMN household_id INTEGER REFERENCES households(id) ON DELETE SET NULL");
    db.exec("CREATE INDEX IF NOT EXISTS idx_categories_household ON categories(household_id)");
    console.log('  ↳ Migration: categories.household_id hinzugefügt');
  }

  // collections.household_id
  const collCols = db.prepare("PRAGMA table_info(collections)").all().map(c => c.name);
  if (!collCols.includes('household_id')) {
    db.exec("ALTER TABLE collections ADD COLUMN household_id INTEGER REFERENCES households(id) ON DELETE SET NULL");
    db.exec("CREATE INDEX IF NOT EXISTS idx_collections_household ON collections(household_id)");
    console.log('  ↳ Migration: collections.household_id hinzugefügt');
  }

  // meal_plans.household_id
  if (!mpCols.includes('household_id')) {
    db.exec("ALTER TABLE meal_plans ADD COLUMN household_id INTEGER REFERENCES households(id) ON DELETE SET NULL");
    db.exec("CREATE INDEX IF NOT EXISTS idx_meal_plans_household ON meal_plans(household_id)");
    console.log('  ↳ Migration: meal_plans.household_id hinzugefügt');
  }

  // shopping_lists.household_id
  const slCols = db.prepare("PRAGMA table_info(shopping_lists)").all().map(c => c.name);
  if (!slCols.includes('household_id')) {
    db.exec("ALTER TABLE shopping_lists ADD COLUMN household_id INTEGER REFERENCES households(id) ON DELETE SET NULL");
    db.exec("CREATE INDEX IF NOT EXISTS idx_shopping_lists_household ON shopping_lists(household_id)");
    console.log('  ↳ Migration: shopping_lists.household_id hinzugefügt');
  }

  // pantry.household_id
  const pantryCols = db.prepare("PRAGMA table_info(pantry)").all().map(c => c.name);
  if (!pantryCols.includes('household_id')) {
    db.exec("ALTER TABLE pantry ADD COLUMN household_id INTEGER REFERENCES households(id) ON DELETE SET NULL");
    db.exec("CREATE INDEX IF NOT EXISTS idx_pantry_household ON pantry(household_id)");
    console.log('  ↳ Migration: pantry.household_id hinzugefügt');
  }

  // ingredient_aliases.household_id
  const iaCols = db.prepare("PRAGMA table_info(ingredient_aliases)").all().map(c => c.name);
  if (!iaCols.includes('household_id')) {
    db.exec("ALTER TABLE ingredient_aliases ADD COLUMN household_id INTEGER REFERENCES households(id) ON DELETE SET NULL");
    console.log('  ↳ Migration: ingredient_aliases.household_id hinzugefügt');
  }

  // blocked_ingredients.household_id
  const biCols = db.prepare("PRAGMA table_info(blocked_ingredients)").all().map(c => c.name);
  if (!biCols.includes('household_id')) {
    db.exec("ALTER TABLE blocked_ingredients ADD COLUMN household_id INTEGER REFERENCES households(id) ON DELETE SET NULL");
    console.log('  ↳ Migration: blocked_ingredients.household_id hinzugefügt');
  }

  // recipe_blocks.household_id
  const rbCols = db.prepare("PRAGMA table_info(recipe_blocks)").all().map(c => c.name);
  if (!rbCols.includes('household_id')) {
    db.exec("ALTER TABLE recipe_blocks ADD COLUMN household_id INTEGER REFERENCES households(id) ON DELETE SET NULL");
    console.log('  ↳ Migration: recipe_blocks.household_id hinzugefügt');
  }

  // ============================================
  // User-Settings Tabelle (Key-Value pro User)
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER NOT NULL,
      household_id INTEGER,
      key TEXT NOT NULL,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // ============================================
  // Household-Settings Tabelle (Key-Value pro Haushalt)
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS household_settings (
      household_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (household_id, key),
      FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
    )
  `);

  // Spalte 'score' und 'breakdown' in meal_plan_entries hinzufügen (Scoring-Transparenz)
  const mpeColsScore = db.prepare("PRAGMA table_info(meal_plan_entries)").all().map(c => c.name);
  if (!mpeColsScore.includes('score')) {
    db.exec("ALTER TABLE meal_plan_entries ADD COLUMN score INTEGER");
    console.log('  ↳ Migration: meal_plan_entries.score hinzugefügt');
  }
  if (!mpeColsScore.includes('breakdown')) {
    db.exec("ALTER TABLE meal_plan_entries ADD COLUMN breakdown TEXT");
    console.log('  ↳ Migration: meal_plan_entries.breakdown hinzugefügt');
  }

  // Spalte 'dedup_note' in shopping_list_items hinzufügen (KI-Deduplizierungs-Info)
  const sliColsDedup = db.prepare("PRAGMA table_info(shopping_list_items)").all().map(c => c.name);
  if (!sliColsDedup.includes('dedup_note')) {
    db.exec("ALTER TABLE shopping_list_items ADD COLUMN dedup_note TEXT");
    console.log('  ↳ Migration: shopping_list_items.dedup_note hinzugefügt');
  }

  // Spalte 'ai_review_issues' in shopping_lists hinzufügen (JSON mit KI-Review-Ergebnissen)
   const slColsReview = db.prepare("PRAGMA table_info(shopping_lists)").all().map(c => c.name);
  if (!slColsReview.includes('ai_review_issues')) {
    db.exec("ALTER TABLE shopping_lists ADD COLUMN ai_review_issues TEXT");
    console.log('  ↳ Migration: shopping_lists.ai_review_issues hinzugefügt');
  }

  // ============================================
  // Tageszeit-Flag für Kategorien
  // ============================================
  const catColsMealTime = db.prepare("PRAGMA table_info(categories)").all().map(c => c.name);
  if (!catColsMealTime.includes('is_meal_time')) {
    db.exec("ALTER TABLE categories ADD COLUMN is_meal_time INTEGER DEFAULT 0");
    // Standard-Tageszeit-Kategorien markieren (Frühstück, Mittagessen, Abendessen, Snack)
    db.exec(`
      UPDATE categories SET is_meal_time = 1
      WHERE name IN ('Frühstück', 'Mittagessen', 'Abendessen', 'Snack')
    `);
    console.log('  ↳ Migration: categories.is_meal_time hinzugefügt');
  }

  // ============================================
  // Duplikate in categories bereinigen + UNIQUE Constraint
  // ============================================
  // Prüfen ob UNIQUE-Index schon existiert
  const hasUniqueIdx = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_categories_unique_name'"
  ).get();

  if (!hasUniqueIdx) {
    console.log('  ↳ Migration: Duplikate in categories bereinigen...');

    // 1. Duplikate finden (gleicher Name pro user_id + household_id, case-insensitive)
    //    Behalte jeweils die Kategorie mit der niedrigsten ID (= älteste)
    const dupes = db.prepare(`
      SELECT c.id, c.user_id, c.name, c.household_id
      FROM categories c
      WHERE c.id NOT IN (
        SELECT MIN(c2.id)
        FROM categories c2
        GROUP BY c2.user_id, LOWER(c2.name), COALESCE(c2.household_id, 0)
      )
    `).all();

    if (dupes.length > 0) {
      console.log(`    → ${dupes.length} Duplikat(e) gefunden, bereinige...`);

      // 2. recipe_categories-Referenzen von Duplikaten auf die "primäre" Kategorie umhängen
      const findPrimary = db.prepare(`
        SELECT MIN(id) as primary_id FROM categories
        WHERE user_id = ? AND LOWER(name) = LOWER(?) AND COALESCE(household_id, 0) = COALESCE(?, 0)
      `);
      const updateRef = db.prepare(`
        UPDATE OR IGNORE recipe_categories SET category_id = ? WHERE category_id = ?
      `);
      const deleteOrphanRef = db.prepare(`
        DELETE FROM recipe_categories WHERE category_id = ?
      `);
      const deleteDupe = db.prepare(`DELETE FROM categories WHERE id = ?`);

      for (const dupe of dupes) {
        const primary = findPrimary.get(dupe.user_id, dupe.name, dupe.household_id);
        if (primary) {
          updateRef.run(primary.primary_id, dupe.id);
          // Falls UPDATE OR IGNORE wegen PK-Konflikt ignoriert wurde, verwaiste Referenzen löschen
          deleteOrphanRef.run(dupe.id);
        }
        deleteDupe.run(dupe.id);
      }
      console.log(`    → Duplikate bereinigt`);
    }

    // 3. UNIQUE Index erstellen (case-insensitive via COLLATE NOCASE)
    db.exec(`
      CREATE UNIQUE INDEX idx_categories_unique_name
      ON categories (user_id, name COLLATE NOCASE, COALESCE(household_id, 0))
    `);
    console.log('  ↳ Migration: UNIQUE Index auf categories (user_id, name, household_id) erstellt');
  }

  // ============================================
  // meal_plan_entries: meal_type → category_id Vereinigung
  // ============================================
  const mpeColsCatId = db.prepare("PRAGMA table_info(meal_plan_entries)").all().map(c => c.name);
  if (!mpeColsCatId.includes('category_id')) {
    console.log('  ↳ Migration: meal_plan_entries.category_id hinzufügen + Datenmigration...');

    // 1. Spalte hinzufügen (nullable zunächst)
    db.exec("ALTER TABLE meal_plan_entries ADD COLUMN category_id INTEGER REFERENCES categories(id)");

    // 2. Mapping von alten meal_type-Strings auf Kategorie-Namen
    const MEAL_TYPE_TO_CATEGORY = {
      fruehstueck: 'Frühstück',
      mittag: 'Mittagessen',
      abendessen: 'Abendessen',
      snack: 'Snack',
    };

    // 3. Alle Einträge mit ihrem meal_plan → user_id laden
    const entries = db.prepare(`
      SELECT mpe.id, mpe.meal_type, mp.user_id, mp.household_id
      FROM meal_plan_entries mpe
      JOIN meal_plans mp ON mp.id = mpe.meal_plan_id
      WHERE mpe.category_id IS NULL
    `).all();

    if (entries.length > 0) {
      const findCategory = db.prepare(`
        SELECT id FROM categories
        WHERE user_id = ? AND LOWER(name) = LOWER(?)
          AND COALESCE(household_id, 0) = COALESCE(?, 0)
          AND is_meal_time = 1
        LIMIT 1
      `);

      const createCategory = db.prepare(`
        INSERT OR IGNORE INTO categories (user_id, name, icon, color, sort_order, household_id, is_meal_time)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `);

      const updateEntry = db.prepare(`
        UPDATE meal_plan_entries SET category_id = ? WHERE id = ?
      `);

      // Default-Werte für fehlende Kategorien
      const CATEGORY_DEFAULTS = {
        'Frühstück':    { icon: '🌅', color: '#f59e0b', sort_order: 1 },
        'Mittagessen':  { icon: '☀️', color: '#10b981', sort_order: 2 },
        'Abendessen':   { icon: '🌙', color: '#6366f1', sort_order: 3 },
        'Snack':        { icon: '🍿', color: '#ec4899', sort_order: 4 },
      };

      let migrated = 0;
      let created = 0;
      for (const entry of entries) {
        const categoryName = MEAL_TYPE_TO_CATEGORY[entry.meal_type] || 'Mittagessen';
        let cat = findCategory.get(entry.user_id, categoryName, entry.household_id);

        if (!cat) {
          // Kategorie existiert nicht für diesen User → erstellen
          const defaults = CATEGORY_DEFAULTS[categoryName] || CATEGORY_DEFAULTS['Mittagessen'];
          createCategory.run(
            entry.user_id, categoryName, defaults.icon, defaults.color,
            defaults.sort_order, entry.household_id
          );
          cat = findCategory.get(entry.user_id, categoryName, entry.household_id);
          created++;
        }

        if (cat) {
          updateEntry.run(cat.id, entry.id);
          migrated++;
        }
      }
      console.log(`    → ${migrated} Einträge migriert, ${created} fehlende Kategorien erstellt`);
    }

    // 4. Verbleibende NULLs abfangen (sollte nicht vorkommen, aber sicherheitshalber)
    const nullCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM meal_plan_entries WHERE category_id IS NULL"
    ).get().cnt;
    if (nullCount > 0) {
      console.warn(`    ⚠ ${nullCount} Einträge ohne category_id — werden entfernt`);
      db.exec("DELETE FROM meal_plan_entries WHERE category_id IS NULL");
    }

    console.log('  ↳ Migration: meal_plan_entries.category_id fertig');
  }

  // ─── meal_plans: start_date + end_date (freie Datumsbereiche) ───
  if (!mpCols.includes('start_date')) {
    console.log('  ↳ Migration: meal_plans → start_date/end_date hinzufügen...');
    db.exec("ALTER TABLE meal_plans ADD COLUMN start_date DATE");
    db.exec("ALTER TABLE meal_plans ADD COLUMN end_date DATE");
    // Bestehende Pläne migrieren: week_start → start_date, week_start+6 → end_date
    db.exec(`
      UPDATE meal_plans
      SET start_date = week_start,
          end_date = date(week_start, '+6 days')
      WHERE start_date IS NULL AND week_start IS NOT NULL
    `);
    console.log('  ↳ Migration: meal_plans.start_date/end_date fertig');
  }

  // Spalte 'color' in meal_plans hinzufügen (Plan-Farbe für Kalender-Ansicht)
  if (!mpCols.includes('color')) {
    db.exec("ALTER TABLE meal_plans ADD COLUMN color TEXT");
    console.log('  ↳ Migration: meal_plans.color hinzugefügt');
  }

  // ─── meal_plan_entries: plan_date (konkretes Datum statt day_of_week) ───
  const mpeCols2 = db.prepare("PRAGMA table_info(meal_plan_entries)").all().map(c => c.name);
  if (!mpeCols2.includes('plan_date')) {
    console.log('  ↳ Migration: meal_plan_entries → plan_date hinzufügen...');
    db.exec("ALTER TABLE meal_plan_entries ADD COLUMN plan_date DATE");
    // Bestehende Entries migrieren: week_start + day_of_week → plan_date
    db.exec(`
      UPDATE meal_plan_entries
      SET plan_date = date(
        (SELECT week_start FROM meal_plans WHERE id = meal_plan_entries.meal_plan_id),
        '+' || day_of_week || ' days'
      )
      WHERE plan_date IS NULL
    `);
    // Einträge ohne plan_date entfernen (verwaiste Entries ohne gültigen Plan)
    const nullDateCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM meal_plan_entries WHERE plan_date IS NULL"
    ).get().cnt;
    if (nullDateCount > 0) {
      console.warn(`    ⚠ ${nullDateCount} Einträge ohne plan_date — werden entfernt`);
      db.exec("DELETE FROM meal_plan_entries WHERE plan_date IS NULL");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_mpe_plan_date ON meal_plan_entries(plan_date)");
    console.log('  ↳ Migration: meal_plan_entries.plan_date fertig');
  }
}

/**
 * Standard-Kategorien für neue Benutzer anlegen
 */
export function createDefaultCategories(userId, householdId = null) {
  const defaultCategories = [
    { name: 'Frühstück', icon: '🌅', color: '#f59e0b', sort_order: 1, is_meal_time: 1 },
    { name: 'Mittagessen', icon: '☀️', color: '#10b981', sort_order: 2, is_meal_time: 1 },
    { name: 'Abendessen', icon: '🌙', color: '#6366f1', sort_order: 3, is_meal_time: 1 },
    { name: 'Snack', icon: '🍿', color: '#ec4899', sort_order: 4, is_meal_time: 1 },
    { name: 'Dessert', icon: '🍰', color: '#f43f5e', sort_order: 5, is_meal_time: 0 },
    { name: 'Getränke', icon: '🥤', color: '#06b6d4', sort_order: 6, is_meal_time: 0 },
  ];

  const stmt = db.prepare(
    'INSERT OR IGNORE INTO categories (user_id, name, icon, color, sort_order, household_id, is_meal_time) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  for (const cat of defaultCategories) {
    stmt.run(userId, cat.name, cat.icon, cat.color, cat.sort_order, householdId, cat.is_meal_time);
  }
}

/**
 * Haushalt-Hilfsfunktionen
 * Werden von Routes und Middleware verwendet.
 */

/**
 * Gibt den Standard-Haushalt eines Users zurück (oder null).
 */
export function getDefaultHousehold(userId) {
  return db.prepare(`
    SELECT h.* FROM households h
    JOIN household_members hm ON h.id = hm.household_id
    WHERE hm.user_id = ? AND hm.is_default = 1
    LIMIT 1
  `).get(userId) || null;
}

/**
 * Prüft ob ein User Mitglied eines Haushalts ist.
 */
export function isHouseholdMember(userId, householdId) {
  return !!db.prepare(
    'SELECT 1 FROM household_members WHERE user_id = ? AND household_id = ?'
  ).get(userId, householdId);
}

/**
 * Gibt alle Haushalt-IDs zurück, in denen ein User Mitglied ist.
 */
export function getUserHouseholdIds(userId) {
  return db.prepare(
    'SELECT household_id FROM household_members WHERE user_id = ?'
  ).all(userId).map(r => r.household_id);
}

/**
 * Erzeugt die WHERE-Bedingung für Haushalt-aware Queries.
 * Gibt { clause, params } zurück.
 *
 * Logik:
 * - Wenn householdId gesetzt: (user_id = ? AND household_id IS NULL) OR household_id = ?
 *   → Eigene private + Haushalt-Daten
 * - Wenn kein Haushalt: user_id = ?
 *   → Nur eigene Daten (Rückwärtskompatibel)
 */
export function householdWhereClause(userId, householdId, tableAlias = '') {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  if (householdId) {
    return {
      clause: `(${prefix}user_id = ? AND ${prefix}household_id IS NULL) OR ${prefix}household_id = ?`,
      params: [userId, householdId],
    };
  }
  return {
    clause: `${prefix}user_id = ?`,
    params: [userId],
  };
}

/**
 * Gibt die Tageszeit-Kategorien (is_meal_time=1) für einen User/Haushalt zurück.
 * Sortiert nach sort_order. Im Haushalt-Kontext werden Duplikate nach Name dedupliziert
 * (bevorzugt die eigene Kategorie des anfragenden Users).
 */
export function getMealTimeCategories(userId, householdId = null) {
  const { clause, params } = householdWhereClause(userId, householdId);
  const categories = db.prepare(`
    SELECT id, name, icon, color, sort_order, user_id
    FROM categories
    WHERE (${clause}) AND is_meal_time = 1
    ORDER BY sort_order, id
  `).all(...params);

  // Im Haushalt-Kontext: Duplikate nach Name deduplizieren
  if (householdId) {
    const deduped = new Map();
    for (const cat of categories) {
      const key = cat.name.toLowerCase().trim();
      if (!deduped.has(key)) {
        deduped.set(key, cat);
      } else if (cat.user_id === userId) {
        // Eigene Kategorie bevorzugen
        deduped.set(key, cat);
      }
    }
    return [...deduped.values()].map(({ user_id, ...rest }) => rest);
  }

  return categories.map(({ user_id, ...rest }) => rest);
}

/**
 * Gibt eine einzelne Kategorie zurück und prüft, ob sie zum User/Haushalt gehört
 * und is_meal_time=1 hat (falls mealTimeOnly=true).
 *
 * Im Haushalt-Kontext werden auch private Kategorien anderer Mitglieder akzeptiert,
 * da diese in geteilten Wochenplänen referenziert werden können.
 */
export function getCategoryForUser(categoryId, userId, householdId = null, mealTimeOnly = true) {
  const mealTimeFilter = mealTimeOnly ? ' AND is_meal_time = 1' : '';

  if (householdId) {
    // Tolerant: eigene private + Haushalt-Kategorien + private Kategorien anderer Mitglieder
    return db.prepare(`
      SELECT id, name, icon, color, sort_order, is_meal_time
      FROM categories
      WHERE id = ?${mealTimeFilter}
        AND (
          (user_id = ? AND household_id IS NULL)
          OR household_id = ?
          OR (household_id IS NULL AND user_id IN (
            SELECT user_id FROM household_members WHERE household_id = ?
          ))
        )
    `).get(categoryId, userId, householdId, householdId) || null;
  }

  // Kein Haushalt: nur eigene Kategorien
  return db.prepare(`
    SELECT id, name, icon, color, sort_order, is_meal_time
    FROM categories
    WHERE id = ? AND user_id = ?${mealTimeFilter}
  `).get(categoryId, userId) || null;
}

export default db;
