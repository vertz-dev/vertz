import { beforeAll, describe, expect, it } from 'bun:test';
import { createServer } from '@vertz/server';
import { createInMemoryDb } from '../api/db';
import { notes } from '../api/entities/notes.entity';

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

async function createNote(
  app: ReturnType<typeof createServer>,
  data: { title: string; content?: string },
) {
  const res = await request(app, 'POST', '/api/notes', data);
  return res.json();
}

describe('Given a Vertz server with notes entity', () => {
  let app: ReturnType<typeof createServer>;

  beforeAll(async () => {
    const db = await createInMemoryDb();
    app = createServer({
      basePath: '/api',
      entities: [notes],
      db,
    });
  });

  describe('When creating a note via POST /api/notes', () => {
    it('Then returns the created note with id, title, content, timestamps', async () => {
      const res = await request(app, 'POST', '/api/notes', {
        title: 'Test Note',
        content: 'Hello world',
      });
      const body = await res.json();
      expect(res.status).toBe(201);
      expect(body.id).toBeDefined();
      expect(body.title).toBe('Test Note');
      expect(body.content).toBe('Hello world');
      expect(body.createdAt).toBeDefined();
    });
  });

  describe('When listing notes via GET /api/notes', () => {
    it('Then returns items array with created notes', async () => {
      // Create a note first
      await createNote(app, { title: 'List Test' });

      const res = await request(app, 'GET', '/api/notes');
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.items).toBeInstanceOf(Array);
      expect(body.items.length).toBeGreaterThan(0);
    });
  });

  describe('When getting a single note via GET /api/notes/:id', () => {
    it('Then returns the note with matching id', async () => {
      const created = await createNote(app, { title: 'Get Test', content: 'Some content' });
      const res = await request(app, 'GET', `/api/notes/${created.id}`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.id).toBe(created.id);
      expect(body.title).toBe('Get Test');
      expect(body.content).toBe('Some content');
    });
  });

  describe('When updating a note via PATCH /api/notes/:id', () => {
    it('Then returns the updated note with new content', async () => {
      const created = await createNote(app, { title: 'Original' });
      const res = await request(app, 'PATCH', `/api/notes/${created.id}`, {
        content: 'Updated content',
      });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.content).toBe('Updated content');
      expect(body.title).toBe('Original');
    });
  });

  describe('When deleting a note via DELETE /api/notes/:id', () => {
    it('Then returns success and note is no longer retrievable', async () => {
      const created = await createNote(app, { title: 'To Delete' });
      const deleteRes = await request(app, 'DELETE', `/api/notes/${created.id}`);
      expect(deleteRes.status).toBe(204);

      const getRes = await request(app, 'GET', `/api/notes/${created.id}`);
      expect(getRes.status).toBe(404);
    });
  });
});
