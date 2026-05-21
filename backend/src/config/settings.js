/**
 * ============================================
 * Runtime-Einstellungen (DB + Env-Fallback)
 * ============================================
 * Liest Einstellungen aus der Datenbank (settings-Tabelle).
 * Fällt auf Umgebungsvariablen zurück, wenn in der DB nichts steht.
 *
 * Verwendung:
 *   import { getSetting, getAiConfig, getReweConfig } from './settings.js';
 *   const provider = getSetting('ai_provider', 'kimi');
 */

import db from './database.js';

/**
 * Einzelne Einstellung lesen (DB → Env → Default)
 */
export function getSetting(key, fallback = '') {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    if (row && row.value !== null && row.value !== '') return row.value;
  } catch { /* DB noch nicht initialisiert — Fallback nutzen */ }
  return fallback;
}

/**
 * Einstellung speichern
 */
export function setSetting(key, value) {
  db.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP"
  ).run(key, String(value));
}

/**
 * Alle Einstellungen als Objekt lesen
 */
export function getAllSettings() {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const map = {};
    for (const row of rows) map[row.key] = row.value;
    return map;
  } catch {
    return {};
  }
}

/**
 * KI-Konfiguration zusammenbauen
 * Priorität: DB-Einstellung > Umgebungsvariable > Default
 */
export function getAiConfig() {
  const env = process.env;

  const provider = getSetting('ai_provider', env.AI_PROVIDER || 'kimi');

  return {
    provider,
    kimi: {
      apiKey:  getSetting('kimi_api_key',  env.KIMI_API_KEY || ''),
      baseUrl: getSetting('kimi_base_url', env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1'),
      model:   getSetting('kimi_model',    env.KIMI_MODEL || 'kimi-k2.5'),
      simpleModel: getSetting('kimi_simple_model', env.KIMI_SIMPLE_MODEL || 'kimi-k2.5'),
    },
    openai: {
      apiKey: getSetting('openai_api_key', env.OPENAI_API_KEY || ''),
      model:  getSetting('openai_model',   env.OPENAI_MODEL || 'gpt-4o'),
      simpleModel: getSetting('openai_simple_model', env.OPENAI_SIMPLE_MODEL || 'gpt-4o-mini'),
    },
    anthropic: {
      apiKey: getSetting('anthropic_api_key', env.ANTHROPIC_API_KEY || ''),
      model:  getSetting('anthropic_model',   env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'),
      simpleModel: getSetting('anthropic_simple_model', env.ANTHROPIC_SIMPLE_MODEL || 'claude-haiku-4-20250414'),
    },
    ollama: {
      baseUrl: getSetting('ollama_base_url', env.OLLAMA_BASE_URL || 'http://localhost:11434'),
      model:   getSetting('ollama_model',    env.OLLAMA_MODEL || 'llava'),
      simpleModel: getSetting('ollama_simple_model', env.OLLAMA_SIMPLE_MODEL || ''),
    },
    requesty: {
      apiKey:  getSetting('requesty_api_key',  env.REQUESTY_API_KEY || ''),
      baseUrl: getSetting('requesty_base_url', env.REQUESTY_BASE_URL || 'https://router.requesty.ai/v1'),
      model:   getSetting('requesty_model',    env.REQUESTY_MODEL || 'gpt-4o'),
      simpleModel: getSetting('requesty_simple_model', env.REQUESTY_SIMPLE_MODEL || 'gpt-4o-mini'),
    },
  };
}

/**
 * Prüft ob die REWE-Integration vom Admin aktiviert ist
 */
export function isReweEnabled() {
  return getSetting('rewe_enabled', 'true') === 'true';
}

/**
 * Einzelne Haushalt-Einstellung lesen
 */
export function getHouseholdSetting(householdId, key, fallback = '') {
  if (!householdId) return fallback;
  try {
    const row = db.prepare('SELECT value FROM household_settings WHERE household_id = ? AND key = ?').get(householdId, key);
    if (row && row.value !== null && row.value !== '') return row.value;
  } catch { /* Tabelle noch nicht initialisiert */ }
  return fallback;
}

/**
 * Haushalt-Einstellung speichern
 */
export function setHouseholdSetting(householdId, key, value) {
  if (!householdId) return;
  db.prepare(
    'INSERT OR REPLACE INTO household_settings (household_id, key, value, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)'
  ).run(householdId, key, String(value));
}

/**
 * Alle Haushalt-Einstellungen als Objekt lesen
 */
export function getAllHouseholdSettings(householdId) {
  if (!householdId) return {};
  try {
    const rows = db.prepare('SELECT key, value FROM household_settings WHERE household_id = ?').all(householdId);
    const map = {};
    for (const row of rows) map[row.key] = row.value;
    return map;
  } catch {
    return {};
  }
}

/**
 * REWE-Konfiguration für einen bestimmten User
 * Jeder User muss seinen eigenen Markt konfigurieren.
 */
export function getUserReweConfig(userId) {
  try {
    const row = db.prepare('SELECT market_id, market_name, zip_code FROM user_rewe_settings WHERE user_id = ?').get(userId);
    if (row && row.market_id) {
      return {
        marketId: row.market_id,
        marketName: row.market_name || '',
        zipCode: row.zip_code || '',
      };
    }
  } catch { /* Tabelle existiert evtl. noch nicht */ }
  return { marketId: '', marketName: '', zipCode: '' };
}
