import { beforeEach, describe, expect, it } from 'bun:test';
import { createDbProvider } from '@vertz/db';
import { createServer } from '@vertz/server';
import { contacts } from '../src/entities';
import { contactsTable } from '../src/schema';

let db: Awaited<ReturnType<typeof createDbProvider>>;
let app: ReturnType<typeof createServer>;

beforeEach(async () => {
  db = await createDbProvider({
    dialect: 'sqlite',
    schema: contactsTable,
    sqlite: { dbPath: ':memory:' },
    migrations: { autoApply: true },
  });

  app = createServer({
    entities: [contacts],
    db,
  });
});

function request(method: string, path: string, body?: Record<string, unknown>): Promise<Response> {
  const init: RequestInit = { method };
  if (body) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return app.handler(new Request(`http://localhost${path}`, init));
}

describe('Contacts API', () => {
  it('creates a contact via POST /api/contacts', async () => {
    const res = await request('POST', '/api/contacts', {
      name: 'Alice Johnson',
      email: 'alice@example.com',
      phone: '+1-555-0100',
      notes: 'Met at conference',
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('Alice Johnson');
    expect(body.email).toBe('alice@example.com');
    expect(body.phone).toBe('+1-555-0100');
    expect(body.notes).toBe('Met at conference');
    expect(body.id).toBeDefined();
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeDefined();
  });

  it('lists contacts via GET /api/contacts', async () => {
    await request('POST', '/api/contacts', { name: 'Alice' });
    await request('POST', '/api/contacts', { name: 'Bob' });

    const res = await request('GET', '/api/contacts');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data.length).toBe(2);
  });

  it('gets a contact by ID via GET /api/contacts/:id', async () => {
    const createRes = await request('POST', '/api/contacts', {
      name: 'Charlie',
      email: 'charlie@example.com',
    });
    const created = await createRes.json();

    const res = await request('GET', `/api/contacts/${created.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Charlie');
    expect(body.email).toBe('charlie@example.com');
  });

  it('persists nullable fields as null when not provided', async () => {
    const createRes = await request('POST', '/api/contacts', {
      name: 'Dana',
    });
    const created = await createRes.json();

    const res = await request('GET', `/api/contacts/${created.id}`);
    const body = await res.json();
    expect(body.name).toBe('Dana');
    expect(body.email).toBeNull();
    expect(body.phone).toBeNull();
    expect(body.notes).toBeNull();
  });

  it('updates a contact via PATCH /api/contacts/:id', async () => {
    const createRes = await request('POST', '/api/contacts', {
      name: 'Diana',
      email: 'diana@old.com',
    });
    const created = await createRes.json();

    const res = await request('PATCH', `/api/contacts/${created.id}`, {
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
    const createRes = await request('POST', '/api/contacts', {
      name: 'Eve',
    });
    const created = await createRes.json();

    const res = await request('DELETE', `/api/contacts/${created.id}`);
    expect(res.status).toBe(204);
  });

  it('returns 404 for non-existent contact', async () => {
    const res = await request('GET', '/api/contacts/non-existent-id');
    expect(res.status).toBe(404);
  });

  it('full CRUD lifecycle', async () => {
    // Create
    const createRes = await request('POST', '/api/contacts', {
      name: 'Frank',
      email: 'frank@example.com',
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const contactId = created.id;

    // Read
    const getRes = await request('GET', `/api/contacts/${contactId}`);
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.name).toBe('Frank');

    // Update
    const updateRes = await request('PATCH', `/api/contacts/${contactId}`, {
      notes: 'Updated notes',
    });
    expect(updateRes.status).toBe(200);
    const updated = await updateRes.json();
    expect(updated.notes).toBe('Updated notes');

    // Delete
    const deleteRes = await request('DELETE', `/api/contacts/${contactId}`);
    expect(deleteRes.status).toBe(204);

    // Verify gone
    const goneRes = await request('GET', `/api/contacts/${contactId}`);
    expect(goneRes.status).toBe(404);
  });
});
