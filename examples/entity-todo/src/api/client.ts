/**
 * API client for the Entity Todo demo.
 *
 * This module provides a typed SDK client that wraps the generated
 * @vertz/codegen output. All CRUD operations return Result<T, FetchError>
 * for compile-time exhaustiveness checking via matchError.
 */

import { FetchClient, type FetchClientConfig, type Result, type FetchErrorType } from '@vertz/fetch';
import { createTodosSdk } from '../generated/entities/todos';

// Base URL for the API (defaults to local dev server)
const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000/api';

/**
 * Create an SDK client instance.
 * In a real app, you'd configure auth strategies here.
 */
function createClient(config: FetchClientConfig) {
  const client = new FetchClient(config);
  return createTodosSdk(client);
}

export const sdk = createClient({
  baseURL: API_BASE,
});

/**
 * Todo type - matches the API response format.
 */
export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * SDK input types (derived from generated schemas).
 */
export type CreateTodoInput = { title: string; completed?: boolean };
export type UpdateTodoInput = Partial<Pick<Todo, 'title' | 'completed'>>;

/**
 * List todos - demonstrates Result handling from SDK.
 * The SDK returns Result<T, FetchError> where FetchError is the error type
 * from @vertz/errors with properties like code, status, serverCode.
 *
 * @returns Result containing array of todos or FetchError
 */
export async function fetchTodos(): Promise<Result<{ todos: Todo[]; total: number }, FetchErrorType>> {
  const result = await sdk.list();

  if (result.ok) {
    // Result.ok = true → result.data is { data: T; status: number; headers: Headers }
    const data = result.data.data as Todo[];
    return {
      ok: true,
      data: {
        todos: data,
        total: data.length,
      },
    };
  }

  // Return the error as-is - components will use matchError to handle it
  return {
    ok: false,
    error: result.error,
  };
}

/**
 * Get a single todo by ID.
 */
export async function fetchTodo(id: string): Promise<Result<Todo, FetchErrorType>> {
  const result = await sdk.get(id);

  if (result.ok) {
    return {
      ok: true,
      data: result.data.data as Todo,
    };
  }

  return {
    ok: false,
    error: result.error,
  };
}

/**
 * Create a new todo.
 */
export async function createTodo(input: CreateTodoInput): Promise<Result<Todo, FetchErrorType>> {
  // The generated SDK expects { body: CreateTodoInput }
  const result = await sdk.create({ body: input });

  if (result.ok) {
    return {
      ok: true,
      data: result.data.data as Todo,
    };
  }

  return {
    ok: false,
    error: result.error,
  };
}

/**
 * Update an existing todo.
 */
export async function updateTodo(
  id: string,
  input: UpdateTodoInput,
): Promise<Result<Todo, FetchErrorType>> {
  // The generated SDK expects { params: { id }, body: UpdateTodoInput }
  const result = await sdk.update(id, { body: input });

  if (result.ok) {
    return {
      ok: true,
      data: result.data.data as Todo,
    };
  }

  return {
    ok: false,
    error: result.error,
  };
}

/**
 * Delete a todo.
 */
export async function deleteTodo(id: string): Promise<Result<{ success: boolean }, FetchErrorType>> {
  const result = await sdk.delete(id);

  if (result.ok) {
    return {
      ok: true,
      data: { success: true },
    };
  }

  return {
    ok: false,
    error: result.error,
  };
}

/**
 * SDK method metadata for form progressive enhancement.
 * This mirrors what @vertz/codegen generates.
 */
export const todoApi = {
  create: Object.assign(
    (body: CreateTodoInput) => createTodo(body),
    {
      url: '/todos',
      method: 'POST' as const,
    },
  ),
  update: (id: string) =>
    Object.assign(
      (body: UpdateTodoInput) => updateTodo(id, body),
      {
        url: `/todos/${id}`,
        method: 'PATCH' as const,
      },
    ),
  delete: (id: string) =>
    Object.assign(
      () => deleteTodo(id),
      {
        url: `/todos/${id}`,
        method: 'DELETE' as const,
      },
    ),
};
