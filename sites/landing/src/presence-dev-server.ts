// ── Presence dev server — Bun WebSocket ─────────────────────
// Runs alongside the Vertz dev server during local development.
// Same room logic as the Cloudflare Durable Object, but using Bun.serve().

import {
  createRoom,
  handleJoin,
  handleLeave,
  handleMessage,
  type ConnectionId,
} from './presence-room-logic';

const PORT = Number(process.env.PRESENCE_PORT) || 4001;

const room = createRoom();
let nextId = 0;

// Map WebSocket instances to connection IDs
const wsToId = new Map<unknown, ConnectionId>();
const idToWs = new Map<ConnectionId, unknown>();

function send(connId: ConnectionId, msg: string) {
  const ws = idToWs.get(connId) as { send(data: string): void } | undefined;
  if (ws) ws.send(msg);
}

function broadcast(msg: string, exclude?: ConnectionId) {
  for (const [id, ws] of idToWs.entries()) {
    if (id !== exclude) {
      (ws as { send(data: string): void }).send(msg);
    }
  }
}

Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === '/__presence') {
      const upgraded = server.upgrade(req);
      if (!upgraded) {
        return new Response('WebSocket upgrade failed', { status: 400 });
      }
      // Bun expects undefined after successful upgrade
      return;
    }

    // Health check
    if (url.pathname === '/__presence/health') {
      return Response.json({ ok: true, connections: room.connections.size });
    }

    return new Response('Not found', { status: 404 });
  },
  websocket: {
    open(ws) {
      const connId = `dev-${nextId++}`;
      wsToId.set(ws, connId);
      idToWs.set(connId, ws);

      const accepted = handleJoin(room, connId, send, broadcast);
      if (!accepted) {
        ws.close(1013, 'Room full');
      }
    },
    message(ws, message) {
      const connId = wsToId.get(ws);
      if (!connId) return;

      const raw = typeof message === 'string' ? message : new TextDecoder().decode(message);
      handleMessage(room, connId, raw, send, broadcast);
    },
    close(ws) {
      const connId = wsToId.get(ws);
      if (!connId) return;

      handleLeave(room, connId, broadcast);
      wsToId.delete(ws);
      idToWs.delete(connId);
    },
  },
});

console.log(`  Presence dev server — ws://localhost:${PORT}/__presence`);
