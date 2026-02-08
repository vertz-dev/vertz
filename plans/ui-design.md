# @vertz/ui — Design Plan

> A compiler-driven UI library. Plain TypeScript. Zero ceremony. Fine-grained reactivity.

**North star:** Write plain TypeScript/JSX. The compiler makes it reactive. If it builds, it renders.

---

## 1. Core Philosophy

| Principle | How @vertz/ui delivers |
|-----------|----------------------|
| "Type Safety Wins" | Files are valid `.tsx` — not `.svelte`, not `.vue`. Full IDE support, `tsc` validates, types flow end-to-end from backend schemas to UI components |
| "One Way to Do Things" | State = `let`. Derived = `const`. Data loading = loaders + `query()`. Forms = native `FormData` + schema validation. No alternatives |
| "If your code builds, it runs" | Code works with plain `tsc` (just not reactive). The compiler is an enhancement, not a requirement for valid syntax |
| "Explicit over implicit" | No virtual DOM, no hidden re-renders, no dependency arrays. Compiler generates targeted subscriptions visible in devtools |
| "My LLM nailed it on the first try" | No framework-specific syntax to learn. It is just TypeScript functions with `let` and JSX |

### What we learned from the competition

| Framework | Key lesson for Vertz UI |
|-----------|------------------------|
| **Svelte 5** | Compiler-driven reactivity works. But `.svelte` files aren't valid TypeScript — we fix that with plain `.tsx` |
| **SolidJS** | Fine-grained DOM updates without VDOM are fast and simple. JSX → direct DOM calls is the right compilation target |
| **Qwik** | Resumability and per-component lazy loading reduce JS shipped. Atomic hydration with serialized state is the path |
| **Marko** | Streaming SSR with out-of-order chunks is production-proven. Auto-detecting which components need hydration is ideal |
| **HTMX** | Native HTML forms manage their own state. Progressive enhancement matters. Don't fight the browser |
| **Million.js** | Compile-time edit maps can turn O(n) reconciliation into O(1) updates for static-structure templates |

---

## 2. Package Structure

| Package | Purpose | Ships to browser? |
|---------|---------|-------------------|
| `@vertz/ui` | JSX runtime, reactivity runtime (signals), router, `query()`, `form()`, hydration client, `ErrorBoundary`, context | Yes |
| `@vertz/ui-server` | Streaming HTML renderer, atomic hydration emitter, `<Head>` management, asset pipeline | No (Node.js only) |
| `@vertz/ui-compiler` | Vite plugin — `let` → signal transform, JSX → DOM calls, component registration for hydration, route type extraction from backend IR | No (build only) |
| `@vertz/codegen` | Reads compiler IR, generates typed SDK client (`sdk.ts`), route types, and re-exported schemas | No (build only) |

Dependency graph:

```
@vertz/schema ← shared validation (server + client)
     ↓
@vertz/core → @vertz/compiler → IR
                                  ↓
                            @vertz/codegen → .vertz/generated/
                                                ├── route-types.ts
                                                ├── sdk.ts          (typed SDK client)
                                                └── schemas.ts
                                                      ↓
@vertz/ui-compiler (Vite plugin) → reads generated types + SDK
     ↓
@vertz/ui (browser)  ←  @vertz/ui-server (SSR)
```

---

## 3. Reactivity: Plain `let` Becomes Reactive

### The developer writes:

```tsx
function Counter() {
  let count = 0;

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => count++}>+</button>
    </div>
  );
}
```

### The compiler outputs:

```tsx
import { signal as __signal } from "@vertz/ui/runtime";
import { text as __text, element as __element, on as __on } from "@vertz/ui/dom";

function Counter() {
  const __count = __signal(0);

  const __root = __element("div");
  const __p = __element("p");
  const __t = __text(() => "Count: " + __count.get());
  __p.append(__t);
  const __btn = __element("button");
  __btn.textContent = "+";
  __on(__btn, "click", () => __count.update(v => v + 1));
  __root.append(__p, __btn);
  return __root;
}
```

### How the compiler decides what is reactive

A `let` variable is reactive if it is referenced in JSX (directly or transitively through a `const`). The compiler uses two-pass taint analysis:

1. **Pass 1**: Collect all `let` declarations inside component functions (functions returning JSX).
2. **Pass 2**: Check if any reference site is inside a `JsxExpression`, `JsxAttribute`, or a `const` that is itself referenced in JSX.

Non-reactive `let` variables are left completely untransformed.

### Computed values

```tsx
function PriceDisplay({ price }: { price: number }) {
  let quantity = 1;
  const total = price * quantity;           // compiler → computed(() => price * __quantity.get())
  const formatted = `$${total.toFixed(2)}`; // compiler → computed(() => `$${__total.get().toFixed(2)}`)

  return <p>Total: {formatted}</p>;
}
```

The compiler detects that `total` depends on reactive `quantity`, so `const total = ...` becomes `const __total = computed(...)`. The chain is transitive — `formatted` depends on `total`, so it also becomes a computed.

### Arrays and objects — immutable replacement

```tsx
let todos: Todo[] = [];

const addTodo = (title: string) => {
  todos = [...todos, { id: crypto.randomUUID(), title, done: false }];
};
```

Arrays and objects are wrapped in a single signal. Mutations require reassignment (`todos = [...]`). The compiler does NOT proxy arrays or detect `.push()` — explicit over implicit.

### What is NOT supported

- **Destructured reactive state**: `let { name, age } = user` is not reactive. Use `let user = { name, age }` and access `user.name`.
- **Mutable array methods as triggers**: `todos.push(item)` will not trigger updates. Use `todos = [...todos, item]`.

The compiler emits diagnostics for these patterns.

---

## 4. No useEffect — Ever

### DOM subscriptions are automatic

Every JSX expression that reads a reactive variable gets a compiler-generated micro-effect:

```tsx
<p>Count: {count}</p>
// becomes: __text(() => "Count: " + __count.get())
// The runtime subscribes to __count and updates the text node directly
```

The developer never writes effects for DOM updates. The compiler writes them all.

### Side effects use `watch()`

For actual side effects (data fetching, logging, document.title), there is one explicit primitive:

```tsx
import { watch, onCleanup } from "@vertz/ui";

function UserProfile({ userId }: { userId: string }) {
  let user: User | null = null;

  watch(() => userId, async (id) => {
    const controller = new AbortController();
    onCleanup(() => controller.abort());

    user = await fetchUser(id, { signal: controller.signal });
  });

  return <div>{user?.name}</div>;
}
```

### The complete side-effect API

| Need | API | When it runs |
|------|-----|-------------|
| DOM updates | Automatic (compiler-generated) | Whenever the bound signal changes |
| React to state change | `watch(() => dep, callback)` | **Once on mount**, then **again whenever `dep` changes** |
| Run on mount only | `watch(() => { ... })` (no dep = run once) | **Once on mount only** — never re-runs |
| Cleanup | `onCleanup(fn)` inside `watch` | Before re-run (dep form) or on unmount (both forms) |
| Derived state | `const x = expr` (compiler makes it computed) | Recalculates when dependencies change |

**Execution timing clarified:**

- **`watch(() => { ... })`** (no dependency, single callback): Runs **once on mount**. This is the equivalent of "run setup code when the component first renders." It never re-executes.
- **`watch(() => dep, callback)`** (dependency + callback): Runs the callback **once on mount** with the current value of `dep`, then **re-runs whenever `dep` changes**. Before each re-run, any `onCleanup` registered in the previous run executes first.

That is the entire list. No `useEffect`, `useMemo`, `useCallback`, `useLayoutEffect`.

---

## 5. Component Model

### Components execute once

Functions run one time, create DOM nodes, set up subscriptions, return the root. They never re-execute. When state changes, only the specific text nodes, attributes, or DOM fragments that depend on that state update.

```tsx
function Greeting({ name }: { name: string }) {
  return <h1>Hello, {name}!</h1>;
}
```

### Props passing — transparent getter wrapping

When a parent passes a reactive value to a child, the compiler wraps it as a getter:

```tsx
// Parent has: let count = 0
// <Child value={count} />

// Compiled: Child({ get value() { return __count.get() } })
// Child reads props.value inside a reactive closure → auto-tracks the parent's signal
```

The child never re-executes. Only the specific DOM node reading `props.value` updates.

### Lifecycle

Two events only:

```tsx
import { onMount, onCleanup } from "@vertz/ui";

function Timer() {
  let seconds = 0;

  onMount(() => {
    const interval = setInterval(() => seconds++, 1000);
    onCleanup(() => clearInterval(interval));
  });

  return <p>{seconds}s</p>;
}
```

No `componentDidUpdate`, no `shouldComponentUpdate`. Fine-grained reactivity eliminates update lifecycle hooks.

### Context (subtree state sharing)

```tsx
import { createContext, useContext } from "@vertz/ui";

const ThemeContext = createContext<{ theme: string; toggle: () => void }>();

function ThemeProvider({ children }: { children: any }) {
  let theme = "light";
  const toggle = () => theme = theme === "light" ? "dark" : "light";
  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

function ThemedButton() {
  const { theme, toggle } = useContext(ThemeContext);
  return <button class={`btn-${theme}`} onClick={toggle}>Toggle</button>;
}
```

### Refs (escape hatch for raw DOM)

```tsx
import { ref } from "@vertz/ui";

function Canvas() {
  const canvasRef = ref<HTMLCanvasElement>();

  // No dependency → runs once on mount.
  // At mount time, canvasRef.current is available because the DOM has been created.
  watch(() => {
    const ctx = canvasRef.current?.getContext("2d");
    // imperative canvas drawing — runs once after the component mounts
  });

  return <canvas ref={canvasRef} width={800} height={400} />;
}
```

---

## 6. End-to-End Type Flow

Types flow from schema definition through backend routes to frontend components — zero manual DTOs.

### The chain

```
@vertz/schema definition
    ↓
@vertz/core route config (body, response, query schemas)
    ↓
@vertz/compiler → IR (intermediate representation)
    ↓
@vertz/codegen → .vertz/generated/
                    ├── route-types.ts    (type definitions)
                    ├── sdk.ts            (typed SDK client)
                    └── schemas.ts        (re-exported schemas)
    ↓
@vertz/ui imports SDK: api.users.list(), api.users.create()
    ↓
Component receives fully typed data
```

### SDK generation from compiler IR

The `@vertz/compiler` produces an IR that describes every module, operation, schema, and endpoint in the backend. `@vertz/codegen` reads this IR and generates a typed SDK client — similar to how Stripe, Resend, or OpenAI generate their client libraries.

The generated SDK:

- **Mirrors the backend module structure**: backend module `users` becomes `api.users`, module `billing.invoices` becomes `api.billing.invoices`.
- **Uses operation IDs as method names**: a route with `operationId: 'list'` in the `users` module becomes `api.users.list()`.
- **Carries full type information**: input schemas (body, query, params) and response types flow from the backend definition. No manual DTOs.
- **Embeds schema references**: each SDK method knows its associated `@vertz/schema` object, enabling `form()` and `query()` to auto-extract validation schemas and cache keys.
- **Generates deterministic cache keys**: each operation gets a stable key based on module path + operation ID + parameters, used by `query()` for caching.

```typescript
// .vertz/generated/sdk.ts (auto-generated — DO NOT EDIT)
import type { User, CreateUserBody } from './route-types';

export interface VertzSDK {
  users: {
    list(opts?: { query?: { page?: number; limit?: number } }): Promise<SDKResult<User[]>>;
    get(opts: { params: { id: string } }): Promise<SDKResult<User>>;
    create(opts: { body: CreateUserBody }): Promise<SDKResult<User>>;
    delete(opts: { params: { id: string } }): Promise<SDKResult<void>>;
    counts(): Promise<SDKResult<{ total: number; byRole: Record<string, number> }>>;
  };
}
```

### Generated route types

```typescript
// .vertz/generated/route-types.ts (auto-generated)
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  createdAt: string;
}

export interface CreateUserBody {
  name: string;
  email: string;
  role?: 'admin' | 'user';
}
```

### Typed SDK client in components

```typescript
import { api } from '.vertz/generated/sdk';

// In a component:
const result = await api.users.list({ query: { page: 1 } });
// result.data is typed as User[]
```

The SDK call reads like natural language: `api.users.list()` instead of memorizing `GET /users`. If the backend renames an operation or changes a schema, `bun run typecheck` on the frontend catches the mismatch immediately — there is no string path to get wrong.

### Shared validation (automatic via SDK)

Each SDK method embeds a reference to its `@vertz/schema` object. This means `form()` and `query()` can extract the schema automatically:

```typescript
// The SDK method api.users.create internally knows:
//   - endpoint: POST /users
//   - body schema: createUserBody (from @vertz/schema)
//   - response type: User

// So form() can derive everything from the SDK method:
const userForm = form(api.users.create);
// No separate schema import needed — the SDK method IS the schema reference
```

---

## 7. Atomic Hydration

### The problem with traditional hydration

React hydration re-executes the entire component tree on the client to attach event handlers. This is wasteful — most of the page is static HTML that doesn't need JavaScript.

### Vertz UI approach: hydrate only what's interactive

The compiler detects which components are interactive (contain `let` state, event handlers that mutate state, `query()` calls). Non-interactive components render as static HTML with zero client JS.

### HTML output

```html
<!-- Static: no JS needed -->
<header><h1>Users</h1></header>

<!-- Interactive component: hydration boundary -->
<div data-v-id="components/SearchBar" data-v-key="search-1">
  <script type="application/json">{"placeholder":"Search users..."}</script>
  <div>
    <input type="text" placeholder="Search users..." value="" />
  </div>
</div>

<!-- Static: no JS needed -->
<footer>&copy; 2026</footer>
```

### How it works

1. `data-v-id` — Maps to a code-split chunk containing the component code.
2. `<script type="application/json">` — Serialized props. Browser doesn't execute it; hydration runtime reads it.
3. The inner HTML — Server-rendered output. Visible immediately, interactive after hydration.

### Client hydration entry

```typescript
// entry-client.ts (auto-scaffolded by @vertz/ui-compiler)
import { hydrate } from '@vertz/ui/hydrate';

hydrate({
  'components/SearchBar': () => import('./components/SearchBar'),
  'components/LikeButton': () => import('./components/LikeButton'),
});
```

### Hydration strategies

```tsx
<SearchBar placeholder="..." hydrate="eager" />      // Above the fold: hydrate immediately
<LikeButton postId={id} />                            // Default: hydrate when visible (IntersectionObserver)
<SortableTable data={data} hydrate="interaction" />   // Hydrate on first user interaction
```

### Nested boundaries

Hydration boundaries don't nest hierarchically. Each `data-v-id` is flat and self-contained. Parent and child interactive components hydrate independently.

---

## 8. Streaming SSR

### How it works

`renderToStream` returns a `ReadableStream` of HTML chunks:

```typescript
import { renderToStream } from '@vertz/ui-server';

const stream = renderToStream(<App url={ctx.raw.url} />);
return new Response(stream, {
  headers: { 'content-type': 'text/html; charset=utf-8' },
});
```

### Out-of-order streaming

When an async loader is inside a `<Suspense>` boundary, the renderer:
1. Emits a placeholder with a slot ID.
2. Continues streaming the rest of the page.
3. When the data arrives, emits an out-of-order chunk:

```html
<!-- Placeholder (streamed first) -->
<div id="v-slot-1"><div class="skeleton">Loading...</div></div>

<!-- Later: replacement chunk (streamed when data arrives) -->
<template id="v-tmpl-1">
  <div data-v-id="components/UserProfile" data-v-key="user-1">
    <script type="application/json">{"user":{"id":"abc","name":"Alice"}}</script>
    <div class="profile"><h2>Alice</h2></div>
  </div>
</template>
<script>
  document.getElementById('v-slot-1').replaceWith(
    document.getElementById('v-tmpl-1').content
  );
</script>
```

### Chunking strategy

Chunking is per-`<Suspense>` boundary, not per-component:

```tsx
<Header />                          {/* Chunk 1: immediate */}
<Suspense fallback={<Skeleton />}>
  <UserProfile userId="abc" />      {/* Chunk 2: streams when data arrives */}
</Suspense>
<Sidebar />                         {/* Chunk 3: immediate */}
<Footer />                          {/* Chunk 4: immediate */}
```

Static content never blocks. Slow data doesn't hold up fast content.

---

## 9. Forms — Native First

### The principle

HTML forms already manage state. An `<input name="email">` holds its value in the DOM. `FormData` extracts it. We don't re-implement form state in JavaScript.

### The `form()` function — SDK-aware

`form()` accepts an SDK method directly. Because the SDK method already knows its endpoint, HTTP method, body schema, and response type, there is no need to separately import the schema or specify the action URL:

```tsx
import { form } from '@vertz/ui/form';
import { api } from '.vertz/generated/sdk';

function CreateUser() {
  const userForm = form(api.users.create);
  // form() extracts from the SDK method:
  //   - body schema (for client-side validation)
  //   - endpoint (POST /users — for action attribute and submission)
  //   - response type (for typed onSuccess callback)

  return (
    <form
      {...userForm.attrs()}
      onSubmit={userForm.handleSubmit({
        onSuccess: (user) => router.navigate(`/users/${user.id}`),
      })}
    >
      <label for="name">Name</label>
      <input name="name" id="name" required />
      {userForm.error('name') && <span class="error">{userForm.error('name')}</span>}

      <label for="email">Email</label>
      <input name="email" id="email" type="email" required />
      {userForm.error('email') && <span class="error">{userForm.error('email')}</span>}

      <label for="role">Role</label>
      <select name="role" id="role">
        <option value="user">User</option>
        <option value="admin">Admin</option>
      </select>

      <button type="submit" disabled={userForm.submitting}>
        {userForm.submitting ? 'Creating...' : 'Create User'}
      </button>
    </form>
  );
}
```

`userForm.attrs()` returns `{ action: "/api/users", method: "POST" }` — derived from the SDK method's endpoint. This keeps the `<form>` element self-describing for progressive enhancement.

### What `form(sdkMethod)` gives you

| Capability | How |
|-----------|-----|
| **Body schema** | Extracted from the SDK method. Used for client-side validation via `@vertz/schema` |
| **Endpoint + method** | Derived from the SDK method's route. Populates `action` and `method` attributes |
| **Response typing** | `onSuccess` callback receives the typed response (e.g., `User`) |
| **Error typing** | `userForm.error('fieldName')` knows valid field names from the body schema |
| **No imports** | No separate schema import, no endpoint strings to get wrong |

### How `handleSubmit` works

1. `event.preventDefault()` — Stops native submission.
2. `new FormData(form)` — Reads all values from the DOM.
3. `formDataToObject(formData)` — Converts to `{ name: "Alice", email: "..." }`.
4. `schema.safeParse(raw)` — Validates with the schema embedded in the SDK method. Coercion handles string→number/boolean.
5. On success: calls the SDK method with typed data, then calls `onSuccess` with the response.
6. On validation failure: populates `userForm.error('fieldName')`.

### Explicit schema override

If you need a different schema (e.g., a subset for a partial update form), you can still pass one explicitly:

```tsx
import { updateUserBody } from '../../schemas/user';

const editForm = form(api.users.update, { schema: updateUserBody });
```

### Progressive enhancement

Without JavaScript, the form submits normally to the `action` URL (derived from the SDK method). The backend validates with the same schema and redirects on success or re-renders with errors. With JavaScript, `handleSubmit` intercepts for a SPA experience. The form works either way — the SDK method just ensures both paths use identical endpoint and schema information.

---

## 10. Router

### Route definition

```typescript
import { defineRoutes } from '@vertz/ui/router';
import { s } from '@vertz/schema';
import { api } from '.vertz/generated/sdk';

export const routes = defineRoutes({
  '/': {
    component: () => import('./pages/Home'),
  },
  '/users': {
    component: () => import('./pages/users/Layout'),
    loader: async () => {
      const counts = await api.users.counts();
      return { counts };
    },
    children: {
      '/': {
        component: () => import('./pages/users/UserList'),
        loader: async ({ search }) => {
          return await api.users.list({ query: search });
        },
        searchParams: s.object({
          page: s.coerce.number().default(1),
          role: s.enum(['admin', 'user', 'all'] as const).default('all'),
        }),
      },
      '/:id': {
        component: () => import('./pages/users/UserDetail'),
        loader: async ({ params }) => {
          return await api.users.get({ params: { id: params.id } });
        },
      },
    },
  },
});
```

### Typed params and search params

Route params are inferred from the pattern string via template literal types:
- `'/:id'` → `params: { id: string }`
- `'/:userId/posts/:postId'` → `params: { userId: string; postId: string }`

Search params are typed via the `searchParams` schema:

```tsx
const [search, setSearch] = useSearchParams();
// search.page is number, search.role is 'admin' | 'user' | 'all'
```

### Layouts and nested routes

Layouts receive `children`. Nested route components render inside the layout. When navigating between children, the layout persists and its loader doesn't re-run.

### Loaders run in parallel

Navigating to `/users/123` fires both the `/users` layout loader and the `/:id` detail loader simultaneously.

---

## 11. Data Fetching — One Way

### The rule

| When | Use |
|------|-----|
| Page-level data (needed to render the page) | **Loaders** in route definitions |
| Client-side reactive re-fetching (search, filters, pagination) | **`query()`** inside components |

There is no `await` in component bodies for data fetching. Data comes from loader props or `query()`.

### `query()` for reactive fetching — SDK-aware with auto-generated keys

When `query()` receives an SDK method call, it automatically generates a deterministic cache key from the operation's module path, operation ID, and parameters. No manual key management.

```tsx
import { api } from '.vertz/generated/sdk';

function UserList({ users: initial }: { users: User[] }) {
  let search = '';

  const results = query(
    () => api.users.list({ query: { q: search } }),
    { initialData: initial, debounce: 300, enabled: () => search.length > 0 }
  );
  // Auto-generated cache key: ["users", "list", { q: search }]
  // Key updates reactively when `search` changes → triggers refetch

  return (
    <div>
      <input onInput={(e) => search = e.currentTarget.value} />
      {results.loading && <div class="loading-bar" />}
      <ul>
        {(results.data ?? initial).map(u => <li key={u.id}>{u.name}</li>)}
      </ul>
    </div>
  );
}
```

`query()` auto-tracks reactive dependencies, refetches when they change, and exposes `.data`, `.loading`, `.error`, `.refetch`.

### Auto-generated cache keys

The SDK generates deterministic keys based on `[modulePath, operationId, ...params]`:

| SDK call | Generated key |
|---------|--------------|
| `api.users.list()` | `["users", "list"]` |
| `api.users.list({ query: { page: 2 } })` | `["users", "list", { page: 2 }]` |
| `api.users.get({ params: { id: "abc" } })` | `["users", "get", { id: "abc" }]` |
| `api.billing.invoices.list()` | `["billing.invoices", "list"]` |

To override the key (e.g., for cross-component cache sharing or custom invalidation patterns):

```tsx
const results = query(
  () => api.users.list({ query: { q: search } }),
  { key: ['my-custom-key', search] }
);
```

### Revalidation after mutations

```typescript
import { revalidate } from '@vertz/ui/router';
import { api } from '.vertz/generated/sdk';

async function handleDelete(userId: string) {
  await api.users.delete({ params: { id: userId } });
  revalidate('/users'); // Re-runs the /users loader
}
```

---

## 12. Error Handling

### Route-level error components

```typescript
'/users/:id': {
  component: () => import('./pages/UserDetail'),
  error: () => import('./pages/UserError'),
  loader: async ({ params }) => api.users.get({ params: { id: params.id } }),
}
```

### Component-level error boundaries

```tsx
import { ErrorBoundary } from '@vertz/ui';

<ErrorBoundary fallback={(error, retry) => (
  <p>{error.message} <button onClick={retry}>Retry</button></p>
)}>
  <ActivityChart />
</ErrorBoundary>
```

### SDK client returns discriminated unions

```typescript
const result = await api.users.create({ body: data });
if (result.ok) {
  // result.data is typed as User
} else {
  // result.error has { code, message, details }
}
```

---

## 13. Testing — First-Class Citizen

Testing is not an afterthought. Every API in `@vertz/ui` is designed with the question "How would you test this?" answered first. The goal: it should be possible to build an entire UI application using TDD, with fast feedback loops at every level.

### Design principles for testability

1. **Components are pure functions** — they take props, return DOM. No hidden global state to mock.
2. **SDK methods are injectable** — `form()` and `query()` accept SDK methods that can be replaced with test doubles.
3. **Router is data-driven** — route definitions are plain objects. `createTestRouter` renders them in isolation.
4. **No browser required for unit tests** — the reactivity runtime and DOM helpers work with any DOM implementation (happy-dom, jsdom).
5. **Progressive test granularity** — unit tests for components, integration tests for pages, e2e tests for full flows.

### Component tests

```typescript
import { renderTest } from '@vertz/ui/test';

test('renders user name from props', () => {
  const { findByText } = renderTest(<UserCard user={{ id: '1', name: 'Alice', email: 'alice@test.com' }} />);
  expect(findByText('Alice')).toBeTruthy();
});

test('updates count when button is clicked', async () => {
  const { findByText, click } = renderTest(<Counter />);
  expect(findByText('Count: 0')).toBeTruthy();
  await click(findByText('+'));
  expect(findByText('Count: 1')).toBeTruthy();
});
```

### Form tests with SDK mocking

```typescript
import { renderTest, fillForm, submitForm } from '@vertz/ui/test';
import { createMockSDK } from '@vertz/ui/test';

test('validates required fields before submission', async () => {
  const mockApi = createMockSDK();
  const { container, findByText } = renderTest(<CreateUser api={mockApi} />);

  await submitForm(container.querySelector('form'));

  // Form should show validation errors, not call the API
  expect(findByText('Name is required')).toBeTruthy();
  expect(mockApi.users.create).not.toHaveBeenCalled();
});

test('submits valid data through SDK method', async () => {
  const mockApi = createMockSDK();
  mockApi.users.create.mockResolvedValue({ ok: true, data: { id: '1', name: 'Alice', email: 'alice@test.com', role: 'user', createdAt: '2026-01-01' } });

  const { container } = renderTest(<CreateUser api={mockApi} />);
  await fillForm(container.querySelector('form'), { name: 'Alice', email: 'alice@test.com' });
  await submitForm(container.querySelector('form'));

  expect(mockApi.users.create).toHaveBeenCalledWith({ body: { name: 'Alice', email: 'alice@test.com' } });
});
```

### Router tests

```typescript
import { createTestRouter } from '@vertz/ui/test';

test('navigates from user list to user detail', async () => {
  const mockApi = createMockSDK();
  mockApi.users.list.mockResolvedValue({ ok: true, data: [{ id: '1', name: 'Alice' }] });
  mockApi.users.get.mockResolvedValue({ ok: true, data: { id: '1', name: 'Alice', email: 'alice@test.com' } });

  const router = createTestRouter(routes, {
    initialPath: '/users',
    sdk: mockApi,
  });
  const { findByText, click } = renderTest(router.component);

  await click(findByText('Alice'));
  expect(router.currentPath).toBe('/users/1');
  expect(findByText('alice@test.com')).toBeTruthy();
});

test('loader errors render error component', async () => {
  const mockApi = createMockSDK();
  mockApi.users.get.mockResolvedValue({ ok: false, error: { code: 'NOT_FOUND', message: 'User not found' } });

  const router = createTestRouter(routes, {
    initialPath: '/users/999',
    sdk: mockApi,
  });
  const { findByText } = renderTest(router.component);
  expect(findByText('User not found')).toBeTruthy();
});
```

### query() tests

```typescript
test('query() refetches when reactive dependency changes', async () => {
  const mockApi = createMockSDK();
  mockApi.users.list
    .mockResolvedValueOnce({ ok: true, data: [{ id: '1', name: 'Alice' }] })
    .mockResolvedValueOnce({ ok: true, data: [{ id: '2', name: 'Bob' }] });

  const { findByText, type } = renderTest(<UserSearch api={mockApi} />);

  expect(findByText('Alice')).toBeTruthy();

  await type('input', 'Bob');
  expect(findByText('Bob')).toBeTruthy();
  expect(mockApi.users.list).toHaveBeenCalledTimes(2);
});
```

### E2E tests with `@vertz/testing`

Full-stack tests using `createTestApp` from `@vertz/testing`, where the real backend runs and the UI renders against it:

```typescript
import { createTestApp } from '@vertz/testing';
import { renderE2E } from '@vertz/ui/test';

test('full flow: create user and see it in the list', async () => {
  const app = await createTestApp(appConfig);
  const { findByText, fillForm, submitForm, navigate } = renderE2E(routes, { baseUrl: app.url });

  await navigate('/users/new');
  await fillForm('form', { name: 'Alice', email: 'alice@test.com' });
  await submitForm('form');

  // Should redirect to user detail
  expect(findByText('Alice')).toBeTruthy();
  expect(findByText('alice@test.com')).toBeTruthy();

  await navigate('/users');
  expect(findByText('Alice')).toBeTruthy(); // appears in the list

  await app.close();
});
```

### TDD workflow example

Building a `UserCard` component from scratch using TDD:

```typescript
// Step 1 — RED: Write the first test
test('renders user name', () => {
  const { findByText } = renderTest(<UserCard user={{ id: '1', name: 'Alice', email: 'alice@test.com' }} />);
  expect(findByText('Alice')).toBeTruthy();
});
// Run → FAILS (UserCard doesn't exist)

// Step 2 — GREEN: Minimal implementation
function UserCard({ user }: { user: User }) {
  return <div>{user.name}</div>;
}
// Run → PASSES

// Step 3 — RED: Next behavior
test('renders user email', () => {
  const { findByText } = renderTest(<UserCard user={{ id: '1', name: 'Alice', email: 'alice@test.com' }} />);
  expect(findByText('alice@test.com')).toBeTruthy();
});
// Run → FAILS

// Step 4 — GREEN: Add email
function UserCard({ user }: { user: User }) {
  return <div><h3>{user.name}</h3><p>{user.email}</p></div>;
}
// Run → PASSES

// Step 5 — RED: Interactive behavior
test('shows delete confirmation on button click', async () => {
  const { findByText, click, queryByText } = renderTest(<UserCard user={mockUser} />);
  expect(queryByText('Are you sure?')).toBeNull();
  await click(findByText('Delete'));
  expect(findByText('Are you sure?')).toBeTruthy();
});
// Run → FAILS — no delete button yet

// Step 6 — GREEN: Add the interaction
function UserCard({ user }: { user: User }) {
  let confirming = false;
  return (
    <div>
      <h3>{user.name}</h3>
      <p>{user.email}</p>
      <button onClick={() => confirming = true}>Delete</button>
      {confirming && <p>Are you sure?</p>}
    </div>
  );
}
// Run → PASSES. Refactor, continue.
```

Every component, form, and route can follow this same Red-Green-Refactor cycle. The key enablers: components are pure functions, SDK methods are mockable, and the DOM is synchronously inspectable after reactive updates.

---

## 14. Compiler Pipeline

### Architecture

```
@vertz/ui-compiler (Vite plugin)
  ├── analyzers/
  │   ├── component-analyzer.ts      -- identifies component functions
  │   ├── reactivity-analyzer.ts     -- detects reactive let variables
  │   └── jsx-analyzer.ts            -- maps JSX usage to reactive deps
  ├── transformers/
  │   ├── signal-transformer.ts      -- let → signal
  │   ├── jsx-transformer.ts         -- JSX → DOM API calls
  │   ├── computed-transformer.ts    -- const deps → computed()
  │   └── prop-transformer.ts        -- reactive prop getter wrapping
  ├── runtime/                       -- ships to browser (~5KB gzip)
  │   ├── signal.ts                  -- signal(), computed(), effect()
  │   ├── dom.ts                     -- __text, __element, __attr, __on, __list, __conditional
  │   └── lifecycle.ts               -- onMount, onCleanup, watch
  └── vite-plugin.ts                 -- Vite integration
```

### How it runs

1. **Analysis** (ts-morph): Parse `.tsx`, identify components, classify variables as reactive or inert, build dependency graph.
2. **Transform** (MagicString): Surgical string replacements with source map preservation. Same approach as Svelte and Vue compilers.
3. **Output**: Modified `.tsx` with signal imports, signal declarations, DOM API calls. Sourcemaps map back to original code for devtools.

### Conditional and list compilation

```tsx
// Ternary → __conditional()
{editing ? <input /> : <span>{text}</span>}

// .map() in JSX → __list() with keyed reconciliation
{todos.map(todo => <li key={todo.id}>{todo.title}</li>)}
```

---

## 15. JSX Differences from React

| React | Vertz UI |
|-------|----------|
| `className` | `class` |
| `htmlFor` | `for` |
| `onChange` on input | `onInput` (native) |
| `value` for controlled inputs | Not needed — native form state |
| Virtual DOM diffing | Direct DOM mutations via signals |
| Components re-render | Components execute once |

---

## 16. What We're NOT Building

| Anti-pattern | Why not |
|-------------|---------|
| Virtual DOM | Fine-grained signal subscriptions update DOM directly. No diffing needed |
| `useEffect` | Compiler generates DOM subscriptions. `watch()` for explicit side effects |
| `useState` / `createSignal` | `let` is the API. Compiler transforms it |
| `useMemo` / `useCallback` | `const` expressions auto-become computed. No manual memoization |
| Dependency arrays | Auto-tracked by the reactive runtime |
| Class components / controllers | Functional only. State is `let`. No exceptions |
| `.svelte` / `.vue` custom files | Standard `.tsx` files. Valid TypeScript |
| Full-page hydration | Atomic per-component hydration. Most HTML stays static |
| React compatibility layer | Clean break. One reactivity system |

---

## 17. Stress Testing the Design

These questions challenge the design against real-world requirements beyond typical CRUD apps. Each answer explains how the architecture holds up — or where it needs extension.

### Can we deploy and stream a single component to production?

**Yes.** The atomic hydration model (section 7) already treats each interactive component as an independent unit with its own `data-v-id`, serialized props, and code-split chunk. Extending this to single-component deployment:

- **Server-side**: A standalone endpoint renders one component via `renderToStream(<MyWidget props={...} />)`. This returns a self-contained HTML fragment with its hydration boundary, serialized state, and a `<script>` tag pointing to the component's chunk.
- **Streaming**: The same out-of-order streaming mechanism works for single components. If the component has async data (wrapped in `<Suspense>`), it streams the placeholder first, then the resolved content.
- **Embedding**: The fragment can be embedded in any page — even non-Vertz pages. The hydration runtime (~4.5 KB) bootstraps the component independently.
- **Use cases**: Micro-frontends, embeddable widgets, email preview components, Slack/Discord unfurl cards.

```typescript
// Server endpoint that streams a single component
app.get('/widgets/user-card/:id', async (ctx) => {
  const user = await getUser(ctx.params.id);
  const stream = renderToStream(<UserCard user={user} />);
  return new Response(stream, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
});
```

The key enabler: components have no implicit dependency on a parent tree. They are self-contained functions that produce DOM, with explicit props and explicit data loading.

### How easy is it for an AI to navigate and modify an app built with this?

**Very easy — this is a core design goal.** The "My LLM nailed it on the first try" principle directly addresses AI navigability:

- **Plain TypeScript files**: No `.svelte`, `.vue`, or custom DSLs. AI models are trained on millions of TypeScript files. Every file in a Vertz UI app is valid `.tsx` that any TypeScript-trained model understands.
- **One way to do things**: State is always `let`. Derived values are always `const`. Data loading is always `query()` or loaders. Forms are always `form(sdkMethod)`. An AI never has to decide between competing patterns.
- **SDK-style API calls**: `api.users.create({ body: data })` is self-documenting. An AI can infer the operation from the method name without looking up endpoint strings.
- **No hidden magic**: No dependency arrays to get wrong, no hook ordering rules, no implicit re-renders. The code does what it says.
- **Flat, predictable file structure**: Components are functions in `.tsx` files. Routes are a single `defineRoutes()` call. An AI can grep for any pattern and find it.
- **Compiler diagnostics**: If an AI writes `todos.push(item)` instead of `todos = [...todos, item]`, the compiler warns immediately — fast feedback even for non-human authors.
- **Generated SDK as documentation**: The SDK is auto-generated with full types. An AI can inspect `api.users` to discover all available operations without reading backend code.

### How easy is it to build integration and e2e tests?

**Testing is designed in, not bolted on.** (See section 13 for detailed examples.)

- **Unit tests**: `renderTest()` creates a component in isolation with a lightweight DOM. No browser needed. Sub-millisecond per test.
- **Integration tests**: `createTestRouter()` renders a full route tree with mocked SDK methods. Tests navigation, loaders, error handling, and layout nesting without a running server.
- **E2E tests**: `renderE2E()` combined with `createTestApp()` from `@vertz/testing` runs the real backend and renders the UI against it. True full-stack validation.
- **SDK mocking**: `createMockSDK()` generates a complete mock of the SDK where every method is a spy/stub. No manual mock setup per endpoint.
- **Form testing**: `fillForm()` and `submitForm()` simulate real user interaction with native form elements. Tests validate the same schema the server uses.
- **No flaky selectors**: Components produce stable DOM structures (no virtual DOM reconciliation artifacts). Test selectors match what the user sees.

The test pyramid is clear:

```
        ┌─────────┐
        │  E2E    │  Few — full-stack, real server, real SDK
        ├─────────┤
        │ Integr. │  Some — route trees, mocked SDK, real reactivity
        ├─────────┤
        │  Unit   │  Many — individual components, pure functions
        └─────────┘
```

### Is it accessible?

**Accessibility is a constraint, not a feature.** The design makes accessible patterns the default and inaccessible patterns harder to write:

- **Native HTML elements**: Forms use real `<form>`, `<input>`, `<label>`, `<select>`, `<button>` elements. Screen readers, keyboard navigation, and autocomplete work out of the box. There is no synthetic event system fighting the browser.
- **`for` attribute, not `htmlFor`**: We use native HTML attribute names. `<label for="email">` works without React's rename.
- **Progressive enhancement**: Forms work without JavaScript. This is inherently the most accessible pattern — it works with any assistive technology, any browser, any connection speed.
- **No div-soup from VDOM**: Components produce exactly the DOM the developer writes. No extra wrapper `<div>`s from fragments or portals. The resulting HTML is what you see in the JSX.
- **Compiler diagnostics for a11y** (planned): The compiler can warn about missing `alt` attributes on `<img>`, missing `for` on `<label>`, click handlers on non-interactive elements, and other common a11y violations. These are compile-time checks, not runtime warnings.
- **ARIA support**: Standard ARIA attributes work as expected in JSX. Reactive ARIA attributes (e.g., `aria-expanded={isOpen}`) are auto-tracked and updated by the compiler, just like any other attribute.

```tsx
// Accessible by default — no special effort needed
function SearchForm() {
  const searchForm = form(api.search.query);

  return (
    <form {...searchForm.attrs()} role="search">
      <label for="q">Search</label>
      <input name="q" id="q" type="search" aria-label="Search users" />
      <button type="submit">Search</button>
    </form>
  );
}
```

The north star: if a developer writes semantic HTML with Vertz UI, the result is accessible. The framework should never make accessibility harder than plain HTML.

---

## 18. Implementation Phases

| Phase | Scope | Depends on |
|-------|-------|-----------|
| 1 | Reactivity runtime — `signal()`, `computed()`, `effect()`, DOM helpers | — |
| 2 | Compiler core — `let` → signal transform, JSX → DOM calls, computed detection | Phase 1 |
| 3 | Component model — props, children, context, lifecycle, refs, `watch()` | Phase 2 |
| 4 | Router — `defineRoutes`, loaders, nested layouts, typed params/search | Phase 3 |
| 5 | Forms — `form()`, SDK-aware submission, `FormData` → typed object, schema validation | Phase 3, Phase 9 |
| 6 | `query()` — reactive data fetching, auto-generated keys, debounce, refetch, initialData | Phase 3, Phase 9 |
| 7 | SSR — `renderToStream`, streaming, out-of-order Suspense chunks | Phase 3 |
| 8 | Atomic hydration — `data-v-id` markers, client bootstrap, lazy/eager/interaction strategies | Phase 7 |
| 9 | SDK generation — `@vertz/codegen` reads compiler IR, generates typed SDK client, route types, schemas | `@vertz/compiler` |
| 10 | Testing — `renderTest`, `createTestRouter`, `fillForm`, SDK mocking, `@vertz/testing` integration | Phase 4-6 |
| 11 | Vite plugin — full dev server integration, HMR, production build, auto-run codegen on backend change | Phase 2+ |

---

## 19. Runtime Size Budget

| Module | Estimated gzip size | POC measured |
|--------|-------------------|-------------|
| Signal core (`signal`, `computed`, `effect`) | ~1.5 KB | 433 B |
| DOM helpers (`__text`, `__element`, `__attr`, `__on`, `__conditional`, `__list`) | ~2 KB | ~550 B |
| Lifecycle (`onMount`, `onCleanup`, `watch`, context) | ~0.5 KB | ~200 B |
| Suspense + ErrorBoundary | ~0.5 KB | — |
| **Total runtime** | **~4.5 KB** | **1.13 KB** |
| Router + query() + form() | ~3 KB (loaded separately) | — |

For comparison: React is ~45 KB, Preact is ~4 KB, Solid is ~7 KB, Svelte runtime is ~2 KB.

---

## 20. POC Validation Notes

> Validated via `poc/ui-validation` branch (PR #100, closed). 82 tests, all passing.

### Implementation details to address

1. **Branch cleanup ownership (Phase 3):** Conditional and list rendering need a scope/ownership system. Each branch's effects must be tracked and disposed when the branch is removed. Standard in Solid and Svelte.

2. **Max iteration guard for watch() (Phase 3):** Add a production safety valve (e.g., 100 re-runs) to catch accidental infinite loops in `watch()` callbacks, with a clear error message pointing to the offending call.

3. **AST-based computed body rewriting (Phase 2):** The compiler must use AST-based rewriting (not regex) when rewriting computed expression bodies. Regex replacement can produce incorrect results with variable names that are substrings of other identifiers (e.g., `x` matching inside `xMax`).

4. **Props object creation (Phase 2):** Standardize on `Object.defineProperties(Object.create(null), { ... })` for component props to ensure getter-based reactivity works reliably with all prop patterns including spreads.

### POC benchmark results (Apple Silicon, Bun 1.3.8)

| Benchmark | ops/sec |
|-----------|---------|
| signal create + get + set (1000x) | 37,798 |
| computed chain (depth=10, 100 updates) | 36,260 |
| effect with 100 signals, batch update | 51,635 |
| 1000 subscribers on one signal | 13,707 |
| diamond dependency (100 updates) | 61,590 |
