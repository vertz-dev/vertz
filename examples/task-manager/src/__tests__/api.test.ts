import type { EntityDbAdapter } from '@vertz/server';
import { createServer } from '@vertz/server';
import { describe, expect, it } from 'bun:test';
import { tasks } from '../entities';

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
        id: `task-${idCounter++}`,
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
    basePath: '/api',
    entities: [tasks],
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

describe('Task Manager API', () => {
  it('creates a task via POST /api/tasks', async () => {
    const db = createInMemoryDb();
    const app = createTestApp(db);
    const res = await request(app, 'POST', '/api/tasks', {
      title: 'Set up CI/CD',
      description: 'Configure GitHub Actions',
      status: 'todo',
      priority: 'high',
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe('Set up CI/CD');
    expect(body.id).toBeDefined();
  });

  it('lists tasks via GET /api/tasks', async () => {
    const db = createInMemoryDb();
    const app = createTestApp(db);
    await request(app, 'POST', '/api/tasks', {
      title: 'Test task',
      description: 'A test',
      status: 'todo',
      priority: 'medium',
    });
    const res = await request(app, 'GET', '/api/tasks');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeInstanceOf(Array);
  });

  it('gets a task by ID via GET /api/tasks/:id', async () => {
    const db = createInMemoryDb();
    const app = createTestApp(db);
    const createRes = await request(app, 'POST', '/api/tasks', {
      title: 'Get me',
      description: 'Find this task',
      status: 'todo',
      priority: 'low',
    });
    const created = await createRes.json();
    const res = await request(app, 'GET', `/api/tasks/${created.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe('Get me');
  });

  it('updates a task via PATCH /api/tasks/:id', async () => {
    const db = createInMemoryDb();
    const app = createTestApp(db);
    const createRes = await request(app, 'POST', '/api/tasks', {
      title: 'Update me',
      description: 'Needs update',
      status: 'todo',
      priority: 'medium',
    });
    const created = await createRes.json();
    const res = await request(app, 'PATCH', `/api/tasks/${created.id}`, {
      status: 'done',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('done');
  });

  it('deletes a task via DELETE /api/tasks/:id', async () => {
    const db = createInMemoryDb();
    const app = createTestApp(db);
    const createRes = await request(app, 'POST', '/api/tasks', {
      title: 'Delete me',
      description: 'Should be removed',
      status: 'todo',
      priority: 'low',
    });
    const created = await createRes.json();
    const res = await request(app, 'DELETE', `/api/tasks/${created.id}`);
    expect(res.status).toBe(204);
  });

  it('returns 404 for non-existent task', async () => {
    const db = createInMemoryDb();
    const app = createTestApp(db);
    const res = await request(app, 'GET', '/api/tasks/non-existent-id');
    expect(res.status).toBe(404);
  });
});
