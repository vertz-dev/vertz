/**
 * Mock fetch for UI component tests.
 *
 * Installs a globalThis.fetch mock that returns realistic responses
 * matching the real server API.
 */

import type { NotesResponse } from './client';

let nextId = 3;

const notes: NotesResponse[] = [
  {
    id: '1',
    title: 'First note',
    content: 'Hello world',
    createdAt: '2026-03-01T10:00:00Z',
    updatedAt: '2026-03-01T10:00:00Z',
  },
  {
    id: '2',
    title: 'Second note',
    content: 'More content here',
    createdAt: '2026-03-02T09:00:00Z',
    updatedAt: '2026-03-02T09:00:00Z',
  },
];

/** Reset mock data to initial state and install fetch mock. */
export function resetMockData(): void {
  // biome-ignore lint/suspicious/noExplicitAny: SSR global hook requires globalThis augmentation
  (globalThis as any).__VERTZ_CLEAR_QUERY_CACHE__?.();
  notes.length = 0;
  notes.push(
    {
      id: '1',
      title: 'First note',
      content: 'Hello world',
      createdAt: '2026-03-01T10:00:00Z',
      updatedAt: '2026-03-01T10:00:00Z',
    },
    {
      id: '2',
      title: 'Second note',
      content: 'More content here',
      createdAt: '2026-03-02T09:00:00Z',
      updatedAt: '2026-03-02T09:00:00Z',
    },
  );
  nextId = 3;

  (globalThis as Record<string, unknown>).fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const isRequest = typeof input === 'object' && 'url' in input && 'method' in input;
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    const method = init?.method ?? (isRequest ? (input as Request).method : 'GET');

    // POST /api/notes — create
    if (method === 'POST' && url.includes('/notes')) {
      const rawBody = init?.body ?? (isRequest ? await (input as Request).text() : undefined);
      const body = JSON.parse(rawBody as string) as { title: string; content?: string };
      const now = new Date().toISOString();
      const note: NotesResponse = {
        id: String(nextId++),
        title: body.title,
        content: body.content ?? '',
        createdAt: now,
        updatedAt: now,
      };
      notes.push(note);
      return new Response(JSON.stringify(note), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // DELETE /api/notes/:id
    if (method === 'DELETE' && url.includes('/notes/')) {
      const id = url.split('/notes/')[1]?.split('?')[0];
      const idx = notes.findIndex((n) => n.id === id);
      if (idx !== -1) notes.splice(idx, 1);
      return new Response(null, { status: 204 });
    }

    // PATCH /api/notes/:id — update
    if (method === 'PATCH' && url.includes('/notes/')) {
      const id = url.split('/notes/')[1]?.split('?')[0];
      const idx = notes.findIndex((n) => n.id === id);
      if (idx === -1) {
        return new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        );
      }
      const rawBody = init?.body ?? (isRequest ? await (input as Request).text() : undefined);
      const body = JSON.parse(rawBody as string) as Record<string, unknown>;
      const existing = notes[idx] as NotesResponse;
      const updated: NotesResponse = {
        ...existing,
        ...(body as Partial<NotesResponse>),
        updatedAt: new Date().toISOString(),
      };
      notes[idx] = updated;
      return new Response(JSON.stringify(updated), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // GET /api/notes/:id — get single
    if (method === 'GET' && url.includes('/notes/')) {
      const id = url.split('/notes/')[1]?.split('?')[0];
      const note = notes.find((n) => n.id === id);
      if (!note) {
        return new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify(note), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // GET /api/notes — list
    if (method === 'GET' && url.includes('/notes')) {
      return new Response(JSON.stringify({ items: [...notes], total: notes.length }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  };
}
