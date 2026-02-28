import { createClient } from '#generated';

export type {
  TodosResponse,
  TodosResponse as Todo,
} from '#generated/types';

/**
 * Response shape for the list endpoint.
 * The server returns `{ data: T[], total, limit, nextCursor, hasNextPage }`.
 * Codegen types `list()` as `TodosResponse[]` but the actual runtime shape
 * is this paginated wrapper — tracked as a known codegen issue.
 */
export interface TodoListResponse {
  data: import('#generated/types').TodosResponse[];
  total: number;
}

export const api = createClient();
