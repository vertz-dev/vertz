// ── Presence Room — Cloudflare Durable Object ──────────────
// Wraps the shared room logic with Cloudflare's DO WebSocket API.
//
// PRIVACY: No user-generated content is transmitted or stored.
// Only interaction signals and connection lifecycle events.

import {
  createRoom,
  handleJoin,
  handleLeave,
  handleMessage,
  type ConnectionId,
  type RoomState,
} from './presence-room-logic';
import { IDLE_TIMEOUT_MS } from './presence-types';

export class PresenceRoom {
  private room: RoomState;
  private wsToId: Map<WebSocket, ConnectionId> = new Map();
  private idToWs: Map<ConnectionId, WebSocket> = new Map();
  private nextId = 0;

  constructor() {
    this.room = createRoom();
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    const connId = `do-${this.nextId++}`;
    this.wsToId.set(server, connId);
    this.idToWs.set(connId, server);

    const send = (id: ConnectionId, msg: string) => {
      const ws = this.idToWs.get(id);
      if (ws) {
        try { ws.send(msg); } catch { /* closed */ }
      }
    };

    const broadcast = (msg: string, exclude?: ConnectionId) => {
      for (const [id, ws] of this.idToWs.entries()) {
        if (id !== exclude) {
          try { ws.send(msg); } catch { /* closed */ }
        }
      }
    };

    server.accept();

    const accepted = handleJoin(this.room, connId, send, broadcast);
    if (!accepted) {
      server.close(1013, 'Room full');
      return new Response(null, { status: 503, statusText: 'Room full' });
    }

    server.addEventListener('message', (event) => {
      const raw = typeof event.data === 'string' ? event.data : '';
      handleMessage(this.room, connId, raw, send, broadcast);
    });

    server.addEventListener('close', () => {
      handleLeave(this.room, connId, broadcast);
      this.wsToId.delete(server);
      this.idToWs.delete(connId);
    });

    server.addEventListener('error', () => {
      handleLeave(this.room, connId, broadcast);
      this.wsToId.delete(server);
      this.idToWs.delete(connId);
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
}
