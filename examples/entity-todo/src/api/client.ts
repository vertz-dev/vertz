/**
 * API client for the Entity Todo demo.
 *
 * Queries use createDescriptor() for use with query() + queryMatch().
 * Mutations return Result<T, FetchError> for matchError exhaustiveness.
 */

import { HttpError } from '@vertz/errors';
import { createDescriptor, err, type FetchErrorType, ok, type Result } from '@vertz/fetch';

// ── Types ──────────────────────────────────────────

export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CreateTodoInput = { title: string; completed?: boolean };
export type UpdateTodoInput = Partial<Pick<Todo, 'title' | 'completed'>>;

// ── In-memory store (simulates API) ────────────────

let nextId = 4;

const todos: Todo[] = [
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
  {
    id: '3',
    title: 'Write tests',
    completed: false,
    createdAt: '2026-02-03T11:00:00Z',
    updatedAt: '2026-02-03T11:00:00Z',
  },
];

function delay(ms = 200): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Raw data functions ─────────────────────────────

async function fetchTodos(): Promise<{ todos: Todo[]; total: number }> {
  await delay();
  return { todos: [...todos], total: todos.length };
}

async function fetchTodo(id: string): Promise<Todo> {
  await delay();
  const todo = todos.find((t) => t.id === id);
  if (!todo) throw new Error(`Todo ${id} not found`);
  return { ...todo };
}

// ── Descriptor-based queries (for query() + queryMatch) ──

function mockFetchResponse<T>(fn: () => Promise<T>) {
  return async () => ok({ data: await fn(), status: 200, headers: new Headers() });
}

export const api = {
  todos: {
    list: Object.assign(
      () =>
        createDescriptor<{ todos: Todo[]; total: number }>(
          'GET',
          '/todos',
          mockFetchResponse(() => fetchTodos()),
        ),
      { url: '/todos', method: 'GET' as const },
    ),
    get: Object.assign(
      (id: string) =>
        createDescriptor<Todo>(
          'GET',
          `/todos/${id}`,
          mockFetchResponse(() => fetchTodo(id)),
        ),
      { url: '/todos/:id', method: 'GET' as const },
    ),
  },
};

// ── Result-returning mutations (for matchError) ────

export async function createTodo(input: CreateTodoInput): Promise<Result<Todo, FetchErrorType>> {
  try {
    await delay(300);
    const now = new Date().toISOString();
    const todo: Todo = {
      id: String(nextId++),
      title: input.title,
      completed: input.completed ?? false,
      createdAt: now,
      updatedAt: now,
    };
    todos.push(todo);
    return ok(todo);
  } catch (e) {
    return err(e as FetchErrorType);
  }
}

export async function updateTodo(
  id: string,
  input: UpdateTodoInput,
): Promise<Result<Todo, FetchErrorType>> {
  try {
    await delay(200);
    const idx = todos.findIndex((t) => t.id === id);
    if (idx === -1) {
      return err(new HttpError(404, `Todo ${id} not found`, 'NOT_FOUND'));
    }
    const existing = todos[idx] as Todo;
    const updated: Todo = {
      ...existing,
      ...input,
      updatedAt: new Date().toISOString(),
    };
    todos[idx] = updated;
    return ok(updated);
  } catch (e) {
    return err(e as FetchErrorType);
  }
}

export async function deleteTodo(
  id: string,
): Promise<Result<{ success: boolean }, FetchErrorType>> {
  try {
    await delay(200);
    const idx = todos.findIndex((t) => t.id === id);
    if (idx === -1) {
      return err(new HttpError(404, `Todo ${id} not found`, 'NOT_FOUND'));
    }
    todos.splice(idx, 1);
    return ok({ success: true });
  } catch (e) {
    return err(e as FetchErrorType);
  }
}

/**
 * SDK methods for form() progressive enhancement.
 *
 * These unwrap the Result: return data on Ok, throw on Err.
 * form() expects a function that returns data or throws — it handles
 * errors via onError callback, not Result matching.
 */
export const todoApi = {
  create: Object.assign(
    async (body: CreateTodoInput): Promise<Todo> => {
      const result = await createTodo(body);
      if (!result.ok) throw result.error;
      return result.data;
    },
    {
      url: '/todos',
      method: 'POST' as const,
    },
  ),
  update: (id: string) =>
    Object.assign(
      async (body: UpdateTodoInput): Promise<Todo> => {
        const result = await updateTodo(id, body);
        if (!result.ok) throw result.error;
        return result.data;
      },
      {
        url: `/todos/${id}`,
        method: 'PATCH' as const,
      },
    ),
  delete: (id: string) =>
    Object.assign(
      async (): Promise<{ success: boolean }> => {
        const result = await deleteTodo(id);
        if (!result.ok) throw result.error;
        return result.data;
      },
      {
        url: `/todos/${id}`,
        method: 'DELETE' as const,
      },
    ),
};

/** Reset mock data to initial state (for tests). */
export function resetMockData(): void {
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
}
