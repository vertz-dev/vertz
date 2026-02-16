/**
 * Type-level tests for QueryResult and query().
 *
 * These tests verify that generic type parameters flow correctly
 * through the query API. They are checked by `tsc --noEmit`
 * (typecheck), not by vitest at runtime.
 */

import type { ReadonlySignal } from '../../runtime/signal-types';
import type { QueryOptions, QueryResult } from '../query';
import { query } from '../query';

// ─── QueryResult<T> — signal types ────────────────────────────────

// data is ReadonlySignal<T | undefined>
declare const result: QueryResult<string>;

const _data: ReadonlySignal<string | undefined> = result.data;
void _data;

const _dataValue: string | undefined = result.data.value;
void _dataValue;

// loading is ReadonlySignal<boolean>
const _loading: ReadonlySignal<boolean> = result.loading;
void _loading;

const _loadingValue: boolean = result.loading.value;
void _loadingValue;

// error is ReadonlySignal<unknown>
const _error: ReadonlySignal<unknown> = result.error;
void _error;

// refetch returns void
const _refetchResult: void = result.refetch();
void _refetchResult;

// revalidate returns void
const _revalidateResult: void = result.revalidate();
void _revalidateResult;

// dispose returns void
const _disposeResult: void = result.dispose();
void _disposeResult;

// ─── query() — generic inference from thunk ───────────────────────

// query() infers T from the thunk return type
const stringQuery = query(() => Promise.resolve('hello'));
const _strData: ReadonlySignal<string | undefined> = stringQuery.data;
void _strData;

interface User {
  id: number;
  name: string;
}

const userQuery = query(async (): Promise<User> => ({ id: 1, name: 'Alice' }));
const _userData: ReadonlySignal<User | undefined> = userQuery.data;
void _userData;

// Accessing properties on the data value
const _userDataVal: User | undefined = userQuery.data.value;
if (_userDataVal) {
  const _id: number = _userDataVal.id;
  const _name: string = _userDataVal.name;
  void _id;
  void _name;
}

// ─── query() — initialData type safety ────────────────────────────

// initialData must match the thunk return type
const _withInitial = query(() => Promise.resolve(42), { initialData: 0 });
void _withInitial;

// @ts-expect-error - initialData type mismatch (string vs number)
const _badInitial = query(() => Promise.resolve(42), { initialData: 'wrong' });
void _badInitial;

// ─── QueryOptions<T> — type constraint ────────────────────────────

// Valid options
const _validOpts: QueryOptions<number> = {
  initialData: 42,
  debounce: 300,
  enabled: true,
  key: 'my-key',
};
void _validOpts;

const _badOpts: QueryOptions<number> = {
  // @ts-expect-error - initialData type must match T
  initialData: 'not a number',
};
void _badOpts;

// ─── QueryResult<T> — data is read-only ───────────────────────────

// data, loading, error are readonly properties
declare const readonlyCheck: QueryResult<number>;

// @ts-expect-error - data is readonly, cannot reassign
readonlyCheck.data = null as unknown as ReadonlySignal<number | undefined>;

// @ts-expect-error - loading is readonly, cannot reassign
readonlyCheck.loading = null as unknown as ReadonlySignal<boolean>;

// @ts-expect-error - error is readonly, cannot reassign
readonlyCheck.error = null as unknown as ReadonlySignal<unknown>;

// ─── QueryResult<T> — complex generic types ──────────────────────

interface ApiResponse<T> {
  data: T;
  meta: { page: number; total: number };
}

const paginatedQuery = query(
  async (): Promise<ApiResponse<User[]>> => ({
    data: [{ id: 1, name: 'Alice' }],
    meta: { page: 1, total: 100 },
  }),
);

const _paginatedData: ReadonlySignal<ApiResponse<User[]> | undefined> = paginatedQuery.data;
void _paginatedData;

const _paginatedVal = paginatedQuery.data.value;
if (_paginatedVal) {
  const _users: User[] = _paginatedVal.data;
  const _page: number = _paginatedVal.meta.page;
  void _users;
  void _page;
}
