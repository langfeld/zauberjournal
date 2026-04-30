/**
 * ============================================
 * Admin Routen - Verwaltungsoberfläche
 * ============================================
 * Nur für Benutzer mit role='admin' zugänglich.
 * - Dashboard-Statistiken
 * - Benutzerverwaltung
 * - Globale Kategorien
 * - Systemeinstellungen
 */

import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import db, { getMealTimeCategories } from '../config/database.js';
import { readdirSync, statSync, unlinkSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import sharp from 'sharp';
import { config } from '../config/env.js';
import { safePath, generateId, sanitize, validateDate } from '../utils/helpers.js';
import { resetProvider } from '../services/ai/provider.js';

/**
 * Generiert ein sicheres Zufallspasswort (16 Zeichen, alphanumerisch + Sonderzeichen).
 * Wird für automatisch angelegte Benutzer beim Import verwendet.
 */
function generateRandomPassword(length = 16) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*';
  const bytes = randomBytes(length);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

// Erlaubte Einstellungs-Keys (verhindert Injection beliebiger Keys)
const ALLOWED_SETTINGS = new Set([
  // Allgemein
  'registration_enabled',
  'maintenance_mode',
  'max_upload_size',
  // KI-Provider
  'ai_provider',
  'kimi_api_key',
  'kimi_base_url',
  'kimi_model',
  'kimi_simple_model',
  'kimi_recipe_instant',
  'ai_shopping_review_instant',
  'openai_api_key',
  'openai_model',
  'anthropic_api_key',
  'anthropic_model',
  'ollama_base_url',
  'ollama_model',
  'requesty_api_key',
  'requesty_base_url',
  'requesty_model',
  'requesty_simple_model',
  // Vorratsabzug
  'ai_pantry_deduction',
  'ai_pantry_deduction_instant',
  // Vorrats-Transfer
  'ai_pantry_transfer',
  'ai_pantry_transfer_instant',
  // REWE
  'rewe_enabled',
  // Haushalte
  'max_household_members',
  'max_households_per_user',
]);

export default async function adminRoutes(fastify) {

  // ============================================
  // Helper: Admin-Aktion loggen
  // ============================================
  function logAdminAction(userId, action, details = null) {
    try {
      db.prepare('INSERT INTO admin_logs (user_id, action, details) VALUES (?, ?, ?)').run(userId, action, details);
    } catch { /* Logging-Fehler ignorieren */ }
  }

  // ============================================
  // Alle Admin-Routen erfordern Admin-Rolle
  // ============================================
  fastify.addHook('onRequest', async function (request, reply) {
    return fastify.requireAdmin(request, reply);
  });

  // ============================================
  // GET /api/admin/stats - Dashboard-Statistiken
  // ============================================
  fastify.get('/stats', {
    schema: {
      description: 'Admin-Statistiken abrufen',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
    },
  }, async () => {
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const activeUserCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1').get().count;
    const recipeCount = db.prepare('SELECT COUNT(*) as count FROM recipes').get().count;
    const aiRecipeCount = db.prepare('SELECT COUNT(*) as count FROM recipes WHERE ai_generated = 1').get().count;
    const mealPlanCount = db.prepare('SELECT COUNT(*) as count FROM meal_plans').get().count;
    const shoppingListCount = db.prepare('SELECT COUNT(*) as count FROM shopping_lists').get().count;
    const pantryItemCount = db.prepare('SELECT COUNT(*) as count FROM pantry').get().count;
    const cookingCount = db.prepare('SELECT COUNT(*) as count FROM cooking_history').get().count;
    const rewePrefsCount = db.prepare('SELECT COUNT(*) as count FROM rewe_product_preferences').get().count;
    const aliasCount = db.prepare('SELECT COUNT(*) as count FROM ingredient_aliases').get().count;
    const recipeBlockCount = db.prepare('SELECT COUNT(*) as count FROM recipe_blocks').get().count;
    const blockedIngredientCount = db.prepare('SELECT COUNT(*) as count FROM blocked_ingredients').get().count;
    const collectionCount = db.prepare('SELECT COUNT(*) as count FROM collections').get().count;

    // Haushalt-Statistiken
    const householdCount = db.prepare('SELECT COUNT(*) as count FROM households').get().count;
    const householdMemberCount = db.prepare('SELECT COUNT(*) as count FROM household_members').get().count;
    const avgMembersPerHousehold = householdCount > 0
      ? +(householdMemberCount / householdCount).toFixed(1)
      : 0;

    // Aktivste Haushalte (nach Aktivitäts-Log-Einträgen)
    const mostActiveHouseholds = db.prepare(`
      SELECT h.id, h.name,
        (SELECT COUNT(*) FROM household_members WHERE household_id = h.id) as member_count,
        COUNT(ha.id) as activity_count
      FROM households h
      LEFT JOIN household_activity ha ON h.id = ha.household_id
      GROUP BY h.id
      ORDER BY activity_count DESC
      LIMIT 5
    `).all();

    // Top 10 beliebteste Rezepte
    const popularRecipes = db.prepare(`
      SELECT r.id, r.title, r.times_cooked, r.is_favorite, u.username as author
      FROM recipes r
      JOIN users u ON r.user_id = u.id
      ORDER BY r.times_cooked DESC
      LIMIT 10
    `).all();

    // Neueste Benutzer
    const recentUsers = db.prepare(`
      SELECT id, username, display_name, created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 5
    `).all();

    // Aktivität letzte 7 Tage
    const weekActivity = db.prepare(`
      SELECT DATE(cooked_at) as date, COUNT(*) as count
      FROM cooking_history
      WHERE cooked_at >= DATE('now', '-7 days')
      GROUP BY DATE(cooked_at)
      ORDER BY date
    `).all();

    // DB-Größe
    const dbSize = db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()").get();

    // Upload-Speicher berechnen
    let storageSize = 0;
    try {
      const uploadsDir = resolve(config.upload.path);
      const calcDirSize = (dir) => {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            calcDirSize(fullPath);
          } else {
            try { storageSize += statSync(fullPath).size; } catch { /* ignorieren */ }
          }
        }
      };
      calcDirSize(uploadsDir);
    } catch { /* Verzeichnis existiert nicht */ }

    return {
      total_users: userCount,
      active_users: activeUserCount,
      total_recipes: recipeCount,
      ai_recipes: aiRecipeCount,
      total_meal_plans: mealPlanCount,
      total_shopping_lists: shoppingListCount,
      total_pantry_items: pantryItemCount,
      total_cook_count: cookingCount,
      rewe_preferences: rewePrefsCount,
      ingredient_aliases: aliasCount,
      blocked_ingredients: blockedIngredientCount,
      recipe_blocks: recipeBlockCount,
      total_collections: collectionCount,
      total_households: householdCount,
      total_household_members: householdMemberCount,
      avg_members_per_household: avgMembersPerHousehold,
      most_active_households: mostActiveHouseholds,
      storage_size: storageSize,
      db_size: dbSize?.size || 0,
      popular_recipes: popularRecipes,
      recent_users: recentUsers,
      week_activity: weekActivity,
    };
  });

  // ============================================
  // GET /api/admin/logs - Aktivitätslog
  // ============================================
  fastify.get('/logs', {
    schema: {
      description: 'Admin-Aktivitätslog abrufen',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, async (request) => {
    const limit = request.query.limit || 20;
    const logs = db.prepare(`
      SELECT al.id, al.action, al.details, al.created_at,
             u.username
      FROM admin_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC
      LIMIT ?
    `).all(limit);

    return { logs };
  });

  // ============================================
  // GET /api/admin/users - Alle Benutzer
  // ============================================
  fastify.get('/users', {
    schema: {
      description: 'Alle Benutzer auflisten',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
    },
  }, async () => {
    const users = db.prepare(`
      SELECT
        u.id, u.username, u.email, u.display_name, u.role, u.is_active,
        u.created_at, u.updated_at,
        (SELECT COUNT(*) FROM recipes WHERE user_id = u.id) as recipe_count,
        (SELECT COUNT(*) FROM cooking_history WHERE user_id = u.id) as cooking_count,
        (SELECT MAX(cooked_at) FROM cooking_history WHERE user_id = u.id) as last_activity
      FROM users u
      ORDER BY u.created_at DESC
    `).all();

    return { users };
  });

  // ============================================
  // PUT /api/admin/users/:id - Benutzer bearbeiten
  // ============================================
  fastify.put('/users/:id', {
    schema: {
      description: 'Benutzer bearbeiten (Rolle, Status)',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'integer' } },
      },
      body: {
        type: 'object',
        properties: {
          role: { type: 'string', enum: ['user', 'admin'] },
          is_active: { type: 'boolean' },
          display_name: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { role, is_active, display_name } = request.body;

    // Sich selbst nicht degradieren
    if (id === request.user.id && role === 'user') {
      return reply.status(400).send({ error: 'Du kannst dir nicht selbst die Admin-Rechte entziehen.' });
    }

    // Sich selbst nicht sperren
    if (id === request.user.id && is_active === false) {
      return reply.status(400).send({ error: 'Du kannst dich nicht selbst sperren.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) {
      return reply.status(404).send({ error: 'Benutzer nicht gefunden.' });
    }

    const updates = [];
    const params = [];

    if (role !== undefined) { updates.push('role = ?'); params.push(role); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }
    if (display_name !== undefined) { updates.push('display_name = ?'); params.push(display_name); }

    if (updates.length === 0) {
      return reply.status(400).send({ error: 'Keine Änderungen angegeben.' });
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(id);

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    logAdminAction(request.user.id, 'Benutzer bearbeitet', `${user.username} (ID ${id})`);

    return { message: 'Benutzer aktualisiert.' };
  });

  // ============================================
  // POST /api/admin/users/:id/reset-password
  // ============================================
  fastify.post('/users/:id/reset-password', {
    schema: {
      description: 'Passwort eines Benutzers zurücksetzen',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['new_password'],
        properties: {
          new_password: { type: 'string', minLength: 6 },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { new_password } = request.body;

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
    if (!user) {
      return reply.status(404).send({ error: 'Benutzer nicht gefunden.' });
    }

    const passwordHash = await bcrypt.hash(new_password, 12);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(passwordHash, id);

    const targetUser = db.prepare('SELECT username FROM users WHERE id = ?').get(id);
    logAdminAction(request.user.id, 'Passwort zurückgesetzt', `${targetUser?.username || 'Unbekannt'} (ID ${id})`);

    return { message: 'Passwort zurückgesetzt.' };
  });

  // ============================================
  // DELETE /api/admin/users/:id - Benutzer löschen
  // ============================================
  fastify.delete('/users/:id', {
    schema: {
      description: 'Benutzer und alle zugehörigen Daten löschen',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { id } = request.params;

    // Sich selbst nicht löschen
    if (Number(id) === request.user.id) {
      return reply.status(400).send({ error: 'Du kannst dich nicht selbst löschen.' });
    }

    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(id);
    if (!user) {
      return reply.status(404).send({ error: 'Benutzer nicht gefunden.' });
    }

    // Rezeptbilder des Benutzers löschen
    const recipes = db.prepare('SELECT image_url FROM recipes WHERE user_id = ? AND image_url IS NOT NULL').all(id);
    for (const recipe of recipes) {
      try {
        const imgRelative = recipe.image_url.replace('/api/uploads/', '');
        const imgPath = safePath(config.upload.path, imgRelative);
        if (imgPath) unlinkSync(imgPath);
      } catch { /* Bild existiert nicht mehr */ }
    }

    // CASCADE löscht alle verknüpften Daten
    db.prepare('DELETE FROM users WHERE id = ?').run(id);

    logAdminAction(request.user.id, 'Benutzer gelöscht', `${user.username} (ID ${id})`);

    return { message: `Benutzer "${user.username}" und alle Daten gelöscht.` };
  });

  // ============================================
  // GET /api/admin/households - Alle Haushalte
  // ============================================
  fastify.get('/households', {
    schema: {
      description: 'Alle Haushalte mit Mitgliederzahlen auflisten',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
    },
  }, async () => {
    const households = db.prepare(`
      SELECT h.id, h.name, h.created_by, h.invite_code, h.invite_code_expires_at,
             h.created_at, h.updated_at,
             u.username as created_by_username,
             (SELECT COUNT(*) FROM household_members WHERE household_id = h.id) as member_count
      FROM households h
      LEFT JOIN users u ON h.created_by = u.id
      ORDER BY h.created_at DESC
    `).all();

    // Mitglieder für jeden Haushalt laden
    for (const hh of households) {
      hh.members = db.prepare(`
        SELECT u.id, u.username, u.display_name, hm.joined_at, hm.is_default
        FROM household_members hm
        JOIN users u ON hm.user_id = u.id
        WHERE hm.household_id = ?
        ORDER BY hm.joined_at ASC
      `).all(hh.id);
    }

    return { households };
  });

  // ============================================
  // DELETE /api/admin/households/:id - Haushalt force-löschen
  // ============================================
  fastify.delete('/households/:id', {
    schema: {
      description: 'Haushalt als Admin endgültig löschen (Daten werden privatisiert)',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'integer' } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const household = db.prepare('SELECT id, name FROM households WHERE id = ?').get(id);
    if (!household) {
      return reply.status(404).send({ error: 'Haushalt nicht gefunden.' });
    }

    db.transaction(() => {
      // Alle Haushalt-Daten zurück zu privaten Daten machen (household_id = NULL)
      db.prepare('UPDATE recipes SET household_id = NULL WHERE household_id = ?').run(id);
      for (const table of ['categories', 'collections', 'meal_plans', 'shopping_lists',
                           'pantry', 'ingredient_aliases', 'blocked_ingredients', 'recipe_blocks']) {
        db.prepare(`UPDATE ${table} SET household_id = NULL WHERE household_id = ?`).run(id);
      }

      // Haushalt löschen (CASCADE löscht household_members + household_activity)
      db.prepare('DELETE FROM households WHERE id = ?').run(id);
    })();

    logAdminAction(request.user.id, 'Haushalt gelöscht', `"${household.name}" (ID ${id})`);

    return { message: `Haushalt "${household.name}" gelöscht. Daten wurden privatisiert.` };
  });

  // ============================================
  // GET /api/admin/categories - Globale Kategorien
  // ============================================
  fastify.get('/categories', {
    schema: {
      description: 'Alle Kategorien aller Benutzer',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
    },
  }, async () => {
    const categories = db.prepare(`
      SELECT c.*, u.username as owner,
        (SELECT COUNT(*) FROM recipe_categories rc WHERE rc.category_id = c.id) as recipe_count
      FROM categories c
      JOIN users u ON c.user_id = u.id
      ORDER BY c.name
    `).all();

    return { categories };
  });

  // ============================================
  // GET /api/admin/settings - Einstellungen lesen
  // ============================================
  fastify.get('/settings', {
    schema: {
      description: 'Systemeinstellungen abrufen',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
    },
  }, async () => {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};

    // API-Keys maskieren (nur letzte 4 Zeichen zeigen)
    const sensitiveKeys = new Set(['kimi_api_key', 'openai_api_key', 'anthropic_api_key', 'requesty_api_key']);
    for (const row of rows) {
      if (sensitiveKeys.has(row.key) && row.value && row.value.length > 4) {
        settings[row.key] = '•'.repeat(row.value.length - 4) + row.value.slice(-4);
      } else {
        settings[row.key] = row.value;
      }
    }
    return { settings };
  });

  // ============================================
  // PUT /api/admin/settings - Einstellungen speichern
  // ============================================
  fastify.put('/settings', {
    schema: {
      description: 'Systemeinstellungen aktualisieren',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          settings: { type: 'object', additionalProperties: { type: 'string' } },
        },
        required: ['settings'],
      },
    },
  }, async (request, reply) => {
    const settings = request.body.settings;

    // Nur erlaubte Keys akzeptieren
    const invalidKeys = Object.keys(settings).filter(k => !ALLOWED_SETTINGS.has(k));
    if (invalidKeys.length) {
      return reply.status(400).send({ error: `Unbekannte Einstellungen: ${invalidKeys.join(', ')}` });
    }

    // Maskierte API-Keys ignorieren (wenn der Wert nur • und 4 Zeichen am Ende hat)
    const sensitiveKeys = new Set(['kimi_api_key', 'openai_api_key', 'anthropic_api_key', 'requesty_api_key']);
    const filteredSettings = {};
    for (const [key, value] of Object.entries(settings)) {
      if (sensitiveKeys.has(key) && value && value.startsWith('•')) continue; // Maskiert → nicht überschreiben
      filteredSettings[key] = value;
    }

    const stmt = db.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP"
    );

    const transaction = db.transaction(() => {
      for (const [key, value] of Object.entries(filteredSettings)) {
        stmt.run(key, String(value));
      }
    });

    transaction();

    // KI-Provider zurücksetzen, wenn sich KI-Einstellungen geändert haben
    const aiKeys = Object.keys(filteredSettings).filter(k => k.startsWith('ai_') || k.startsWith('kimi_') || k.startsWith('openai_') || k.startsWith('anthropic_') || k.startsWith('ollama_') || k.startsWith('requesty_'));
    if (aiKeys.length > 0) {
      resetProvider();
    }

    logAdminAction(request.user.id, 'Einstellungen geändert', Object.keys(filteredSettings).join(', '));

    return { message: 'Einstellungen gespeichert.' };
  });

  // ============================================
  // POST /api/admin/cleanup - Verwaiste Bilder aufräumen
  // ============================================
  fastify.post('/cleanup', {
    schema: {
      description: 'Verwaiste Bilder aufräumen',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
    },
  }, async () => {
    const uploadsDir = resolve(config.upload.path, 'recipes');
    let files;
    try {
      files = readdirSync(uploadsDir);
    } catch {
      return { cleaned: 0, message: 'Upload-Verzeichnis nicht gefunden.' };
    }

    // Alle in der DB referenzierten Bilder sammeln
    const dbImages = db.prepare("SELECT image_url FROM recipes WHERE image_url IS NOT NULL").all();
    const referencedFiles = new Set(dbImages.map(r => r.image_url.split('/').pop()));

    let cleaned = 0;
    for (const file of files) {
      if (!referencedFiles.has(file)) {
        try {
          unlinkSync(join(uploadsDir, file));
          cleaned++;
        } catch { /* Ignorieren */ }
      }
    }

    logAdminAction(request.user.id, 'Aufräumen durchgeführt', `${cleaned} verwaiste Bilder entfernt`);

    return { cleaned, message: `${cleaned} verwaiste Bilder entfernt.` };
  });

  // ============================================
  // ADMIN EXPORT / IMPORT
  // ============================================

  /**
   * GET /api/admin/export
   * Alle Rezepte aller Benutzer als JSON exportieren
   * ?include_images=true  — Bilder als Base64 einbetten
   * ?user_id=123          — Nur Rezepte eines bestimmten Users
   */
  fastify.get('/export', {
    schema: {
      description: 'Alle Rezepte exportieren (Admin)',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          include_images: { type: 'boolean', default: false },
          user_id: { type: 'integer' },
        },
      },
    },
  }, async (request, reply) => {
    const includeImages = request.query.include_images === true || request.query.include_images === 'true';
    const filterUserId = request.query.user_id;

    // Rezepte laden (alle oder gefiltert nach User)
    let recipes;
    if (filterUserId) {
      recipes = db.prepare(`
        SELECT r.*, u.username as author
        FROM recipes r JOIN users u ON r.user_id = u.id
        WHERE r.user_id = ?
        ORDER BY r.created_at DESC
      `).all(filterUserId);
    } else {
      recipes = db.prepare(`
        SELECT r.*, u.username as author
        FROM recipes r JOIN users u ON r.user_id = u.id
        ORDER BY u.username, r.created_at DESC
      `).all();
    }

    const exportData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      source: 'Zauberjournal (Admin-Export)',
      recipe_count: recipes.length,
      recipes: [],
    };

    for (const recipe of recipes) {
      const categories = db.prepare(`
        SELECT c.name, c.icon, c.color FROM categories c
        JOIN recipe_categories rc ON c.id = rc.category_id
        WHERE rc.recipe_id = ?
      `).all(recipe.id);

      const ingredients = db.prepare(
        'SELECT name, amount, unit, group_name, sort_order, is_optional, notes FROM ingredients WHERE recipe_id = ? ORDER BY group_name, sort_order'
      ).all(recipe.id);

      const steps = db.prepare(
        'SELECT step_number, title, instruction, duration_minutes FROM cooking_steps WHERE recipe_id = ? ORDER BY step_number'
      ).all(recipe.id);

      const recipeExport = {
        title: recipe.title,
        description: recipe.description,
        servings: recipe.servings,
        prep_time: recipe.prep_time,
        cook_time: recipe.cook_time,
        total_time: recipe.total_time,
        difficulty: recipe.difficulty,
        source_url: recipe.source_url,
        is_favorite: recipe.is_favorite,
        notes: recipe.notes,
        ai_generated: recipe.ai_generated,
        created_at: recipe.created_at,
        author: recipe.author,
        categories,
        ingredients,
        steps,
      };

      if (includeImages && recipe.image_url) {
        try {
          const relPath = recipe.image_url.replace('/api/uploads/', '');
          const imgPath = safePath(config.upload.path, relPath);
          if (imgPath && existsSync(imgPath)) {
            const imgBuffer = readFileSync(imgPath);
            recipeExport.image_base64 = imgBuffer.toString('base64');
            recipeExport.image_mime = 'image/webp';
          }
        } catch { /* ignorieren */ }
      }

      exportData.recipes.push(recipeExport);
    }

    const suffix = filterUserId ? `-user-${filterUserId}` : '-alle';
    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="admin-rezepte-export${suffix}-${new Date().toISOString().split('T')[0]}.json"`);
    return exportData;
  });

  /**
   * POST /api/admin/import
   * Rezepte aus JSON-Datei importieren (Admin)
   * Kann einem bestimmten User zugewiesen werden
   */
  fastify.post('/import', {
    schema: {
      description: 'Rezepte importieren und einem Benutzer zuweisen (Admin)',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    // JSON-Datei oder Body akzeptieren
    let importData;
    let targetUserId;

    const contentType = request.headers['content-type'] || '';

    if (contentType.includes('multipart')) {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          const buffer = await part.toBuffer();
          try {
            importData = JSON.parse(buffer.toString('utf-8'));
          } catch {
            return reply.status(400).send({ error: 'Ungültiges JSON-Format in der Datei.' });
          }
        } else if (part.fieldname === 'user_id') {
          targetUserId = parseInt(part.value, 10);
        }
      }
    } else {
      importData = request.body?.data || request.body;
      targetUserId = request.body?.user_id;
    }

    if (!importData?.recipes || !Array.isArray(importData.recipes)) {
      return reply.status(400).send({ error: 'Ungültiges Export-Format. Erwartet: { recipes: [...] }' });
    }

    if (importData.recipes.length === 0) {
      return reply.status(400).send({ error: 'Keine Rezepte zum Importieren gefunden.' });
    }

    if (importData.recipes.length > 500) {
      return reply.status(400).send({ error: 'Maximal 500 Rezepte pro Admin-Import erlaubt.' });
    }

    // Ziel-User bestimmen (oder Admin selbst)
    const userId = targetUserId || request.user.id;
    const targetUser = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
    if (!targetUser) {
      return reply.status(404).send({ error: 'Ziel-Benutzer nicht gefunden.' });
    }

    // Kategorien des Ziel-Users laden
    const userCategories = db.prepare('SELECT id, name FROM categories WHERE user_id = ?').all(userId);
    const catMap = new Map(userCategories.map(c => [c.name, c.id]));

    let imported = 0;
    let skipped = 0;
    const errors = [];
    const pendingImages = [];

    const transaction = db.transaction(() => {
      for (const recipe of importData.recipes) {
        try {
          if (!recipe.title) {
            skipped++;
            errors.push('Übersprungen: Rezept ohne Titel');
            continue;
          }

          // Duplikat-Check: gleiches Rezept (Titel) beim selben User?
          const existing = db.prepare(
            'SELECT id FROM recipes WHERE user_id = ? AND title = ? COLLATE NOCASE'
          ).get(userId, recipe.title.trim());
          if (existing) {
            skipped++;
            errors.push(`Übersprungen (Duplikat): „${recipe.title}"`);
            continue;
          }

          const VALID_DIFFICULTIES = new Set(['easy','medium','hard','einfach','mittel','schwer']);
          const title = sanitize(recipe.title, 300);
          const description = recipe.description ? sanitize(recipe.description, 5000) : null;
          const servings = Math.min(Math.max(parseInt(recipe.servings) || 4, 1), 100);
          const prepTime = Math.min(Math.max(parseInt(recipe.prep_time) || 0, 0), 10080);
          const cookTime = Math.min(Math.max(parseInt(recipe.cook_time) || 0, 0), 10080);
          const totalTime = Math.min(parseInt(recipe.total_time) || (prepTime + cookTime), 10080);
          const difficulty = VALID_DIFFICULTIES.has(recipe.difficulty) ? recipe.difficulty : 'mittel';
          const sourceUrl = recipe.source_url ? sanitize(recipe.source_url, 2000) : null;
          const notes = recipe.notes ? sanitize(recipe.notes, 5000) : null;

          const recipeResult = db.prepare(`
            INSERT INTO recipes (user_id, title, description, servings, prep_time, cook_time, total_time, difficulty, source_url, is_favorite, notes, ai_generated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            userId,
            title,
            description,
            servings,
            prepTime,
            cookTime,
            totalTime,
            difficulty,
            sourceUrl,
            recipe.is_favorite ? 1 : 0,
            notes,
            recipe.ai_generated ? 1 : 0
          );

          const recipeId = recipeResult.lastInsertRowid;

          // Bild für spätere Verarbeitung vormerken (Sharp ist async)
          if (recipe.image_base64 && typeof recipe.image_base64 === 'string' && recipe.image_base64.length < 14 * 1024 * 1024) {
            try {
              const imgBuffer = Buffer.from(recipe.image_base64, 'base64');
              // Größenbegrenzung: max 10 MB raw
              if (imgBuffer.length <= 10 * 1024 * 1024) {
                const imageId = generateId();
                const imagePath = `recipes/${imageId}.webp`;
                pendingImages.push({ recipeId, imgBuffer, imagePath });
                db.prepare('UPDATE recipes SET image_url = ? WHERE id = ?').run(`/api/uploads/${imagePath}`, recipeId);
              }
            } catch { /* ignorieren */ }
          }

          // Kategorien zuordnen (max. 20 pro Rezept)
          if (recipe.categories?.length) {
            const cats = recipe.categories.slice(0, 20);
            const insertCat = db.prepare(
              'INSERT OR IGNORE INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)'
            );
            for (const cat of cats) {
              const catName = sanitize(typeof cat === 'string' ? cat : cat.name, 100);
              let catId = catMap.get(catName);
              if (!catId && catName) {
                const catIcon = sanitize(typeof cat === 'object' && cat.icon ? cat.icon : '🍽️', 10);
                const catColor = (typeof cat === 'object' && /^#[0-9a-fA-F]{6}$/.test(cat.color)) ? cat.color : '#6366f1';
                const isMealTime = (typeof cat === 'object' && cat.is_meal_time) ? 1 : 0;
                const sortOrder = (typeof cat === 'object' && typeof cat.sort_order === 'number') ? cat.sort_order : 0;
                const newCat = db.prepare(
                  'INSERT INTO categories (user_id, name, icon, color, is_meal_time, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
                ).run(userId, catName, catIcon, catColor, isMealTime, sortOrder);
                catId = newCat.lastInsertRowid;
                catMap.set(catName, catId);
              }
              if (catId) insertCat.run(recipeId, catId);
            }
          }

          // Zutaten (max. 200 pro Rezept)
          if (recipe.ingredients?.length) {
            const ings = recipe.ingredients.slice(0, 200);
            const insertIng = db.prepare(`
              INSERT INTO ingredients (recipe_id, name, amount, unit, group_name, sort_order, is_optional, notes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            ings.forEach((ing, idx) => {
              insertIng.run(recipeId, String(ing.name || '').slice(0, 500), ing.amount || null, String(ing.unit || '').slice(0, 50), String(ing.group_name || '').slice(0, 200) || null, ing.sort_order ?? idx, ing.is_optional ? 1 : 0, String(ing.notes || '').slice(0, 500) || null);
            });
          }

          // Schritte (max. 100 pro Rezept)
          if (recipe.steps?.length) {
            const stps = recipe.steps.slice(0, 100);
            const insertStep = db.prepare(`
              INSERT INTO cooking_steps (recipe_id, step_number, title, instruction, duration_minutes)
              VALUES (?, ?, ?, ?, ?)
            `);
            stps.forEach((step, idx) => {
              insertStep.run(recipeId, step.step_number ?? idx + 1, String(step.title || '').slice(0, 500) || null, String(step.instruction || '').slice(0, 5000), step.duration_minutes || null);
            });
          }

          imported++;
        } catch (err) {
          skipped++;
          errors.push(`Fehler bei "${sanitize(recipe.title || 'Unbenannt', 50)}"`);
        }
      }
    });

    transaction();

    // Bilder asynchron durch Sharp re-encodieren (validiert echtes Bildformat)
    for (const { recipeId, imgBuffer, imagePath } of pendingImages) {
      try {
        const fullPath = resolve(config.upload.path, imagePath);
        await sharp(imgBuffer)
          .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 85 })
          .toFile(fullPath);
      } catch {
        // Ungültiges Bild – ignorieren
      }
    }

    logAdminAction(request.user.id, 'Rezepte importiert', `${imported} Rezept(e) für ${targetUser.username}`);

    return {
      message: `${imported} Rezept(e) für "${targetUser.username}" importiert, ${skipped} übersprungen.`,
      imported,
      skipped,
      target_user: targetUser.username,
      errors: errors.length ? errors : undefined,
    };
  });

  // ============================================
  // ADMIN VORRATSSCHRANK EXPORT / IMPORT
  // ============================================

  /**
   * GET /api/admin/export/pantry
   * Alle Vorräte aller Benutzer als JSON exportieren
   * ?user_id=123 — Nur Vorräte eines bestimmten Users
   */
  fastify.get('/export/pantry', {
    schema: {
      description: 'Alle Vorräte exportieren (Admin)',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          user_id: { type: 'integer' },
        },
      },
    },
  }, async (request, reply) => {
    const filterUserId = request.query.user_id;

    let items;
    if (filterUserId) {
      items = db.prepare(`
        SELECT p.*, u.username as owner
        FROM pantry p JOIN users u ON p.user_id = u.id
        WHERE p.user_id = ?
        ORDER BY u.username, p.category, p.ingredient_name
      `).all(filterUserId);
    } else {
      items = db.prepare(`
        SELECT p.*, u.username as owner
        FROM pantry p JOIN users u ON p.user_id = u.id
        ORDER BY u.username, p.category, p.ingredient_name
      `).all();
    }

    const exportData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      source: 'Zauberjournal (Admin-Export)',
      type: 'pantry',
      item_count: items.length,
      items: items.map(i => ({
        ingredient_name: i.ingredient_name,
        amount: i.amount,
        unit: i.unit,
        category: i.category,
        expiry_date: i.expiry_date,
        notes: i.notes,
        owner: i.owner,
      })),
    };

    const suffix = filterUserId ? `-user-${filterUserId}` : '-alle';
    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="admin-vorrat-export${suffix}-${new Date().toISOString().split('T')[0]}.json"`);
    return exportData;
  });

  /**
   * POST /api/admin/import/pantry
   * Vorräte aus JSON importieren und einem Benutzer zuweisen (Admin)
   */
  fastify.post('/import/pantry', {
    schema: {
      description: 'Vorräte importieren und einem Benutzer zuweisen (Admin)',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    let importData;
    let targetUserId;

    const contentType = request.headers['content-type'] || '';

    if (contentType.includes('multipart')) {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          const buffer = await part.toBuffer();
          try {
            importData = JSON.parse(buffer.toString('utf-8'));
          } catch {
            return reply.status(400).send({ error: 'Ungültiges JSON-Format in der Datei.' });
          }
        } else if (part.fieldname === 'user_id') {
          targetUserId = parseInt(part.value, 10);
        }
      }
    } else {
      importData = request.body?.data || request.body;
      targetUserId = request.body?.user_id;
    }

    if (!importData?.items || !Array.isArray(importData.items)) {
      return reply.status(400).send({ error: 'Ungültiges Export-Format. Erwartet: { items: [...] }' });
    }

    if (importData.items.length === 0) {
      return reply.status(400).send({ error: 'Keine Vorräte zum Importieren gefunden.' });
    }

    if (importData.items.length > 2000) {
      return reply.status(400).send({ error: 'Maximal 2000 Vorräte pro Admin-Import erlaubt.' });
    }

    const userId = targetUserId || request.user.id;
    const targetUser = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
    if (!targetUser) {
      return reply.status(404).send({ error: 'Ziel-Benutzer nicht gefunden.' });
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    const findExisting = db.prepare(
      'SELECT * FROM pantry WHERE user_id = ? AND LOWER(ingredient_name) = LOWER(?)'
    );
    const insertItem = db.prepare(
      'INSERT INTO pantry (user_id, ingredient_name, amount, unit, category, expiry_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const updateAmount = db.prepare(
      'UPDATE pantry SET amount = amount + ?, unit = COALESCE(?, unit), category = COALESCE(?, category), expiry_date = COALESCE(?, expiry_date), notes = COALESCE(?, notes), updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    );

    const transaction = db.transaction(() => {
      for (const item of importData.items) {
        try {
          const name = String(item.ingredient_name || item.name || '').trim().slice(0, 200);
          if (!name) { skipped++; continue; }

          const amount = Math.min(Math.max(parseFloat(item.amount) || 0, 0), 99999);
          if (amount <= 0) { skipped++; continue; }

          const unit = String(item.unit || 'Stk').trim().slice(0, 50);
          const category = String(item.category || 'Sonstiges').trim().slice(0, 100);
          const expiry_date = (item.expiry_date && /^\d{4}-\d{2}-\d{2}$/.test(item.expiry_date)) ? item.expiry_date : null;
          const notes = item.notes ? String(item.notes).trim().slice(0, 500) : null;

          const existing = findExisting.get(userId, name);
          if (existing) {
            updateAmount.run(amount, unit, category, expiry_date, notes, existing.id);
            updated++;
          } else {
            insertItem.run(userId, name, amount, unit, category, expiry_date, notes);
            imported++;
          }
        } catch (err) {
          skipped++;
          errors.push(`Fehler bei "${item.ingredient_name || '?'}": ${err.message}`);
        }
      }
    });

    transaction();

    logAdminAction(request.user.id, 'Vorräte importiert', `${imported} neu, ${updated} aktualisiert für ${targetUser.username}`);

    return {
      message: `${imported} neu importiert, ${updated} aktualisiert, ${skipped} übersprungen für "${targetUser.username}".`,
      imported,
      updated,
      skipped,
      target_user: targetUser.username,
      errors: errors.length ? errors : undefined,
    };
  });

  // ============================================
  // REWE Produkt-Präferenzen Export / Import
  // ============================================

  /**
   * GET /api/admin/export/rewe-preferences
   * Alle REWE Produkt-Präferenzen als JSON exportieren
   * ?user_id=123 — Nur Präferenzen eines bestimmten Users
   */
  fastify.get('/export/rewe-preferences', {
    schema: {
      description: 'REWE Produkt-Präferenzen exportieren (Admin)',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          user_id: { type: 'integer' },
        },
      },
    },
  }, async (request, reply) => {
    const filterUserId = request.query.user_id;

    let prefs;
    if (filterUserId) {
      prefs = db.prepare(`
        SELECT rpp.*, u.username as owner
        FROM rewe_product_preferences rpp JOIN users u ON rpp.user_id = u.id
        WHERE rpp.user_id = ?
        ORDER BY u.username, rpp.ingredient_name
      `).all(filterUserId);
    } else {
      prefs = db.prepare(`
        SELECT rpp.*, u.username as owner
        FROM rewe_product_preferences rpp JOIN users u ON rpp.user_id = u.id
        ORDER BY u.username, rpp.ingredient_name
      `).all();
    }

    const exportData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      source: 'Zauberjournal (Admin-Export)',
      type: 'rewe-preferences',
      preference_count: prefs.length,
      preferences: prefs.map(p => ({
        ingredient_name: p.ingredient_name,
        rewe_product_id: p.rewe_product_id,
        rewe_product_name: p.rewe_product_name,
        rewe_price: p.rewe_price,
        rewe_package_size: p.rewe_package_size,
        times_selected: p.times_selected,
        owner: p.owner,
      })),
    };

    const suffix = filterUserId ? `-user-${filterUserId}` : '-alle';
    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="admin-rewe-prefs-export${suffix}-${new Date().toISOString().split('T')[0]}.json"`);
    return exportData;
  });

  /**
   * POST /api/admin/import/rewe-preferences
   * REWE Produkt-Präferenzen aus JSON importieren (Admin)
   */
  fastify.post('/import/rewe-preferences', {
    schema: {
      description: 'REWE Produkt-Präferenzen importieren (Admin)',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    let importData;
    let targetUserId;

    const contentType = request.headers['content-type'] || '';

    if (contentType.includes('multipart')) {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          const buffer = await part.toBuffer();
          try {
            importData = JSON.parse(buffer.toString('utf-8'));
          } catch {
            return reply.status(400).send({ error: 'Ungültiges JSON-Format in der Datei.' });
          }
        } else if (part.fieldname === 'user_id') {
          targetUserId = parseInt(part.value, 10);
        }
      }
    } else {
      importData = request.body?.data || request.body;
      targetUserId = request.body?.user_id;
    }

    if (!importData?.preferences || !Array.isArray(importData.preferences)) {
      return reply.status(400).send({ error: 'Ungültiges Export-Format. Erwartet: { preferences: [...] }' });
    }

    if (importData.preferences.length === 0) {
      return reply.status(400).send({ error: 'Keine Präferenzen zum Importieren gefunden.' });
    }

    if (importData.preferences.length > 5000) {
      return reply.status(400).send({ error: 'Maximal 5000 Präferenzen pro Import erlaubt.' });
    }

    const userId = targetUserId || request.user.id;
    const targetUser = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
    if (!targetUser) {
      return reply.status(404).send({ error: 'Ziel-Benutzer nicht gefunden.' });
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    const upsertPref = db.prepare(`
      INSERT INTO rewe_product_preferences (user_id, ingredient_name, rewe_product_id, rewe_product_name, rewe_price, rewe_package_size, times_selected, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, ingredient_name) DO UPDATE SET
        rewe_product_id = excluded.rewe_product_id,
        rewe_product_name = excluded.rewe_product_name,
        rewe_price = excluded.rewe_price,
        rewe_package_size = excluded.rewe_package_size,
        times_selected = excluded.times_selected,
        updated_at = CURRENT_TIMESTAMP
    `);

    const findExisting = db.prepare(
      'SELECT id FROM rewe_product_preferences WHERE user_id = ? AND LOWER(ingredient_name) = LOWER(?)'
    );

    const transaction = db.transaction(() => {
      for (const pref of importData.preferences) {
        try {
          const ingredientName = String(pref.ingredient_name || '').trim().slice(0, 300);
          if (!ingredientName) { skipped++; continue; }

          const productId = String(pref.rewe_product_id || '').trim().slice(0, 100);
          if (!productId) { skipped++; continue; }

          const productName = String(pref.rewe_product_name || '').trim().slice(0, 500);
          const price = typeof pref.rewe_price === 'number' ? Math.min(Math.max(pref.rewe_price, 0), 99999) : (parseFloat(pref.rewe_price) || null);
          const packageSize = pref.rewe_package_size ? String(pref.rewe_package_size).trim().slice(0, 100) : null;
          const timesSelected = Math.min(Math.max(parseInt(pref.times_selected) || 1, 1), 10000);

          const existing = findExisting.get(userId, ingredientName);
          upsertPref.run(userId, ingredientName, productId, productName, price, packageSize, timesSelected);

          if (existing) {
            updated++;
          } else {
            imported++;
          }
        } catch (err) {
          skipped++;
          errors.push(`Fehler bei "${pref.ingredient_name || '?'}": ${err.message}`);
        }
      }
    });

    transaction();

    logAdminAction(request.user.id, 'REWE-Präferenzen importiert', `${imported} neu, ${updated} aktualisiert für ${targetUser.username}`);

    return {
      message: `${imported} neu importiert, ${updated} aktualisiert, ${skipped} übersprungen für "${targetUser.username}".`,
      imported,
      updated,
      skipped,
      target_user: targetUser.username,
      errors: errors.length ? errors : undefined,
    };
  });

  // ============================================
  // Benutzer Export / Import
  // ============================================

  /**
   * GET /api/admin/export/users
   * Alle Benutzerkonten als JSON exportieren (ohne Passwörter)
   */
  fastify.get('/export/users', {
    schema: {
      description: 'Benutzerkonten exportieren (Admin)',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const users = db.prepare(`
      SELECT id, username, email, display_name, role, is_active, created_at, updated_at
      FROM users
      ORDER BY id
    `).all();

    // Zusatzdaten pro Benutzer sammeln
    const enrichedUsers = users.map(u => {
      const recipeCount = db.prepare('SELECT COUNT(*) as c FROM recipes WHERE user_id = ?').get(u.id).c;
      const pantryCount = db.prepare('SELECT COUNT(*) as c FROM pantry WHERE user_id = ?').get(u.id).c;
      const cookCount = db.prepare('SELECT COUNT(*) as c FROM cooking_history WHERE user_id = ?').get(u.id).c;

      // Bring!-Einstellungen (ohne Passwort)
      const bring = db.prepare('SELECT default_list_uuid, default_list_name FROM bring_settings WHERE user_id = ?').get(u.id);

      return {
        ...u,
        stats: { recipes: recipeCount, pantry_items: pantryCount, times_cooked: cookCount },
        bring_settings: bring ? { default_list_uuid: bring.default_list_uuid, default_list_name: bring.default_list_name } : null,
      };
    });

    const exportData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      source: 'Zauberjournal (Admin-Export)',
      type: 'users',
      user_count: enrichedUsers.length,
      users: enrichedUsers,
    };

    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="admin-users-export-${new Date().toISOString().split('T')[0]}.json"`);
    return exportData;
  });

  /**
   * POST /api/admin/import/users
   * Benutzerkonten aus JSON importieren (Admin)
   * Erstellt Konten mit temporärem Passwort
   */
  fastify.post('/import/users', {
    schema: {
      description: 'Benutzerkonten importieren (Admin)',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    let importData;

    const contentType = request.headers['content-type'] || '';

    if (contentType.includes('multipart')) {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          const buffer = await part.toBuffer();
          try {
            importData = JSON.parse(buffer.toString('utf-8'));
          } catch {
            return reply.status(400).send({ error: 'Ungültiges JSON-Format in der Datei.' });
          }
        }
      }
    } else {
      importData = request.body?.data || request.body;
    }

    if (!importData?.users || !Array.isArray(importData.users)) {
      return reply.status(400).send({ error: 'Ungültiges Export-Format. Erwartet: { users: [...] }' });
    }

    if (importData.users.length === 0) {
      return reply.status(400).send({ error: 'Keine Benutzer zum Importieren gefunden.' });
    }

    if (importData.users.length > 500) {
      return reply.status(400).send({ error: 'Maximal 500 Benutzer pro Import erlaubt.' });
    }

    let imported = 0;
    let skipped = 0;
    const errors = [];
    const tempPassword = generateRandomPassword();
    const hashedTempPw = bcrypt.hashSync(tempPassword, 10);

    const insertUser = db.prepare(`
      INSERT INTO users (username, email, display_name, role, is_active, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
    `);

    const checkUsername = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)');
    const checkEmail = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)');

    const transaction = db.transaction(() => {
      for (const user of importData.users) {
        try {
          const username = String(user.username || '').trim().slice(0, 50);
          const email = String(user.email || '').trim().slice(0, 255);

          if (!username || !email) {
            skipped++;
            errors.push(`Übersprungen: Benutzername oder E-Mail fehlt.`);
            continue;
          }

          // Einfache E-Mail-Validierung
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
            skipped++;
            errors.push(`Ungültige E-Mail für "${username}".`);
            continue;
          }

          // Benutzername: nur alphanumerisch + Bindestrich/Unterstrich
          if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
            skipped++;
            errors.push(`Ungültiger Benutzername "${username}".`);
            continue;
          }

          // Doppelten Benutzernamen/E-Mail prüfen
          if (checkUsername.get(username)) {
            skipped++;
            errors.push(`"${username}" existiert bereits.`);
            continue;
          }
          if (checkEmail.get(email)) {
            skipped++;
            errors.push(`E-Mail "${email}" existiert bereits.`);
            continue;
          }

          const displayName = String(user.display_name || username).trim().slice(0, 100);
          const role = (user.role === 'admin') ? 'admin' : 'user';
          const isActive = user.is_active !== undefined ? (user.is_active ? 1 : 0) : 1;
          const createdAt = (user.created_at && /^\d{4}-\d{2}-\d{2}/.test(user.created_at)) ? String(user.created_at).slice(0, 30) : null;

          insertUser.run(username, email, displayName, role, isActive, hashedTempPw, createdAt);
          imported++;
        } catch (err) {
          skipped++;
          errors.push(`Fehler bei "${user.username || '?'}": ${err.message}`);
        }
      }
    });

    transaction();

    logAdminAction(request.user.id, 'Benutzer importiert', `${imported} Benutzer importiert`);

    return {
      message: `${imported} Benutzer importiert, ${skipped} übersprungen.`,
      imported,
      skipped,
      temp_password: imported > 0 ? tempPassword : undefined,
      errors: errors.length ? errors : undefined,
    };
  });

  // ============================================
  // Zutaten-Aliase Export / Import
  // ============================================

  /**
   * GET /api/admin/export/ingredient-aliases
   * Alle Zutaten-Aliase als JSON exportieren
   */
  fastify.get('/export/ingredient-aliases', {
    schema: {
      description: 'Zutaten-Aliase exportieren (Admin)',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          user_id: { type: 'integer' },
        },
      },
    },
  }, async (request, reply) => {
    const filterUserId = request.query.user_id;

    let aliases;
    if (filterUserId) {
      aliases = db.prepare(`
        SELECT ia.*, u.username as owner
        FROM ingredient_aliases ia JOIN users u ON ia.user_id = u.id
        WHERE ia.user_id = ?
        ORDER BY u.username, ia.canonical_name, ia.alias_name
      `).all(filterUserId);
    } else {
      aliases = db.prepare(`
        SELECT ia.*, u.username as owner
        FROM ingredient_aliases ia JOIN users u ON ia.user_id = u.id
        ORDER BY u.username, ia.canonical_name, ia.alias_name
      `).all();
    }

    let blocked;
    if (filterUserId) {
      blocked = db.prepare(`
        SELECT bi.*, u.username as owner
        FROM blocked_ingredients bi JOIN users u ON bi.user_id = u.id
        WHERE bi.user_id = ?
        ORDER BY u.username, bi.ingredient_name
      `).all(filterUserId);
    } else {
      blocked = db.prepare(`
        SELECT bi.*, u.username as owner
        FROM blocked_ingredients bi JOIN users u ON bi.user_id = u.id
        ORDER BY u.username, bi.ingredient_name
      `).all();
    }

    const exportData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      source: 'Zauberjournal (Admin-Export)',
      type: 'ingredient-settings',
      alias_count: aliases.length,
      blocked_count: blocked.length,
      aliases: aliases.map(a => ({
        canonical_name: a.canonical_name,
        alias_name: a.alias_name,
        owner: a.owner,
      })),
      blocked_ingredients: blocked.map(b => ({
        ingredient_name: b.ingredient_name,
        owner: b.owner,
      })),
    };

    const suffix = filterUserId ? `-user-${filterUserId}` : '-alle';
    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="admin-ingredient-settings-export${suffix}-${new Date().toISOString().split('T')[0]}.json"`);
    return exportData;
  });

  /**
   * POST /api/admin/import/ingredient-aliases
   * Zutaten-Aliase aus JSON importieren (Admin)
   */
  fastify.post('/import/ingredient-aliases', {
    schema: {
      description: 'Zutaten-Aliase importieren (Admin)',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    let importData;
    let targetUserId;

    const contentType = request.headers['content-type'] || '';

    if (contentType.includes('multipart')) {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          const buffer = await part.toBuffer();
          try {
            importData = JSON.parse(buffer.toString('utf-8'));
          } catch {
            return reply.status(400).send({ error: 'Ungültiges JSON-Format in der Datei.' });
          }
        } else if (part.fieldname === 'user_id') {
          targetUserId = parseInt(part.value, 10);
        }
      }
    } else {
      importData = request.body?.data || request.body;
      targetUserId = request.body?.user_id;
    }

    const hasAliases = Array.isArray(importData?.aliases) && importData.aliases.length > 0;
    const hasBlocked = Array.isArray(importData?.blocked_ingredients) && importData.blocked_ingredients.length > 0;

    if (!hasAliases && !hasBlocked) {
      return reply.status(400).send({ error: 'Ungültiges Export-Format. Erwartet: { aliases: [...] } und/oder { blocked_ingredients: [...] }' });
    }

    if (importData.aliases && importData.aliases.length > 5000) {
      return reply.status(400).send({ error: 'Maximal 5000 Aliase pro Import erlaubt.' });
    }

    if (importData.blocked_ingredients && importData.blocked_ingredients.length > 5000) {
      return reply.status(400).send({ error: 'Maximal 5000 geblockte Zutaten pro Import erlaubt.' });
    }

    const userId = targetUserId || request.user.id;
    const targetUser = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
    if (!targetUser) {
      return reply.status(404).send({ error: 'Ziel-Benutzer nicht gefunden.' });
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let blockedImported = 0;
    let blockedSkipped = 0;
    const errorsArr = [];

    const upsertAlias = db.prepare(`
      INSERT INTO ingredient_aliases (user_id, canonical_name, alias_name)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, alias_name) DO UPDATE SET
        canonical_name = excluded.canonical_name
    `);

    const findExisting = db.prepare(
      'SELECT id FROM ingredient_aliases WHERE user_id = ? AND LOWER(alias_name) = LOWER(?)'
    );

    const upsertBlocked = db.prepare(`
      INSERT OR IGNORE INTO blocked_ingredients (user_id, ingredient_name)
      VALUES (?, ?)
    `);

    const transaction = db.transaction(() => {
      // Aliase importieren
      if (hasAliases) {
        for (const alias of importData.aliases) {
          try {
            const canonicalName = String(alias.canonical_name || '').trim().slice(0, 300);
            const aliasName = String(alias.alias_name || '').trim().slice(0, 300);

            if (!canonicalName || !aliasName) { skipped++; continue; }

            const existing = findExisting.get(userId, aliasName);
            upsertAlias.run(userId, canonicalName, aliasName);

            if (existing) { updated++; } else { imported++; }
          } catch (err) {
            skipped++;
            errorsArr.push(`Fehler bei Alias "${alias.alias_name || '?'}": ${err.message}`);
          }
        }
      }

      // Geblockte Zutaten importieren
      if (hasBlocked) {
        for (const blocked of importData.blocked_ingredients) {
          try {
            const ingredientName = String(blocked.ingredient_name || '').trim().slice(0, 300);
            if (!ingredientName) { blockedSkipped++; continue; }

            const result = upsertBlocked.run(userId, ingredientName);
            if (result.changes > 0) { blockedImported++; } else { blockedSkipped++; }
          } catch (err) {
            blockedSkipped++;
            errorsArr.push(`Fehler bei geblockter Zutat "${blocked.ingredient_name || '?'}": ${err.message}`);
          }
        }
      }
    });

    transaction();

    const logParts = [];
    if (hasAliases) logParts.push(`Aliase: ${imported} neu, ${updated} aktualisiert`);
    if (hasBlocked) logParts.push(`Geblockt: ${blockedImported} neu`);
    logAdminAction(request.user.id, 'Zutaten-Einstellungen importiert', `${logParts.join(', ')} für ${targetUser.username}`);

    return {
      message: `Aliase: ${imported} neu, ${updated} aktualisiert, ${skipped} übersprungen. Geblockt: ${blockedImported} importiert, ${blockedSkipped} übersprungen. Benutzer: "${targetUser.username}".`,
      imported,
      updated,
      skipped,
      blocked_imported: blockedImported,
      blocked_skipped: blockedSkipped,
      target_user: targetUser.username,
      errors: errorsArr.length ? errorsArr : undefined,
    };
  });

  // Einheiten-Umrechnungen Export/Import entfernt (ingredient_conversions Tabelle wurde entfernt)

  // ============================================
  // Wochenplan Export/Import (Admin)
  // ============================================

  /**
   * GET /api/admin/export/meal-plans
   * Alle Wochenpläne aller Benutzer als JSON exportieren
   */
  fastify.get('/export/meal-plans', {
    schema: {
      description: 'Alle Wochenpläne exportieren (Admin)',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: { user_id: { type: 'integer' } },
      },
    },
  }, async (request, reply) => {
    const filterUserId = request.query.user_id;

    let plans;
    if (filterUserId) {
      plans = db.prepare(`
        SELECT mp.*, u.username as owner
        FROM meal_plans mp JOIN users u ON mp.user_id = u.id
        WHERE mp.user_id = ?
        ORDER BY u.username, mp.week_start DESC
      `).all(filterUserId);
    } else {
      plans = db.prepare(`
        SELECT mp.*, u.username as owner
        FROM meal_plans mp JOIN users u ON mp.user_id = u.id
        ORDER BY u.username, mp.week_start DESC
      `).all();
    }

    const planIds = plans.map(p => p.id);
    let entries = [];
    if (planIds.length) {
      entries = db.prepare(`
        SELECT mpe.*, r.title as recipe_title, c.name as category_name
        FROM meal_plan_entries mpe
        LEFT JOIN recipes r ON mpe.recipe_id = r.id
        LEFT JOIN categories c ON mpe.category_id = c.id
        WHERE mpe.meal_plan_id IN (${planIds.map(() => '?').join(',')})
        ORDER BY mpe.meal_plan_id, mpe.day_of_week, COALESCE(c.sort_order, 0)
      `).all(...planIds);
    }

    const plansWithEntries = plans.map(plan => ({
      week_start: plan.week_start,
      created_at: plan.created_at,
      owner: plan.owner,
      entries: entries
        .filter(e => e.meal_plan_id === plan.id)
        .map(e => ({
          recipe_title: e.recipe_title,
          recipe_id: e.recipe_id,
          day_of_week: e.day_of_week,
          category_name: e.category_name || e.meal_type,
          meal_type: e.meal_type,
          servings: e.servings,
          is_cooked: e.is_cooked,
        })),
    }));

    const exportData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      source: 'Zauberjournal (Admin-Export)',
      type: 'meal_plans',
      plan_count: plansWithEntries.length,
      plans: plansWithEntries,
    };

    const suffix = filterUserId ? `-user-${filterUserId}` : '-alle';
    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="admin-wochenplaene-export${suffix}-${new Date().toISOString().split('T')[0]}.json"`);
    return exportData;
  });

  /**
   * POST /api/admin/import/meal-plans
   * Wochenpläne importieren und einem Benutzer zuweisen (Admin)
   */
  fastify.post('/import/meal-plans', {
    schema: {
      description: 'Wochenpläne importieren (Admin)',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    let importData;
    let targetUserId;

    const contentType = request.headers['content-type'] || '';
    if (contentType.includes('multipart')) {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          const buffer = await part.toBuffer();
          try { importData = JSON.parse(buffer.toString('utf-8')); } catch {
            return reply.status(400).send({ error: 'Ungültiges JSON-Format.' });
          }
        } else if (part.fieldname === 'user_id') {
          targetUserId = parseInt(part.value, 10);
        }
      }
    } else {
      importData = request.body?.data || request.body;
      targetUserId = request.body?.user_id;
    }

    if (!importData?.plans || !Array.isArray(importData.plans)) {
      return reply.status(400).send({ error: 'Ungültiges Export-Format. Erwartet: { plans: [...] }' });
    }
    if (importData.plans.length > 500) {
      return reply.status(400).send({ error: 'Maximal 500 Wochenpläne pro Import.' });
    }

    const userId = targetUserId || request.user.id;
    const targetUser = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
    if (!targetUser) return reply.status(404).send({ error: 'Ziel-Benutzer nicht gefunden.' });

    let imported = 0, skipped = 0, entriesImported = 0;

    const insertPlan = db.prepare('INSERT INTO meal_plans (user_id, week_start) VALUES (?, ?)');
    const insertEntry = db.prepare(
      'INSERT INTO meal_plan_entries (meal_plan_id, recipe_id, day_of_week, meal_type, category_id, servings, is_cooked) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const findRecipe = db.prepare('SELECT id FROM recipes WHERE user_id = ? AND LOWER(title) = LOWER(?)');
    const existingPlan = db.prepare('SELECT id FROM meal_plans WHERE user_id = ? AND week_start = ?');

    // Kategorie-Auflösung für meal plan entries
    const userMealCategories = getMealTimeCategories(userId);
    const mealTypeAliasMap = {
      fruehstueck: 'Frühstück', mittag: 'Mittagessen', abendessen: 'Abendessen', snack: 'Snack',
      breakfast: 'Frühstück', lunch: 'Mittagessen', dinner: 'Abendessen',
    };

    function resolveCategoryId(entry) {
      if (entry.category_name) {
        const cat = userMealCategories.find(c => c.name.toLowerCase() === entry.category_name.toLowerCase());
        if (cat) return cat.id;
      }
      if (entry.meal_type && mealTypeAliasMap[entry.meal_type]) {
        const alias = mealTypeAliasMap[entry.meal_type];
        const cat = userMealCategories.find(c => c.name.toLowerCase() === alias.toLowerCase());
        if (cat) return cat.id;
      }
      return userMealCategories[0]?.id || null;
    }

    const transaction = db.transaction(() => {
      for (const plan of importData.plans) {
        if (!plan.week_start || !/^\d{4}-\d{2}-\d{2}$/.test(plan.week_start)) { skipped++; continue; }
        if (existingPlan.get(userId, plan.week_start)) { skipped++; continue; }

        const { lastInsertRowid } = insertPlan.run(userId, plan.week_start);
        const planId = Number(lastInsertRowid);
        imported++;

        if (plan.entries?.length) {
          const entries = plan.entries.slice(0, 50);
          for (const entry of entries) {
            let recipeId = entry.recipe_id;
            if (entry.recipe_title && !recipeId) {
              const recipe = findRecipe.get(userId, entry.recipe_title);
              if (recipe) recipeId = recipe.id;
            }
            if (!recipeId) continue;
            const dayOfWeek = Math.min(Math.max(parseInt(entry.day_of_week) || 0, 0), 6);
            const categoryId = resolveCategoryId(entry);
            const mealType = entry.meal_type || entry.category_name || 'mittag';
            const servings = Math.min(Math.max(parseInt(entry.servings) || 2, 1), 100);
            insertEntry.run(planId, recipeId, dayOfWeek, mealType, categoryId, servings, entry.is_cooked ? 1 : 0);
            entriesImported++;
          }
        }
      }
    });
    transaction();

    logAdminAction(request.user.id, 'Wochenpläne importiert', `${imported} Pläne, ${entriesImported} Einträge für ${targetUser.username}`);

    return {
      message: `${imported} Pläne importiert, ${entriesImported} Einträge, ${skipped} übersprungen für "${targetUser.username}".`,
      imported,
      entries_imported: entriesImported,
      skipped,
      target_user: targetUser.username,
    };
  });

  // ============================================
  // Einkaufslisten Export/Import (Admin)
  // ============================================

  /**
   * GET /api/admin/export/shopping-lists
   * Alle Einkaufslisten aller Benutzer als JSON exportieren
   */
  fastify.get('/export/shopping-lists', {
    schema: {
      description: 'Alle Einkaufslisten exportieren (Admin)',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: { user_id: { type: 'integer' } },
      },
    },
  }, async (request, reply) => {
    const filterUserId = request.query.user_id;

    let lists;
    if (filterUserId) {
      lists = db.prepare(`
        SELECT sl.*, u.username as owner
        FROM shopping_lists sl JOIN users u ON sl.user_id = u.id
        WHERE sl.user_id = ?
        ORDER BY u.username, sl.created_at DESC
      `).all(filterUserId);
    } else {
      lists = db.prepare(`
        SELECT sl.*, u.username as owner
        FROM shopping_lists sl JOIN users u ON sl.user_id = u.id
        ORDER BY u.username, sl.created_at DESC
      `).all();
    }

    const listIds = lists.map(l => l.id);
    let items = [];
    if (listIds.length) {
      items = db.prepare(`
        SELECT sli.*, r.title as recipe_title
        FROM shopping_list_items sli
        LEFT JOIN recipes r ON sli.recipe_id = r.id
        WHERE sli.shopping_list_id IN (${listIds.map(() => '?').join(',')})
        ORDER BY sli.shopping_list_id, sli.ingredient_name
      `).all(...listIds);
    }

    const listsWithItems = lists.map(list => ({
      name: list.name,
      is_active: list.is_active,
      created_at: list.created_at,
      owner: list.owner,
      items: items
        .filter(i => i.shopping_list_id === list.id)
        .map(i => ({
          ingredient_name: i.ingredient_name,
          amount: i.amount,
          unit: i.unit,
          is_checked: i.is_checked,
          recipe_title: i.recipe_title,
          rewe_product_name: i.rewe_product_name,
          rewe_price: i.rewe_price,
        })),
    }));

    const exportData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      source: 'Zauberjournal (Admin-Export)',
      type: 'shopping_lists',
      list_count: listsWithItems.length,
      lists: listsWithItems,
    };

    const suffix = filterUserId ? `-user-${filterUserId}` : '-alle';
    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="admin-einkaufslisten-export${suffix}-${new Date().toISOString().split('T')[0]}.json"`);
    return exportData;
  });

  /**
   * POST /api/admin/import/shopping-lists
   * Einkaufslisten importieren und einem Benutzer zuweisen (Admin)
   */
  fastify.post('/import/shopping-lists', {
    schema: {
      description: 'Einkaufslisten importieren (Admin)',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    let importData;
    let targetUserId;

    const contentType = request.headers['content-type'] || '';
    if (contentType.includes('multipart')) {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          const buffer = await part.toBuffer();
          try { importData = JSON.parse(buffer.toString('utf-8')); } catch {
            return reply.status(400).send({ error: 'Ungültiges JSON-Format.' });
          }
        } else if (part.fieldname === 'user_id') {
          targetUserId = parseInt(part.value, 10);
        }
      }
    } else {
      importData = request.body?.data || request.body;
      targetUserId = request.body?.user_id;
    }

    if (!importData?.lists || !Array.isArray(importData.lists)) {
      return reply.status(400).send({ error: 'Ungültiges Export-Format. Erwartet: { lists: [...] }' });
    }
    if (importData.lists.length > 500) {
      return reply.status(400).send({ error: 'Maximal 500 Einkaufslisten pro Import.' });
    }

    const userId = targetUserId || request.user.id;
    const targetUser = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
    if (!targetUser) return reply.status(404).send({ error: 'Ziel-Benutzer nicht gefunden.' });

    let imported = 0, itemsImported = 0;

    const insertList = db.prepare('INSERT INTO shopping_lists (user_id, name, is_active) VALUES (?, ?, ?)');
    const insertItem = db.prepare(
      'INSERT INTO shopping_list_items (shopping_list_id, ingredient_name, amount, unit, is_checked) VALUES (?, ?, ?, ?, ?)'
    );

    const transaction = db.transaction(() => {
      for (const list of importData.lists) {
        const name = String(list.name || `Admin-Import ${new Date().toLocaleDateString('de-DE')}`).trim().slice(0, 200);
        const { lastInsertRowid } = insertList.run(userId, name, 0);
        const listId = Number(lastInsertRowid);
        imported++;

        if (list.items?.length) {
          const items = list.items.slice(0, 500);
          for (const item of items) {
            const ingredientName = String(item.ingredient_name || '').trim().slice(0, 300);
            if (!ingredientName) continue;
            const amount = typeof item.amount === 'number' ? Math.min(Math.max(item.amount, 0), 99999) : (parseFloat(item.amount) || null);
            const unit = item.unit ? String(item.unit).trim().slice(0, 50) : null;
            insertItem.run(listId, ingredientName, amount, unit, item.is_checked ? 1 : 0);
            itemsImported++;
          }
        }
      }
    });
    transaction();

    logAdminAction(request.user.id, 'Einkaufslisten importiert', `${imported} Listen, ${itemsImported} Artikel für ${targetUser.username}`);

    return {
      message: `${imported} Listen importiert, ${itemsImported} Artikel für "${targetUser.username}".`,
      imported,
      items_imported: itemsImported,
      target_user: targetUser.username,
    };
  });

  // ============================================
  // Rezept-Sperren Export/Import (Admin)
  // ============================================

  /**
   * GET /api/admin/export/recipe-blocks
   * Alle Rezept-Sperren aller Benutzer als JSON exportieren
   */
  fastify.get('/export/recipe-blocks', {
    schema: {
      description: 'Alle Rezept-Sperren exportieren (Admin)',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: { user_id: { type: 'integer' } },
      },
    },
  }, async (request, reply) => {
    const filterUserId = request.query.user_id;

    let blocks;
    if (filterUserId) {
      blocks = db.prepare(`
        SELECT rb.*, r.title as recipe_title, u.username as owner
        FROM recipe_blocks rb
        JOIN recipes r ON rb.recipe_id = r.id
        JOIN users u ON rb.user_id = u.id
        WHERE rb.user_id = ?
        ORDER BY u.username, rb.blocked_until ASC
      `).all(filterUserId);
    } else {
      blocks = db.prepare(`
        SELECT rb.*, r.title as recipe_title, u.username as owner
        FROM recipe_blocks rb
        JOIN recipes r ON rb.recipe_id = r.id
        JOIN users u ON rb.user_id = u.id
        ORDER BY u.username, rb.blocked_until ASC
      `).all();
    }

    const exportData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      source: 'Zauberjournal (Admin-Export)',
      type: 'recipe_blocks',
      block_count: blocks.length,
      blocks: blocks.map(b => ({
        recipe_title: b.recipe_title,
        recipe_id: b.recipe_id,
        blocked_until: b.blocked_until,
        reason: b.reason,
        created_at: b.created_at,
        owner: b.owner,
      })),
    };

    const suffix = filterUserId ? `-user-${filterUserId}` : '-alle';
    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="admin-rezept-sperren-export${suffix}-${new Date().toISOString().split('T')[0]}.json"`);
    return exportData;
  });

  /**
   * POST /api/admin/import/recipe-blocks
   * Rezept-Sperren importieren und einem Benutzer zuweisen (Admin)
   */
  fastify.post('/import/recipe-blocks', {
    schema: {
      description: 'Rezept-Sperren importieren (Admin)',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    let importData;
    let targetUserId;

    const contentType = request.headers['content-type'] || '';
    if (contentType.includes('multipart')) {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          const buffer = await part.toBuffer();
          try { importData = JSON.parse(buffer.toString('utf-8')); } catch {
            return reply.status(400).send({ error: 'Ungültiges JSON-Format.' });
          }
        } else if (part.fieldname === 'user_id') {
          targetUserId = parseInt(part.value, 10);
        }
      }
    } else {
      importData = request.body?.data || request.body;
      targetUserId = request.body?.user_id;
    }

    if (!importData?.blocks || !Array.isArray(importData.blocks)) {
      return reply.status(400).send({ error: 'Ungültiges Export-Format. Erwartet: { blocks: [...] }' });
    }
    if (importData.blocks.length > 2000) {
      return reply.status(400).send({ error: 'Maximal 2000 Rezept-Sperren pro Import.' });
    }

    const userId = targetUserId || request.user.id;
    const targetUser = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
    if (!targetUser) return reply.status(404).send({ error: 'Ziel-Benutzer nicht gefunden.' });

    let imported = 0, updated = 0, skipped = 0;

    const findRecipe = db.prepare('SELECT id FROM recipes WHERE user_id = ? AND LOWER(title) = LOWER(?)');
    const findExisting = db.prepare('SELECT id FROM recipe_blocks WHERE user_id = ? AND recipe_id = ?');
    const insertBlock = db.prepare('INSERT INTO recipe_blocks (user_id, recipe_id, blocked_until, reason) VALUES (?, ?, ?, ?)');
    const updateBlock = db.prepare('UPDATE recipe_blocks SET blocked_until = ?, reason = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?');

    const transaction = db.transaction(() => {
      for (const block of importData.blocks) {
        let recipeId = block.recipe_id;
        if (block.recipe_title) {
          const recipe = findRecipe.get(userId, block.recipe_title);
          if (recipe) recipeId = recipe.id;
        }
        if (!recipeId || !block.blocked_until || !/^\d{4}-\d{2}-\d{2}/.test(block.blocked_until)) { skipped++; continue; }

        const blockedUntil = String(block.blocked_until).slice(0, 30);
        const reason = block.reason ? String(block.reason).trim().slice(0, 500) : null;
        const existing = findExisting.get(userId, recipeId);
        if (existing) {
          updateBlock.run(blockedUntil, reason, existing.id);
          updated++;
        } else {
          insertBlock.run(userId, recipeId, blockedUntil, reason);
          imported++;
        }
      }
    });
    transaction();

    logAdminAction(request.user.id, 'Rezept-Sperren importiert', `${imported} neu, ${updated} aktualisiert für ${targetUser.username}`);

    return {
      message: `${imported} neu importiert, ${updated} aktualisiert, ${skipped} übersprungen für "${targetUser.username}".`,
      imported,
      updated,
      skipped,
      target_user: targetUser.username,
    };
  });

  // ============================================
  // Sammlungen Export/Import (Admin)
  // ============================================

  /**
   * GET /api/admin/export/collections
   * Alle Sammlungen exportieren (optional per User)
   */
  fastify.get('/export/collections', {
    schema: {
      description: 'Sammlungen aller Benutzer als JSON exportieren (Admin)',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          user_id: { type: 'integer' },
        },
      },
    },
  }, async (request, reply) => {
    const filterUserId = request.query.user_id;
    let query = `
      SELECT c.*, u.username as owner
      FROM collections c
      JOIN users u ON c.user_id = u.id
    `;
    const params = [];
    if (filterUserId) {
      query += ' WHERE c.user_id = ?';
      params.push(filterUserId);
    }
    query += ' ORDER BY c.user_id, c.sort_order ASC, c.name ASC';

    const collections = db.prepare(query).all(...params);

    const exportData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      source: 'Zauberjournal',
      type: 'collections',
      collection_count: collections.length,
      collections: collections.map(col => {
        const recipeTitles = db.prepare(`
          SELECT r.title FROM recipes r
          JOIN recipe_collections rc ON r.id = rc.recipe_id
          WHERE rc.collection_id = ?
        `).all(col.id).map(r => r.title);

        return {
          name: col.name,
          icon: col.icon,
          color: col.color,
          sort_order: col.sort_order,
          owner: col.owner,
          recipe_titles: recipeTitles,
        };
      }),
    };

    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="sammlungen-admin-export-${new Date().toISOString().split('T')[0]}.json"`);
    return exportData;
  });

  /**
   * POST /api/admin/import/collections
   * Sammlungen für einen bestimmten User importieren
   */
  fastify.post('/import/collections', {
    schema: {
      description: 'Sammlungen für einen User importieren (Admin)',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    let importData;
    let targetUserId;

    if (request.isMultipart()) {
      const parts = {};
      for await (const part of request.parts()) {
        if (part.file) {
          const buffer = await part.toBuffer();
          parts.file = buffer.toString('utf-8').replace(/^\uFEFF/, '').trim();
        } else {
          parts[part.fieldname] = part.value;
        }
      }
      if (!parts.file) return reply.status(400).send({ error: 'Keine Datei hochgeladen.' });
      try { importData = JSON.parse(parts.file); } catch { return reply.status(400).send({ error: 'Ungültiges JSON.' }); }
      targetUserId = parseInt(parts.user_id);
    } else {
      importData = request.body;
      targetUserId = importData?.user_id;
    }

    if (!targetUserId) return reply.status(400).send({ error: 'user_id ist erforderlich.' });

    const targetUser = db.prepare('SELECT id, username FROM users WHERE id = ?').get(targetUserId);
    if (!targetUser) return reply.status(404).send({ error: 'Benutzer nicht gefunden.' });

    if (!importData || !Array.isArray(importData.collections)) {
      return reply.status(400).send({ error: 'Ungültiges Format: "collections"-Array erwartet.' });
    }
    if (importData.collections.length > 500) {
      return reply.status(400).send({ error: 'Maximal 500 Sammlungen.' });
    }

    let imported = 0, updated = 0, skipped = 0, recipesLinked = 0;

    const userRecipes = db.prepare('SELECT id, title FROM recipes WHERE user_id = ?').all(targetUserId);
    const recipeTitleMap = new Map(userRecipes.map(r => [r.title.toLowerCase(), r.id]));

    const transaction = db.transaction(() => {
      for (const col of importData.collections) {
        if (!col.name || typeof col.name !== 'string') { skipped++; continue; }

        const name = col.name.trim().slice(0, 100);
        const icon = (col.icon || '📁').slice(0, 10);
        const color = /^#[0-9a-fA-F]{6}$/.test(col.color) ? col.color : '#6366f1';
        const sortOrder = typeof col.sort_order === 'number' ? Math.min(Math.max(Math.floor(col.sort_order), 0), 9999) : 0;

        const existing = db.prepare(
          'SELECT id FROM collections WHERE user_id = ? AND name = ? COLLATE NOCASE'
        ).get(targetUserId, name);

        let collectionId;
        if (existing) {
          db.prepare('UPDATE collections SET icon = ?, color = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(icon, color, sortOrder, existing.id);
          collectionId = existing.id;
          updated++;
        } else {
          const res = db.prepare('INSERT INTO collections (user_id, name, icon, color, sort_order) VALUES (?, ?, ?, ?, ?)')
            .run(targetUserId, name, icon, color, sortOrder);
          collectionId = res.lastInsertRowid;
          imported++;
        }

        if (Array.isArray(col.recipe_titles)) {
          const titles = col.recipe_titles.slice(0, 200);
          for (const title of titles) {
            if (typeof title !== 'string') continue;
            const recipeId = recipeTitleMap.get(title.toLowerCase());
            if (recipeId) {
              const res = db.prepare('INSERT OR IGNORE INTO recipe_collections (recipe_id, collection_id) VALUES (?, ?)').run(recipeId, collectionId);
              if (res.changes > 0) recipesLinked++;
            }
          }
        }
      }
    });
    transaction();

    logAdminAction(request.user.id, 'Sammlungen importiert', `${imported} neu, ${updated} aktualisiert für ${targetUser.username}`);

    return {
      message: `${imported} neu, ${updated} aktualisiert, ${skipped} übersprungen. ${recipesLinked} Rezept-Zuordnungen.`,
      imported, updated, skipped, recipes_linked: recipesLinked,
      target_user: targetUser.username,
    };
  });

  // ============================================
  // Komplett-Backup als JSON (Admin)
  // ============================================

  /**
   * GET /api/admin/backup/export-json
   * Alle Daten aller (oder eines) Benutzer(s) als JSON exportieren
   */
  fastify.get('/backup/export-json', {
    schema: {
      description: 'Kompletter JSON-Export aller Benutzerdaten (Admin)',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          user_id: { type: 'integer' },
          include_images: { type: 'boolean', default: false },
        },
      },
    },
  }, async (request, reply) => {
    const filterUserId = request.query.user_id;
    const includeImages = request.query.include_images === true || request.query.include_images === 'true';

    // Benutzer ermitteln
    const users = filterUserId
      ? db.prepare('SELECT id, username, display_name, email, role, is_active, created_at FROM users WHERE id = ?').all(filterUserId)
      : db.prepare('SELECT id, username, display_name, email, role, is_active, created_at FROM users').all();

    // Haushalte exportieren (inkl. Mitglieder-Zuordnungen)
    const households = db.prepare(`
      SELECT h.id, h.name, h.created_at, h.created_by_user_id,
             u.username as created_by_username
      FROM households h
      LEFT JOIN users u ON h.created_by_user_id = u.id
      ORDER BY h.id
    `).all();
    const exportedHouseholds = households.map(h => {
      const members = db.prepare(`
        SELECT u.username, hm.role, hm.is_default, hm.joined_at
        FROM household_members hm
        JOIN users u ON hm.user_id = u.id
        WHERE hm.household_id = ?
      `).all(h.id);
      return {
        name: h.name,
        created_at: h.created_at,
        created_by_username: h.created_by_username,
        members,
      };
    });

    const exportData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      source: 'Zauberjournal',
      type: 'admin_full_backup',
      user_count: users.length,
      household_count: exportedHouseholds.length,
      households: exportedHouseholds,
      users: [],
    };

    for (const user of users) {
      const userId = user.id;

      // Rezepte
      const recipes = db.prepare('SELECT * FROM recipes WHERE user_id = ?').all(userId);
      const exportedRecipes = [];
      for (const recipe of recipes) {
        const categories = db.prepare(`
          SELECT c.name, c.icon, c.color, c.is_meal_time, c.sort_order FROM categories c
          JOIN recipe_categories rc ON c.id = rc.category_id WHERE rc.recipe_id = ?
        `).all(recipe.id);
        const ingredients = db.prepare(
          'SELECT name, amount, unit, group_name, sort_order, is_optional, notes FROM ingredients WHERE recipe_id = ? ORDER BY group_name, sort_order'
        ).all(recipe.id);
        const steps = db.prepare(
          'SELECT step_number, title, instruction, duration_minutes FROM cooking_steps WHERE recipe_id = ? ORDER BY step_number'
        ).all(recipe.id);

        const recipeExport = {
          title: recipe.title, description: recipe.description, servings: recipe.servings,
          prep_time: recipe.prep_time, cook_time: recipe.cook_time, total_time: recipe.total_time,
          difficulty: recipe.difficulty, source_url: recipe.source_url, is_favorite: recipe.is_favorite,
          notes: recipe.notes, ai_generated: recipe.ai_generated, times_cooked: recipe.times_cooked,
          last_cooked_at: recipe.last_cooked_at, created_at: recipe.created_at, updated_at: recipe.updated_at,
          household_id: recipe.household_id || null,
          calories: recipe.calories, protein: recipe.protein, carbs: recipe.carbs, fat: recipe.fat,
          nutrition_note: recipe.nutrition_note, nutrition_details: recipe.nutrition_details,
          categories, ingredients, steps,
        };
        if (includeImages && recipe.image_url) {
          try {
            const relPath = recipe.image_url.replace('/api/uploads/', '');
            const imgPath = safePath(config.upload.path, relPath);
            if (imgPath && existsSync(imgPath)) {
              recipeExport.image_base64 = readFileSync(imgPath).toString('base64');
              recipeExport.image_mime = 'image/webp';
            }
          } catch { /* skip */ }
        }
        exportedRecipes.push(recipeExport);
      }

      // Sammlungen
      const collections = db.prepare('SELECT * FROM collections WHERE user_id = ? ORDER BY sort_order, name').all(userId);
      const exportedCollections = collections.map(col => {
        const recipeTitles = db.prepare(`
          SELECT r.title FROM recipes r JOIN recipe_collections rc ON r.id = rc.recipe_id WHERE rc.collection_id = ?
        `).all(col.id).map(r => r.title);
        return { name: col.name, icon: col.icon, color: col.color, sort_order: col.sort_order, recipe_titles: recipeTitles };
      });

      // Pantry
      const pantryItems = db.prepare(
        'SELECT ingredient_name, amount, unit, category, expiry_date, notes, is_permanent FROM pantry WHERE user_id = ?'
      ).all(userId);

      // Meal Plans
      const mealPlans = db.prepare('SELECT * FROM meal_plans WHERE user_id = ?').all(userId);
      const exportedMealPlans = mealPlans.map(plan => {
        const entries = db.prepare(`
          SELECT mpe.day_of_week, mpe.meal_type, mpe.category_id, mpe.servings, mpe.is_cooked,
                 r.title as recipe_title, c.name as category_name
          FROM meal_plan_entries mpe
          LEFT JOIN recipes r ON mpe.recipe_id = r.id
          LEFT JOIN categories c ON mpe.category_id = c.id
          WHERE mpe.meal_plan_id = ?
        `).all(plan.id);
        return {
          week_start: plan.week_start,
          created_at: plan.created_at,
          entries: entries.map(e => ({
            day_of_week: e.day_of_week,
            category_name: e.category_name || e.meal_type,
            meal_type: e.meal_type,
            servings: e.servings,
            is_cooked: e.is_cooked,
            recipe_title: e.recipe_title,
          })),
        };
      });

      // Shopping Lists
      const shoppingLists = db.prepare('SELECT * FROM shopping_lists WHERE user_id = ?').all(userId);
      const exportedShoppingLists = shoppingLists.map(list => {
        const items = db.prepare(`
          SELECT sli.ingredient_name, sli.amount, sli.unit, sli.is_checked, r.title as recipe_title, sli.rewe_product_name, sli.rewe_price
          FROM shopping_list_items sli LEFT JOIN recipes r ON sli.recipe_id = r.id WHERE sli.shopping_list_id = ?
        `).all(list.id);
        return { name: list.name, is_active: list.is_active, created_at: list.created_at, items };
      });

      // Recipe Blocks
      const recipeBlocks = db.prepare(`
        SELECT rb.blocked_until, rb.reason, rb.created_at, r.title as recipe_title
        FROM recipe_blocks rb JOIN recipes r ON rb.recipe_id = r.id WHERE rb.user_id = ?
      `).all(userId);

      // Ingredient Aliases
      const ingredientAliases = db.prepare(
        'SELECT canonical_name, alias_name FROM ingredient_aliases WHERE user_id = ?'
      ).all(userId);

      const blockedIngredients = db.prepare(
        'SELECT ingredient_name FROM blocked_ingredients WHERE user_id = ?'
      ).all(userId).map(b => b.ingredient_name);

      exportData.users.push({
        user: {
          username: user.username,
          display_name: user.display_name,
          email: user.email,
          role: user.role,
          is_active: user.is_active,
          created_at: user.created_at,
        },
        data: {
          recipes: exportedRecipes,
          collections: exportedCollections,
          pantry: pantryItems,
          meal_plans: exportedMealPlans,
          shopping_lists: exportedShoppingLists,
          recipe_blocks: recipeBlocks,
          ingredient_aliases: ingredientAliases,
          blocked_ingredients: blockedIngredients,
        },
      });
    }

    logAdminAction(request.user.id, 'JSON-Komplett-Export', `${users.length} Benutzer exportiert`);

    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="zauberjournal-admin-backup-${new Date().toISOString().split('T')[0]}.json"`);
    return exportData;
  });

  // ── Hilfsfunktion: Importiert Backup-Daten für einen einzelnen User ──
  // options.overwrite = true → bestehende Daten überschreiben statt überspringen
  async function importBackupDataForUser(userId, data, options = {}) {
    const overwrite = options.overwrite === true;
    const LIMITS = { recipes: 500, collections: 200, pantry: 2000, mealPlans: 200, shoppingLists: 500, recipeBlocks: 500, ingredientAliases: 5000, blockedIngredients: 5000, maxCategoriesPerRecipe: 20, maxIngredientsPerRecipe: 200, maxStepsPerRecipe: 100 };

    function _sanitize(val, maxLen = 10000) {
      if (typeof val !== 'string') return typeof val === 'number' ? val : '';
      return val.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim().slice(0, maxLen);
    }

    const VALID_DIFFICULTIES = new Set(['easy','medium','hard','einfach','mittel','schwer']);

    const recipes = Array.isArray(data.recipes) ? data.recipes.slice(0, LIMITS.recipes) : [];
    const collections = Array.isArray(data.collections) ? data.collections.slice(0, LIMITS.collections) : [];
    const pantry = Array.isArray(data.pantry) ? data.pantry.slice(0, LIMITS.pantry) : [];
    const mealPlans = Array.isArray(data.meal_plans) ? data.meal_plans.slice(0, LIMITS.mealPlans) : [];
    const shoppingLists = Array.isArray(data.shopping_lists) ? data.shopping_lists.slice(0, LIMITS.shoppingLists) : [];
    const recipeBlocks = Array.isArray(data.recipe_blocks) ? data.recipe_blocks.slice(0, LIMITS.recipeBlocks) : [];
    const ingredientAliases = Array.isArray(data.ingredient_aliases) ? data.ingredient_aliases.slice(0, LIMITS.ingredientAliases) : [];
    const blockedIngredients = Array.isArray(data.blocked_ingredients) ? data.blocked_ingredients.slice(0, LIMITS.blockedIngredients) : [];

    const result = {
      recipes: { imported: 0, updated: 0, skipped: 0 },
      collections: { imported: 0, updated: 0, skipped: 0, recipes_linked: 0 },
      pantry: { imported: 0, updated: 0, skipped: 0 },
      meal_plans: { imported: 0, updated: 0, skipped: 0, entries_imported: 0 },
      shopping_lists: { imported: 0, items_imported: 0 },
      recipe_blocks: { imported: 0, updated: 0, skipped: 0 },
      ingredient_aliases: { imported: 0, updated: 0, skipped: 0 },
      blocked_ingredients: { imported: 0, skipped: 0 },
    };

    const pendingImages = [];
    const catMap = new Map();
    const existingCats = db.prepare('SELECT id, name FROM categories WHERE user_id = ?').all(userId);
    for (const c of existingCats) catMap.set(c.name.toLowerCase(), c.id);

    function getOrCreateCategory(cat) {
      const key = cat.name.toLowerCase();
      if (catMap.has(key)) return catMap.get(key);
      const res = db.prepare('INSERT INTO categories (user_id, name, icon, color, is_meal_time, sort_order) VALUES (?, ?, ?, ?, ?, ?)').run(userId, cat.name, cat.icon || '📁', cat.color || '#6366f1', cat.is_meal_time ? 1 : 0, parseInt(cat.sort_order) || 0);
      catMap.set(key, res.lastInsertRowid);
      return res.lastInsertRowid;
    }

    // Hilfsfunktion: Rezept-Kinderdaten (Zutaten, Schritte, Kategorien) einfügen
    function insertRecipeChildren(recipeId, recipe) {
      if (Array.isArray(recipe.categories)) {
        for (const cat of recipe.categories.slice(0, LIMITS.maxCategoriesPerRecipe)) {
          if (!cat.name) continue;
          db.prepare('INSERT OR IGNORE INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, getOrCreateCategory(cat));
        }
      }
      if (Array.isArray(recipe.ingredients)) {
        for (const ing of recipe.ingredients.slice(0, LIMITS.maxIngredientsPerRecipe)) {
          if (!ing.name) continue;
          db.prepare('INSERT INTO ingredients (recipe_id, name, amount, unit, group_name, sort_order, is_optional, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(recipeId, _sanitize(ing.name, 200), parseFloat(ing.amount) || null, _sanitize(ing.unit || '', 50), _sanitize(ing.group_name || '', 100), parseInt(ing.sort_order) || 0, ing.is_optional ? 1 : 0, _sanitize(ing.notes || '', 500));
        }
      }
      if (Array.isArray(recipe.steps)) {
        for (const step of recipe.steps.slice(0, LIMITS.maxStepsPerRecipe)) {
          if (!step.instruction) continue;
          db.prepare('INSERT INTO cooking_steps (recipe_id, step_number, title, instruction, duration_minutes) VALUES (?, ?, ?, ?, ?)').run(recipeId, parseInt(step.step_number) || 0, _sanitize(step.title || '', 200), _sanitize(step.instruction, 5000), parseInt(step.duration_minutes) || null);
        }
      }
      if (recipe.image_base64 && recipe.image_mime && typeof recipe.image_base64 === 'string' && recipe.image_base64.length < 14 * 1024 * 1024) {
        pendingImages.push({ recipeId, base64: recipe.image_base64 });
      }
    }

    const importedRecipeMap = new Map();
    const existingRecipes = db.prepare('SELECT id, title FROM recipes WHERE user_id = ?').all(userId);
    for (const r of existingRecipes) importedRecipeMap.set(r.title.toLowerCase(), r.id);

    const transaction = db.transaction(() => {
      // 1. Rezepte
      for (const recipe of recipes) {
        if (!recipe.title || typeof recipe.title !== 'string') { result.recipes.skipped++; continue; }
        const title = _sanitize(recipe.title, 200);
        const description = _sanitize(recipe.description || '', 5000);
        const servings = Math.min(Math.max(1, parseInt(recipe.servings) || 4), 100);
        const prepTime = Math.min(parseInt(recipe.prep_time) || 0, 10080);
        const cookTime = Math.min(parseInt(recipe.cook_time) || 0, 10080);
        const totalTime = Math.min(parseInt(recipe.total_time) || 0, 10080);
        const difficulty = VALID_DIFFICULTIES.has(recipe.difficulty) ? recipe.difficulty : 'mittel';
        const sourceUrl = _sanitize(recipe.source_url || '', 2000);
        const notes = _sanitize(recipe.notes || '', 5000);
        const calories = parseFloat(recipe.calories) || null;
        const protein = parseFloat(recipe.protein) || null;
        const carbs = parseFloat(recipe.carbs) || null;
        const fat = parseFloat(recipe.fat) || null;
        const nutritionNote = _sanitize(recipe.nutrition_note || '', 1000);
        const nutritionDetails = typeof recipe.nutrition_details === 'string' ? _sanitize(recipe.nutrition_details, 10000) : (recipe.nutrition_details ? JSON.stringify(recipe.nutrition_details) : null);
        const createdAt = (recipe.created_at && /^\d{4}-\d{2}-\d{2}/.test(recipe.created_at)) ? String(recipe.created_at).slice(0, 30) : null;
        const updatedAt = (recipe.updated_at && /^\d{4}-\d{2}-\d{2}/.test(recipe.updated_at)) ? String(recipe.updated_at).slice(0, 30) : null;

        const existing = db.prepare('SELECT id FROM recipes WHERE user_id = ? AND LOWER(title) = LOWER(?)').get(userId, title);

        if (existing && overwrite) {
          // Überschreiben: Rezept-Felder aktualisieren, Kinder löschen + neu einfügen
          db.prepare(`UPDATE recipes SET description = ?, servings = ?, prep_time = ?, cook_time = ?, total_time = ?, difficulty = ?, source_url = ?, is_favorite = ?, notes = ?, ai_generated = ?, times_cooked = ?, last_cooked_at = ?, calories = ?, protein = ?, carbs = ?, fat = ?, nutrition_note = ?, nutrition_details = ?, updated_at = COALESCE(?, CURRENT_TIMESTAMP) WHERE id = ?`)
            .run(description, servings, prepTime, cookTime, totalTime, difficulty, sourceUrl, recipe.is_favorite ? 1 : 0, notes, recipe.ai_generated ? 1 : 0, Math.min(parseInt(recipe.times_cooked) || 0, 99999), recipe.last_cooked_at || null, calories, protein, carbs, fat, nutritionNote, nutritionDetails, updatedAt, existing.id);
          // Kinder löschen
          db.prepare('DELETE FROM ingredients WHERE recipe_id = ?').run(existing.id);
          db.prepare('DELETE FROM cooking_steps WHERE recipe_id = ?').run(existing.id);
          db.prepare('DELETE FROM recipe_categories WHERE recipe_id = ?').run(existing.id);
          insertRecipeChildren(existing.id, recipe);
          importedRecipeMap.set(title.toLowerCase(), existing.id);
          result.recipes.updated++;
        } else if (existing) {
          // Nicht überschreiben → überspringen
          importedRecipeMap.set(title.toLowerCase(), existing.id);
          result.recipes.skipped++;
        } else {
          // Neu einfügen
          const res = db.prepare(`INSERT INTO recipes (user_id, title, description, servings, prep_time, cook_time, total_time, difficulty, source_url, is_favorite, notes, ai_generated, times_cooked, last_cooked_at, calories, protein, carbs, fat, nutrition_note, nutrition_details, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))`)
            .run(userId, title, description, servings, prepTime, cookTime, totalTime, difficulty, sourceUrl, recipe.is_favorite ? 1 : 0, notes, recipe.ai_generated ? 1 : 0, Math.min(parseInt(recipe.times_cooked) || 0, 99999), recipe.last_cooked_at || null, calories, protein, carbs, fat, nutritionNote, nutritionDetails, createdAt, updatedAt);
          const newId = res.lastInsertRowid;
          insertRecipeChildren(newId, recipe);
          importedRecipeMap.set(title.toLowerCase(), newId);
          result.recipes.imported++;
        }
      }

      // 2. Sammlungen (bereits update-fähig, bei overwrite auch Rezept-Zuordnungen ersetzen)
      for (const col of collections) {
        if (!col.name || typeof col.name !== 'string') { result.collections.skipped++; continue; }
        const name = _sanitize(col.name, 100);
        const icon = _sanitize(col.icon || '📁', 10);
        const color = /^#[0-9a-fA-F]{6}$/.test(col.color) ? col.color : '#6366f1';
        const sortOrder = typeof col.sort_order === 'number' ? col.sort_order : 0;
        const existing = db.prepare('SELECT id FROM collections WHERE user_id = ? AND name = ? COLLATE NOCASE').get(userId, name);
        let colId;
        if (existing) {
          db.prepare('UPDATE collections SET icon = ?, color = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(icon, color, sortOrder, existing.id);
          colId = existing.id;
          if (overwrite) {
            // Bei Überschreiben: alte Zuordnungen entfernen
            db.prepare('DELETE FROM recipe_collections WHERE collection_id = ?').run(colId);
          }
          result.collections.updated++;
        } else {
          const r = db.prepare('INSERT INTO collections (user_id, name, icon, color, sort_order) VALUES (?, ?, ?, ?, ?)').run(userId, name, icon, color, sortOrder);
          colId = r.lastInsertRowid;
          result.collections.imported++;
        }
        if (Array.isArray(col.recipe_titles)) {
          for (const t of col.recipe_titles) { if (typeof t !== 'string') continue; const rid = importedRecipeMap.get(t.toLowerCase()); if (rid) { const r2 = db.prepare('INSERT OR IGNORE INTO recipe_collections (recipe_id, collection_id) VALUES (?, ?)').run(rid, colId); if (r2.changes > 0) result.collections.recipes_linked++; } }
        }
      }

      // 3. Pantry
      for (const item of pantry) {
        if (!item.ingredient_name || typeof item.ingredient_name !== 'string') { result.pantry.skipped++; continue; }
        const name = _sanitize(item.ingredient_name, 200);
        const ex = db.prepare('SELECT id FROM pantry WHERE user_id = ? AND LOWER(ingredient_name) = LOWER(?)').get(userId, name);
        const amount = Math.min(Math.max(parseFloat(item.amount) || 1, 0), 99999);
        const expiryDate = (item.expiry_date && /^\d{4}-\d{2}-\d{2}$/.test(item.expiry_date)) ? item.expiry_date : null;
        if (ex) {
          if (overwrite) {
            // Überschreiben: Werte komplett ersetzen
            db.prepare('UPDATE pantry SET amount = ?, unit = ?, category = ?, expiry_date = ?, notes = ?, is_permanent = ? WHERE id = ?')
              .run(amount, _sanitize(item.unit || 'Stk', 50), _sanitize(item.category || 'Sonstiges', 100), expiryDate, _sanitize(item.notes || '', 500), item.is_permanent ? 1 : 0, ex.id);
          } else {
            // Standard: Menge addieren
            db.prepare('UPDATE pantry SET amount = amount + ? WHERE id = ?').run(amount, ex.id);
          }
          result.pantry.updated++;
        } else {
          db.prepare('INSERT INTO pantry (user_id, ingredient_name, amount, unit, category, expiry_date, notes, is_permanent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(userId, name, amount, _sanitize(item.unit || 'Stk', 50), _sanitize(item.category || 'Sonstiges', 100), expiryDate, _sanitize(item.notes || '', 500), item.is_permanent ? 1 : 0);
          result.pantry.imported++;
        }
      }

      // 4. Wochenpläne
      const adminUserMealCategories = getMealTimeCategories(userId);
      const adminMealTypeAliasMap = {
        fruehstueck: 'Frühstück', mittag: 'Mittagessen', abendessen: 'Abendessen', snack: 'Snack',
        breakfast: 'Frühstück', lunch: 'Mittagessen', dinner: 'Abendessen',
      };

      function adminResolveCategoryId(entry) {
        if (entry.category_name) {
          const cat = adminUserMealCategories.find(c => c.name.toLowerCase() === entry.category_name.toLowerCase());
          if (cat) return cat.id;
        }
        if (entry.meal_type && adminMealTypeAliasMap[entry.meal_type]) {
          const alias = adminMealTypeAliasMap[entry.meal_type];
          const cat = adminUserMealCategories.find(c => c.name.toLowerCase() === alias.toLowerCase());
          if (cat) return cat.id;
        }
        return adminUserMealCategories[0]?.id || null;
      }

      for (const plan of mealPlans) {
        if (!plan.week_start || !/^\d{4}-\d{2}-\d{2}$/.test(plan.week_start)) { result.meal_plans.skipped++; continue; }
        const ex = db.prepare('SELECT id FROM meal_plans WHERE user_id = ? AND week_start = ?').get(userId, plan.week_start);

        let planId;
        if (ex && overwrite) {
          // Überschreiben: alte Einträge löschen, Plan behalten
          db.prepare('DELETE FROM meal_plan_entries WHERE meal_plan_id = ?').run(ex.id);
          planId = ex.id;
          result.meal_plans.updated++;
        } else if (ex) {
          result.meal_plans.skipped++;
          continue;
        } else {
          const pr = db.prepare('INSERT INTO meal_plans (user_id, week_start) VALUES (?, ?)').run(userId, plan.week_start);
          planId = pr.lastInsertRowid;
          result.meal_plans.imported++;
        }

        if (Array.isArray(plan.entries)) {
          for (const e of plan.entries.slice(0, 50)) {
            let rid = null;
            if (e.recipe_title) rid = importedRecipeMap.get(e.recipe_title.toLowerCase()) || null;
            if (!rid && e.recipe_id) { const c = db.prepare('SELECT id FROM recipes WHERE id = ? AND user_id = ?').get(e.recipe_id, userId); if (c) rid = c.id; }
            if (!rid) continue;
            const dayOfWeek = Math.min(Math.max(parseInt(e.day_of_week) || 0, 0), 6);
            const categoryId = adminResolveCategoryId(e);
            const mealType = e.meal_type || e.category_name || 'mittag';
            const servings = Math.min(Math.max(parseInt(e.servings) || 2, 1), 100);
            db.prepare('INSERT INTO meal_plan_entries (meal_plan_id, recipe_id, day_of_week, meal_type, category_id, servings, is_cooked) VALUES (?, ?, ?, ?, ?, ?, ?)').run(planId, rid, dayOfWeek, mealType, categoryId, servings, e.is_cooked ? 1 : 0);
            result.meal_plans.entries_imported++;
          }
        }
      }

      // 5. Einkaufslisten
      for (const list of shoppingLists) {
        // Bei Überschreiben: bestehende gleichnamige Liste löschen
        if (overwrite && list.name) {
          const exList = db.prepare('SELECT id FROM shopping_lists WHERE user_id = ? AND name = ? COLLATE NOCASE').get(userId, _sanitize(list.name, 200));
          if (exList) {
            db.prepare('DELETE FROM shopping_list_items WHERE shopping_list_id = ?').run(exList.id);
            db.prepare('DELETE FROM shopping_lists WHERE id = ?').run(exList.id);
          }
        }
        const lr = db.prepare('INSERT INTO shopping_lists (user_id, name, is_active) VALUES (?, ?, 0)').run(userId, _sanitize(list.name || 'Import', 200));
        result.shopping_lists.imported++;
        if (Array.isArray(list.items)) {
          for (const item of list.items.slice(0, 500)) {
            if (!item.ingredient_name) continue;
            let rid = null;
            if (item.recipe_title) rid = importedRecipeMap.get(item.recipe_title.toLowerCase()) || null;
            const amount = typeof item.amount === 'number' ? Math.min(Math.max(item.amount, 0), 99999) : (parseFloat(item.amount) || 1);
            db.prepare('INSERT INTO shopping_list_items (shopping_list_id, ingredient_name, amount, unit, is_checked, recipe_id) VALUES (?, ?, ?, ?, ?, ?)').run(lr.lastInsertRowid, _sanitize(item.ingredient_name, 300), amount, _sanitize(item.unit || '', 50), item.is_checked ? 1 : 0, rid);
            result.shopping_lists.items_imported++;
          }
        }
      }

      // 6. Rezept-Sperren
      for (const block of recipeBlocks) {
        if (!block.recipe_title) { result.recipe_blocks.skipped++; continue; }
        const rid = importedRecipeMap.get(block.recipe_title.toLowerCase());
        if (!rid) { result.recipe_blocks.skipped++; continue; }
        const ex = db.prepare('SELECT id FROM recipe_blocks WHERE user_id = ? AND recipe_id = ?').get(userId, rid);
        if (ex) { db.prepare('UPDATE recipe_blocks SET blocked_until = ?, reason = ? WHERE id = ?').run(block.blocked_until || null, _sanitize(block.reason || '', 500), ex.id); result.recipe_blocks.updated++; }
        else { db.prepare('INSERT INTO recipe_blocks (user_id, recipe_id, blocked_until, reason) VALUES (?, ?, ?, ?)').run(userId, rid, block.blocked_until || null, _sanitize(block.reason || '', 500)); result.recipe_blocks.imported++; }
      }

      // 7. Zutaten-Aliase
      for (const alias of ingredientAliases) {
        if (!alias.canonical_name || !alias.alias_name) { result.ingredient_aliases.skipped++; continue; }
        const ex = db.prepare('SELECT id FROM ingredient_aliases WHERE user_id = ? AND alias_name = ? COLLATE NOCASE').get(userId, alias.alias_name);
        if (ex) { db.prepare('UPDATE ingredient_aliases SET canonical_name = ? WHERE id = ?').run(_sanitize(alias.canonical_name, 200), ex.id); result.ingredient_aliases.updated++; }
        else { db.prepare('INSERT INTO ingredient_aliases (user_id, canonical_name, alias_name) VALUES (?, ?, ?)').run(userId, _sanitize(alias.canonical_name, 200), _sanitize(alias.alias_name, 200)); result.ingredient_aliases.imported++; }
      }

      // 8. Geblockte Zutaten
      for (const name of blockedIngredients) {
        if (typeof name !== 'string' || !name.trim()) { result.blocked_ingredients.skipped++; continue; }
        const r = db.prepare('INSERT OR IGNORE INTO blocked_ingredients (user_id, ingredient_name) VALUES (?, ?)').run(userId, _sanitize(name, 200));
        if (r.changes > 0) result.blocked_ingredients.imported++; else result.blocked_ingredients.skipped++;
      }
    });
    transaction();

    // Bilder async verarbeiten
    if (pendingImages.length > 0) {
      const uploadsDir = resolve(config.upload.path, 'recipes');
      if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });
      for (const { recipeId, base64 } of pendingImages) {
        try {
          const imgBuffer = Buffer.from(base64, 'base64');
          const filename = `${generateId()}.webp`;
          const filePath = join(uploadsDir, filename);
          const processed = await sharp(imgBuffer).resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
          writeFileSync(filePath, processed);
          db.prepare('UPDATE recipes SET image_url = ? WHERE id = ?').run(`/api/uploads/recipes/${filename}`, recipeId);
        } catch { /* skip */ }
      }
    }

    return result;
  }

  /**
   * POST /api/admin/backup/import-json
   * Kompletter JSON-Import — bei admin_full_backup werden alle Benutzer
   * automatisch per Username zugeordnet. Bei full_backup (Einzel-User)
   * muss ein Ziel-Benutzer angegeben werden.
   *
   * Optionale Felder (Formular):
   *   create_users = "true" → fehlende Benutzer automatisch anlegen
   *   overwrite    = "true" → bestehende Daten überschreiben statt überspringen
   */
  fastify.post('/backup/import-json', {
    schema: {
      description: 'Kompletter JSON-Import (Admin) – Multi-User oder Einzel-User, optional mit Überschreiben und User-Anlage',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    let importData;
    let targetUserId;
    let createUsers = false;
    let overwrite = false;

    if (request.isMultipart()) {
      const parts = {};
      for await (const part of request.parts()) {
        if (part.file) {
          const buffer = await part.toBuffer();
          parts.file = buffer.toString('utf-8').replace(/^\uFEFF/, '').trim();
        } else {
          parts[part.fieldname] = part.value;
        }
      }
      if (!parts.file) return reply.status(400).send({ error: 'Keine Datei hochgeladen.' });
      try { importData = JSON.parse(parts.file); } catch { return reply.status(400).send({ error: 'Ungültiges JSON.' }); }
      targetUserId = parts.user_id ? parseInt(parts.user_id) : null;
      createUsers = parts.create_users === 'true' || parts.create_users === true;
      overwrite = parts.overwrite === 'true' || parts.overwrite === true;
    } else {
      importData = request.body;
      targetUserId = importData?.user_id || null;
      createUsers = importData?.create_users === true;
      overwrite = importData?.overwrite === true;
    }

    if (!importData || importData.source !== 'Zauberjournal') {
      return reply.status(400).send({ error: 'Ungültige Quelle — nur Zauberjournal-Backups.' });
    }

    const importOptions = { overwrite };

    // ── admin_full_backup: Alle Benutzer automatisch per Username zuordnen ──
    if (importData.type === 'admin_full_backup') {
      if (!Array.isArray(importData.users) || importData.users.length === 0) {
        return reply.status(400).send({ error: 'Keine Benutzerdaten im Backup gefunden.' });
      }

      // Alle existierenden User laden (Username → ID)
      const allDbUsers = db.prepare('SELECT id, username FROM users').all();
      const usernameToId = new Map(allDbUsers.map(u => [u.username.toLowerCase(), u.id]));

      const perUserResults = [];
      const unmatchedUsers = [];
      const createdUsers = [];
      const tempPassword = generateRandomPassword();
      let hashedTempPw = null;

      for (const entry of importData.users) {
        const backupUsername = entry.user?.username;
        if (!backupUsername) { unmatchedUsers.push('(kein Username)'); continue; }

        let matchedUserId = usernameToId.get(backupUsername.toLowerCase());

        // Fehlenden User automatisch anlegen
        if (!matchedUserId && createUsers && entry.user) {
          try {
            // Passwort-Hash nur einmal erzeugen
            if (!hashedTempPw) hashedTempPw = bcrypt.hashSync(tempPassword, 10);

            const u = entry.user;
            const username = String(u.username || '').trim().slice(0, 50);
            const email = String(u.email || `${username}@import.local`).trim().slice(0, 255);
            const displayName = String(u.display_name || username).trim().slice(0, 100);
            const role = (u.role === 'admin') ? 'admin' : 'user';
            const isActive = u.is_active !== undefined ? (u.is_active ? 1 : 0) : 1;
            const createdAt = (u.created_at && /^\d{4}-\d{2}-\d{2}/.test(u.created_at)) ? String(u.created_at).slice(0, 30) : null;

            // Prüfe ob Username gültig ist
            if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
              unmatchedUsers.push(`${backupUsername} (ungültiger Username)`);
              continue;
            }
            // Prüfe ob E-Mail schon belegt
            const emailExists = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email);
            if (emailExists) {
              // Fallback-Email generieren
              const fallbackEmail = `${username}-${Date.now()}@import.local`;
              db.prepare('INSERT INTO users (username, email, display_name, role, is_active, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))')
                .run(username, fallbackEmail, displayName, role, isActive, hashedTempPw, createdAt);
            } else {
              db.prepare('INSERT INTO users (username, email, display_name, role, is_active, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))')
                .run(username, email, displayName, role, isActive, hashedTempPw, createdAt);
            }

            const newUser = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(username);
            if (newUser) {
              matchedUserId = newUser.id;
              usernameToId.set(username.toLowerCase(), newUser.id);
              createdUsers.push(username);
            }
          } catch (err) {
            unmatchedUsers.push(`${backupUsername} (Anlage fehlgeschlagen: ${err.message})`);
            continue;
          }
        }

        if (!matchedUserId) {
          unmatchedUsers.push(backupUsername);
          continue;
        }

        if (!entry.data || typeof entry.data !== 'object') {
          unmatchedUsers.push(`${backupUsername} (keine Daten)`);
          continue;
        }

        const userResult = await importBackupDataForUser(matchedUserId, entry.data, importOptions);
        const totalImported = Object.values(userResult).reduce((sum, r) => sum + (r.imported || 0), 0);
        const totalUpdated = Object.values(userResult).reduce((sum, r) => sum + (r.updated || 0), 0);
        const totalSkipped = Object.values(userResult).reduce((sum, r) => sum + (r.skipped || 0), 0);
        perUserResults.push({ username: backupUsername, imported: totalImported, updated: totalUpdated, skipped: totalSkipped, details: userResult });
      }

      logAdminAction(request.user.id, 'JSON-Komplett-Import', `Multi-User-Import: ${perUserResults.length} Benutzer${overwrite ? ' (Überschreiben)' : ''}${createdUsers.length ? `, ${createdUsers.length} User angelegt` : ''}`);

      // Gesamt-Zusammenfassung
      const totalDetails = {
        recipes: { imported: 0, updated: 0, skipped: 0 },
        collections: { imported: 0, updated: 0, skipped: 0, recipes_linked: 0 },
        pantry: { imported: 0, updated: 0, skipped: 0 },
        meal_plans: { imported: 0, updated: 0, skipped: 0, entries_imported: 0 },
        shopping_lists: { imported: 0, items_imported: 0 },
        recipe_blocks: { imported: 0, updated: 0, skipped: 0 },
        ingredient_aliases: { imported: 0, updated: 0, skipped: 0 },
        blocked_ingredients: { imported: 0, skipped: 0 },
      };
      for (const ur of perUserResults) {
        for (const [key, val] of Object.entries(ur.details)) {
          for (const [k, v] of Object.entries(val)) {
            totalDetails[key][k] = (totalDetails[key][k] || 0) + v;
          }
        }
      }

      const totalImported = Object.values(totalDetails).reduce((sum, r) => sum + (r.imported || 0), 0);
      const totalUpdated = Object.values(totalDetails).reduce((sum, r) => sum + (r.updated || 0), 0);
      const totalSkipped = Object.values(totalDetails).reduce((sum, r) => sum + (r.skipped || 0), 0);

      return {
        message: `Multi-User-Import abgeschlossen: ${perUserResults.length} Benutzer verarbeitet, ${unmatchedUsers.length} nicht zugeordnet. ${totalImported} neu, ${totalUpdated} aktualisiert, ${totalSkipped} übersprungen.`,
        users_imported: perUserResults.length,
        users_created: createdUsers,
        users_unmatched: unmatchedUsers,
        temp_password: createdUsers.length > 0 ? tempPassword : undefined,
        overwrite_mode: overwrite,
        per_user: perUserResults.map(r => ({ username: r.username, imported: r.imported, updated: r.updated, skipped: r.skipped })),
        details: totalDetails,
      };
    }

    // ── full_backup (Einzel-User): Ziel-Benutzer erforderlich ──
    if (importData.type === 'full_backup') {
      if (!targetUserId) return reply.status(400).send({ error: 'user_id ist erforderlich für Einzel-User-Backups.' });
      const targetUser = db.prepare('SELECT id, username FROM users WHERE id = ?').get(targetUserId);
      if (!targetUser) return reply.status(404).send({ error: 'Benutzer nicht gefunden.' });

      if (!importData.data || typeof importData.data !== 'object') {
        return reply.status(400).send({ error: 'Keine gültigen Daten im Backup.' });
      }

      const result = await importBackupDataForUser(targetUserId, importData.data, importOptions);
      logAdminAction(request.user.id, 'JSON-Komplett-Import', `Einzel-Import für ${targetUser.username}${overwrite ? ' (Überschreiben)' : ''}`);

      const totalImported = Object.values(result).reduce((sum, r) => sum + (r.imported || 0), 0);
      const totalUpdated = Object.values(result).reduce((sum, r) => sum + (r.updated || 0), 0);
      const totalSkipped = Object.values(result).reduce((sum, r) => sum + (r.skipped || 0), 0);

      return {
        message: `Backup-Import für "${targetUser.username}" abgeschlossen: ${totalImported} neu, ${totalUpdated} aktualisiert, ${totalSkipped} übersprungen.`,
        target_user: targetUser.username,
        overwrite_mode: overwrite,
        details: result,
      };
    }

    return reply.status(400).send({ error: 'Unbekannter Backup-Typ. Erwartet: full_backup oder admin_full_backup.' });
  });

  // ============================================
  // Komplett-Backup (SQLite DB Download)
  // ============================================

  /**
   * GET /api/admin/backup/download
   * SQLite-Datenbank als Datei herunterladen
   */
  fastify.get('/backup/download', {
    schema: {
      description: 'Komplette Datenbank als Backup herunterladen (Admin)',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const dbPath = config.database.path;
    if (!existsSync(dbPath)) {
      return reply.status(404).send({ error: 'Datenbank-Datei nicht gefunden.' });
    }

    // WAL checkpoint, damit alle Daten in der Hauptdatei sind
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch { /* Ignorieren falls kein WAL-Modus */ }

    const dbBuffer = readFileSync(dbPath);
    const dateStr = new Date().toISOString().split('T')[0];

    logAdminAction(request.user.id, 'Datenbank-Backup heruntergeladen', `${(dbBuffer.length / 1024 / 1024).toFixed(1)} MB`);

    reply.header('Content-Type', 'application/x-sqlite3');
    reply.header('Content-Disposition', `attachment; filename="cookbook-backup-${dateStr}.db"`);
    reply.header('Content-Length', dbBuffer.length);
    return reply.send(dbBuffer);
  });
}
