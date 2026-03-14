import { beforeEach, describe, expect, it } from 'bun:test';
import { createServer } from '@vertz/server';
import { createInMemoryDb } from '../api/db';
import { notes } from '../api/entities/notes.entity';

type App = ReturnType<typeof createServer>;

interface NoteResponse {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

function request(
  app: App,
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
  app: App,
  data: { title: string; content?: string },
): Promise<NoteResponse> {
  const res = await request(app, 'POST', '/api/notes', data);
  return res.json() as Promise<NoteResponse>;
}

describe('Given a Vertz server with notes entity', () => {
  let app: App;

  beforeEach(async () => {
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
    it('Then returns items array with the created note', async () => {
      await createNote(app, { title: 'List Test' });

      const res = await request(app, 'GET', '/api/notes');
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.items).toBeInstanceOf(Array);
      expect(body.items.length).toBe(1);
      expect(body.items[0].title).toBe('List Test');
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

  describe('When getting a non-existent note via GET /api/notes/:id', () => {
    it('Then returns 404', async () => {
      const res = await request(app, 'GET', '/api/notes/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(404);
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
    it('Then returns 204 and note is no longer retrievable', async () => {
      const created = await createNote(app, { title: 'To Delete' });
      const deleteRes = await request(app, 'DELETE', `/api/notes/${created.id}`);
      expect(deleteRes.status).toBe(204);

      const getRes = await request(app, 'GET', `/api/notes/${created.id}`);
      expect(getRes.status).toBe(404);
    });
  });

  describe('When creating a note with missing title via POST /api/notes', () => {
    it('Then returns an error response', async () => {
      const res = await request(app, 'POST', '/api/notes', {});
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });
});
