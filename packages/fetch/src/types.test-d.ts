/**
 * Type-level tests for RequestOptions.
 *
 * Validates that typed query interfaces (e.g., from @vertz/openapi codegen)
 * are assignable to RequestOptions.query without needing explicit index signatures.
 * Checked by `tsc --noEmit -p tsconfig.typecheck.json`.
 */

import type { RequestOptions } from './types';

// ─── Typed query interface WITHOUT index signature ───────────────

interface ListTasksQuery {
  status?: string;
  limit?: number;
}

// Generated code passes typed query objects to FetchClient.get() via RequestOptions.
// This must not require an index signature on the query interface (#2217).
declare const typedQuery: ListTasksQuery;
const _opts: RequestOptions = { query: typedQuery };
void _opts;

// ─── Record<string, unknown> still works ─────────────────────────

declare const untypedQuery: Record<string, unknown>;
const _untyped: RequestOptions = { query: untypedQuery };
void _untyped;

// ─── Inline object literal works ─────────────────────────────────

const _inline: RequestOptions = { query: { page: 1, search: 'test' } };
void _inline;

// ─── Empty object works ──────────────────────────────────────────

const _empty: RequestOptions = { query: {} };
void _empty;

// ─── Required fields in query interface ──────────────────────────

interface StrictQuery {
  page: number;
  sort: 'asc' | 'desc';
}

declare const strictQuery: StrictQuery;
const _strict: RequestOptions = { query: strictQuery };
void _strict;

// ─── Primitives are rejected ─────────────────────────────────────

// @ts-expect-error - string is not a valid query
const _string: RequestOptions = { query: 'invalid' };
void _string;

// @ts-expect-error - number is not a valid query
const _number: RequestOptions = { query: 42 };
void _number;

// @ts-expect-error - boolean is not a valid query
const _bool: RequestOptions = { query: true };
void _bool;

// @ts-expect-error - null is not a valid query
const _null: RequestOptions = { query: null };
void _null;
