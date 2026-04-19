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

// revalidating is Unwrapped<ReadonlySignal<boolean>> which equals boolean
const _revalidating: boolean = result.revalidating;
void _revalidating;

// idle is Unwrapped<ReadonlySignal<boolean>> which equals boolean
const _idle: boolean = result.idle;
void _idle;

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

// @ts-expect-error - revalidating is readonly, cannot reassign
readonlyCheck.revalidating = null as unknown as boolean;

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
query(descriptor, { debounce: 300 });

// ─── query() — descriptor error type flows through ───────────────

// Extract the default error type from QueryDescriptor (FetchError from @vertz/errors)
type DefaultDescriptorError = NonNullable<(typeof descriptor)['_error']>;

// Default descriptor carries the descriptor's error type
const _descriptorError: DefaultDescriptorError | undefined = descriptorResult.error;
void _descriptorError;

// The default FetchError (from @vertz/errors) has .code and .message
if (descriptorResult.error) {
  const _msg: string = descriptorResult.error.message;
  void _msg;
}

// Custom error type on descriptor flows through to QueryResult
interface CustomError {
  code: string;
  detail: string;
}

declare const customDescriptor: QueryDescriptor<string, CustomError>;
const customResult = query(customDescriptor);
const _customError: CustomError | undefined = customResult.error;
void _customError;

// Custom error properties are accessible
if (customResult.error) {
  const _code: string = customResult.error.code;
  const _detail: string = customResult.error.detail;
  void _code;
  void _detail;
}

// @ts-expect-error - error type mismatch: cannot assign CustomError | undefined to string
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

// ─── query() — null-return overloads ──────────────────────────────

// Thunk returning Promise | null — infers T from Promise
declare const condition: boolean;
const nullableThunk = query(() => (condition ? Promise.resolve('hello') : null));
const _nullableData: string | undefined = nullableThunk.data;
void _nullableData;

// idle signal is available
const _nullableIdle: boolean = nullableThunk.idle;
void _nullableIdle;

// Thunk returning QueryDescriptor | null — preserves T and E types
declare const conditionalDescriptor: QueryDescriptor<string[], CustomError>;
const descriptorThunk = query(() => (condition ? conditionalDescriptor : null));
const _descriptorThunkData: string[] | undefined = descriptorThunk.data;
void _descriptorThunkData;

// Error type is preserved through descriptor-in-thunk overload
const _descriptorThunkError: CustomError | undefined = descriptorThunk.error;
void _descriptorThunkError;

// @ts-expect-error - thunk must return Promise, QueryDescriptor, AsyncIterable, or null — not a raw value
query(() => 42);

// @ts-expect-error - thunk must return Promise, QueryDescriptor, AsyncIterable, or null — not a string
query(() => 'hello');

// ─── query() — stream overload (AsyncIterable source) ────────────

import type { QueryStreamOptions, QueryStreamResult } from '../query';

interface AgentEvent {
  id: string;
  text: string;
}

declare function makeStream(): AsyncIterable<AgentEvent>;

// Stream overload returns QueryStreamResult<T> — data is T[], not T | undefined
const streamResult: QueryStreamResult<AgentEvent> = query(() => makeStream(), {
  key: 'stream-key',
});

// data is AgentEvent[] (always-array, never undefined)
const _streamData: AgentEvent[] = streamResult.data;
void _streamData;

// reconnecting replaces revalidating on stream queries
const _reconnecting: boolean = streamResult.reconnecting;
void _reconnecting;

// loading / error / idle still present
const _streamLoading: boolean = streamResult.loading;
const _streamError: unknown = streamResult.error;
const _streamIdle: boolean = streamResult.idle;
void _streamLoading;
void _streamError;
void _streamIdle;

// Stream overload requires `key`
// @ts-expect-error - key is required for stream queries
query(() => makeStream(), {});

// Stream overload accepts tuple keys
const _tupleKey: QueryStreamResult<AgentEvent> = query(() => makeStream(), {
  key: ['session', 'abc', 'messages'] as const,
});
void _tupleKey;

// QueryStreamOptions does not have refetchInterval
const _streamOpts: QueryStreamOptions = {
  key: 'k',
  // @ts-expect-error - refetchInterval is not part of QueryStreamOptions
  refetchInterval: 1000,
};
void _streamOpts;

// Stream thunk receives an optional AbortSignal
query(
  (signal) => {
    // signal is AbortSignal | undefined
    const _isAborted: boolean | undefined = signal?.aborted;
    void _isAborted;
    return makeStream();
  },
  { key: 'with-signal' },
);

// Stream result data is NOT typed as T | undefined
declare const _wrongData: AgentEvent | undefined;
// @ts-expect-error - stream data is AgentEvent[], not AgentEvent | undefined
const _bad: AgentEvent | undefined = streamResult.data;
void _bad;
void _wrongData;

// Promise overload result still has data: T | undefined (regression check)
const _promiseRegression = query(() => Promise.resolve('a'));
const _promiseData: string | undefined = _promiseRegression.data;
void _promiseData;
