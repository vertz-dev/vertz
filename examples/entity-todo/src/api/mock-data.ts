/**
 * Mock data and in-memory store for the Entity Todo demo.
 *
 * In a real app, these would use the generated SDK from @vertz/codegen
 * talking to a @vertz/server backend. Here we simulate the full CRUD cycle
 * with an in-memory array and artificial async delays.
 */

import type { CreateTodoInput, Todo, UpdateTodoInput } from '../generated';

let nextId = 4;

const todos: Todo[] = [
  {
    id: '1',
    title: 'Define data schema with d.table()',
    completed: true,
    createdAt: '2026-02-01T10:00:00Z',
    updatedAt: '2026-02-01T10:00:00Z',
  },
  {
    id: '2',
    title: 'Generate typed SDK with vertz codegen',
    completed: true,
    createdAt: '2026-02-02T10:00:00Z',
    updatedAt: '2026-02-02T14:00:00Z',
  },
  {
    id: '3',
    title: 'Build reactive UI with @vertz/ui',
    completed: false,
    createdAt: '2026-02-03T10:00:00Z',
    updatedAt: '2026-02-03T10:00:00Z',
  },
];

/** Simulate network latency. */
function delay(ms = 200): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch all todos. */
export async function fetchTodos(): Promise<{ todos: Todo[]; total: number }> {
  await delay();
  return { todos: [...todos], total: todos.length };
}

/** Fetch a single todo by ID. */
export async function fetchTodo(id: string): Promise<Todo> {
  await delay();
  const todo = todos.find((t) => t.id === id);
  if (!todo) throw new Error(`Todo ${id} not found`);
  return { ...todo };
}

/** Create a new todo. */
export async function createTodo(body: CreateTodoInput): Promise<Todo> {
  await delay(300);
  const now = new Date().toISOString();
  const todo: Todo = {
    id: String(nextId++),
    title: body.title,
    completed: body.completed ?? false,
    createdAt: now,
    updatedAt: now,
  };
  todos.push(todo);
  return { ...todo };
}

/** Update an existing todo. */
export async function updateTodo(id: string, body: UpdateTodoInput): Promise<Todo> {
  await delay(200);
  const idx = todos.findIndex((t) => t.id === id);
  if (idx === -1) throw new Error(`Todo ${id} not found`);
  const existing = todos[idx] as Todo;
  const updated: Todo = {
    ...existing,
    ...body,
    updatedAt: new Date().toISOString(),
  };
  todos[idx] = updated;
  return { ...updated };
}

/** Delete a todo. */
export async function deleteTodo(id: string): Promise<{ success: boolean }> {
  await delay(200);
  const idx = todos.findIndex((t) => t.id === id);
  if (idx === -1) throw new Error(`Todo ${id} not found`);
  todos.splice(idx, 1);
  return { success: true };
}

/**
 * Simulated SDK methods for use with form().
 *
 * These mimic what @vertz/codegen would produce: a callable function
 * with `.url` and `.method` metadata for progressive enhancement.
 */
export const todoApi = {
  create: Object.assign((body: CreateTodoInput) => createTodo(body), {
    url: '/api/todos',
    method: 'POST',
  }),

  update: (id: string) =>
    Object.assign((body: UpdateTodoInput) => updateTodo(id, body), {
      url: `/api/todos/${id}`,
      method: 'PATCH',
    }),

  delete: (id: string) =>
    Object.assign(() => deleteTodo(id), { url: `/api/todos/${id}`, method: 'DELETE' }),
};

/** Reset mock data to initial state (for tests). */
export function resetMockData(): void {
  todos.length = 0;
  todos.push(
    {
      id: '1',
      title: 'Define data schema with d.table()',
      completed: true,
      createdAt: '2026-02-01T10:00:00Z',
      updatedAt: '2026-02-01T10:00:00Z',
    },
    {
      id: '2',
      title: 'Generate typed SDK with vertz codegen',
      completed: true,
      createdAt: '2026-02-02T10:00:00Z',
      updatedAt: '2026-02-02T14:00:00Z',
    },
  );
  nextId = 3;
}

export type { Todo, CreateTodoInput, UpdateTodoInput } from '../generated';
