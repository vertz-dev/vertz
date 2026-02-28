/**
 * Mock fetch for UI component tests.
 *
 * Installs a globalThis.fetch mock that returns realistic responses
 * matching the real server API. Used by todo-form.test.ts and todo-list.test.ts.
 */

import type { TodosResponse } from '#generated/types';

let nextId = 3;

const todos: TodosResponse[] = [
  {
    id: '1',
    title: 'Set up project structure',
    completed: true,
    createdAt: '2026-02-01T10:00:00Z',
    updatedAt: '2026-02-01T10:00:00Z',
  },
  {
    id: '2',
    title: 'Add entity CRUD',
    completed: false,
    createdAt: '2026-02-02T09:00:00Z',
    updatedAt: '2026-02-02T09:00:00Z',
  },
];

/** Reset mock data to initial state and install fetch mock. */
export function resetMockData(): void {
  // Clear the query cache so each test starts with loading=true
  // biome-ignore lint/suspicious/noExplicitAny: SSR global hook requires globalThis augmentation
  (globalThis as any).__VERTZ_CLEAR_QUERY_CACHE__?.();
  todos.length = 0;
  todos.push(
    {
      id: '1',
      title: 'Set up project structure',
      completed: true,
      createdAt: '2026-02-01T10:00:00Z',
      updatedAt: '2026-02-01T10:00:00Z',
    },
    {
      id: '2',
      title: 'Add entity CRUD',
      completed: false,
      createdAt: '2026-02-02T09:00:00Z',
      updatedAt: '2026-02-02T09:00:00Z',
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

    // POST /api/todos — create
    if (method === 'POST' && url.includes('/todos')) {
      const rawBody = init?.body ?? (isRequest ? await (input as Request).text() : undefined);
      const body = JSON.parse(rawBody as string) as { title: string; completed?: boolean };
      const now = new Date().toISOString();
      const todo: TodosResponse = {
        id: String(nextId++),
        title: body.title,
        completed: (body.completed as boolean) ?? false,
        createdAt: now,
        updatedAt: now,
      };
      todos.push(todo);
      return new Response(JSON.stringify(todo), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // DELETE /api/todos/:id
    if (method === 'DELETE' && url.includes('/todos/')) {
      const id = url.split('/todos/')[1]?.split('?')[0];
      const idx = todos.findIndex((t) => t.id === id);
      if (idx !== -1) todos.splice(idx, 1);
      return new Response(null, { status: 204 });
    }

    // PATCH /api/todos/:id — update
    if (method === 'PATCH' && url.includes('/todos/')) {
      const id = url.split('/todos/')[1]?.split('?')[0];
      const idx = todos.findIndex((t) => t.id === id);
      if (idx === -1) {
        return new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } }),
          {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }
      const rawBody = init?.body ?? (isRequest ? await (input as Request).text() : undefined);
      const body = JSON.parse(rawBody as string) as Record<string, unknown>;
      const existing = todos[idx] as TodosResponse;
      const updated: TodosResponse = {
        ...existing,
        ...(body as Partial<TodosResponse>),
        updatedAt: new Date().toISOString(),
      };
      todos[idx] = updated;
      return new Response(JSON.stringify(updated), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // GET /api/todos/:id — get single
    if (method === 'GET' && url.includes('/todos/')) {
      const id = url.split('/todos/')[1]?.split('?')[0];
      const todo = todos.find((t) => t.id === id);
      if (!todo) {
        return new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } }),
          {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }
      return new Response(JSON.stringify(todo), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // GET /api/todos — list
    if (method === 'GET' && url.includes('/todos')) {
      return new Response(JSON.stringify({ data: [...todos], total: todos.length }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  };
}
