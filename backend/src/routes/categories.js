/**
 * ============================================
 * Kategorien-Routen
 * ============================================
 * CRUD für benutzerdefinierte Rezeptkategorien.
 */

import db from '../config/database.js';
import { householdWhereClause } from '../config/database.js';

export default async function categoriesRoutes(fastify) {
  fastify.addHook('onRequest', fastify.resolveHousehold);

  /**
   * GET /api/categories
   * Alle Kategorien des Benutzers
   */
  fastify.get('/', {
    schema: { description: 'Kategorien auflisten', tags: ['Kategorien'], security: [{ bearerAuth: [] }] },
  }, async (request) => {
    const { clause: hhClause, params: hhParams } = householdWhereClause(request.user.id, request.householdId, 'c');
    const categories = db.prepare(`
      SELECT c.*, COUNT(rc.recipe_id) as recipe_count
      FROM categories c
      LEFT JOIN recipe_categories rc ON c.id = rc.category_id
      WHERE (${hhClause})
      GROUP BY c.id
      ORDER BY c.sort_order
    `).all(...hhParams);

    return { categories };
  });

  /**
   * POST /api/categories
   * Neue Kategorie erstellen
   */
  fastify.post('/', {
    schema: {
      description: 'Neue Kategorie erstellen',
      tags: ['Kategorien'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
          icon: { type: 'string', maxLength: 10 },
          color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
          is_meal_time: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const { name, icon, color, is_meal_time } = request.body;
    const userId = request.user.id;
    const householdId = request.householdId || null;

    // Duplikat-Check (case-insensitive, scope-aware: gleicher User + gleicher Haushalt-Scope)
    const existing = db.prepare(
      `SELECT id FROM categories WHERE user_id = ? AND COALESCE(household_id, 0) = ? AND name = ? COLLATE NOCASE`
    ).get(userId, householdId || 0, name.trim());
    if (existing) {
      return reply.status(409).send({ error: `Kategorie „${name}" existiert bereits.` });
    }

    // Maximale sort_order ermitteln
    const { clause: hhClause, params: hhParams } = householdWhereClause(userId, request.householdId);
    const maxOrder = db.prepare(
      `SELECT MAX(sort_order) as max FROM categories WHERE (${hhClause})`
    ).get(...hhParams);

    const result = db.prepare(
      'INSERT INTO categories (user_id, name, icon, color, sort_order, household_id, is_meal_time) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(userId, name, icon || '🍽️', color || '#6366f1', (maxOrder.max || 0) + 1, householdId, is_meal_time ? 1 : 0);

    return reply.status(201).send({
      id: result.lastInsertRowid,
      message: 'Kategorie erstellt!',
    });
  });

  /**
   * PUT /api/categories/reorder
   * Reihenfolge aller Kategorien aktualisieren (Batch)
   * Body: { order: [{ id: 1, sort_order: 0 }, ...] }
   * WICHTIG: Muss VOR /:id registriert werden!
   */
  fastify.put('/reorder', {
    schema: {
      description: 'Kategorien-Reihenfolge aktualisieren',
      tags: ['Kategorien'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['order'],
        properties: {
          order: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'sort_order'],
              properties: {
                id: { type: 'integer' },
                sort_order: { type: 'integer' },
              },
            },
          },
        },
      },
    },
  }, async (request) => {
    const { clause: hhClause, params: hhParams } = householdWhereClause(request.user.id, request.householdId);
    const stmt = db.prepare(
      `UPDATE categories SET sort_order = ? WHERE id = ? AND (${hhClause})`
    );
    const transaction = db.transaction((items) => {
      for (const item of items) {
        stmt.run(item.sort_order, item.id, ...hhParams);
      }
    });
    transaction(request.body.order);
    return { message: 'Reihenfolge aktualisiert!' };
  });

  /**
   * PUT /api/categories/:id
   * Kategorie aktualisieren
   */
  fastify.put('/:id', {
    schema: { description: 'Kategorie aktualisieren', tags: ['Kategorien'], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const { name, icon, color, sort_order, is_meal_time } = request.body;
    const categoryId = request.params.id;
    const { clause: hhClause, params: hhParams } = householdWhereClause(request.user.id, request.householdId);

    // Aktuelle Kategorie laden (für Scope-Check + Namensvergleich)
    const current = db.prepare(
      `SELECT * FROM categories WHERE id = ? AND (${hhClause})`
    ).get(categoryId, ...hhParams);
    if (!current) return reply.status(404).send({ error: 'Kategorie nicht gefunden' });

    // Duplikat-Check NUR bei tatsächlicher Namensänderung, scope-aware
    if (name && name.trim().toLowerCase() !== current.name.toLowerCase()) {
      // Nur innerhalb des gleichen Scopes prüfen (user_id + household_id)
      const existing = db.prepare(
        `SELECT id FROM categories
         WHERE user_id = ? AND COALESCE(household_id, 0) = ?
           AND name = ? COLLATE NOCASE AND id != ?`
      ).get(current.user_id, current.household_id || 0, name.trim(), categoryId);
      if (existing) {
        return reply.status(409).send({ error: `Kategorie „${name}" existiert bereits.` });
      }
    }

    const result = db.prepare(
      `UPDATE categories SET name=COALESCE(?,name), icon=COALESCE(?,icon), color=COALESCE(?,color), sort_order=COALESCE(?,sort_order), is_meal_time=COALESCE(?,is_meal_time) WHERE id=? AND (${hhClause})`
    ).run(name, icon, color, sort_order, is_meal_time !== undefined ? (is_meal_time ? 1 : 0) : null, categoryId, ...hhParams);

    if (result.changes === 0) return reply.status(404).send({ error: 'Kategorie nicht gefunden' });
    return { message: 'Kategorie aktualisiert!' };
  });

  /**
   * DELETE /api/categories/:id
   * Kategorie löschen
   */
  fastify.delete('/:id', {
    schema: { description: 'Kategorie löschen', tags: ['Kategorien'], security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const categoryId = request.params.id;
    const { clause: hhClause, params: hhParams } = householdWhereClause(request.user.id, request.householdId);

    // Prüfen ob Kategorie existiert und dem User gehört
    const cat = db.prepare(`SELECT id FROM categories WHERE id = ? AND (${hhClause})`).get(categoryId, ...hhParams);
    if (!cat) return reply.status(404).send({ error: 'Kategorie nicht gefunden' });

    // Transaktion: Referenzierende Einträge aufräumen, dann Kategorie löschen
    // (meal_plan_entries.category_id hat kein ON DELETE CASCADE wegen ALTER TABLE)
    const deleteCategory = db.transaction(() => {
      db.prepare('DELETE FROM meal_plan_entries WHERE category_id = ?').run(categoryId);
      db.prepare('DELETE FROM categories WHERE id = ?').run(categoryId);
    });
    deleteCategory();

    return { message: 'Kategorie gelöscht' };
  });
}
