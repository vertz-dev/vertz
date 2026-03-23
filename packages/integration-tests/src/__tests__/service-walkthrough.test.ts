// ===========================================================================
// Service Developer Walkthrough — Public API Validation Test
//
// This test validates that a developer can use the standalone service() API
// using ONLY public imports from @vertz/server and @vertz/db.
//
// service() provides non-entity endpoints (webhooks, OAuth, health checks)
// with typed entity DI — no model, no CRUD, just custom handlers.
//
// Written as RED in Phase 1 — will fail until Phase 2 wires route generation.
// ===========================================================================

import { describe, expect, it } from 'bun:test';
import { d } from '@vertz/db';
import type { EntityDbAdapter } from '@vertz/server';
import { createServer, entity, service } from '@vertz/server';

// ---------------------------------------------------------------------------
// 1. Schema + entity definition — same as entity walkthrough
// ---------------------------------------------------------------------------

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  email: d.text().unique(),
  name: d.text(),
  role: d.enum('user_role', ['user', 'admin']).default('user'),
  createdAt: d.timestamp().default('now').readOnly(),
});

const usersModel = d.model(usersTable);

const usersEntity = entity('users', {
  model: usersModel,
  access: {
    list: () => true,
    get: () => true,
    create: () => true,
  },
});

// ---------------------------------------------------------------------------
// 2. In-memory DB adapter
// ---------------------------------------------------------------------------

function createInMemoryDb(initial: Record<string, unknown>[] = []): EntityDbAdapter {
  const store = [...initial];
  return {
    async get(id, _options?) {
      return store.find((r) => r.id === id) ?? null;
    },
    async list() {
      return { data: [...store], total: store.length };
    },
    async create(data) {
      const record = { id: `id-${store.length + 1}`, ...data };
      store.push(record);
      return record;
    },
    async update(id, data, _options?) {
      const existing = store.find((r) => r.id === id);
      if (!existing) return { id, ...data };
      Object.assign(existing, data);
      return { ...existing };
    },
    async delete(id, _options?) {
      const idx = store.findIndex((r) => r.id === id);
      if (idx === -1) return null;
      return store.splice(idx, 1)[0] ?? null;
    },
  };
}

// ---------------------------------------------------------------------------
// 3. Standalone service — uses entity DI to access users
// ---------------------------------------------------------------------------

const loginBodySchema = {
  parse(value: unknown) {
    const v = value as Record<string, unknown>;
    if (typeof v?.email !== 'string') {
      return { ok: false as const, error: new Error('email is required') };
    }
    return { ok: true as const, data: v as { email: string } };
  },
};

const loginResponseSchema = {
  parse(value: unknown) {
    return { ok: true as const, data: value as { token: string; userId: string } };
  },
};

const healthResponseSchema = {
  parse(value: unknown) {
    return { ok: true as const, data: value as { status: string } };
  },
};

const authService = service('auth', {
  inject: { users: usersEntity },
  access: {
    login: () => true,
    // health has no access rule → should NOT generate a route (deny by default)
  },
  actions: {
    login: {
      body: loginBodySchema,
      response: loginResponseSchema,
      async handler(input, ctx) {
        // Use injected entity to look up user
        const result = await ctx.entities.users.list();
        const user = result.items.find((u: Record<string, unknown>) => u.email === input.email);
        if (!user) {
          return { token: '', userId: '' };
        }
        return {
          token: `tok-${(user as Record<string, unknown>).id}`,
          userId: String((user as Record<string, unknown>).id),
        };
      },
    },
    health: {
      body: { parse: () => ({ ok: true as const, data: {} }) },
      response: healthResponseSchema,
      async handler() {
        return { status: 'ok' };
      },
    },
  },
});

// ---------------------------------------------------------------------------
// Helper: make a request to the app
// ---------------------------------------------------------------------------

function request(
  app: ReturnType<typeof createServer>,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<Response> {
  const init: RequestInit = { method };
  if (body) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return app.handler(new Request(`http://localhost${path}`, init));
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Service Developer Walkthrough (public API only)', () => {
  it('POST /api/auth/login returns 200 with token when user exists', async () => {
    const db = createInMemoryDb([
      { id: 'u1', email: 'alice@example.com', name: 'Alice', role: 'user' },
    ]);
    const app = createServer({
      entities: [usersEntity],
      services: [authService],
      db,
    });

    const res = await request(app, 'POST', '/api/auth/login', {
      email: 'alice@example.com',
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe('tok-u1');
    expect(body.userId).toBe('u1');
  });

  it('POST /api/auth/login returns empty token when user not found', async () => {
    const db = createInMemoryDb();
    const app = createServer({
      entities: [usersEntity],
      services: [authService],
      db,
    });

    const res = await request(app, 'POST', '/api/auth/login', {
      email: 'unknown@example.com',
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe('');
  });

  it('POST /api/auth/login returns 400 on invalid body', async () => {
    const db = createInMemoryDb();
    const app = createServer({
      entities: [usersEntity],
      services: [authService],
      db,
    });

    const res = await request(app, 'POST', '/api/auth/login', {});

    expect(res.status).toBe(400);
  });

  it('POST /api/auth/health returns 404 (no access rule = no route)', async () => {
    const db = createInMemoryDb();
    const app = createServer({
      entities: [usersEntity],
      services: [authService],
      db,
    });

    const res = await request(app, 'POST', '/api/auth/health');

    expect(res.status).toBe(404);
  });

  it('service() definition has kind discriminator', () => {
    expect(authService.kind).toBe('service');
    expect(authService.name).toBe('auth');
  });

  it('entity definition has kind discriminator', () => {
    expect(usersEntity.kind).toBe('entity');
  });
});
