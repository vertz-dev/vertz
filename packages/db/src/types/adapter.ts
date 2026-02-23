/**
 * Database Adapter Types for @vertz/db
 *
 * Generic adapter interface that abstracts database operations.
 * Implemented by SQLite, D1, and other database adapters.
 */

// ---------------------------------------------------------------------------
// List Options - pagination & filtering
// ---------------------------------------------------------------------------

export interface ListOptions {
  where?: Record<string, unknown>;
  limit?: number;
  /** Cursor-based pagination: fetch records after this ID. */
  after?: string;
}

// ---------------------------------------------------------------------------
// DB Adapter Interface - abstracts the actual database operations
// ---------------------------------------------------------------------------

export interface EntityDbAdapter {
  get(id: string): Promise<Record<string, unknown> | null>;
  list(options?: ListOptions): Promise<{ data: Record<string, unknown>[]; total: number }>;
  create(data: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(id: string): Promise<Record<string, unknown> | null>;
}
