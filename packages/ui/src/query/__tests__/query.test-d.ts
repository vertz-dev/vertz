/**
 * Type-level tests for QueryResult and query().
 *
 * These tests verify that generic type parameters flow correctly
 * through the query API. They are checked by `tsc --noEmit`
 * (typecheck), not by vitest at runtime.
 */

import type { QueryOptions, QueryResult } from '../query';

// ─── QueryResult<T> — unwrapped types ────────────────────────────

// data is Unwrapped<ReadonlySignal<T | undefined>> which equals T | undefined
declare const result: QueryResult<string>;

const _data: string | undefined = result.data;
void _data;

// Access the value directly (no .value needed)
const _dataValue: string | undefined = result.data;
void _dataValue;

// loading is Unwrapped<ReadonlySignal<boolean>> which equals boolean
const _loading: boolean = result.loading;
void _loading;

// Access directly (no .value needed)
const _loadingValue: boolean = result.loading;
void _loadingValue;

// error is Unwrapped<ReadonlySignal<unknown | undefined>> which equals unknown
const _error: unknown = result.error;
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
import { query } from '../query';

const stringQuery = query(() => Promise.resolve('hello'));
const _strData: string | undefined = stringQuery.data;
void _strData;

interface User {
  id: number;
  name: string;
}

const userQuery = query(async (): Promise<User> => ({ id: 1, name: 'Alice' }));
const _userData: User | undefined = userQuery.data;
void _userData;

// Accessing properties on the data value directly (no .value needed)
if (_userData) {
  const _id: number = _userData.id;
  const _name: string = _userData.name;
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
readonlyCheck.data = null as unknown as number | undefined;

// @ts-expect-error - loading is readonly, cannot reassign
readonlyCheck.loading = null as unknown as boolean;

// @ts-expect-error - error is readonly, cannot reassign
readonlyCheck.error = null as unknown as unknown;

// ─── query() — QueryDescriptor overload ──────────────────────────

import type { QueryDescriptor } from '@vertz/fetch';

// query() infers T from QueryDescriptor<T>
declare const descriptor: QueryDescriptor<string[]>;
const descriptorResult = query(descriptor);
const _descriptorData: string[] | undefined = descriptorResult.data;
void _descriptorData;

// descriptor overload omits 'key' from options
// @ts-expect-error - key is not allowed in descriptor overload
query(descriptor, { key: 'manual-key' });

// descriptor overload still allows other options
query(descriptor, { enabled: false });
query(descriptor, { debounce: 300 });

// ─── query() — descriptor error type flows through ───────────────

import type { FetchError } from '@vertz/fetch';

// Default descriptor carries FetchError as error type
const _descriptorError: FetchError | undefined = descriptorResult.error;
void _descriptorError;

// Custom error type on descriptor flows through to QueryResult
interface CustomError {
  code: string;
  detail: string;
}

declare const customDescriptor: QueryDescriptor<string, CustomError>;
const customResult = query(customDescriptor);
const _customError: CustomError | undefined = customResult.error;
void _customError;

// @ts-expect-error - error type mismatch: cannot assign FetchError | undefined to string
const _wrongError: string = customResult.error;
void _wrongError;

// Thunk overload error is still unknown (no error type info from thunks)
const thunkResult = query(() => Promise.resolve('hello'));
const _thunkError: unknown = thunkResult.error;
void _thunkError;

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

const _paginatedData: ApiResponse<User[]> | undefined = paginatedQuery.data;
void _paginatedData;

if (_paginatedData) {
  const _users: User[] = _paginatedData.data;
  const _page: number = _paginatedData.meta.page;
  void _users;
  void _page;
}
