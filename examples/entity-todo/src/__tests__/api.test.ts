import type { EntityDbAdapter } from '@vertz/server';
import { createServer } from '@vertz/server';
import { describe, expect, it } from 'vitest';
import { todos } from '../entities';

// In-memory DB adapter for testing
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
        id: `todo-${idCounter++}`,
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
    entities: [todos],
    db,
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

describe('Entity Todo API', () => {
  it('creates a todo via POST /api/todos', async () => {
    const db = createInMemoryDb();
    const app = createTestApp(db);
    const res = await request(app, 'POST', '/api/todos', {
      title: 'Buy milk',
      completed: false,
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe('Buy milk');
    expect(body.id).toBeDefined();
  });

  it('lists todos via GET /api/todos', async () => {
    const db = createInMemoryDb();
    const app = createTestApp(db);
    // Create one first
    await request(app, 'POST', '/api/todos', {
      title: 'Test todo',
    });
    const res = await request(app, 'GET', '/api/todos');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeInstanceOf(Array);
  });

  it('gets a todo by ID via GET /api/todos/:id', async () => {
    const db = createInMemoryDb();
    const app = createTestApp(db);
    const createRes = await request(app, 'POST', '/api/todos', {
      title: 'Get me',
    });
    const created = await createRes.json();
    const res = await request(app, 'GET', `/api/todos/${created.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe('Get me');
  });

  it('updates a todo via PATCH /api/todos/:id', async () => {
    const db = createInMemoryDb();
    const app = createTestApp(db);
    const createRes = await request(app, 'POST', '/api/todos', {
      title: 'Update me',
      completed: false,
    });
    const created = await createRes.json();
    const res = await request(app, 'PATCH', `/api/todos/${created.id}`, {
      completed: true,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.completed).toBe(true);
  });

  it('deletes a todo via DELETE /api/todos/:id', async () => {
    const db = createInMemoryDb();
    const app = createTestApp(db);
    const createRes = await request(app, 'POST', '/api/todos', {
      title: 'Delete me',
    });
    const created = await createRes.json();
    const res = await request(app, 'DELETE', `/api/todos/${created.id}`);
    expect(res.status).toBe(204);
  });

  it('returns 404 for non-existent todo', async () => {
    const db = createInMemoryDb();
    const app = createTestApp(db);
    const res = await request(app, 'GET', '/api/todos/non-existent-id');
    expect(res.status).toBe(404);
  });

  it('returns error response when db.create throws (e.g., missing required fields)', async () => {
    // Simulate what happens with a real DB that enforces constraints
    const failingDb: EntityDbAdapter = {
      ...createInMemoryDb(),
      async create(_data) {
        throw new Error('NOT NULL constraint failed: todos.title');
      },
    };
    const app = createTestApp(failingDb);
    const res = await request(app, 'POST', '/api/todos', { completed: false });
    // Should return an error status, not crash or hang
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(600);
    // Response should be valid JSON
    const body = await res.text();
    expect(() => JSON.parse(body)).not.toThrow();
  });
});
