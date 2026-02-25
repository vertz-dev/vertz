import { describe, expect, it } from 'bun:test';
import type { EntityDbAdapter } from '@vertz/server';
import { createServer } from '@vertz/server';
import { contacts } from '../src/entities';

function createInMemoryDb(): EntityDbAdapter {
  const store: Record<string, unknown>[] = [];
  let idCounter = 1;

  return {
    async get(id) {
      return store.find((r) => r.id === id) ?? null;
    },
    async list(options?: { where?: Record<string, unknown>; limit?: number; after?: string }) {
      let result = [...store];
      const where = options?.where;
      if (where) {
        result = result.filter((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        );
      }
      const total = result.length;
      if (options?.after) {
        const afterIdx = result.findIndex((r) => r.id === options.after);
        result = afterIdx >= 0 ? result.slice(afterIdx + 1) : [];
      }
      if (options?.limit !== undefined) {
        result = result.slice(0, options.limit);
      }
      return { data: result, total };
    },
    async create(data) {
      const record = {
        id: `contact-${idCounter++}`,
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.push(record);
      return record;
    },
    async update(id, data) {
      const existing = store.find((r) => r.id === id);
      if (!existing) return null;
      Object.assign(existing, { ...data, updatedAt: new Date().toISOString() });
      return { ...existing };
    },
    async delete(id) {
      const idx = store.findIndex((r) => r.id === id);
      if (idx === -1) return null;
      return store.splice(idx, 1)[0] ?? null;
    },
  };
}

function createTestApp(db: EntityDbAdapter) {
  return createServer({
    entities: [contacts],
    _entityDbFactory: () => db,
  });
}

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

describe('Contacts API', () => {
  it('creates a contact via POST /api/contacts', async () => {
    const db = createInMemoryDb();
    const app = createTestApp(db);
    const res = await request(app, 'POST', '/api/contacts', {
      name: 'Alice Johnson',
      email: 'alice@example.com',
      phone: '+1-555-0100',
      notes: 'Met at conference',
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('Alice Johnson');
    expect(body.email).toBe('alice@example.com');
    expect(body.id).toBeDefined();
  });

  it('lists contacts via GET /api/contacts', async () => {
    const db = createInMemoryDb();
    const app = createTestApp(db);
    await request(app, 'POST', '/api/contacts', { name: 'Alice' });
    await request(app, 'POST', '/api/contacts', { name: 'Bob' });

    const res = await request(app, 'GET', '/api/contacts');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data.length).toBe(2);
  });

  it('gets a contact by ID via GET /api/contacts/:id', async () => {
    const db = createInMemoryDb();
    const app = createTestApp(db);
    const createRes = await request(app, 'POST', '/api/contacts', {
      name: 'Charlie',
      email: 'charlie@example.com',
    });
    const created = await createRes.json();

    const res = await request(app, 'GET', `/api/contacts/${created.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Charlie');
    expect(body.email).toBe('charlie@example.com');
  });

  it('updates a contact via PATCH /api/contacts/:id', async () => {
    const db = createInMemoryDb();
    const app = createTestApp(db);
    const createRes = await request(app, 'POST', '/api/contacts', {
      name: 'Diana',
      email: 'diana@old.com',
    });
    const created = await createRes.json();

    const res = await request(app, 'PATCH', `/api/contacts/${created.id}`, {
      email: 'diana@new.com',
      phone: '+1-555-0200',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe('diana@new.com');
    expect(body.phone).toBe('+1-555-0200');
    expect(body.name).toBe('Diana');
  });

  it('deletes a contact via DELETE /api/contacts/:id', async () => {
    const db = createInMemoryDb();
    const app = createTestApp(db);
    const createRes = await request(app, 'POST', '/api/contacts', {
      name: 'Eve',
    });
    const created = await createRes.json();

    const res = await request(app, 'DELETE', `/api/contacts/${created.id}`);
    expect(res.status).toBe(204);
  });

  it('returns 404 for non-existent contact', async () => {
    const db = createInMemoryDb();
    const app = createTestApp(db);
    const res = await request(app, 'GET', '/api/contacts/non-existent-id');
    expect(res.status).toBe(404);
  });

  it('full CRUD lifecycle', async () => {
    const db = createInMemoryDb();
    const app = createTestApp(db);

    // Create
    const createRes = await request(app, 'POST', '/api/contacts', {
      name: 'Frank',
      email: 'frank@example.com',
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const contactId = created.id;

    // Read
    const getRes = await request(app, 'GET', `/api/contacts/${contactId}`);
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.name).toBe('Frank');

    // Update
    const updateRes = await request(app, 'PATCH', `/api/contacts/${contactId}`, {
      notes: 'Updated notes',
    });
    expect(updateRes.status).toBe(200);
    const updated = await updateRes.json();
    expect(updated.notes).toBe('Updated notes');

    // Delete
    const deleteRes = await request(app, 'DELETE', `/api/contacts/${contactId}`);
    expect(deleteRes.status).toBe(204);

    // Verify gone
    const goneRes = await request(app, 'GET', `/api/contacts/${contactId}`);
    expect(goneRes.status).toBe(404);
  });
});
