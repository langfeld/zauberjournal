/**
 * ============================================
 * Haushalt-Routen (Mehrbenutzerbetrieb)
 * ============================================
 * CRUD für Haushalte, Einladungs-System,
 * Mitgliederverwaltung und Daten-Migration.
 */

import db from '../config/database.js';
import { randomBytes } from 'crypto';
import { getDefaultHousehold, isHouseholdMember, getUserHouseholdIds } from '../config/database.js';
import { getSetting } from '../config/settings.js';

/**
 * Erzeugt einen 8-stelligen alphanumerischen Invite-Code
 */
function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne I, O, 0, 1 (Verwechslungsgefahr)
  let code = '';
  const bytes = randomBytes(8);
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

export default async function householdRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  // ─────────────────────────────────────────────
  // GET / – Eigene Haushalte auflisten
  // ─────────────────────────────────────────────
  fastify.get('/', {
    schema: {
      description: 'Alle Haushalte des aktuellen Benutzers',
      tags: ['Haushalte'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const userId = request.user.id;

    const households = db.prepare(`
      SELECT h.*, hm.is_default, hm.joined_at,
        (SELECT COUNT(*) FROM household_members WHERE household_id = h.id) as member_count
      FROM households h
      JOIN household_members hm ON h.id = hm.household_id
      WHERE hm.user_id = ?
      ORDER BY hm.is_default DESC, h.created_at ASC
    `).all(userId);

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

  // ─────────────────────────────────────────────
  // POST / – Neuen Haushalt erstellen
  // ─────────────────────────────────────────────
  fastify.post('/', {
    schema: {
      description: 'Neuen Haushalt erstellen',
      tags: ['Haushalte'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.id;
    const { name } = request.body;

    // Limit prüfen
    const maxHouseholds = parseInt(getSetting('max_households_per_user') || '3');
    const currentCount = db.prepare(
      'SELECT COUNT(*) as count FROM household_members WHERE user_id = ?'
    ).get(userId).count;

    if (currentCount >= maxHouseholds) {
      return reply.status(400).send({
        error: `Du kannst maximal ${maxHouseholds} Haushalten beitreten.`,
      });
    }

    // Invite-Code generieren (48h gültig)
    const inviteCode = generateInviteCode();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const result = db.transaction(() => {
      // Haushalt erstellen
      const { lastInsertRowid: householdId } = db.prepare(`
        INSERT INTO households (name, invite_code, invite_code_expires_at, created_by)
        VALUES (?, ?, ?, ?)
      `).run(name, inviteCode, expiresAt, userId);

      // Ersteller als Mitglied hinzufügen (Standard-Haushalt wenn erster)
      const isFirst = currentCount === 0 ? 1 : 0;
      db.prepare(`
        INSERT INTO household_members (household_id, user_id, is_default)
        VALUES (?, ?, ?)
      `).run(householdId, userId, isFirst);

      // Aktivitäts-Log
      db.prepare(`
        INSERT INTO household_activity (household_id, user_id, action, details)
        VALUES (?, ?, 'household:created', ?)
      `).run(householdId, userId, JSON.stringify({ name }));

      return householdId;
    })();

    const household = db.prepare('SELECT * FROM households WHERE id = ?').get(result);

    return reply.status(201).send({
      message: `Haushalt "${name}" erstellt!`,
      household: {
        ...household,
        member_count: 1,
        members: [{
          id: userId,
          username: request.user.username,
          joined_at: new Date().toISOString(),
        }],
      },
    });
  });

  // ─────────────────────────────────────────────
  // GET /:id – Haushalt-Details
  // ─────────────────────────────────────────────
  fastify.get('/:id', {
    schema: {
      description: 'Haushalt-Details mit Mitgliedern',
      tags: ['Haushalte'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const householdId = parseInt(request.params.id);
    const userId = request.user.id;

    if (!isHouseholdMember(userId, householdId)) {
      return reply.status(403).send({ error: 'Kein Zugriff auf diesen Haushalt.' });
    }

    const household = db.prepare('SELECT * FROM households WHERE id = ?').get(householdId);
    if (!household) {
      return reply.status(404).send({ error: 'Haushalt nicht gefunden.' });
    }

    household.members = db.prepare(`
      SELECT u.id, u.username, u.display_name, hm.joined_at, hm.is_default
      FROM household_members hm
      JOIN users u ON hm.user_id = u.id
      WHERE hm.household_id = ?
      ORDER BY hm.joined_at ASC
    `).all(householdId);

    household.member_count = household.members.length;

    // Statistiken
    household.stats = {
      recipes: db.prepare('SELECT COUNT(*) as count FROM recipes WHERE household_id = ?').get(householdId).count,
      pantry_items: db.prepare('SELECT COUNT(*) as count FROM pantry WHERE household_id = ?').get(householdId).count,
    };

    return { household };
  });

  // ─────────────────────────────────────────────
  // PUT /:id – Haushalt umbenennen
  // ─────────────────────────────────────────────
  fastify.put('/:id', {
    schema: {
      description: 'Haushalt umbenennen',
      tags: ['Haushalte'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
        },
      },
    },
  }, async (request, reply) => {
    const householdId = parseInt(request.params.id);
    const userId = request.user.id;

    if (!isHouseholdMember(userId, householdId)) {
      return reply.status(403).send({ error: 'Kein Zugriff auf diesen Haushalt.' });
    }

    const { name } = request.body;
    if (name) {
      db.prepare('UPDATE households SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(name, householdId);
    }

    return { message: 'Haushalt aktualisiert!' };
  });

  // ─────────────────────────────────────────────
  // DELETE /:id – Haushalt auflösen
  // ─────────────────────────────────────────────
  fastify.delete('/:id', {
    schema: {
      description: 'Haushalt auflösen (nur Ersteller). Daten werden den jeweiligen Erstellern als private Daten zurückgegeben.',
      tags: ['Haushalte'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const householdId = parseInt(request.params.id);
    const userId = request.user.id;

    const household = db.prepare('SELECT * FROM households WHERE id = ?').get(householdId);
    if (!household) {
      return reply.status(404).send({ error: 'Haushalt nicht gefunden.' });
    }

    if (household.created_by !== userId) {
      return reply.status(403).send({ error: 'Nur der Ersteller kann den Haushalt auflösen.' });
    }

    db.transaction(() => {
      // Alle Haushalt-Daten zurück zu privaten Daten machen
      // Rezepte → created_by_user_id wird owner, household_id = NULL
      db.prepare(`
        UPDATE recipes SET household_id = NULL
        WHERE household_id = ?
      `).run(householdId);

      // Andere Tabellen: household_id = NULL
      for (const table of ['categories', 'collections', 'meal_plans', 'shopping_lists',
                           'pantry', 'ingredient_aliases', 'blocked_ingredients', 'recipe_blocks']) {
        db.prepare(`UPDATE ${table} SET household_id = NULL WHERE household_id = ?`).run(householdId);
      }

      // Haushalt löschen (CASCADE löscht household_members + household_activity)
      db.prepare('DELETE FROM households WHERE id = ?').run(householdId);
    })();

    return { message: 'Haushalt aufgelöst. Daten wurden privatisiert.' };
  });

  // ─────────────────────────────────────────────
  // POST /:id/invite – Neuen Invite-Code generieren
  // ─────────────────────────────────────────────
  fastify.post('/:id/invite', {
    schema: {
      description: 'Neuen Einladungs-Code generieren (alter wird ungültig)',
      tags: ['Haushalte'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          expires_hours: { type: 'integer', minimum: 1, maximum: 168, default: 48 },
        },
      },
    },
  }, async (request, reply) => {
    const householdId = parseInt(request.params.id);
    const userId = request.user.id;

    if (!isHouseholdMember(userId, householdId)) {
      return reply.status(403).send({ error: 'Kein Zugriff auf diesen Haushalt.' });
    }

    const expiresHours = request.body?.expires_hours || 48;
    const inviteCode = generateInviteCode();
    const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000).toISOString();

    db.prepare(`
      UPDATE households SET invite_code = ?, invite_code_expires_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(inviteCode, expiresAt, householdId);

    return {
      invite_code: inviteCode,
      expires_at: expiresAt,
      message: 'Neuer Einladungs-Code generiert!',
    };
  });

  // ─────────────────────────────────────────────
  // POST /join – Per Invite-Code beitreten
  // ─────────────────────────────────────────────
  fastify.post('/join', {
    config: {
      rateLimit: { max: 5, timeWindow: '15 minutes' },
    },
    schema: {
      description: 'Einem Haushalt per Einladungs-Code beitreten',
      tags: ['Haushalte'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['invite_code'],
        properties: {
          invite_code: { type: 'string', minLength: 8, maxLength: 8 },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.id;
    const { invite_code } = request.body;

    // Code normalisieren (Groß-/Kleinschreibung egal)
    const code = invite_code.toUpperCase().trim();

    const household = db.prepare(`
      SELECT * FROM households
      WHERE invite_code = ? AND invite_code_expires_at > datetime('now')
    `).get(code);

    if (!household) {
      return reply.status(400).send({
        error: 'Ungültiger oder abgelaufener Einladungs-Code.',
      });
    }

    // Bereits Mitglied?
    if (isHouseholdMember(userId, household.id)) {
      return reply.status(409).send({
        error: 'Du bist bereits Mitglied dieses Haushalts.',
      });
    }

    // Limit prüfen
    const maxMembers = parseInt(getSetting('max_household_members') || '10');
    const memberCount = db.prepare(
      'SELECT COUNT(*) as count FROM household_members WHERE household_id = ?'
    ).get(household.id).count;

    if (memberCount >= maxMembers) {
      return reply.status(400).send({
        error: `Dieser Haushalt hat das Mitglieder-Limit (${maxMembers}) erreicht.`,
      });
    }

    // Max Haushalte pro User prüfen
    const maxHouseholds = parseInt(getSetting('max_households_per_user') || '3');
    const userCount = db.prepare(
      'SELECT COUNT(*) as count FROM household_members WHERE user_id = ?'
    ).get(userId).count;

    if (userCount >= maxHouseholds) {
      return reply.status(400).send({
        error: `Du kannst maximal ${maxHouseholds} Haushalten beitreten.`,
      });
    }

    db.transaction(() => {
      // Als erster Haushalt = Standard
      const isFirst = userCount === 0 ? 1 : 0;
      db.prepare(`
        INSERT INTO household_members (household_id, user_id, is_default)
        VALUES (?, ?, ?)
      `).run(household.id, userId, isFirst);

      // Aktivitäts-Log
      db.prepare(`
        INSERT INTO household_activity (household_id, user_id, action, details)
        VALUES (?, ?, 'member:joined', ?)
      `).run(household.id, userId, JSON.stringify({ username: request.user.username }));
    })();

    return {
      message: `Du bist dem Haushalt "${household.name}" beigetreten!`,
      household_id: household.id,
      household_name: household.name,
    };
  });

  // ─────────────────────────────────────────────
  // DELETE /:id/leave – Haushalt verlassen
  // ─────────────────────────────────────────────
  fastify.delete('/:id/leave', {
    schema: {
      description: 'Haushalt verlassen. Eigene private Daten bleiben erhalten.',
      tags: ['Haushalte'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const householdId = parseInt(request.params.id);
    const userId = request.user.id;

    if (!isHouseholdMember(userId, householdId)) {
      return reply.status(404).send({ error: 'Du bist kein Mitglied dieses Haushalts.' });
    }

    const memberCount = db.prepare(
      'SELECT COUNT(*) as count FROM household_members WHERE household_id = ?'
    ).get(householdId).count;

    db.transaction(() => {
      // Mitgliedschaft entfernen
      db.prepare('DELETE FROM household_members WHERE household_id = ? AND user_id = ?')
        .run(householdId, userId);

      // Aktivitäts-Log
      db.prepare(`
        INSERT INTO household_activity (household_id, user_id, action, details)
        VALUES (?, ?, 'member:left', ?)
      `).run(householdId, userId, JSON.stringify({ username: request.user.username }));

      // Letztes Mitglied → Haushalt auflösen
      if (memberCount <= 1) {
        // Daten privatisieren
        db.prepare('UPDATE recipes SET household_id = NULL WHERE household_id = ?').run(householdId);
        for (const table of ['categories', 'collections', 'meal_plans', 'shopping_lists',
                             'pantry', 'ingredient_aliases', 'blocked_ingredients', 'recipe_blocks']) {
          db.prepare(`UPDATE ${table} SET household_id = NULL WHERE household_id = ?`).run(householdId);
        }
        db.prepare('DELETE FROM households WHERE id = ?').run(householdId);
      }
    })();

    return { message: 'Haushalt verlassen.' };
  });

  // ─────────────────────────────────────────────
  // DELETE /:id/members/:userId – Mitglied entfernen
  // ─────────────────────────────────────────────
  fastify.delete('/:id/members/:userId', {
    schema: {
      description: 'Mitglied aus Haushalt entfernen (nur Ersteller)',
      tags: ['Haushalte'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const householdId = parseInt(request.params.id);
    const targetUserId = parseInt(request.params.userId);
    const userId = request.user.id;

    const household = db.prepare('SELECT * FROM households WHERE id = ?').get(householdId);
    if (!household) {
      return reply.status(404).send({ error: 'Haushalt nicht gefunden.' });
    }

    // Nur Ersteller darf andere entfernen
    if (household.created_by !== userId) {
      return reply.status(403).send({ error: 'Nur der Ersteller kann Mitglieder entfernen.' });
    }

    // Sich selbst kann man nicht entfernen (→ leave benutzen)
    if (targetUserId === userId) {
      return reply.status(400).send({ error: 'Nutze "Haushalt verlassen" stattdessen.' });
    }

    const result = db.prepare(
      'DELETE FROM household_members WHERE household_id = ? AND user_id = ?'
    ).run(householdId, targetUserId);

    if (result.changes === 0) {
      return reply.status(404).send({ error: 'Mitglied nicht gefunden.' });
    }

    // Aktivitäts-Log
    const targetUser = db.prepare('SELECT username FROM users WHERE id = ?').get(targetUserId);
    db.prepare(`
      INSERT INTO household_activity (household_id, user_id, action, details)
      VALUES (?, ?, 'member:removed', ?)
    `).run(householdId, userId, JSON.stringify({
      removed_user: targetUser?.username,
      removed_by: request.user.username,
    }));

    return { message: 'Mitglied entfernt.' };
  });

  // ─────────────────────────────────────────────
  // PUT /:id/default – Als Standard-Haushalt setzen
  // ─────────────────────────────────────────────
  fastify.put('/:id/default', {
    schema: {
      description: 'Diesen Haushalt als Standard setzen',
      tags: ['Haushalte'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const householdId = parseInt(request.params.id);
    const userId = request.user.id;

    if (!isHouseholdMember(userId, householdId)) {
      return reply.status(403).send({ error: 'Kein Zugriff auf diesen Haushalt.' });
    }

    db.transaction(() => {
      // Alle auf nicht-default setzen
      db.prepare('UPDATE household_members SET is_default = 0 WHERE user_id = ?').run(userId);
      // Diesen als default
      db.prepare('UPDATE household_members SET is_default = 1 WHERE household_id = ? AND user_id = ?')
        .run(householdId, userId);
    })();

    return { message: 'Standard-Haushalt gesetzt.' };
  });

  // ─────────────────────────────────────────────
  // GET /:id/activity – Aktivitäts-Feed
  // ─────────────────────────────────────────────
  fastify.get('/:id/activity', {
    schema: {
      description: 'Aktivitäts-Feed des Haushalts',
      tags: ['Haushalte'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 },
        },
      },
    },
  }, async (request, reply) => {
    const householdId = parseInt(request.params.id);
    const userId = request.user.id;

    if (!isHouseholdMember(userId, householdId)) {
      return reply.status(403).send({ error: 'Kein Zugriff auf diesen Haushalt.' });
    }

    const limit = request.query.limit || 20;
    const offset = request.query.offset || 0;

    const activities = db.prepare(`
      SELECT ha.*, u.username, u.display_name
      FROM household_activity ha
      LEFT JOIN users u ON ha.user_id = u.id
      WHERE ha.household_id = ?
      ORDER BY ha.created_at DESC
      LIMIT ? OFFSET ?
    `).all(householdId, limit, offset);

    const total = db.prepare(
      'SELECT COUNT(*) as count FROM household_activity WHERE household_id = ?'
    ).get(householdId).count;

    return {
      activities: activities.map(a => ({
        ...a,
        details: a.details ? JSON.parse(a.details) : null,
      })),
      total,
      hasMore: offset + limit < total,
    };
  });

  // ─────────────────────────────────────────────
  // GET /:id/dashboard-feed – Aggregierter Aktivitäts-Feed
  // ─────────────────────────────────────────────
  fastify.get('/:id/dashboard-feed', {
    schema: {
      description: 'Aggregierter Feed aus Rezepten, Kochhistorie, Wochenplan und Einkäufen',
      tags: ['Haushalte'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 15 },
        },
      },
    },
  }, async (request, reply) => {
    const householdId = parseInt(request.params.id);
    const userId = request.user.id;

    if (!isHouseholdMember(userId, householdId)) {
      return reply.status(403).send({ error: 'Kein Zugriff auf diesen Haushalt.' });
    }

    const limit = request.query.limit || 15;
    const events = [];

    // 1. Kürzlich erstellte Rezepte
    const newRecipes = db.prepare(`
      SELECT r.id, r.title, r.created_at as ts, r.user_id, u.username, u.display_name
      FROM recipes r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.household_id = ?
      ORDER BY r.created_at DESC LIMIT ?
    `).all(householdId, limit);

    for (const r of newRecipes) {
      events.push({
        type: 'recipe:created',
        message: `hat „${r.title}" hinzugefügt`,
        username: r.display_name || r.username,
        user_id: r.user_id,
        timestamp: r.ts,
        icon: '📝',
        link: `/recipes/${r.id}`,
      });
    }

    // 2. Kürzlich gekochte Rezepte
    const cooked = db.prepare(`
      SELECT ch.cooked_at as ts, r.title, r.id as recipe_id, ch.user_id, u.username, u.display_name
      FROM cooking_history ch
      JOIN recipes r ON ch.recipe_id = r.id
      LEFT JOIN users u ON ch.user_id = u.id
      WHERE r.household_id = ?
      ORDER BY ch.cooked_at DESC LIMIT ?
    `).all(householdId, limit);

    for (const c of cooked) {
      events.push({
        type: 'recipe:cooked',
        message: `hat „${c.title}" gekocht`,
        username: c.display_name || c.username,
        user_id: c.user_id,
        timestamp: c.ts,
        icon: '👨‍🍳',
        link: `/recipes/${c.recipe_id}`,
      });
    }

    // 3. Wochenpläne erstellt
    const plans = db.prepare(`
      SELECT mp.id, mp.created_at as ts, mp.user_id, u.username, u.display_name,
        (SELECT COUNT(*) FROM meal_plan_entries WHERE meal_plan_id = mp.id) as entry_count
      FROM meal_plans mp
      LEFT JOIN users u ON mp.user_id = u.id
      WHERE mp.household_id = ?
      ORDER BY mp.created_at DESC LIMIT ?
    `).all(householdId, limit);

    for (const p of plans) {
      events.push({
        type: 'mealplan:created',
        message: `hat einen Wochenplan erstellt (${p.entry_count} Gerichte)`,
        username: p.display_name || p.username,
        user_id: p.user_id,
        timestamp: p.ts,
        icon: '📅',
        link: '/mealplan',
      });
    }

    // 4. Einkäufe abgeschlossen (is_active = 0 bedeutet abgeschlossen)
    const completedLists = db.prepare(`
      SELECT sl.id, sl.created_at as ts, sl.user_id, u.username, u.display_name,
        (SELECT COUNT(*) FROM shopping_list_items WHERE shopping_list_id = sl.id) as item_count
      FROM shopping_lists sl
      LEFT JOIN users u ON sl.user_id = u.id
      WHERE sl.household_id = ? AND sl.is_active = 0
      ORDER BY sl.created_at DESC LIMIT ?
    `).all(householdId, limit);

    for (const s of completedLists) {
      events.push({
        type: 'shopping:completed',
        message: `hat den Einkauf abgeschlossen (${s.item_count} Artikel)`,
        username: s.display_name || s.username,
        user_id: s.user_id,
        timestamp: s.ts,
        icon: '🛒',
        link: '/shopping',
      });
    }

    // 5. Haushalt-Events (Mitglieder beigetreten, verlassen etc.)
    const householdEvents = db.prepare(`
      SELECT ha.action, ha.details, ha.created_at as ts, ha.user_id, u.username, u.display_name
      FROM household_activity ha
      LEFT JOIN users u ON ha.user_id = u.id
      WHERE ha.household_id = ?
      ORDER BY ha.created_at DESC LIMIT ?
    `).all(householdId, limit);

    const actionLabels = {
      'household:created': 'hat den Haushalt erstellt',
      'member:joined': 'ist dem Haushalt beigetreten',
      'member:left': 'hat den Haushalt verlassen',
      'member:removed': 'wurde aus dem Haushalt entfernt',
      'data:migrated': 'hat Daten in den Haushalt migriert',
    };

    for (const e of householdEvents) {
      events.push({
        type: e.action,
        message: actionLabels[e.action] || e.action,
        username: e.display_name || e.username,
        user_id: e.user_id,
        timestamp: e.ts,
        icon: '🏠',
        link: '/household',
      });
    }

    // Nach Zeitstempel sortieren, neueste zuerst
    events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return {
      events: events.slice(0, limit),
    };
  });

  // ─────────────────────────────────────────────
  // GET /:id/stats – Haushalt-Statistiken
  // ─────────────────────────────────────────────
  fastify.get('/:id/stats', {
    schema: {
      description: 'Statistiken des Haushalts',
      tags: ['Haushalte'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const householdId = parseInt(request.params.id);
    const userId = request.user.id;

    if (!isHouseholdMember(userId, householdId)) {
      return reply.status(403).send({ error: 'Kein Zugriff auf diesen Haushalt.' });
    }

    // Gemeinsam gekochte Rezepte (distinct)
    const cookedCount = db.prepare(`
      SELECT COUNT(DISTINCT ch.recipe_id) as count
      FROM cooking_history ch
      JOIN recipes r ON ch.recipe_id = r.id
      WHERE r.household_id = ?
    `).get(householdId).count;

    // Gesamt-Koch-Akte
    const totalCooks = db.prepare(`
      SELECT COUNT(*) as count
      FROM cooking_history ch
      JOIN recipes r ON ch.recipe_id = r.id
      WHERE r.household_id = ?
    `).get(householdId).count;

    // Lieblings-Rezepte (am häufigsten gekocht)
    const topRecipes = db.prepare(`
      SELECT r.id, r.title, r.image_url, COUNT(*) as cook_count
      FROM cooking_history ch
      JOIN recipes r ON ch.recipe_id = r.id
      WHERE r.household_id = ?
      GROUP BY r.id
      ORDER BY cook_count DESC
      LIMIT 5
    `).all(householdId);

    // Wochenplan-Streak (aufeinanderfolgende Wochen mit Plan)
    const plans = db.prepare(`
      SELECT week_start FROM meal_plans
      WHERE household_id = ?
      ORDER BY week_start DESC
    `).all(householdId);

    let streak = 0;
    if (plans.length > 0) {
      const now = new Date();
      // Aktuelle Woche ist Montag
      const currentMonday = new Date(now);
      currentMonday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      currentMonday.setHours(0, 0, 0, 0);

      let checkDate = new Date(currentMonday);
      for (const plan of plans) {
        const planDate = new Date(plan.week_start);
        planDate.setHours(0, 0, 0, 0);
        const diffDays = Math.round((checkDate - planDate) / (24 * 60 * 60 * 1000));

        if (diffDays >= 0 && diffDays <= 1) {
          streak++;
          checkDate.setDate(checkDate.getDate() - 7);
        } else if (diffDays > 1) {
          break;
        }
      }
    }

    // Koch-Aktivität pro Mitglied
    const memberStats = db.prepare(`
      SELECT u.id, u.username, u.display_name, COUNT(ch.id) as cook_count
      FROM household_members hm
      JOIN users u ON hm.user_id = u.id
      LEFT JOIN cooking_history ch ON ch.user_id = u.id
        AND ch.recipe_id IN (SELECT id FROM recipes WHERE household_id = ?)
      WHERE hm.household_id = ?
      GROUP BY u.id
      ORDER BY cook_count DESC
    `).all(householdId, householdId);

    // Rezepte insgesamt
    const recipeCount = db.prepare(
      'SELECT COUNT(*) as count FROM recipes WHERE household_id = ?'
    ).get(householdId).count;

    // Erledigte Einkäufe (inaktive Listen = abgeschlossen)
    const completedShops = db.prepare(
      'SELECT COUNT(*) as count FROM shopping_lists WHERE household_id = ? AND is_active = 0'
    ).get(householdId).count;

    return {
      stats: {
        recipes: recipeCount,
        cooked_unique: cookedCount,
        cooked_total: totalCooks,
        completed_shops: completedShops,
        streak,
        top_recipes: topRecipes,
        member_stats: memberStats,
      },
    };
  });

  // ─────────────────────────────────────────────
  // GET /:id/suggestions – Rezept-Vorschläge für den Wochenplan
  // ─────────────────────────────────────────────
  fastify.get('/:id/suggestions', {
    schema: {
      description: 'Rezept-Vorschläge für den Wochenplan basierend auf Haushalt-Daten',
      tags: ['Haushalte'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 20, default: 6 },
        },
      },
    },
  }, async (request, reply) => {
    const householdId = parseInt(request.params.id);
    const userId = request.user.id;

    if (!isHouseholdMember(userId, householdId)) {
      return reply.status(403).send({ error: 'Kein Zugriff auf diesen Haushalt.' });
    }

    const limit = request.query.limit || 6;

    // 1. Beliebte Rezepte im Haushalt (oft gekocht, aber nicht letzte 2 Wochen)
    const popular = db.prepare(`
      SELECT r.id, r.title, r.image_url, r.total_time, r.difficulty,
        COUNT(ch.id) as cook_count,
        MAX(ch.cooked_at) as last_cooked,
        u.display_name as suggested_by, u.username as suggested_by_username
      FROM recipes r
      JOIN cooking_history ch ON ch.recipe_id = r.id
      LEFT JOIN users u ON ch.user_id = u.id
      WHERE r.household_id = ?
        AND r.id NOT IN (
          SELECT DISTINCT mpe.recipe_id FROM meal_plan_entries mpe
          JOIN meal_plans mp ON mpe.meal_plan_id = mp.id
          WHERE mp.household_id = ? AND mp.week_start >= date('now', '-14 days')
        )
      GROUP BY r.id
      ORDER BY cook_count DESC, RANDOM()
      LIMIT ?
    `).all(householdId, householdId, limit);

    // 2. Zufällige Rezepte die noch nie gekocht wurden (Entdeckungen)
    const remaining = limit - popular.length;
    let discoveries = [];
    if (remaining > 0) {
      const popularIds = popular.map(p => p.id);
      const excludeClause = popularIds.length > 0
        ? `AND r.id NOT IN (${popularIds.map(() => '?').join(',')})`
        : '';
      discoveries = db.prepare(`
        SELECT r.id, r.title, r.image_url, r.total_time, r.difficulty,
          0 as cook_count, NULL as last_cooked,
          u.display_name as suggested_by, u.username as suggested_by_username
        FROM recipes r
        LEFT JOIN users u ON r.user_id = u.id
        WHERE r.household_id = ?
          AND r.id NOT IN (SELECT recipe_id FROM cooking_history)
          ${excludeClause}
        ORDER BY RANDOM()
        LIMIT ?
      `).all(householdId, ...popularIds, remaining);
    }

    const suggestions = [
      ...popular.map(r => ({ ...r, reason: `${r.cook_count}× gekocht – Haushalt-Favorit` })),
      ...discoveries.map(r => ({ ...r, reason: 'Noch nie gekocht – Neues entdecken!' })),
    ];

    return { suggestions };
  });

  // ─────────────────────────────────────────────
  // POST /:id/migrate – Bestehende Daten in Haushalt verschieben
  // ─────────────────────────────────────────────
  fastify.post('/:id/migrate', {
    schema: {
      description: 'Eigene Daten in den Haushalt migrieren. Verschiebt Rezepte, Kategorien, Sammlungen, Wochenpläne, Einkaufslisten, Pantry etc.',
      tags: ['Haushalte'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          include_recipes: { type: 'boolean', default: true, description: 'Rezepte migrieren' },
          exclude_recipe_ids: {
            type: 'array',
            items: { type: 'integer' },
            default: [],
            description: 'Rezept-IDs die privat bleiben sollen',
          },
          include_categories: { type: 'boolean', default: true },
          include_collections: { type: 'boolean', default: true },
          include_meal_plans: { type: 'boolean', default: true },
          include_shopping_lists: { type: 'boolean', default: true },
          include_pantry: { type: 'boolean', default: true },
          include_aliases: { type: 'boolean', default: true },
          include_blocks: { type: 'boolean', default: true },
        },
      },
    },
  }, async (request, reply) => {
    const householdId = parseInt(request.params.id);
    const userId = request.user.id;

    if (!isHouseholdMember(userId, householdId)) {
      return reply.status(403).send({ error: 'Kein Zugriff auf diesen Haushalt.' });
    }

    const opts = request.body || {};
    const excludeIds = new Set(opts.exclude_recipe_ids || []);

    const stats = db.transaction(() => {
      const result = {};

      // Rezepte migrieren (optional, außer ausgeschlossene)
      if (opts.include_recipes !== false) {
        if (excludeIds.size > 0) {
        const placeholders = [...excludeIds].map(() => '?').join(',');
        result.recipes = db.prepare(`
          UPDATE recipes SET household_id = ?, created_by_user_id = COALESCE(created_by_user_id, user_id)
          WHERE user_id = ? AND household_id IS NULL AND id NOT IN (${placeholders})
        `).run(householdId, userId, ...excludeIds).changes;
      } else {
        result.recipes = db.prepare(`
          UPDATE recipes SET household_id = ?, created_by_user_id = COALESCE(created_by_user_id, user_id)
          WHERE user_id = ? AND household_id IS NULL
        `).run(householdId, userId).changes;
      }
      }

      // Kategorien — bei gleichnamigen Haushalt-Kategorien mergen statt duplizieren
      if (opts.include_categories !== false) {
        const userCats = db.prepare(
          'SELECT * FROM categories WHERE user_id = ? AND household_id IS NULL'
        ).all(userId);

        let catMigrated = 0;
        for (const cat of userCats) {
          // Gibt es im Haushalt schon eine Kategorie mit gleichem Namen?
          const existingInHousehold = db.prepare(
            `SELECT id FROM categories
             WHERE household_id = ? AND name = ? COLLATE NOCASE AND id != ?`
          ).get(householdId, cat.name, cat.id);

          if (existingInHousehold) {
            // Merge: recipe_categories + meal_plan_entries umhängen, dann Quelle löschen
            db.prepare(
              'UPDATE OR IGNORE recipe_categories SET category_id = ? WHERE category_id = ?'
            ).run(existingInHousehold.id, cat.id);
            db.prepare(
              'DELETE FROM recipe_categories WHERE category_id = ?'
            ).run(cat.id);
            db.prepare(
              'UPDATE meal_plan_entries SET category_id = ? WHERE category_id = ?'
            ).run(existingInHousehold.id, cat.id);
            db.prepare('DELETE FROM categories WHERE id = ?').run(cat.id);
          } else {
            // Normal migrieren
            db.prepare(
              'UPDATE categories SET household_id = ? WHERE id = ?'
            ).run(householdId, cat.id);
          }
          catMigrated++;
        }
        result.categories = catMigrated;
      }

      // Sammlungen
      if (opts.include_collections !== false) {
        result.collections = db.prepare(
          'UPDATE collections SET household_id = ? WHERE user_id = ? AND household_id IS NULL'
        ).run(householdId, userId).changes;
      }

      // Wochenpläne
      if (opts.include_meal_plans !== false) {
        result.meal_plans = db.prepare(
          'UPDATE meal_plans SET household_id = ? WHERE user_id = ? AND household_id IS NULL'
        ).run(householdId, userId).changes;
      }

      // Einkaufslisten
      if (opts.include_shopping_lists !== false) {
        result.shopping_lists = db.prepare(
          'UPDATE shopping_lists SET household_id = ? WHERE user_id = ? AND household_id IS NULL'
        ).run(householdId, userId).changes;
      }

      // Pantry
      if (opts.include_pantry !== false) {
        result.pantry = db.prepare(
          'UPDATE pantry SET household_id = ? WHERE user_id = ? AND household_id IS NULL'
        ).run(householdId, userId).changes;
      }

      // Zutaten-Aliase
      if (opts.include_aliases !== false) {
        result.ingredient_aliases = db.prepare(
          'UPDATE ingredient_aliases SET household_id = ? WHERE user_id = ? AND household_id IS NULL'
        ).run(householdId, userId).changes;
        result.blocked_ingredients = db.prepare(
          'UPDATE blocked_ingredients SET household_id = ? WHERE user_id = ? AND household_id IS NULL'
        ).run(householdId, userId).changes;
      }

      // Rezept-Sperren
      if (opts.include_blocks !== false) {
        result.recipe_blocks = db.prepare(
          'UPDATE recipe_blocks SET household_id = ? WHERE user_id = ? AND household_id IS NULL'
        ).run(householdId, userId).changes;
      }

      // Aktivitäts-Log
      db.prepare(`
        INSERT INTO household_activity (household_id, user_id, action, details)
        VALUES (?, ?, 'data:migrated', ?)
      `).run(householdId, userId, JSON.stringify(result));

      return result;
    })();

    return {
      message: 'Daten erfolgreich migriert!',
      migrated: stats,
    };
  });

  // ─────────────────────────────────────────────
  // GET /:id/categories/compare – Kategorien aller Mitglieder vergleichen
  // ─────────────────────────────────────────────
  fastify.get('/:id/categories/compare', {
    schema: {
      description: 'Alle Kategorien aller Haushaltsmitglieder zum Vergleich anzeigen',
      tags: ['Haushalte'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const householdId = parseInt(request.params.id);
    const userId = request.user.id;

    if (!isHouseholdMember(userId, householdId)) {
      return reply.status(403).send({ error: 'Kein Zugriff auf diesen Haushalt.' });
    }

    // Mitglieder laden
    const members = db.prepare(`
      SELECT u.id, u.username, u.display_name
      FROM household_members hm
      JOIN users u ON hm.user_id = u.id
      WHERE hm.household_id = ?
      ORDER BY hm.joined_at ASC
    `).all(householdId);

    // Alle Kategorien aller Mitglieder laden (private + Haushalt-Kategorien)
    const memberIds = members.map(m => m.id);
    const placeholders = memberIds.map(() => '?').join(',');
    const categories = db.prepare(`
      SELECT c.id, c.name, c.icon, c.color, c.sort_order, c.is_meal_time,
             c.user_id, c.household_id,
             u.username, u.display_name
      FROM categories c
      JOIN users u ON c.user_id = u.id
      WHERE c.user_id IN (${placeholders})
        AND (c.household_id = ? OR c.household_id IS NULL)
      ORDER BY c.is_meal_time DESC, c.name COLLATE NOCASE, c.user_id
    `).all(...memberIds, householdId);

    // Gruppierung nach normalisiertem Namen (case-insensitive)
    const groupMap = new Map();
    for (const cat of categories) {
      const key = cat.name.toLowerCase().trim();
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          name: cat.name, // erster gefundener Name als Default
          categories: [],
        });
      }
      groupMap.get(key).categories.push(cat);
    }

    // Gruppen bilden
    const groups = [];
    for (const [, group] of groupMap) {
      const cats = group.categories;
      const memberUserIds = new Set(cats.map(c => c.user_id));
      const allNames = [...new Set(cats.map(c => c.name))];
      const allIcons = [...new Set(cats.map(c => c.icon))];
      const allColors = [...new Set(cats.map(c => c.color))];
      const hasDuplicates = cats.length > memberIds.length; // Mehr Einträge als Mitglieder = DB-Duplikate

      groups.push({
        canonical_name: group.name,
        is_synced: allNames.length === 1 && allIcons.length === 1 && allColors.length === 1
                   && memberUserIds.size === memberIds.length && !hasDuplicates,
        has_name_conflict: allNames.length > 1,
        has_style_conflict: allIcons.length > 1 || allColors.length > 1,
        has_duplicates: hasDuplicates,
        missing_for: memberIds.filter(id => !memberUserIds.has(id)),
        categories: cats.map(c => ({
          id: c.id,
          name: c.name,
          icon: c.icon,
          color: c.color,
          sort_order: c.sort_order,
          is_meal_time: c.is_meal_time,
          user_id: c.user_id,
          household_id: c.household_id,
          owner_name: c.display_name || c.username,
        })),
      });
    }

    // Sortierung: Nicht-synchronisierte zuerst, dann nach Name
    groups.sort((a, b) => {
      if (a.is_synced !== b.is_synced) return a.is_synced ? 1 : -1;
      return a.canonical_name.localeCompare(b.canonical_name, 'de');
    });

    return { members, groups };
  });

  // ─────────────────────────────────────────────
  // POST /:id/categories/merge – Kategorien zusammenfassen
  // ─────────────────────────────────────────────
  fastify.post('/:id/categories/merge', {
    schema: {
      description: 'Abweichende Kategorien zusammenfassen (Name, Icon, Farbe angleichen)',
      tags: ['Haushalte'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['categoryIds', 'targetName'],
        properties: {
          categoryIds: {
            type: 'array',
            items: { type: 'integer' },
            minItems: 1,
            description: 'IDs der Kategorien die angeglichen werden sollen',
          },
          targetName: { type: 'string', minLength: 1, maxLength: 50 },
          targetIcon: { type: ['string', 'null'], maxLength: 10, default: null },
          targetColor: { type: ['string', 'null'], pattern: '^#[0-9a-fA-F]{6}$', default: null },
        },
      },
    },
  }, async (request, reply) => {
    const householdId = parseInt(request.params.id);
    const userId = request.user.id;

    if (!isHouseholdMember(userId, householdId)) {
      return reply.status(403).send({ error: 'Kein Zugriff auf diesen Haushalt.' });
    }

    const { categoryIds, targetName, targetIcon, targetColor } = request.body;

    // Mitglieder-IDs laden für Zugriffskontrolle
    const memberIds = db.prepare(
      'SELECT user_id FROM household_members WHERE household_id = ?'
    ).all(householdId).map(m => m.user_id);

    const result = db.transaction(() => {
      let renamed = 0;
      let merged = 0;

      for (const catId of categoryIds) {
        // Kategorie laden und Zugehörigkeit prüfen
        const cat = db.prepare(
          'SELECT * FROM categories WHERE id = ?'
        ).get(catId);

        if (!cat) continue;
        if (!memberIds.includes(cat.user_id)) continue; // Sicherheit
        if (cat.household_id !== null && cat.household_id !== householdId) continue;

        // Prüfen ob der User bereits eine Kategorie mit dem Ziel-Namen hat
        const existing = db.prepare(
          `SELECT id FROM categories
           WHERE user_id = ? AND name = ? COLLATE NOCASE AND id != ?
             AND (household_id = ? OR household_id IS NULL)`
        ).get(cat.user_id, targetName, catId, householdId);

        if (existing) {
          // Echter Merge: recipe_categories von cat auf existing umhängen
          db.prepare(`
            UPDATE OR IGNORE recipe_categories SET category_id = ? WHERE category_id = ?
          `).run(existing.id, catId);
          // Verbleibende Duplikate entfernen (falls UPDATE OR IGNORE übersprungen hat)
          db.prepare(
            'DELETE FROM recipe_categories WHERE category_id = ?'
          ).run(catId);

          // meal_plan_entries von cat auf existing umhängen
          db.prepare(
            'UPDATE meal_plan_entries SET category_id = ? WHERE category_id = ?'
          ).run(existing.id, catId);

          // Alte Kategorie löschen
          db.prepare('DELETE FROM categories WHERE id = ?').run(catId);

          // Existing-Kategorie auch auf Ziel-Style updaten
          const updates = [];
          const vals = [];
          if (targetIcon) { updates.push('icon = ?'); vals.push(targetIcon); }
          if (targetColor) { updates.push('color = ?'); vals.push(targetColor); }
          if (updates.length > 0) {
            db.prepare(
              `UPDATE categories SET ${updates.join(', ')} WHERE id = ?`
            ).run(...vals, existing.id);
          }

          merged++;
        } else {
          // Einfaches Umbenennen/Restylen
          const updates = ['name = ?'];
          const vals = [targetName];
          if (targetIcon) { updates.push('icon = ?'); vals.push(targetIcon); }
          if (targetColor) { updates.push('color = ?'); vals.push(targetColor); }
          db.prepare(
            `UPDATE categories SET ${updates.join(', ')} WHERE id = ?`
          ).run(...vals, catId);
          renamed++;
        }
      }

      // Aktivitäts-Log
      db.prepare(`
        INSERT INTO household_activity (household_id, user_id, action, details)
        VALUES (?, ?, 'categories:merged', ?)
      `).run(householdId, userId, JSON.stringify({
        targetName, renamed, merged, categoryIds,
      }));

      return { renamed, merged };
    })();

    return {
      message: `Kategorien synchronisiert: ${result.renamed} umbenannt, ${result.merged} zusammengeführt.`,
      ...result,
    };
  });

  // ─────────────────────────────────────────────
  // GET /:id/export – Haushalt-Daten exportieren
  // ─────────────────────────────────────────────
  fastify.get('/:id/export', {
    schema: {
      description: 'Alle Daten des Haushalts als JSON exportieren',
      tags: ['Haushalte'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const householdId = parseInt(request.params.id);
    const userId = request.user.id;

    if (!isHouseholdMember(userId, householdId)) {
      return reply.status(403).send({ error: 'Kein Zugriff auf diesen Haushalt.' });
    }

    const household = db.prepare('SELECT * FROM households WHERE id = ?').get(householdId);
    const members = db.prepare(`
      SELECT u.username, u.display_name, hm.joined_at
      FROM household_members hm
      JOIN users u ON hm.user_id = u.id
      WHERE hm.household_id = ?
    `).all(householdId);

    const recipes = db.prepare('SELECT * FROM recipes WHERE household_id = ?').all(householdId);
    const categories = db.prepare('SELECT * FROM categories WHERE household_id = ?').all(householdId);
    const collections = db.prepare('SELECT * FROM collections WHERE household_id = ?').all(householdId);
    const pantryItems = db.prepare(
      'SELECT ingredient_name, amount, unit, category, expiry_date, notes, is_permanent FROM pantry WHERE household_id = ?'
    ).all(householdId);

    // Rezepte mit Details anreichern
    const exportedRecipes = recipes.map(recipe => {
      const ingredients = db.prepare(
        'SELECT name, amount, unit, group_name, sort_order, is_optional, notes FROM ingredients WHERE recipe_id = ? ORDER BY sort_order'
      ).all(recipe.id);
      const steps = db.prepare(
        'SELECT step_number, title, instruction, duration_minutes FROM cooking_steps WHERE recipe_id = ? ORDER BY step_number'
      ).all(recipe.id);
      const cats = db.prepare(`
        SELECT c.name, c.icon, c.color FROM categories c
        JOIN recipe_categories rc ON c.id = rc.category_id
        WHERE rc.recipe_id = ?
      `).all(recipe.id);

      return {
        title: recipe.title,
        description: recipe.description,
        servings: recipe.servings,
        prep_time: recipe.prep_time,
        cook_time: recipe.cook_time,
        total_time: recipe.total_time,
        difficulty: recipe.difficulty,
        is_favorite: recipe.is_favorite,
        notes: recipe.notes,
        categories: cats,
        ingredients,
        steps,
      };
    });

    reply.header('Content-Disposition', `attachment; filename="haushalt-${household.name}-export.json"`);
    return {
      export_version: '1.0',
      export_date: new Date().toISOString(),
      household: {
        name: household.name,
        members,
      },
      recipes: exportedRecipes,
      categories: categories.map(c => ({ name: c.name, icon: c.icon, color: c.color })),
      collections: collections.map(c => ({ name: c.name, icon: c.icon, color: c.color })),
      pantry: pantryItems,
    };
  });
}
