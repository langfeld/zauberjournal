/**
 * ============================================
 * Household SSE (Server-Sent Events)
 * ============================================
 * Echtzeit-Benachrichtigungen für Haushaltsmitglieder.
 * Jedes Mitglied hält eine SSE-Verbindung offen und
 * wird bei Änderungen (Rezepte, Wochenplan, Einkauf, etc.) benachrichtigt.
 */

import { isHouseholdMember } from '../config/database.js';
import db from '../config/database.js';

// Map: householdId → Set<{ userId, reply }>
const connections = new Map();

/**
 * Broadcast an alle Mitglieder eines Haushalts (außer Sender).
 * Wird von Route-Handlern aufgerufen nach Datenmutationen.
 */
export function broadcastToHousehold(householdId, event, data, excludeUserId = null) {
  if (!householdId) return;
  const clients = connections.get(householdId);
  if (!clients || clients.size === 0) return;

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  for (const client of clients) {
    if (client.userId !== excludeUserId) {
      try {
        client.reply.raw.write(payload);
      } catch {
        // Verbindung tot → wird beim nächsten Heartbeat entfernt
        clients.delete(client);
      }
    }
  }
}

/**
 * Nachricht an einen bestimmten User im Haushalt senden.
 * Wird z. B. für KI-Fortschrittsanzeigen genutzt, die nur den
 * auslösenden User betreffen.
 */
export function sendToUser(householdId, userId, event, data) {
  if (!householdId || !userId) return;
  const clients = connections.get(householdId);
  if (!clients || clients.size === 0) return;

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  for (const client of clients) {
    if (client.userId === userId) {
      try {
        client.reply.raw.write(payload);
      } catch {
        clients.delete(client);
      }
    }
  }
}

/**
 * Anzahl aktiver Verbindungen für einen Haushalt.
 */
export function getConnectionCount(householdId) {
  return connections.get(householdId)?.size || 0;
}

export default async function householdEventsRoutes(fastify) {
  // SSE-Auth: EventSource unterstützt keine Custom-Headers,
  // daher Token aus Query-Parameter oder Authorization-Header lesen
  fastify.addHook('onRequest', async (request, reply) => {
    // Token aus Query-Parameter (für EventSource) oder Header lesen
    const token = request.query?.token || null;
    if (token) {
      // Manuell JWT verifizieren
      try {
        const decoded = fastify.jwt.verify(token);
        const user = db.prepare('SELECT id, username, role, is_active FROM users WHERE id = ?').get(decoded.id);
        if (!user || !user.is_active) {
          return reply.status(401).send({ error: 'Nicht autorisiert' });
        }
        request.user = { id: user.id, username: user.username, role: user.role };
      } catch {
        return reply.status(401).send({ error: 'Token ungültig' });
      }
    } else {
      // Fallback auf Standard-Auth (für Tests/API-Aufrufe)
      await fastify.authenticate(request, reply);
    }
  });

  /**
   * GET /api/household-events/:householdId
   * SSE-Stream für Echtzeit-Updates eines Haushalts.
   */
  fastify.get('/:householdId', {
    schema: {
      description: 'SSE-Stream für Haushalt-Echtzeit-Updates',
      tags: ['Haushalte'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          householdId: { type: 'integer' },
        },
        required: ['householdId'],
      },
    },
  }, async (request, reply) => {
    const householdId = Number(request.params.householdId);
    const userId = request.user.id;

    // Mitgliedschaft prüfen
    if (!isHouseholdMember(userId, householdId)) {
      return reply.code(403).send({ error: 'Kein Mitglied dieses Haushalts' });
    }

    // SSE-Headers setzen
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Nginx-Buffering deaktivieren
    });

    // Initiale Verbindungsbestätigung
    reply.raw.write(`event: connected\ndata: ${JSON.stringify({
      householdId,
      userId,
      timestamp: new Date().toISOString(),
    })}\n\n`);

    // Verbindung registrieren
    if (!connections.has(householdId)) {
      connections.set(householdId, new Set());
    }
    const client = { userId, reply };
    connections.get(householdId).add(client);

    // Heartbeat alle 30 Sekunden (hält Verbindung offen)
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(`: heartbeat ${Date.now()}\n\n`);
      } catch {
        // Verbindung tot
        clearInterval(heartbeat);
        connections.get(householdId)?.delete(client);
      }
    }, 30000);

    // Cleanup bei Verbindungsende
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      const clients = connections.get(householdId);
      if (clients) {
        clients.delete(client);
        if (clients.size === 0) {
          connections.delete(householdId);
        }
      }
    });

    // Nicht automatisch schließen (SSE bleibt offen)
    // Fastify: reply wird nicht gesendet, raw stream bleibt offen
  });

  /**
   * GET /api/household-events/:householdId/online
   * Zeigt an, welche Mitglieder gerade online sind.
   */
  fastify.get('/:householdId/online', {
    schema: {
      description: 'Online-Status der Haushaltsmitglieder',
      tags: ['Haushalte'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const householdId = Number(request.params.householdId);
    const userId = request.user.id;

    if (!isHouseholdMember(userId, householdId)) {
      return reply.code(403).send({ error: 'Kein Mitglied dieses Haushalts' });
    }

    const clients = connections.get(householdId);
    const onlineUserIds = clients
      ? [...new Set([...clients].map(c => c.userId))]
      : [];

    return {
      household_id: householdId,
      online_count: onlineUserIds.length,
      online_user_ids: onlineUserIds,
    };
  });
}
