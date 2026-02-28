/**
 * API client for the Entity Todo demo.
 *
 * Thin adapter over the generated SDK from @vertz/codegen.
 * Queries use createDescriptor() for use with query() + queryMatch().
 * Mutations throw on error (createDescriptor auto-unwraps Result).
 */

import { FetchClient } from '@vertz/fetch';
import { createTodosSdk } from '../generated/entities/todos';

export type {
  CreateTodosInput,
  TodosResponse,
  TodosResponse as Todo,
  UpdateTodosInput,
} from '../generated/types/todos';

/**
 * Resolve the API base URL.
 * In the browser, uses the current origin. In tests/SSR, falls back to localhost.
 */
const origin =
  typeof globalThis.location !== 'undefined' && globalThis.location.origin !== 'null'
    ? globalThis.location.origin
    : 'http://localhost:3000';

/**
 * Lazy fetch delegate: always reads globalThis.fetch at call time.
 * This allows tests to replace globalThis.fetch after module initialization.
 */
const lazyFetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  globalThis.fetch(input, init)) as typeof fetch;

const fetchClient = new FetchClient({
  baseURL: `${origin}/api`,
  fetch: lazyFetch,
});

const sdk = createTodosSdk(fetchClient);

/**
 * Response shape for the list endpoint.
 * The server returns `{ data: T[], total, limit, nextCursor, hasNextPage }`.
 * Codegen types `list()` as `TodosResponse[]` but the actual runtime shape
 * is this paginated wrapper — tracked as a known codegen issue.
 */
export interface TodoListResponse {
  data: import('../generated/types/todos').TodosResponse[];
  total: number;
}

// Query descriptors for query() + queryMatch()
export const api = {
  todos: {
    list: sdk.list,
    get: sdk.get,
  },
};

// Mutation methods — awaitable, throw FetchError on failure
export const todoApi = {
  create: sdk.create,
  update: sdk.update,
  delete: sdk.delete,
};
