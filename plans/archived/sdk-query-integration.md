# SDK + Query Integration — Zero-Boilerplate Data Fetching

## Problem

The generated entity SDK exists to eliminate manual API client code. But today, using it in the UI requires a hand-written wrapper file (`src/api/client.ts`) that:

1. Initializes `FetchClient` with URL workarounds
2. Rewrites every SDK method as a throw-on-error wrapper
3. Manually unwraps the `Result` → `FetchResponse` → API body chain
4. Defines cache keys for `query()` by hand
5. Re-exports `taskApi` metadata objects for `form()`

This defeats the purpose of code generation. The ideal DX: import the SDK, use it with `query()`, done. No wrapper file. No boilerplate.

## Desired DX

```tsx
// src/api/index.ts — the only file the user writes
import { createClient } from '../generated/client';

export const api = createClient({
  baseURL: '/api',
  // Auth options are typed — only what the API actually supports.
  // If the API doesn't declare auth, this property doesn't exist.
  auth: {
    token: () => localStorage.getItem('auth_token'),
  },
});
```

```tsx
// In a page component
import { api } from '../api';

export function TaskListPage() {
  const tasks = query(api.tasks.list());
  //                  ^^^^^^^^^^^^^^^^
  //                  Returns a QueryDescriptor, not a Promise.
  //                  Key auto-derived: "GET:/tasks"
  //                  Result auto-unwrapped: tasks.data is Task[]

  return (
    <ul>
      {tasks.data?.map(task => <li key={task.id}>{task.title}</li>)}
    </ul>
  );
}
```

```tsx
// Parameterized query
export function TaskDetailPage() {
  const { id } = useParams<'/tasks/:id'>();
  const task = query(api.tasks.get(id), { enabled: !!id });
  //                 ^^^^^^^^^^^^^^^^^   ^^^^^^^^^^^^^^^^^
  //                 Key: "GET:/tasks/<id>"    Options slot is always 2nd arg
}
```

```tsx
// Imperative usage — same SDK, await works
async function handleCreate(body: CreateTaskBody) {
  const task = await api.tasks.create(body);
  // task is Task (unwrapped), throws on error
}
```

```tsx
// Form integration — unchanged, already works
const taskForm = form(api.tasks.create, { onSuccess });
```

## API Surface

### `query()` — enhanced signature

```typescript
// New: accepts QueryDescriptor (from SDK methods)
function query<T>(
  descriptor: QueryDescriptor<T>,
  options?: Omit<QueryOptions<T>, 'key'>,
): QueryResult<T>;

// Existing: accepts thunk (backward compatible)
function query<T>(
  thunk: () => Promise<T>,
  options?: QueryOptions<T>,
): QueryResult<T>;
```

When `query()` receives a `QueryDescriptor`, it:
- Uses the descriptor's key (no manual `key` needed)
- Calls the descriptor's fetch function
- Auto-unwraps the `Result` (throws `FetchError` on `ok: false`)

When `query()` receives a plain function, it behaves as today (backward compatible).

### `QueryDescriptor<T>` — thenable with metadata

```typescript
interface QueryDescriptor<T> extends PromiseLike<T> {
  readonly _key: string;            // Cache key: "GET:/tasks" or "GET:/tasks/abc-123"
  readonly _fetch: () => Promise<T>; // The actual fetch function
}
```

The descriptor is a **thenable**: it has a `.then()` method, so `await descriptor` works. This means SDK methods work in both contexts:

- `query(api.tasks.list())` — reactive, cached, managed by query()
- `await api.tasks.list()` — imperative, one-shot, no caching

When awaited directly, the descriptor executes the fetch and auto-unwraps the Result (throws on error). This eliminates the `result.data.data` chain.

### SDK method return type change

Today:
```typescript
list: (query?) => client.get<TasksResponse[]>('/tasks', { query })
// Returns: Promise<FetchResponse<TasksResponse[]>>
// Which is: Promise<Result<{ data: TasksResponse[], status, headers }, FetchError>>
```

Proposed:
```typescript
list: (query?) => createDescriptor('GET', '/tasks', () => client.get<TasksResponse[]>('/tasks', { query }))
// Returns: QueryDescriptor<TasksResponse[]>
// - Thenable: await resolves to TasksResponse[] (auto-unwrapped)
// - Has _key: "GET:/tasks"
// - query() reads _key and _fetch
```

### `createDescriptor()` helper (in `@vertz/fetch` or `@vertz/codegen` runtime)

```typescript
function createDescriptor<T>(
  method: string,
  path: string,
  fetchFn: () => Promise<FetchResponse<T>>,
): QueryDescriptor<T> {
  const key = `${method}:${path}`;

  const unwrappedFetch = async (): Promise<T> => {
    const result = await fetchFn();
    if (!result.ok) throw result.error;
    return result.data.data as T;
  };

  return {
    _key: key,
    _fetch: unwrappedFetch,
    then(onFulfilled, onRejected) {
      return unwrappedFetch().then(onFulfilled, onRejected);
    },
  };
}
```

### Auth — API-driven, not consumer-driven

Auth configuration is defined by the API (server-side), not guessed by the consumer. The codegen reads what auth strategies the server supports and generates a typed `createClient` that only accepts valid options.

**Principle:** If the API doesn't support bearer tokens, you can't pass one. TypeScript enforces this.

#### Server-side definition (what drives codegen)

```typescript
// src/server.ts — declares auth strategies
const app = createServer({
  basePath: '/api',
  entities: [tasks],
  db,
  auth: {
    strategies: ['bearer'],  // or ['apiKey'], ['bearer', 'apiKey'], etc.
  },
});
```

#### Generated client (shaped by server definition)

When the server declares `strategies: ['bearer']`, the codegen generates:

```typescript
// Generated createClient — typed for bearer auth
interface TaskManagerClientConfig {
  baseURL: string;
  auth?: {
    token: string | (() => string | null);  // static or dynamic
  };
}

export function createClient(config: TaskManagerClientConfig) {
  const authHandle = createBearerAuthHandle(config.auth?.token);

  const fetchClient = new FetchClient({
    baseURL: config.baseURL,
    authStrategies: authHandle ? [authHandle._strategy] : [],
  });

  return {
    tasks: createTasksSdk(fetchClient),
    auth: authHandle,  // setToken(), clear(), isAuthenticated
  };
}
```

If the server declared `strategies: ['apiKey']`, the generated config would have `apiKey: string` instead of `token`. If no auth is declared, the `auth` property doesn't exist at all.

#### Consumer usage

```typescript
// src/api/index.ts — the only file the user writes
import { createClient } from '../generated/client';

export const api = createClient({
  baseURL: '/api',
  auth: {
    token: () => localStorage.getItem('auth_token'),
  },
});

// Dynamic auth — login/logout
api.auth.setToken(loginResponse.token);
api.auth.clear();
api.auth.isAuthenticated; // boolean
```

#### Internal `BearerAuthHandle` (not user-facing)

```typescript
// Runtime helper used by generated code — not imported by consumers
function createBearerAuthHandle(
  initialToken?: string | (() => string | null),
): BearerAuthHandle {
  let token: string | null = null; // reactive via signal() internally

  if (typeof initialToken === 'string') {
    token = initialToken;
  }

  const getToken = typeof initialToken === 'function'
    ? initialToken
    : () => token;

  return {
    setToken(t: string) { token = t; },
    clear() { token = null; },
    get isAuthenticated() { return getToken() !== null; },
    _strategy: {
      type: 'bearer' as const,
      token: getToken,
    },
  };
}

interface BearerAuthHandle {
  setToken(token: string): void;
  clear(): void;
  readonly isAuthenticated: boolean;
}
```

The signal is an implementation detail. `bearerAuth()` / `createBearerAuthHandle()` are internal — the consumer never imports them. The generated `createClient` factory is the only API surface.

### Codegen changes — metadata on all operations

Today only `create` has `.url`, `.method`, `.meta`. The codegen must attach metadata to **all** operations:

```typescript
export function createTasksSdk(client: Client) {
  return {
    list: Object.assign(
      (query?) => createDescriptor('GET', '/tasks', () => client.get('/tasks', { query })),
      { url: '/tasks', method: 'GET' as const },
    ),
    get: Object.assign(
      (id: string) => createDescriptor('GET', `/tasks/${id}`, () => client.get(`/tasks/${id}`)),
      { url: '/tasks/:id', method: 'GET' as const },
    ),
    create: Object.assign(
      (body: CreateInput) => createDescriptor('POST', '/tasks', () => client.post('/tasks', body)),
      { url: '/tasks', method: 'POST' as const, meta: { bodySchema: createSchema } },
    ),
    update: Object.assign(
      (id: string, body: UpdateInput) => createDescriptor('PATCH', `/tasks/${id}`, () => client.patch(`/tasks/${id}`, body)),
      { url: '/tasks/:id', method: 'PATCH' as const },
    ),
    delete: Object.assign(
      (id: string) => createDescriptor('DELETE', `/tasks/${id}`, () => client.delete(`/tasks/${id}`)),
      { url: '/tasks/:id', method: 'DELETE' as const },
    ),
  };
}
```

Key: parameterized operations (`get`, `update`, `delete`) embed the actual ID in the descriptor key at call time — `"GET:/tasks/abc-123"`, not `"GET:/tasks/:id"`. This gives each resource its own cache entry.

## Manifesto Alignment

**Explicit over implicit:** The SDK initialization is explicit — one file, visible wiring. Components don't repeat it but the configuration is traceable. The descriptor carries its key explicitly (derived from method + path), not hashed from `toString()`.

**One way to do things:** Today there are two patterns for data fetching — manual `fetch()` wrappers and `query()` with thunks. This consolidation: SDK methods return descriptors that work everywhere. `query()` for reactive, `await` for imperative.

**Compile-time over runtime:** TypeScript enforces that `query()` receives either a `QueryDescriptor` or a thunk. The descriptor's type parameter flows through to `QueryResult<T>` — if the SDK says `Task[]`, that's what `tasks.data` is.

**LLM-first:** An LLM generating code for a Vertz app writes `query(api.tasks.list())` — one line, no ceremony, no cache key to invent. The SDK import is the only thing to know.

## Non-Goals

- **Optimistic updates / mutations** — `query()` is for reads. Mutations use `await` directly or `form()`. Cache invalidation after mutations (e.g., refetch task list after creating a task) is a separate design.
- **Infinite scroll / pagination** — Pagination queries need key composition (page/cursor params). The descriptor key includes query params, so `api.tasks.list({ page: 2 })` gets key `"GET:/tasks?page=2"`. Infinite scroll is a higher-level pattern on top.
- **Multi-tenant / scoped auth** — `bearerAuth()` is global (module singleton). Scoped auth via Context is a future extension if needed.
- **Exposing `signal()` as public API** — Deferred. The `bearerAuth()` abstraction avoids the need to expose signals outside components for now.

## Unknowns

### 1. TypeScript inference through QueryDescriptor (needs POC)

**Question:** Does TypeScript correctly infer the generic type `T` when `query()` receives a `QueryDescriptor<T>`? Specifically:

```tsx
const tasks = query(api.tasks.list());
// Does TS infer tasks.data as Task[] | undefined?

const task = query(api.tasks.get(id));
// Does TS infer task.data as Task | undefined?
```

**Strategy:** Needs POC. Build a minimal `QueryDescriptor` + `query()` overload and verify inference in VS Code.

### 2. Thenable + await interaction

**Question:** When you `await` a `QueryDescriptor`, does the Promise resolution behave correctly? Specifically:
- Does `const task = await api.tasks.get(id)` resolve to `Task` (not `QueryDescriptor<Task>`)?
- Does error propagation work (thrown `FetchError` is catchable)?
- Does `Promise.all([api.tasks.list(), api.tasks.get(id)])` work?

**Strategy:** Needs POC. Test thenable behavior with various async patterns.

### 3. Key derivation for parameterized queries with query params

**Question:** For `api.tasks.list({ status: 'done' })`, the key should be `"GET:/tasks?status=done"`. How do we serialize query params into a stable key? Object key order matters for string comparison.

**Strategy:** Discussion-resolvable. Use sorted `URLSearchParams` serialization — deterministic and matches URL semantics.

### 4. DELETE 204 handling in descriptors

**Question:** DELETE returns 204 No Content. The auto-unwrap in `createDescriptor` calls `result.data.data` which fails on empty bodies. The descriptor needs to handle 204 gracefully.

**Strategy:** Discussion-resolvable. The unwrap function checks the response status or catches `ParseError` — same pattern as the current workaround but centralized.

### 5. `query()` overload resolution

**Question:** With two overloads — `query(descriptor, opts?)` and `query(thunk, opts?)` — does TypeScript correctly distinguish them? A `QueryDescriptor` is a thenable, and a thunk `() => Promise<T>` is a function. These are structurally distinct, so overload resolution should work. But edge cases (e.g., passing a descriptor-returning function) need testing.

**Strategy:** Needs POC. Part of the TypeScript inference POC.

## Framework Fixes Required (prerequisites)

These are bugs independent of the SDK DX work, but must be fixed first:

| Package | Issue | Fix |
|---------|-------|-----|
| `@vertz/fetch` | `buildURL` drops base path with absolute paths (`/tasks` + `http://host/api` → `http://host/tasks`) | Strip leading `/` from path or concatenate strings instead of `new URL()` |
| `@vertz/fetch` | `globalThis.fetch` loses `this` binding in HMR bundles | Bind in constructor: `this.fetchFn = (config.fetch ?? globalThis.fetch).bind(globalThis)` |
| `@vertz/fetch` | 204 No Content causes `ParseError` (empty body → `response.json()` throws) | Skip JSON parse when `response.status === 204` |
| `@vertz/codegen` | Generated `client.ts` missing `export type Client` | Add `export type Client = FetchClient` |
| `@vertz/codegen` | Only `create` operations have `.url`/`.method` metadata | Attach metadata to all operations |

## E2E Acceptance Test

```typescript
// packages/integration-tests/src/sdk-query-integration.test.ts
import { createServer, entity } from '@vertz/server';
import { query } from '@vertz/ui';
import { createClient, bearerAuth } from '<generated>';

test('query(api.tasks.list()) returns reactive data with auto key', async () => {
  const result = query(api.tasks.list());
  // result.data is Task[] after loading
  // result.loading transitions false → true → false
  // result._key is 'GET:/tasks' (auto-derived)
});

test('await api.tasks.create(body) returns Task directly', async () => {
  const task = await api.tasks.create({ title: 'Test', description: '...' });
  // task is Task (not Result, not FetchResponse)
  expect(task.title).toBe('Test');
  expect(task.id).toBeDefined();
});

test('query(api.tasks.get(id)) has unique cache key per id', async () => {
  const task1 = query(api.tasks.get('id-1'));
  const task2 = query(api.tasks.get('id-2'));
  // Different cache keys: 'GET:/tasks/id-1' vs 'GET:/tasks/id-2'
});

test('bearerAuth() injects token into requests', async () => {
  const auth = bearerAuth();
  const api = createClient({ baseURL: '/api', auth });

  auth.setToken('my-token');
  // Subsequent requests include Authorization: Bearer my-token

  auth.clear();
  // Subsequent requests have no Authorization header
});

test('query() with enabled: false does not fetch', async () => {
  const result = query(api.tasks.get('id'), { enabled: false });
  // result.loading is false, result.data is undefined
  // No network request made
});

// Type-level tests
test('TypeScript infers correct types', () => {
  const tasks = query(api.tasks.list());
  // @ts-expect-error — data is Task[] | undefined, not string
  const _bad: string = tasks.data;

  const task = query(api.tasks.get('id'));
  // @ts-expect-error — data is Task | undefined, not Task[]
  const _bad2: Task[] = task.data;
});
```

## POC Plan

Build a minimal POC in `poc/sdk-query-descriptor` to validate:

1. **QueryDescriptor type + thenable behavior**
   - Create `QueryDescriptor<T>` with `_key`, `_fetch`, `then()`
   - Verify `await descriptor` resolves to `T`
   - Verify `Promise.all([desc1, desc2])` works
   - Verify `query(descriptor)` receives correct type

2. **TypeScript inference through query() overloads**
   - Two overloads: `query(QueryDescriptor<T>)` and `query(() => Promise<T>)`
   - Verify TS picks the right overload
   - Verify `T` flows through to `QueryResult<T>`
   - Verify `@ts-expect-error` on wrong types

3. **Auto-key derivation**
   - `list()` → `"GET:/tasks"`
   - `get(id)` → `"GET:/tasks/<id>"`
   - `list({ status: 'done' })` → `"GET:/tasks?status=done"`
   - Verify keys are stable (same args → same key)

4. **Result auto-unwrap**
   - Success: `Result<{data: Task}, FetchError>` → `Task`
   - Error: `Result<_, FetchError>` → throws `FetchError`
   - 204 No Content: handled gracefully

5. **bearerAuth() abstraction**
   - Token injection works
   - `.setToken()` / `.clear()` / `.isAuthenticated` API
   - No signal exposed to consumers
