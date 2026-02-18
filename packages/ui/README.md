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

### Vite Setup

```ts
// vite.config.ts
import vertz from '@vertz/ui-compiler/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vertz()],
});
```

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
    <div className={styles.classNames.card}>
      <h2 className={styles.classNames.title}>{title}</h2>
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

Bind forms to SDK methods:

```tsx
import { form } from '@vertz/ui';

// Assuming you have an SDK method
declare const createUser: (body: { name: string; email: string }) => Promise<{ id: string }>;

const userForm = form(createUser, {
  schema: {
    name: { required: true },
    email: { required: true, type: 'email' },
  },
});

function CreateUser() {
  return (
    <form
      {...userForm.attrs()}
      onSubmit={userForm.handleSubmit({
        onSuccess: (result) => console.log('User created:', result.id),
      })}
    >
      <input name="name" placeholder="Name" />
      {userForm.error('name') && <span className="error">{userForm.error('name')}</span>}

      <input name="email" type="email" placeholder="Email" />
      {userForm.error('email') && <span className="error">{userForm.error('email')}</span>}

      <button type="submit" disabled={userForm.submitting.value}>
        {userForm.submitting.value ? 'Creating...' : 'Create User'}
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

### Manual Signals

Most of the time, the compiler handles reactivity for you. But you can create signals manually:

```tsx
import { signal } from '@vertz/ui';

const count = signal(0);

count.value;        // Read (subscribes if in tracking context)
count.value = 5;    // Write
count.peek();       // Read without subscribing
count.notify();     // Manually notify subscribers
```

### Effects

Run side effects that respond to reactive changes:

```tsx
import { effect } from '@vertz/ui';

const count = signal(0);

const dispose = effect(() => {
  console.log('Count is now:', count.value);
});

count.value = 5; // logs: "Count is now: 5"
dispose();       // Stop the effect
```

### Batching Updates

Group multiple signal writes into a single effect run:

```tsx
import { batch, effect, signal } from '@vertz/ui';

const first = signal('a');
const last = signal('b');

effect(() => {
  console.log(first.value, last.value);
});

batch(() => {
  first.value = 'x';
  last.value = 'y';
}); // logs only once: "x y"
```

### Untracking Reads

Read signals without creating subscriptions:

```tsx
import { untrack, signal, effect } from '@vertz/ui';

const count = signal(0);
const other = signal(1);

effect(() => {
  const tracked = count.value;                 // subscribes to count
  const notTracked = untrack(() => other.value); // no subscription
  console.log(tracked, notTracked);
});

count.value = 5; // effect re-runs
other.value = 10; // effect does NOT re-run
```

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

---

## Hydration

Server-render and hydrate components on the client:

```tsx
import { hydrate, visibleStrategy } from '@vertz/ui/hydrate';

const registry = {
  Counter: () => import('./Counter'),
  TodoList: () => import('./TodoList'),
};

// Hydrate when components become visible
hydrate(registry, visibleStrategy);
```

**Strategies:**
- `eagerStrategy` — Hydrate immediately
- `idleStrategy` — Hydrate when browser is idle
- `visibleStrategy` — Hydrate when component is visible
- `interactionStrategy` — Hydrate on first user interaction
- `lazyStrategy` — Never auto-hydrate
- `mediaStrategy` — Hydrate based on media query

---

## What You Don't Need to Know

- How the compiler transforms your code
- Internal signal implementation details
- The reactive graph structure
- How dependency tracking works under the hood

**Write ordinary JavaScript. The compiler handles the rest.**

---

## API Reference

For complete API details, see the TypeScript definitions in `src/index.ts`.

Key exports:

**Reactivity:** `signal`, `computed`, `effect`, `batch`, `untrack`, `onCleanup`  
**Lifecycle:** `onMount`, `watch`  
**Components:** `createContext`, `useContext`, `children`, `ref`, `ErrorBoundary`, `Suspense`  
**CSS:** `css`, `variants`, `defineTheme`, `compileTheme`, `ThemeProvider`, `globalCss`, `s`  
**Forms:** `form`, `formDataToObject`, `validate`  
**Data:** `query`  
**Routing:** `defineRoutes`, `createRouter`, `createLink`, `createOutlet`, `parseSearchParams`, `useSearchParams`  
**Hydration:** `hydrate`, `eagerStrategy`, `idleStrategy`, `visibleStrategy`, `interactionStrategy`, `lazyStrategy`, `mediaStrategy`

---

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development setup and pull request guidelines.
