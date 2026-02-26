# @vertz/ui

**Use `let` for state. Use `const` for derived. Write JSX. Done.**

```tsx
function Counter() {
  let count = 0;

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => count++}>Increment</button>
    </div>
  );
}
```

That's it. `count` is reactive. The compiler transforms your code into efficient reactive DOM updates. No virtual DOM, no hooks, no boilerplate.

---

## Installation

```bash
npm install @vertz/ui @vertz/ui-compiler
```

### Bun Setup

The `@vertz/ui-server/bun-plugin` handles compiler transforms, CSS extraction, and Fast Refresh automatically when using `Bun.serve()` with HTML imports or `vertz dev`.

---

## The Basics

### Reactive State: `let`

Any `let` variable read in JSX becomes reactive:

```tsx
function TodoInput() {
  let text = '';

  return (
    <div>
      <input value={text} onInput={(e) => (text = e.target.value)} />
      <p>You typed: {text}</p>
    </div>
  );
}
```

Assignments work naturally: `text = 'hello'`, `count++`, `items.push(item)`.

### Derived State: `const`

A `const` that reads a reactive variable becomes computed (cached, lazy):

```tsx
function Cart() {
  let quantity = 1;
  let price = 10;

  const total = quantity * price;
  const formatted = `$${total}`;

  return <p>Total: {formatted}</p>;
}
```

`total` only recalculates when `quantity` or `price` change.

### Components

Components are plain functions returning DOM:

```tsx
function Greeting({ name }) {
  return <h1>Hello, {name}!</h1>;
}

function App() {
  let name = 'World';

  return (
    <div>
      <Greeting name={name} />
      <button onClick={() => (name = 'Alice')}>Change Name</button>
    </div>
  );
}
```

### Mounting

Mount your app to the DOM with `mount()`:

```tsx
import { mount } from '@vertz/ui';

function App() {
  let count = 0;
  return <button onClick={() => count++}>Count: {count}</button>;
}

const { unmount, root } = mount(App, '#app');
```

**With options:**

```tsx
import { mount } from '@vertz/ui';
import { defineTheme } from '@vertz/ui/css';

const theme = defineTheme({
  colors: { primary: { 500: '#3b82f6' } },
});

mount(App, '#app', {
  theme,
  styles: ['body { margin: 0; }'],
  onMount: (root) => console.log('Mounted to', root),
});
```

`mount(app, selector, options?)` accepts:

- `selector` — CSS selector string or `HTMLElement`
- `options.theme` — theme definition for CSS vars
- `options.styles` — global CSS strings to inject
- `options.hydration` — `'replace'` (default) or `false`
- `options.registry` — component registry for per-component hydration
- `options.onMount` — callback after mount completes

Returns a `MountHandle` with `unmount()` and `root`.

### Lifecycle: `onMount`

Run code once when the component is created:

```tsx
import { onMount, onCleanup } from '@vertz/ui';

function Timer() {
  let seconds = 0;

  onMount(() => {
    const id = setInterval(() => seconds++, 1000);
    onCleanup(() => clearInterval(id));
  });

  return <p>{seconds}s</p>;
}
```

### Data Fetching: `query`

Fetch data reactively:

```tsx
import { query } from '@vertz/ui';

function UserProfile() {
  let userId = 1;

  const { data, loading } = query(() =>
    fetch(`/api/users/${userId}`).then((r) => r.json())
  );

  return (
    <div>
      {loading.value ? 'Loading...' : <p>{data.value?.name}</p>}
      <button onClick={() => userId++}>Next User</button>
    </div>
  );
}
```

---

## You're Done (Probably)

**90% of apps only need the above.** The rest is for special cases.

---

## Styling

### `css` — Scoped Styles

```tsx
import { css } from '@vertz/ui/css';

const styles = css({
  card: ['p:4', 'bg:white', 'rounded:lg', 'shadow:md'],
  title: ['font:xl', 'weight:bold', 'mb:2'],
});

function Card({ title, children }) {
  return (
    <div className={styles.card}>
      <h2 className={styles.title}>{title}</h2>
      {children}
    </div>
  );
}
```

### `variants` — Typed Variants

```tsx
import { variants } from '@vertz/ui/css';

const button = variants({
  base: ['px:4', 'py:2', 'rounded:md', 'font:medium'],
  variants: {
    intent: {
      primary: ['bg:blue.600', 'text:white'],
      secondary: ['bg:gray.100', 'text:gray.800'],
    },
    size: {
      sm: ['px:2', 'py:1', 'text:sm'],
      lg: ['px:6', 'py:3', 'text:lg'],
    },
  },
  defaultVariants: { intent: 'primary', size: 'md' },
});

function Button({ intent, size, children }) {
  return <button className={button({ intent, size })}>{children}</button>;
}
```

### `s` — Inline Dynamic Styles

```tsx
import { s } from '@vertz/ui/css';

function ProgressBar({ percent }) {
  return <div style={s([`w:${percent}%`, 'bg:green.500', 'h:4'])} />;
}
```

### Theming

```tsx
import { defineTheme, compileTheme, ThemeProvider } from '@vertz/ui/css';

const theme = defineTheme({
  colors: {
    primary: { 500: '#3b82f6', 600: '#2563eb' },
    background: { DEFAULT: '#ffffff', _dark: '#111827' },
  },
});

const compiled = compileTheme(theme);

ThemeProvider({ theme: 'dark', children: [<App />] });
```

---

## Forms

Bind forms to server actions with type-safe validation:

```tsx
import { form } from '@vertz/ui';

const createUser = Object.assign(
  async (body: { name: string; email: string }) => {
    const res = await fetch('/api/users', { method: 'POST', body: JSON.stringify(body) });
    return res.json() as Promise<{ id: string }>;
  },
  { url: '/api/users', method: 'POST' }
);

const userSchema = { /* validation schema */ };

function CreateUser() {
  const f = form(createUser, {
    schema: userSchema,
    onSuccess: (result) => console.log('User created:', result.id),
  });

  return (
    <form action={f.action} method={f.method} onSubmit={f.onSubmit}>
      <input name="name" placeholder="Name" />
      {f.name.error && <span class="error">{f.name.error}</span>}

      <input name="email" type="email" placeholder="Email" />
      {f.email.error && <span class="error">{f.email.error}</span>}

      <button type="submit" disabled={f.submitting}>
        {f.submitting.value ? 'Creating...' : 'Create User'}
      </button>
    </form>
  );
}
```

---

## Routing

```tsx
import { defineRoutes, createRouter, createLink } from '@vertz/ui/router';

const routes = defineRoutes({
  '/': { component: () => <HomePage /> },
  '/users/:id': {
    component: () => <UserPage />,
    loader: async ({ params }) => {
      const res = await fetch(`/api/users/${params.id}`);
      return res.json();
    },
  },
});

const router = createRouter(routes);
const Link = createLink(router.current, router.navigate);

function Nav() {
  return (
    <nav>
      <Link href="/">Home</Link>
      <Link href="/users/1">User 1</Link>
    </nav>
  );
}
```

---

## Context

Share values without passing props:

```tsx
import { createContext, useContext } from '@vertz/ui';

const ThemeContext = createContext<'light' | 'dark'>('light');

function App() {
  let theme = 'light';

  return (
    <ThemeContext.Provider value={theme}>
      <ThemeToggle />
    </ThemeContext.Provider>
  );
}

function ThemeToggle() {
  const theme = useContext(ThemeContext);
  return <p>Current theme: {theme}</p>;
}
```

---

## Error Handling

```tsx
import { ErrorBoundary } from '@vertz/ui';

function App() {
  return (
    <ErrorBoundary
      fallback={(error, retry) => (
        <div>
          <p>Error: {error.message}</p>
          <button onClick={retry}>Retry</button>
        </div>
      )}
    >
      {() => <RiskyComponent />}
    </ErrorBoundary>
  );
}
```

---

## Advanced

### Watch

Watch a dependency and run a callback when it changes:

```tsx
import { watch } from '@vertz/ui';

function Logger() {
  let count = 0;

  watch(
    () => count,
    (value) => console.log('count changed to', value)
  );

  return <button onClick={() => count++}>Increment</button>;
}
```

### Refs

Access DOM elements after mount:

```tsx
import { ref, onMount } from '@vertz/ui';

function AutoFocus() {
  const inputRef = ref<HTMLInputElement>();

  onMount(() => {
    inputRef.current?.focus();
  });

  return <input ref={inputRef} placeholder="Auto-focused" />;
}
```

---

## Testing

Import from `@vertz/ui/test`:

```tsx
import { renderTest, findByText, click, waitFor } from '@vertz/ui/test';

// Mount a component for testing
const { container, findByText, click, unmount } = renderTest(<Counter />);

// Query the DOM
const button = findByText('Increment');
await click(button);
const label = findByText('Count: 1');

// Clean up
unmount();
```

### Query Helpers

| Export | Description |
|---|---|
| `findByTestId(id)` | Find element by `data-testid` — throws if not found |
| `findByText(text)` | Find element by text content — throws if not found |
| `queryByTestId(id)` | Find element by `data-testid` — returns `null` if not found |
| `queryByText(text)` | Find element by text content — returns `null` if not found |
| `waitFor(fn, options?)` | Retry an assertion until it passes |

### Interaction Helpers

| Export | Description |
|---|---|
| `click(el)` | Simulate a click event |
| `type(el, text)` | Simulate typing into an input |
| `press(key)` | Simulate a key press |
| `fillForm(form, values)` | Fill multiple form fields |
| `submitForm(form)` | Submit a form |

### Route Testing

```tsx
import { createTestRouter } from '@vertz/ui/test';

const { component, router, navigate } = await createTestRouter(
  {
    '/': { component: () => <Home /> },
    '/about': { component: () => <About /> },
  },
  { initialPath: '/' }
);

await navigate('/about');
```

---

## JSX Runtime

The `@vertz/ui/jsx-runtime` subpath provides the JSX factory used by the compiler. This is configured automatically by the Bun plugin — you don't need to set it up manually.

---

## Gotchas

### `onMount` runs synchronously

`onMount` fires during component initialization, not after DOM insertion. This means the DOM node exists but may not be in the document yet. If you need to measure layout or interact with the painted DOM, use `requestAnimationFrame` inside `onMount`:

```tsx
onMount(() => {
  // DOM node exists but may not be painted yet
  requestAnimationFrame(() => {
    // Now it's safe to measure layout
  });
});
```

### `onCleanup` requires a disposal scope

Calling `onCleanup` outside of `onMount`, `watch`, or `effect` throws a `DisposalScopeError`. This is intentional — without a scope, the cleanup would be silently discarded:

```tsx
// Works — inside onMount
onMount(() => {
  const id = setInterval(() => seconds++, 1000);
  onCleanup(() => clearInterval(id));
});

// Throws DisposalScopeError — no scope
function setup() {
  onCleanup(() => {}); // Error!
}
```

### Primitives are uncontrolled only

`@vertz/ui-primitives` components (Dialog, Select, Tabs, etc.) currently only support uncontrolled mode with `defaultValue` + callbacks. Controlled mode (where a parent prop overrides internal state) is not yet supported.

### Popover has no focus trap

`Popover` focuses the first element on open but does not trap focus. Tab will move focus outside the popover. This is correct for non-modal popovers (tooltips, menus), but if you need modal behavior with a focus trap, use `Dialog` instead.

---

## What You Don't Need to Know

- How the compiler transforms your code
- Internal signal implementation details
- The reactive graph structure
- How dependency tracking works under the hood

**Write ordinary JavaScript. The compiler handles the rest.**

---

## API Reference

### Lifecycle

| Export | Description |
|---|---|
| `onMount` | Run code once when a component mounts |
| `onCleanup` | Register a cleanup callback |
| `watch` | Watch a dependency and run a callback on change |

### Components

| Export | Description |
|---|---|
| `createContext` | Create a context for dependency injection |
| `useContext` | Read a context value |
| `children` | Access resolved children |
| `ref` | Create a ref for DOM element access |
| `ErrorBoundary` | Catch errors in a component tree |
| `Suspense` | Show fallback while async content loads |

### Mounting

| Export | Description |
|---|---|
| `mount` | Mount an app to a DOM element |

### CSS (`@vertz/ui/css`)

| Export | Description |
|---|---|
| `css` | Create scoped styles |
| `variants` | Create typed variant styles |
| `s` | Inline dynamic styles |
| `defineTheme` | Define a theme |
| `compileTheme` | Compile a theme to CSS |
| `ThemeProvider` | Provide a theme to descendants |
| `globalCss` | Inject global CSS |

### Forms

| Export | Description |
|---|---|
| `form` | Create a form bound to an SDK method |
| `formDataToObject` | Convert FormData to a plain object |
| `validate` | Run schema validation |

### Data

| Export | Description |
|---|---|
| `query` | Reactive data fetching |

### Routing (`@vertz/ui/router`)

| Export | Description |
|---|---|
| `defineRoutes` | Define route configuration |
| `createRouter` | Create a router instance |
| `createLink` | Create a `<Link>` component |
| `createOutlet` | Create a route outlet |
| `parseSearchParams` | Parse URL search parameters |
| `useSearchParams` | Reactive search parameters |

### Testing (`@vertz/ui/test`)

| Export | Description |
|---|---|
| `renderTest` | Mount a component for testing |
| `findByTestId` | Find element by `data-testid` (throws) |
| `findByText` | Find element by text content (throws) |
| `queryByTestId` | Find element by `data-testid` (nullable) |
| `queryByText` | Find element by text content (nullable) |
| `waitFor` | Retry an assertion until it passes |
| `click` | Simulate a click |
| `type` | Simulate typing |
| `press` | Simulate a key press |
| `fillForm` | Fill multiple form fields |
| `submitForm` | Submit a form |
| `createTestRouter` | Create a router for testing |

---

## License

MIT
