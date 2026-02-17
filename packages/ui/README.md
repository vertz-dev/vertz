# @vertz/ui

A compiler-driven UI framework with fine-grained reactivity. Write plain JavaScript — the compiler transforms your code into efficient reactive DOM updates. No virtual DOM, no hooks, no boilerplate.

## Quick Example

```tsx
function Counter() {
  let count = 0;

  return (
    <div>
      <span>{count}</span>
      <button onClick={() => count++}>+</button>
    </div>
  );
}
```

That's it. `count` is reactive. Typing in the input, and the heading updates automatically.

---

## Installation

```bash
npm install @vertz/ui @vertz/ui-compiler
```

### Vite Config

```ts
// vite.config.ts
import vertz from '@vertz/ui-compiler/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vertz()],
});
```

---

## Key Concepts

### `let` = Reactive State

Any `let` variable read in JSX becomes a reactive signal:

```tsx
function Counter() {
  let count = 0;
  return <span>{count}</span>;
}
```

Assignments work naturally: `count++`, `count = 5`, `count += 1`.

### `const` = Derived State

A `const` that reads a signal becomes a computed (cached, lazy):

```tsx
function Pricing() {
  let quantity = 1;
  const total = 10 * quantity;  // computed
  const formatted = `$${total}`; // computed

  return <span>{formatted}</span>;
}
```

### Effects

Use `effect()` for side effects that respond to signal changes:

```tsx
import { effect, onCleanup } from '@vertz/ui';

function Analytics() {
  let page = '/home';

  effect(() => {
    sendPageView(page);
  });

  onCleanup(() => cleanup());
}
```

### Components

Components are plain functions returning DOM nodes:

```tsx
function Card({ title, children }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      {children}
    </div>
  );
}
```

---

## API Reference

### Reactivity

#### `signal<T>(initial: T): Signal<T>`

Create a reactive value:

```tsx
import { signal } from '@vertz/ui';

const count = signal(0);
count.value;        // 0
count.value = 5;    // set value
count.peek();       // read without subscribing
count.notify();     // manually notify subscribers
```

#### `computed<T>(fn: () => T): Computed<T>`

Create a derived value that's cached and lazily re-evaluated:

```tsx
import { computed, signal } from '@vertz/ui';

const count = signal(1);
const doubled = computed(() => count.value * 2);
```

#### `effect(fn: () => void): DisposeFn`

Run a side effect whenever dependencies change. Returns a dispose function:

```tsx
import { effect, signal } from '@vertz/ui';

const count = signal(0);
const dispose = effect(() => {
  console.log('count is', count.value);
});

count.value = 1; // logs: count is 1
dispose();       // stop the effect
```

#### `batch(fn: () => void): void`

Group multiple signal updates into a single effect run:

```tsx
import { batch, effect, signal } from '@vertz/ui';

let first = signal('a');
let last = signal('b');

effect(() => {
  console.log(first.value, last.value);
});

batch(() => {
  first.value = 'x';
  last.value = 'y';
}); // logs only once: x y
```

#### `untrack<T>(fn: () => T): T`

Read signals without creating a subscription:

```tsx
import { untrack, signal, effect } from '@vertz/ui';

const count = signal(0);
const other = signal(1);

effect(() => {
  const tracked = count.value;     // subscribes to count
  const notTracked = untrack(() => other.value); // no subscription
});
```

#### `onCleanup(fn: () => void): void`

Register a cleanup function. Throws `DisposalScopeError` if called outside a scope:

```tsx
import { effect, onCleanup } from '@vertz/ui';

effect(() => {
  const ws = new WebSocket('wss://example.com');
  onCleanup(() => ws.close());
});
```

#### Types

- **Signal<T>** — Read/write reactive value with `.value`
- **ReadonlySignal<T>** — Read-only (computed values)
- **Computed<T>** — Derived, cached signal
- **DisposeFn** — `() => void` for cleanup

---

### Components

#### `createContext<T>(defaultValue?: T): Context<T>`

Create a context for passing values without props:

```tsx
import { createContext, useContext } from '@vertz/ui';

const ThemeCtx = createContext<'light' | 'dark'>('light');
```

#### `useContext<T>(ctx: Context<T>): T | undefined`

Read a context value:

```tsx
const theme = useContext(ThemeCtx);
```

#### `children(accessor: ChildrenAccessor): () => Node[]`

Resolve children to DOM nodes:

```tsx
import { children } from '@vertz/ui';

function Panel(props) {
  const getChildren = children(props.children);
  const el = <div className="panel" />;
  for (const child of getChildren()) {
    el.appendChild(child);
  }
  return el;
}
```

#### `ref<T>(): Ref<T>`

Create a ref for DOM element access:

```tsx
import { ref, onMount } from '@vertz/ui';

function FocusInput() {
  const inputRef = ref<HTMLInputElement>();

  onMount(() => {
    inputRef.current?.focus();
  });

  const el = <input /> as HTMLInputElement;
  inputRef.current = el;
  return el;
}
```

#### `onMount(fn: () => void): void`

Run code once when component is created:

```tsx
import { onMount } from '@vertz/ui';

function Timer() {
  let elapsed = 0;

  onMount(() => {
    const id = setInterval(() => elapsed++, 1000);
    onCleanup(() => clearInterval(id));
  });

  return <span>{elapsed}s</span>;
}
```

#### `watch<T>(dep: () => T, callback: (value: T) => void): void`

Watch a dependency and run callback when it changes:

```tsx
import { watch } from '@vertz/ui';

function Logger() {
  let count = 0;

  watch(
    () => count,
    (value) => console.log('count changed to', value)
  );

  return <button onClick={() => count++}>+</button>;
}
```

#### `ErrorBoundary(props: { children: () => Node; fallback: (error: Error, retry: () => void) => Node }): Node`

Catch errors in child components:

```tsx
import { ErrorBoundary } from '@vertz/ui';

function App() {
  return ErrorBoundary({
    children: () => RiskyComponent(),
    fallback: (error, retry) => (
      <div>
        <p>Error: {error.message}</p>
        <button onClick={retry}>Retry</button>
      </div>
    ),
  });
}
```

#### `Suspense(props: { children: () => Node; fallback: () => Node }): Node`

Handle async components:

```tsx
import { Suspense } from '@vertz/ui';

function App() {
  return Suspense({
    children: () => AsyncComponent(),
    fallback: () => <div>Loading...</div>,
  });
}
```

---

### CSS

#### `css(styles: CSSInput): CSSOutput`

Create scoped styles:

```tsx
import { css } from '@vertz/ui/css';

const styles = css({
  card: ['p:4', 'bg:background', 'rounded:lg'],
  title: ['font:xl', 'weight:bold'],
});

function Card() {
  return (
    <div className={styles.classNames.card}>
      <h2 className={styles.classNames.title}>Hello</h2>
    </div>
  );
}
```

#### `variants(config: VariantsConfig): VariantFunction`

Create typed variants:

```tsx
import { variants } from '@vertz/ui/css';

const button = variants({
  base: ['flex', 'font:medium'],
  variants: {
    intent: {
      primary: ['bg:blue.600', 'text:white'],
      secondary: ['bg:gray.100', 'text:gray.800'],
    },
    size: {
      sm: ['px:2', 'py:1'],
      lg: ['px:4', 'py:2'],
    },
  },
  defaultVariants: { intent: 'primary', size: 'md' },
});

button({ intent: 'secondary', size: 'sm' }); // returns className string
```

#### `defineTheme(theme: ThemeInput): Theme`

Define a design theme:

```tsx
import { defineTheme, compileTheme, ThemeProvider } from '@vertz/ui/css';

const theme = defineTheme({
  colors: {
    primary: { 500: '#3b82f6', 600: '#2563eb' },
    background: { DEFAULT: '#ffffff', _dark: '#111827' },
  },
});

const compiled = compileTheme(theme);
// compiled.css contains CSS custom properties

ThemeProvider({ theme: 'dark', children: [app] });
```

#### `globalCss(styles: GlobalCSSInput): void`

Add global styles:

```tsx
import { globalCss } from '@vertz/ui/css';

globalCss({
  '*, *::before, *::after': { boxSizing: 'border-box' },
  body: { fontFamily: 'system-ui' },
});
```

#### `s(styles: CSSInput): string`

Inline dynamic styles:

```tsx
import { s } from '@vertz/ui/css';

function Bar({ width }) {
  return <div style={s([`w:${width}px`, 'bg:blue.500'])} />;
}
```

---

### Forms

#### `form<TBody, TResult>(sdkMethod: SdkMethod<TBody, TResult>, options: FormOptions<TBody>): FormInstance<TBody, TResult>`

Create a form bound to an SDK method:

```tsx
import { form } from '@vertz/ui/form';
import type { SdkMethod } from '@vertz/ui/form';

declare const createUser: SdkMethod<{ name: string; email: string }, { id: string }>;

const userForm = form(createUser, { schema: userSchema });

function CreateUserForm() {
  return (
    <form {...userForm.attrs()} onSubmit={userForm.handleSubmit({ onSuccess: (r) => console.log(r.id) })}>
      <input name="name" />
      {userForm.error('name') && <span>{userForm.error('name')}</span>}
      <button type="submit">{userForm.submitting.value ? 'Saving...' : 'Create'}</button>
    </form>
  );
}
```

#### `formDataToObject(formData: FormData, options?: FormDataOptions): Record<string, unknown>`

Convert FormData to plain object:

```tsx
import { formDataToObject } from '@vertz/ui/form';

const data = formDataToObject(formData, { coerce: true });
// { name: "Alice", age: 30 } from FormData
```

#### `validate<T>(schema: FormSchema<T>, data: unknown): ValidationResult<T>`

Validate data against a schema:

```tsx
import { validate } from '@vertz/ui/form';

const result = validate(userSchema, formData);
if (result.success) {
  console.log(result.data);
} else {
  console.log(result.errors);
}
```

---

### Data Fetching

#### `query<T>(thunk: () => Promise<T>, options?: QueryOptions<T>): QueryResult<T>`

Create a reactive data fetch:

```tsx
import { query } from '@vertz/ui/query';

function UserProfile() {
  let userId = 1;

  const { data, loading, error, refetch } = query(
    () => fetch(`/api/users/${userId}`).then(r => r.json())
  );

  return (
    <div>
      {loading.value ? 'Loading...' : data.value?.name}
      <button onClick={() => userId++}>Next</button>
      <button onClick={refetch}>Refresh</button>
    </div>
  );
}
```

Options:
- `initialData` — Pre-populated data
- `debounce` — Debounce re-fetches (ms)
- `enabled` — Enable/disable fetching
- `key` — Custom cache key
- `cache` — Custom cache store

Returns: `{ data, loading, error, refetch, revalidate, dispose }`

---

### Routing

#### `defineRoutes(map: RouteDefinitionMap): CompiledRoute[]`

Define routes:

```tsx
import { defineRoutes, createRouter, createLink } from '@vertz/ui/router';

const routes = defineRoutes({
  '/': { component: () => HomePage() },
  '/users/:id': {
    component: () => UserPage(),
    loader: async ({ params, signal }) => {
      const res = await fetch(`/api/users/${params.id}`, { signal });
      return res.json();
    },
  },
});
```

#### `createRouter(routes: CompiledRoute[], initialUrl?: string): Router`

Create a router instance:

```tsx
const router = createRouter(routes);

router.current;      // Signal<RouteMatch | null>
router.navigate('/users/42');
router.revalidate();
router.dispose();
```

#### `createLink(currentPath: ReadonlySignal<string>, navigate: (url: string) => void): (props: LinkProps) => HTMLAnchorElement`

Create a Link component:

```tsx
const Link = createLink(router.current, router.navigate);

Link({ href: '/', children: 'Home', activeClass: 'active' });
```

#### `createOutlet(outletCtx: Context<OutletContext>): () => Node`

Create an outlet for nested routes:

```tsx
import { createContext } from '@vertz/ui';
import { createOutlet } from '@vertz/ui/router';

const outletCtx = createContext<OutletContext>();
const Outlet = createOutlet(outletCtx);
```

#### `parseSearchParams<T>(urlParams: URLSearchParams, schema?: SearchParamSchema<T>): T`

Parse search params:

```tsx
import { parseSearchParams, useSearchParams } from '@vertz/ui/router';

const params = parseSearchParams(new URLSearchParams('?page=1'), mySchema);
const page = useSearchParams(router.searchParams);
```

---

### Hydration

#### `hydrate(registry: ComponentRegistry, strategy?: Strategy): void`

Hydrate components on the page:

```tsx
import { hydrate, eagerStrategy } from '@vertz/ui/hydrate';

hydrate(registry, eagerStrategy);
```

Strategies:
- `eagerStrategy` — Hydrate immediately
- `idleStrategy` — Hydrate when idle
- `visibleStrategy` — Hydrate when visible
- `interactionStrategy` — Hydrate on first interaction
- `lazyStrategy` — Never hydrate automatically
- `mediaStrategy` — Hydrate based on media query

---

## What You Don't Need to Know

- How the compiler transforms your code
- Internal signal implementation details
- The reactive graph structure

Write ordinary JavaScript. The compiler handles the rest.

---

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development setup and pull request guidelines.
