// ===========================================================================
// Content Descriptors Developer Walkthrough — Public API Validation Test
//
// This test validates that a developer can use content descriptors with the
// service() API using ONLY public imports from @vertz/server and @vertz/db.
//
// content.* descriptors allow non-JSON content types (XML, HTML, text, binary)
// in service actions, while JSON endpoints continue to require schemas.
// ===========================================================================

import { describe, expect, it } from 'bun:test';
import { d } from '@vertz/db';
import { s } from '@vertz/schema';
import type { EntityDbAdapter } from '@vertz/server';
import { content, createServer, entity, service } from '@vertz/server';

// ---------------------------------------------------------------------------
// 1. Schema + entity definition (for service DI)
// ---------------------------------------------------------------------------

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  email: d.text().unique(),
  name: d.text(),
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

function createInMemoryDb(): EntityDbAdapter {
  const store: Record<string, unknown>[] = [];
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
// 3. Service definition with content descriptor actions
// ---------------------------------------------------------------------------

const testService = service('test', {
  inject: { users: usersEntity },
  actions: {
    // XML GET — no body, returns XML
    xmlGet: {
      method: 'GET',
      response: content.xml(),
      handler: async () => '<EntityDescriptor/>',
    },
    // XML POST — XML in, XML out
    xmlPost: {
      method: 'POST',
      body: content.xml(),
      response: content.xml(),
      handler: async (input) => `<Response>${input}</Response>`,
    },
    // HTML GET — returns HTML
    htmlGet: {
      method: 'GET',
      response: content.html(),
      handler: async () => '<html><body>Hello</body></html>',
    },
    // JSON POST — unchanged, schemas required
    jsonPost: {
      method: 'POST',
      body: s.object({ email: s.email() }),
      response: s.object({ ok: s.boolean() }),
      handler: async () => ({ ok: true }),
    },
    // Mixed — XML in, JSON out
    xmlToJson: {
      method: 'POST',
      body: content.xml(),
      response: s.object({ count: s.number() }),
      handler: async (input) => ({ count: input.length }),
    },
    // Plain text GET
    textGet: {
      method: 'GET',
      response: content.text(),
      handler: async () => 'OK',
    },
  },
  access: {
    xmlGet: () => true,
    xmlPost: () => true,
    htmlGet: () => true,
    jsonPost: () => true,
    xmlToJson: () => true,
    textGet: () => true,
  },
});

// ---------------------------------------------------------------------------
// Helper: make a request to the app
// ---------------------------------------------------------------------------

function request(
  app: ReturnType<typeof createServer>,
  method: string,
  path: string,
  options?: { body?: string | Record<string, unknown>; contentType?: string },
): Promise<Response> {
  const init: RequestInit = { method };
  if (options?.body !== undefined) {
    const isJson =
      options.contentType?.includes('application/json') ?? typeof options.body === 'object';
    init.headers = {
      'content-type': options.contentType ?? (isJson ? 'application/json' : 'application/xml'),
    };
    init.body = isJson ? JSON.stringify(options.body) : (options.body as string);
  }
  return app.handler(new Request(`http://localhost${path}`, init));
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Feature: Content descriptors for service actions', () => {
  describe('Given a service with content descriptor actions', () => {
    describe('When GET /api/test/xmlGet is called', () => {
      it('Then returns body "<EntityDescriptor/>"', async () => {
        const db = createInMemoryDb();
        const app = createServer({
          entities: [usersEntity],
          services: [testService],
          db,
        });

        const res = await request(app, 'GET', '/api/test/xmlGet');

        expect(res.status).toBe(200);
        expect(await res.text()).toBe('<EntityDescriptor/>');
      });

      it('Then content-type is application/xml', async () => {
        const db = createInMemoryDb();
        const app = createServer({
          entities: [usersEntity],
          services: [testService],
          db,
        });

        const res = await request(app, 'GET', '/api/test/xmlGet');

        expect(res.headers.get('content-type')).toBe('application/xml');
      });
    });

    describe('When POST /api/test/xmlPost is called with application/xml body', () => {
      it('Then handler receives the XML as string input', async () => {
        const db = createInMemoryDb();
        const app = createServer({
          entities: [usersEntity],
          services: [testService],
          db,
        });

        const res = await request(app, 'POST', '/api/test/xmlPost', {
          body: '<Request>data</Request>',
          contentType: 'application/xml',
        });

        expect(res.status).toBe(200);
        expect(await res.text()).toBe('<Response><Request>data</Request></Response>');
      });

      it('Then content-type is application/xml', async () => {
        const db = createInMemoryDb();
        const app = createServer({
          entities: [usersEntity],
          services: [testService],
          db,
        });

        const res = await request(app, 'POST', '/api/test/xmlPost', {
          body: '<data/>',
          contentType: 'application/xml',
        });

        expect(res.headers.get('content-type')).toBe('application/xml');
      });
    });

    describe('When POST /api/test/xmlPost is called with application/json content-type', () => {
      it('Then returns 415 Unsupported Media Type', async () => {
        const db = createInMemoryDb();
        const app = createServer({
          entities: [usersEntity],
          services: [testService],
          db,
        });

        const res = await request(app, 'POST', '/api/test/xmlPost', {
          body: { some: 'json' },
          contentType: 'application/json',
        });

        expect(res.status).toBe(415);
        const body = await res.json();
        expect(body.error.code).toBe('UnsupportedMediaType');
      });
    });

    describe('When GET /api/test/htmlGet is called', () => {
      it('Then returns HTML body', async () => {
        const db = createInMemoryDb();
        const app = createServer({
          entities: [usersEntity],
          services: [testService],
          db,
        });

        const res = await request(app, 'GET', '/api/test/htmlGet');

        expect(res.status).toBe(200);
        expect(await res.text()).toBe('<html><body>Hello</body></html>');
      });

      it('Then content-type is text/html', async () => {
        const db = createInMemoryDb();
        const app = createServer({
          entities: [usersEntity],
          services: [testService],
          db,
        });

        const res = await request(app, 'GET', '/api/test/htmlGet');

        expect(res.headers.get('content-type')).toBe('text/html');
      });
    });

    describe('When POST /api/test/jsonPost is called with valid JSON', () => {
      it('Then validates input and returns JSON (unchanged)', async () => {
        const db = createInMemoryDb();
        const app = createServer({
          entities: [usersEntity],
          services: [testService],
          db,
        });

        const res = await request(app, 'POST', '/api/test/jsonPost', {
          body: { email: 'alice@example.com' },
          contentType: 'application/json',
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
      });

      it('Then content-type is application/json', async () => {
        const db = createInMemoryDb();
        const app = createServer({
          entities: [usersEntity],
          services: [testService],
          db,
        });

        const res = await request(app, 'POST', '/api/test/jsonPost', {
          body: { email: 'alice@example.com' },
          contentType: 'application/json',
        });

        expect(res.headers.get('content-type')).toBe('application/json');
      });
    });

    describe('When POST /api/test/jsonPost is called with invalid JSON', () => {
      it('Then returns 400 BadRequest (unchanged)', async () => {
        const db = createInMemoryDb();
        const app = createServer({
          entities: [usersEntity],
          services: [testService],
          db,
        });

        const res = await request(app, 'POST', '/api/test/jsonPost', {
          body: { notAnEmail: 123 },
          contentType: 'application/json',
        });

        expect(res.status).toBe(400);
      });
    });

    describe('When POST /api/test/xmlToJson is called with XML body', () => {
      it('Then handler receives XML string as input', async () => {
        const db = createInMemoryDb();
        const app = createServer({
          entities: [usersEntity],
          services: [testService],
          db,
        });

        const res = await request(app, 'POST', '/api/test/xmlToJson', {
          body: '<items><item/><item/></items>',
          contentType: 'application/xml',
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.count).toBe(29); // length of the XML string
      });

      it('Then content-type is application/json', async () => {
        const db = createInMemoryDb();
        const app = createServer({
          entities: [usersEntity],
          services: [testService],
          db,
        });

        const res = await request(app, 'POST', '/api/test/xmlToJson', {
          body: '<data/>',
          contentType: 'application/xml',
        });

        expect(res.headers.get('content-type')).toBe('application/json');
      });
    });

    describe('When GET /api/test/textGet is called', () => {
      it('Then returns "OK" as plain text', async () => {
        const db = createInMemoryDb();
        const app = createServer({
          entities: [usersEntity],
          services: [testService],
          db,
        });

        const res = await request(app, 'GET', '/api/test/textGet');

        expect(res.status).toBe(200);
        expect(await res.text()).toBe('OK');
      });

      it('Then content-type is text/plain', async () => {
        const db = createInMemoryDb();
        const app = createServer({
          entities: [usersEntity],
          services: [testService],
          db,
        });

        const res = await request(app, 'GET', '/api/test/textGet');

        expect(res.headers.get('content-type')).toBe('text/plain');
      });
    });
  });
});
