/**
 * POC Type-Level Tests: TypeScript inference through QueryDescriptor + query() overloads.
 *
 * These tests validate that TypeScript correctly infers generic types through
 * the QueryDescriptor → query() pipeline. Uses @ts-expect-error for negative tests.
 */

import { query, type QueryResult } from './descriptor';
import { createClient, type Task } from './simulated-sdk';

// ---------- Setup ----------

const api = createClient({ baseURL: '/api' });

// ---------- Positive: correct types compile ----------

// query(descriptor) → QueryResult<Task[]>
const tasks: QueryResult<Task[]> = query(api.tasks.list());

// query(descriptor) → QueryResult<Task>
const task: QueryResult<Task> = query(api.tasks.get('id'));

// data is T | undefined
const _taskData: Task[] | undefined = tasks.data;
const _singleData: Task | undefined = task.data;

// Descriptor is assignable to PromiseLike<T>
const _promise1: PromiseLike<Task[]> = api.tasks.list();
const _promise2: PromiseLike<Task> = api.tasks.get('id');

// query() with options compiles
const _withOptions: QueryResult<Task> = query(api.tasks.get('id'), { enabled: false });

// Backward compat: thunk overload compiles
const _thunk: QueryResult<number[]> = query(
  () => Promise.resolve([1, 2, 3]),
  { key: 'numbers' },
);

// ---------- Negative: wrong types should error ----------

// @ts-expect-error — tasks.data is Task[] | undefined, not string
const _bad1: string = tasks.data;

// @ts-expect-error — task.data is Task | undefined, not Task[]
const _bad2: Task[] = task.data;

// @ts-expect-error — QueryResult<Task[]> is not assignable to QueryResult<string>
const _bad3: QueryResult<string> = query(api.tasks.list());

// @ts-expect-error — QueryResult<Task> is not assignable to QueryResult<Task[]>
const _bad4: QueryResult<Task[]> = query(api.tasks.get('id'));

// @ts-expect-error — descriptor is PromiseLike<Task[]>, not PromiseLike<string>
const _bad5: PromiseLike<string> = api.tasks.list();

// @ts-expect-error — descriptor for Task is not assignable to PromiseLike<Task[]>
const _bad6: PromiseLike<Task[]> = api.tasks.get('id');

// ---------- Overload discrimination ----------

// query(descriptor) should NOT accept `key` option (Omit<QueryOptions, 'key'>)
// Note: This works because the first overload omits 'key' from options.
// The thunk overload allows 'key', so if TS picks the wrong overload, this would compile.

// Descriptor overload: options slot omits 'key'
// @ts-expect-error — 'key' is not valid in descriptor overload options
const _badKey: QueryResult<Task[]> = query(api.tasks.list(), { key: 'manual-key' });

// Suppress unused vars
void _taskData;
void _singleData;
void _promise1;
void _promise2;
void _withOptions;
void _thunk;
void _bad1;
void _bad2;
void _bad3;
void _bad4;
void _bad5;
void _bad6;
void _badKey;
