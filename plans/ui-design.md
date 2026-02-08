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

Dependency graph:

```
@vertz/schema ← shared validation (server + client)
     ↓
@vertz/core → @vertz/compiler → .vertz/generated/
                                    ├── route-types.ts    (NEW)
                                    └── client-api.ts     (NEW)
                                          ↓
@vertz/ui-compiler (Vite plugin) → reads generated types
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

| Need | API |
|------|-----|
| DOM updates | Automatic (compiler-generated) |
| React to state change | `watch(() => dep, callback)` |
| Run on mount | `watch(() => { ... })` (no dep = run once) |
| Cleanup | `onCleanup(fn)` inside `watch` |
| Derived state | `const x = expr` (compiler makes it computed) |

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

  watch(() => {
    const ctx = canvasRef.current?.getContext("2d");
    // imperative canvas drawing...
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
@vertz/compiler → .vertz/generated/route-types.ts
    ↓
@vertz/ui typed API client (api.get, api.post)
    ↓
Component receives fully typed data
```

### Generated route types

```typescript
// .vertz/generated/route-types.ts (auto-generated)
export interface RouteTypes {
  'GET /users': {
    query: { page: number; limit: number };
    response: Array<{ id: string; name: string; email: string; role: string; createdAt: string }>;
  };
  'POST /users': {
    body: { name: string; email: string; role?: 'admin' | 'user' };
    response: { id: string; name: string; email: string; role: string; createdAt: string };
  };
}
```

### Typed API client

```typescript
// In a component:
const users = await api.get('/users', { query: { page: 1 } });
// users is typed as Array<{ id: string; name: string; email: string; ... }>
```

If the backend changes a schema, `bun run typecheck` on the frontend catches the mismatch immediately.

### Shared validation

The same `@vertz/schema` objects validate on both sides:

```typescript
import { createUserBody } from '../../schemas/user';

// Server: used in route config as body: createUserBody
// Client: used in form() for client-side validation
const userForm = form(createUserBody);
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

### The `form()` function

```tsx
import { form } from '@vertz/ui/form';
import { createUserBody } from '../../schemas/user';
import { api } from '../api';

function CreateUser() {
  const userForm = form(createUserBody);

  return (
    <form
      action="/api/users"
      method="POST"
      onSubmit={userForm.handleSubmit(async (data) => {
        // data is typed as { name: string; email: string; role?: 'admin' | 'user' }
        const result = await api.post('/users', { body: data });
        if (result.ok) router.navigate(`/users/${result.data.id}`);
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

### How `handleSubmit` works

1. `event.preventDefault()` — Stops native submission.
2. `new FormData(form)` — Reads all values from the DOM.
3. `formDataToObject(formData)` — Converts to `{ name: "Alice", email: "..." }`.
4. `schema.safeParse(raw)` — Validates with `@vertz/schema`. Coercion handles string→number/boolean.
5. On success: calls your handler with typed data.
6. On validation failure: populates `userForm.error('fieldName')`.

### Progressive enhancement

Without JavaScript, the form submits normally to `action="/api/users"`. The backend validates with the same schema and redirects on success or re-renders with errors. With JavaScript, `handleSubmit` intercepts for a SPA experience. The form works either way.

---

## 10. Router

### Route definition

```typescript
import { defineRoutes } from '@vertz/ui/router';
import { s } from '@vertz/schema';

export const routes = defineRoutes({
  '/': {
    component: () => import('./pages/Home'),
  },
  '/users': {
    component: () => import('./pages/users/Layout'),
    loader: async () => {
      const counts = await api.get('/users/counts');
      return { counts };
    },
    children: {
      '/': {
        component: () => import('./pages/users/UserList'),
        loader: async ({ search }) => {
          return await api.get('/users', { query: search });
        },
        searchParams: s.object({
          page: s.coerce.number().default(1),
          role: s.enum(['admin', 'user', 'all'] as const).default('all'),
        }),
      },
      '/:id': {
        component: () => import('./pages/users/UserDetail'),
        loader: async ({ params }) => {
          return await api.get(`/users/${params.id}`);
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

### `query()` for reactive fetching

```tsx
function UserList({ users: initial }: { users: User[] }) {
  let search = '';

  const results = query(
    () => api.get('/users', { query: { q: search } }),
    { initialData: initial, debounce: 300, enabled: () => search.length > 0 }
  );

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

### Revalidation after mutations

```typescript
import { revalidate } from '@vertz/ui/router';

async function handleDelete(userId: string) {
  await api.delete(`/users/${userId}`);
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
  loader: async ({ params }) => api.get(`/users/${params.id}`),
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

### API client returns discriminated unions

```typescript
const result = await api.post('/users', { body: data });
if (result.ok) {
  // result.data is typed
} else {
  // result.error has { code, message, details }
}
```

---

## 13. Testing

```typescript
import { renderTest, fillForm, submitForm } from '@vertz/ui/test';

test('renders user list', () => {
  const { findByText } = renderTest(<UserList users={mockUsers} />);
  expect(findByText('Alice')).toBeTruthy();
});

test('validates form and submits', async () => {
  const { container } = renderTest(<CreateUser />);
  await fillForm(container.querySelector('form'), { name: 'Alice', email: 'alice@test.com' });
  await submitForm(container.querySelector('form'));
  // assertions...
});

test('navigates between routes', async () => {
  const router = createTestRouter(routes, {
    initialPath: '/users',
    loaderMocks: { '/users': () => ({ users: mockUsers }) },
  });
  const { findByText, click } = renderTest(router.component);
  await click(findByText('Alice'));
  expect(router.currentPath).toBe('/users/1');
});
```

Integrates with `@vertz/testing` for full-stack tests using `createTestApp`.

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

## 17. Implementation Phases

| Phase | Scope | Depends on |
|-------|-------|-----------|
| 1 | Reactivity runtime — `signal()`, `computed()`, `effect()`, DOM helpers | — |
| 2 | Compiler core — `let` → signal transform, JSX → DOM calls, computed detection | Phase 1 |
| 3 | Component model — props, children, context, lifecycle, refs, `watch()` | Phase 2 |
| 4 | Router — `defineRoutes`, loaders, nested layouts, typed params/search | Phase 3 |
| 5 | Forms — `form()`, `FormData` → typed object, schema validation | Phase 3 |
| 6 | `query()` — reactive data fetching, debounce, refetch, initialData | Phase 3 |
| 7 | SSR — `renderToStream`, streaming, out-of-order Suspense chunks | Phase 3 |
| 8 | Atomic hydration — `data-v-id` markers, client bootstrap, lazy/eager/interaction strategies | Phase 7 |
| 9 | End-to-end types — `ClientApiGenerator`, route-types.ts, typed API client | `@vertz/compiler` |
| 10 | Testing — `renderTest`, `createTestRouter`, `fillForm`, `@vertz/testing` integration | Phase 4-6 |
| 11 | Vite plugin — full dev server integration, HMR, production build | Phase 2+ |

---

## 18. Runtime Size Budget

| Module | Estimated gzip size |
|--------|-------------------|
| Signal core (`signal`, `computed`, `effect`) | ~1.5 KB |
| DOM helpers (`__text`, `__element`, `__attr`, `__on`, `__conditional`, `__list`) | ~2 KB |
| Lifecycle (`onMount`, `onCleanup`, `watch`, context) | ~0.5 KB |
| Suspense + ErrorBoundary | ~0.5 KB |
| **Total runtime** | **~4.5 KB** |
| Router + query() + form() | ~3 KB (loaded separately) |

For comparison: React is ~45 KB, Preact is ~4 KB, Solid is ~7 KB, Svelte runtime is ~2 KB.
