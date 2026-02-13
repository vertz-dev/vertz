# @vertz/ui

A compiler-driven UI framework with fine-grained reactivity. Write plain variables and JSX -- the compiler transforms them into efficient reactive DOM operations. No virtual DOM.

## Table of Contents

- [Quick Start](#quick-start)
- [Reactivity](#reactivity)
- [Components](#components)
- [Conditional Rendering](#conditional-rendering)
- [List Rendering](#list-rendering)
- [Styling](#styling)
- [Data Fetching](#data-fetching)
- [Routing](#routing)
- [Forms](#forms)
- [Lifecycle](#lifecycle)
- [Primitives](#primitives)
- [When to Use effect()](#when-to-use-effect)

---

## Quick Start

### Install

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

The plugin transforms all `.tsx` and `.jsx` files by default. You can customize with `include` and `exclude` globs:

```ts
vertz({
  include: ['**/*.tsx'],
  exclude: ['**/vendor/**'],
  cssExtraction: true, // default: true in production
})
```

### Hello World

```tsx
function App() {
  let name = 'World';

  return (
    <div>
      <h1>Hello, {name}!</h1>
      <input
        value={name}
        onInput={(e) => (name = (e.target as HTMLInputElement).value)}
      />
    </div>
  );
}

document.body.appendChild(App());
```

That's it. `name` is reactive. Typing in the input updates the heading. No hooks, no store setup, no subscriptions.

---

## Reactivity

This is the core mental model of the framework. The compiler does the heavy lifting -- you write normal-looking code and get fine-grained reactive DOM updates.

### `let` = Reactive State

Any `let` declaration inside a component that is read in JSX becomes a signal:

```tsx
// What you write:
function Counter() {
  let count = 0;
  return <span>{count}</span>;
}

// What the compiler produces:
function Counter() {
  const count = signal(0);
  const __el = __element("span");
  __el.appendChild(__text(() => count.value));
  return __el;
}
```

Assignments work naturally:

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

The compiler transforms `count++` to `count.value++`, `count = 5` to `count.value = 5`, and `count += 1` to `count.value += 1`.

### `const` = Derived State

A `const` that references a signal becomes a computed:

```tsx
// What you write:
function Pricing() {
  let quantity = 1;
  const total = 10 * quantity;
  const formatted = `$${total}`;

  return <span>{formatted}</span>;
}

// What the compiler produces:
function Pricing() {
  const quantity = signal(1);
  const total = computed(() => 10 * quantity.value);
  const formatted = computed(() => `$${total.value}`);
  // ...
}
```

Computeds are lazy and cached -- they only recompute when their dependencies change.

Destructuring also works:

```tsx
function Profile() {
  let user = { name: 'Alice', age: 30 };
  const { name, age } = user;

  return <span>{name} - {age}</span>;
}
// Compiler produces:
// const name = computed(() => user.name)
// const age = computed(() => user.age)
```

### JSX Text Interpolation

`{expr}` in JSX creates a reactive text node when `expr` depends on signals:

```tsx
<span>{count}</span>
// becomes: __text(() => count.value)
```

Static expressions produce plain text nodes:

```tsx
const title = "Hello";
<span>{title}</span>
// becomes: document.createTextNode(title)
```

### JSX Reactive Attributes

Attributes that depend on signals auto-update:

```tsx
function App() {
  let isActive = false;

  return (
    <div className={isActive ? 'active' : 'inactive'}>
      <button onClick={() => isActive = !isActive}>Toggle</button>
    </div>
  );
}
// The compiler wraps the reactive className in __attr(el, "className", () => ...)
```

### Mutations

The compiler intercepts mutations on signal-backed variables and generates peek/notify calls so the reactivity system is notified:

```tsx
function App() {
  let items = ['a', 'b'];

  // .push(), .splice(), etc. all work:
  items.push('c');
  // compiles to: (items.peek().push('c'), items.notify())

  // Property assignment:
  let user = { name: 'Alice' };
  user.name = 'Bob';
  // compiles to: (user.peek().name = 'Bob', user.notify())

  // Index assignment:
  items[0] = 'z';
  // compiles to: (items.peek()[0] = 'z', items.notify())

  // Object.assign:
  Object.assign(user, { age: 30 });
  // compiles to: (Object.assign(user.peek(), { age: 30 }), user.notify())

  // delete:
  let config = { debug: true };
  delete config.debug;
  // compiles to: (delete config.peek().debug, config.notify())
}
```

### Event Handlers

`onClick`, `onInput`, etc. are transformed to `__on(el, "click", handler)`:

```tsx
<button onClick={() => count++}>+</button>
```

### DO vs DON'T

```tsx
// DON'T -- imperative DOM manipulation
// This ignores the compiler entirely. You're doing its job by hand, badly.
import { signal, effect } from '@vertz/ui';

function Counter() {
  const count = signal(0);
  const label = document.createElement('span');
  effect(() => { label.textContent = String(count.value); });
  const btn = document.createElement('button');
  btn.onclick = () => { count.value++; };
  btn.textContent = '+';
  const div = document.createElement('div');
  div.append(label, btn);
  return div;
}

// DO -- declarative JSX (let the compiler handle reactivity)
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

The declarative version is shorter, clearer, and produces the same (or better) runtime code. The compiler generates exactly the reactive bindings needed -- no more, no less.

---

## Components

Components are functions that return `HTMLElement` (or `Node`). There is no component class, no `render()` method.

### Basic Component

```tsx
function Greeting() {
  return <h1>Hello</h1>;
}

// Use it:
document.body.appendChild(Greeting());
```

### Props

Props are plain objects. For reactive props (values that can change), use getter functions:

```tsx
interface CardProps {
  title: string;        // static -- value captured once
  count: () => number;  // reactive -- getter re-evaluated on access
}

function Card(props: CardProps) {
  return (
    <div>
      <h2>{props.title}</h2>
      <span>{props.count()}</span>
    </div>
  );
}

// Usage:
function App() {
  let n = 0;
  return (
    <div>
      <Card title="Score" count={() => n} />
      <button onClick={() => n++}>+</button>
    </div>
  );
}
```

The `() => n` getter ensures `Card` re-reads the value reactively. A bare `n` would capture the value once and never update.

### Children

Components can accept children via the `children` helper:

```tsx
import { children, type ChildrenAccessor } from '@vertz/ui';

interface PanelProps {
  children: ChildrenAccessor;
}

function Panel(props: PanelProps) {
  const getChildren = children(props.children);
  const el = <div className="panel" />;
  for (const child of getChildren()) {
    (el as HTMLElement).appendChild(child);
  }
  return el;
}
```

### Composition

Components compose by returning DOM nodes. No special syntax needed:

```tsx
function App() {
  return (
    <div>
      {Header()}
      {MainContent()}
      {Footer()}
    </div>
  );
}
```

---

## Conditional Rendering

Use standard JSX conditional patterns. The compiler transforms them into efficient reactive DOM operations with automatic disposal:

```tsx
function Toggle() {
  let show = false;

  return (
    <div>
      {show && <p>Now you see me</p>}
      <button onClick={() => show = !show}>Toggle</button>
    </div>
  );
}
```

Ternaries work too:

```tsx
function StatusBadge() {
  let online = true;

  return (
    <div>
      {online ? <span className="green">Online</span> : <span className="gray">Offline</span>}
    </div>
  );
}
```

Under the hood, the compiler transforms these into `__conditional()` calls that manage DOM insertion, replacement, and cleanup automatically. When the condition changes, the old branch is disposed and the new branch is rendered in place.

### Manual Control

For advanced use cases where you need direct access to the dispose function or more control over the condition lifecycle, you can use `__conditional()` from `@vertz/ui/internals` directly:

```tsx
import { __conditional } from '@vertz/ui/internals';

function Toggle() {
  let show = false;

  return (
    <div>
      {__conditional(
        () => show,
        () => <p>Now you see me</p>,
        () => <p>Now you don't</p>
      )}
      <button onClick={() => show = !show}>Toggle</button>
    </div>
  );
}
```

`__conditional` takes three arguments:

1. `condFn: () => boolean` -- reactive condition
2. `trueFn: () => Node` -- rendered when true
3. `falseFn: () => Node` -- rendered when false

---

## List Rendering

Use `.map()` in JSX with a `key` prop for efficient keyed reconciliation. The compiler transforms it into optimized list operations:

```tsx
function TodoList() {
  let todos = [
    { id: '1', text: 'Learn vertz' },
    { id: '2', text: 'Build something' },
  ];

  return (
    <div>
      <ul>
        {todos.map(todo => <li key={todo.id}>{todo.text}</li>)}
      </ul>
      <button onClick={() => {
        todos = [...todos, { id: String(Date.now()), text: 'New todo' }];
      }}>
        Add
      </button>
    </div>
  );
}
```

The `key` prop is extracted by the compiler for efficient keyed reconciliation -- existing DOM nodes are reused and reordered, not recreated. Always provide a stable, unique key for each item.

### Manual Control

For advanced use cases where you need direct access to the list lifecycle or want to work with the signal directly, you can use `__list()` from `@vertz/ui/internals`:

```tsx
import { signal } from '@vertz/ui';
import { __list } from '@vertz/ui/internals';

function TodoList() {
  const todosSignal = signal([
    { id: '1', text: 'Learn vertz' },
    { id: '2', text: 'Build something' },
  ]);

  const container = <ul /> as HTMLElement;

  __list(
    container,
    todosSignal,
    (todo) => todo.id,             // key function
    (todo) => <li>{todo.text}</li> // render function (called once per key)
  );

  return (
    <div>
      {container}
      <button onClick={() => {
        todosSignal.value = [...todosSignal.value, { id: String(Date.now()), text: 'New todo' }];
      }}>
        Add
      </button>
    </div>
  );
}
```

`__list` arguments:

1. `container: HTMLElement` -- parent element
2. `items: Signal<T[]>` -- reactive array
3. `keyFn: (item: T) => string | number` -- unique key extractor
4. `renderFn: (item: T) => Node` -- creates DOM for each item (called once per key)

---

## Styling

Import from `@vertz/ui/css` or from the main `@vertz/ui` export.

### `css()` -- Scoped Style Blocks

```tsx
import { css } from '@vertz/ui/css';

const styles = css({
  card: ['p:4', 'bg:background', 'rounded:lg'],
  title: ['font:xl', 'weight:bold', 'text:foreground'],
});

function Card() {
  return (
    <div className={styles.classNames.card}>
      <h2 className={styles.classNames.title}>Hello</h2>
    </div>
  );
}
```

Shorthand syntax: `property:value` maps to CSS custom properties and design tokens. Pseudo-states are supported:

```tsx
const button = css({
  root: ['p:4', 'bg:primary', 'hover:bg:primary.700', 'rounded:md'],
});
```

Object form for complex selectors:

```tsx
const fancy = css({
  card: [
    'p:4', 'bg:background',
    { '&::after': ['content:empty', 'block'] },
  ],
});
```

### `variants()` -- Typed Component Variants

```tsx
import { variants } from '@vertz/ui/css';

const button = variants({
  base: ['flex', 'font:medium', 'rounded:md'],
  variants: {
    intent: {
      primary: ['bg:primary.600', 'text:foreground'],
      secondary: ['bg:background', 'text:muted'],
    },
    size: {
      sm: ['text:xs', 'h:8'],
      md: ['text:sm', 'h:10'],
      lg: ['text:base', 'h:12'],
    },
  },
  defaultVariants: { intent: 'primary', size: 'md' },
  compoundVariants: [
    { intent: 'primary', size: 'sm', styles: ['px:2'] },
  ],
});

// Returns a className string:
button({ intent: 'secondary', size: 'sm' }); // => "base_abc secondary_def sm_ghi"
button();                                      // => uses defaults
```

The variant function is fully typed -- TypeScript infers the allowed values for `intent` and `size`.

### `defineTheme()` and `ThemeProvider`

```tsx
import { defineTheme, compileTheme, ThemeProvider } from '@vertz/ui/css';

const theme = defineTheme({
  colors: {
    primary: { 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' },
    background: { DEFAULT: '#ffffff', _dark: '#111827' },
    foreground: { DEFAULT: '#111827', _dark: '#f9fafb' },
  },
  spacing: {
    1: '0.25rem',
    2: '0.5rem',
    4: '1rem',
    8: '2rem',
  },
});

// Generate CSS custom properties:
const compiled = compileTheme(theme);
// compiled.css contains:
//   :root { --color-primary-500: #3b82f6; --color-background: #ffffff; ... }
//   [data-theme="dark"] { --color-background: #111827; ... }

// Apply theme to a subtree:
const app = ThemeProvider({
  theme: 'dark',
  children: [MyApp()],
});
document.body.appendChild(app);
```

Contextual tokens use `DEFAULT` for the base value and `_dark` for the dark variant. The `ThemeProvider` sets `data-theme` on a wrapper element.

### `globalCss()` -- Global Styles

```tsx
import { globalCss } from '@vertz/ui/css';

globalCss({
  '*, *::before, *::after': {
    boxSizing: 'border-box',
    margin: '0',
  },
  body: {
    fontFamily: 'system-ui, sans-serif',
    lineHeight: '1.5',
  },
});
```

Properties use camelCase and are converted to kebab-case. CSS custom properties (`--*`) are passed through as-is.

### `s()` -- Inline Styles

For truly dynamic styles that can't be static:

```tsx
import { s } from '@vertz/ui/css';

function Bar(props: { width: number }) {
  return <div style={s([`w:${props.width}px`, 'h:4', 'bg:primary.500'])} />;
}
```

Pseudo-states are not supported in `s()` -- use `css()` for those.

---

## Data Fetching

Import from `@vertz/ui/query` or the main `@vertz/ui` export.

```tsx
import { query } from '@vertz/ui/query';

function UserProfile() {
  let userId = 1;

  const { data, loading, error, refetch } = query(
    () => fetch(`/api/users/${userId}`).then(r => r.json()),
  );

  return (
    <div>
      {/* data, loading, error are signals -- read .value in reactive contexts */}
      <span>{loading.value ? 'Loading...' : ''}</span>
      <span>{data.value?.name}</span>
      <button onClick={() => userId++}>Next User</button>
      <button onClick={refetch}>Refresh</button>
    </div>
  );
}
```

The thunk runs inside an effect, so reactive dependencies read before the `await` are automatically tracked. When `userId` changes, the query re-fetches.

### Options

```tsx
const result = query(() => fetchData(), {
  initialData: cachedValue,    // skip initial fetch
  debounce: 300,               // debounce re-fetches (ms)
  enabled: true,               // set false to disable
  key: 'custom-cache-key',     // explicit cache key
  cache: myCustomCache,        // custom CacheStore implementation
});
```

### Cleanup

```tsx
const { dispose } = query(() => fetchData());

// Stop the reactive effect and clean up in-flight requests:
dispose();
```

`revalidate()` is an alias for `refetch()`.

---

## Routing

Import from `@vertz/ui/router` or the main `@vertz/ui` export.

### Define Routes

```tsx
import { defineRoutes, createRouter, createLink, createOutlet } from '@vertz/ui/router';

const routes = defineRoutes({
  '/': {
    component: () => HomePage(),
  },
  '/users/:id': {
    component: () => UserPage(),
    loader: async ({ params, signal }) => {
      const res = await fetch(`/api/users/${params.id}`, { signal });
      return res.json();
    },
    errorComponent: (error) => <div>Failed: {error.message}</div>,
  },
  '/about': {
    component: () => AboutPage(),
  },
});
```

### Create Router

```tsx
const router = createRouter(routes, window.location.pathname + window.location.search);

// Reactive state:
router.current;      // Signal<RouteMatch | null>
router.loaderData;   // Signal<unknown[]>
router.loaderError;  // Signal<Error | null>
router.searchParams; // Signal<Record<string, unknown>>

// Navigation:
await router.navigate('/users/42');
await router.navigate('/home', { replace: true });

// Re-run loaders:
await router.revalidate();

// Cleanup:
router.dispose();
```

### Link Component

```tsx
const Link = createLink(router.current, (url) => router.navigate(url));

function Nav() {
  return (
    <nav>
      {Link({ href: '/', children: 'Home', activeClass: 'active' })}
      {Link({ href: '/about', children: 'About', activeClass: 'active' })}
    </nav>
  );
}
```

Links intercept clicks for SPA navigation (modifier-key clicks still open new tabs). The `activeClass` is applied reactively when the link's `href` matches the current path.

### Nested Routes and Outlets

```tsx
import { createContext } from '@vertz/ui';
import { createOutlet, type OutletContext } from '@vertz/ui/router';

const outletCtx = createContext<OutletContext>();
const Outlet = createOutlet(outletCtx);

const routes = defineRoutes({
  '/dashboard': {
    component: () => DashboardLayout(),
    children: {
      '/': {
        component: () => DashboardHome(),
      },
      '/settings': {
        component: () => DashboardSettings(),
      },
    },
  },
});
```

### Search Params

```tsx
import { parseSearchParams, useSearchParams } from '@vertz/ui/router';

// Parse raw URLSearchParams, optionally through a schema:
const params = parseSearchParams(new URLSearchParams('?page=1&sort=name'), mySchema);

// Read reactively inside an effect or computed:
const search = useSearchParams(router.searchParams);
```

### Type-Safe Params

Route params are extracted from the path pattern at the type level:

```tsx
import type { ExtractParams } from '@vertz/ui/router';

type Params = ExtractParams<'/users/:id/posts/:postId'>;
// => { id: string; postId: string }
```

---

## Forms

Import from `@vertz/ui/form` or the main `@vertz/ui` export.

```tsx
import { form } from '@vertz/ui/form';
import type { SdkMethod } from '@vertz/ui/form';

// An SDK method with endpoint metadata (typically from @vertz/codegen):
declare const createUser: SdkMethod<{ name: string; email: string }, { id: string }>;

const userForm = form(createUser, {
  schema: userSchema, // any object with parse(data): T
});

function CreateUserForm() {
  return (
    <form
      {...userForm.attrs()}
      onSubmit={userForm.handleSubmit({
        onSuccess: (result) => console.log('Created:', result.id),
        onError: (errors) => console.log('Errors:', errors),
      })}
    >
      <input name="name" />
      {userForm.error('name') && <span className="error">{userForm.error('name')}</span>}

      <input name="email" type="email" />
      {userForm.error('email') && <span className="error">{userForm.error('email')}</span>}

      <button type="submit" disabled={userForm.submitting.value}>
        {userForm.submitting.value ? 'Saving...' : 'Create'}
      </button>
    </form>
  );
}
```

### API

- `form(sdkMethod, { schema })` -- creates a form instance
- `.attrs()` -- returns `{ action, method }` for progressive enhancement
- `.handleSubmit({ onSuccess?, onError? })` -- returns an event handler or accepts `FormData` directly
- `.error(field)` -- returns the error message for a field (reactive)
- `.submitting` -- `Signal<boolean>` for loading state

The schema can be any object with a `parse(data: unknown): T` method (compatible with `@vertz/schema`). On failure, if the error has a `fieldErrors` property, those are surfaced per-field. Otherwise, a generic `_form` error is set.

---

## Lifecycle

### `onMount(callback)`

Runs once when the component is created. Does not re-run on signal changes. Supports `onCleanup` inside for teardown:

```tsx
import { onMount, onCleanup } from '@vertz/ui';

function Timer() {
  let elapsed = 0;

  onMount(() => {
    const id = setInterval(() => elapsed++, 1000);
    onCleanup(() => clearInterval(id));
  });

  return <span>{elapsed}s</span>;
}
```

### `onCleanup(fn)`

Registers a teardown function with the current disposal scope. Called in LIFO order when the scope is disposed:

```tsx
import { onCleanup } from '@vertz/ui';

function WebSocketView() {
  const ws = new WebSocket('wss://example.com');
  onCleanup(() => ws.close());
  // ...
}
```

Must be called inside a disposal scope (`effect()`, `watch()`, `onMount()`, or a `pushScope()/popScope()` block). Throws `DisposalScopeError` if called outside a scope.

### `watch(dep, callback)`

Watches a reactive dependency and runs the callback whenever it changes. Runs immediately with the current value:

```tsx
import { watch, onCleanup } from '@vertz/ui';

function Logger() {
  let count = 0;

  watch(
    () => count,
    (value) => {
      console.log('count changed to', value);
      const id = setTimeout(() => console.log('delayed log', value), 1000);
      onCleanup(() => clearTimeout(id));
    }
  );

  return <button onClick={() => count++}>+</button>;
}
```

The `dep` function is the only tracked dependency. The callback runs untracked, so signal reads inside it don't create additional subscriptions. Before each re-run, any `onCleanup` registered in the previous callback execution runs first.

### `ref()`

Access a DOM element after creation:

```tsx
import { ref, onMount } from '@vertz/ui';

function FocusInput() {
  const inputRef = ref<HTMLInputElement>();

  onMount(() => {
    inputRef.current?.focus();
  });

  // Assign ref.current after element creation:
  const el = <input /> as HTMLInputElement;
  inputRef.current = el;

  return el;
}
```

### Context

Share values down the component tree without prop-drilling:

```tsx
import { createContext, useContext } from '@vertz/ui';

const ThemeCtx = createContext<'light' | 'dark'>('light');

function App() {
  const el = document.createDocumentFragment();

  ThemeCtx.Provider('dark', () => {
    el.appendChild(ThemedCard());
  });

  return el;
}

function ThemedCard() {
  const theme = useContext(ThemeCtx); // => 'dark'
  return <div className={theme === 'dark' ? 'card-dark' : 'card-light'}>Themed</div>;
}
```

`useContext` works in both synchronous component code and inside `effect`/`watch` callbacks (the context scope is captured when the effect is created).

### ErrorBoundary

Catch errors thrown by child components:

```tsx
import { ErrorBoundary } from '@vertz/ui';

function App() {
  return ErrorBoundary({
    children: () => RiskyComponent(),
    fallback: (error, retry) => (
      <div>
        <p>Something broke: {error.message}</p>
        <button onClick={retry}>Retry</button>
      </div>
    ),
  });
}
```

The `retry` function re-invokes `children()` and swaps the result into the DOM if it succeeds.

### Suspense

Handle async boundaries (components that throw promises):

```tsx
import { Suspense } from '@vertz/ui';

function App() {
  return Suspense({
    children: () => AsyncComponent(),
    fallback: () => <div>Loading...</div>,
  });
}
```

If `children()` throws a `Promise`, the fallback is rendered. When the promise resolves, `children()` is called again and the result replaces the fallback in the DOM. Non-promise errors are re-thrown for `ErrorBoundary` to catch.

---

## Primitives

`@vertz/primitives` provides headless, WAI-ARIA compliant UI components. These are intentionally imperative -- they create pre-wired DOM elements with proper ARIA attributes, keyboard handling, and state management.

```bash
npm install @vertz/primitives
```

Available components: `Accordion`, `Button`, `Checkbox`, `Combobox`, `Dialog`, `Menu`, `Popover`, `Progress`, `Radio`, `Select`, `Slider`, `Switch`, `Tabs`, `Toast`, `Tooltip`.

### Usage Pattern

Primitives return DOM elements and reactive state. Compose them with your JSX:

```tsx
import { Button } from '@vertz/primitives';
import { css } from '@vertz/ui/css';

const styles = css({
  btn: ['px:4', 'py:2', 'bg:primary.600', 'text:foreground', 'rounded:md'],
});

function MyButton() {
  const { root, state } = Button.Root({
    disabled: false,
    onPress: () => console.log('pressed!'),
  });

  root.textContent = 'Click me';
  root.classList.add(styles.classNames.btn);

  return root;
}
```

Primitives handle:
- ARIA roles and attributes (`role="button"`, `aria-pressed`, `aria-expanded`, etc.)
- Keyboard interaction (Enter/Space for buttons, arrow keys for menus, Escape for dialogs)
- Focus management
- State via signals (`state.disabled`, `state.pressed`, `state.open`, etc.)

You provide the styling. They provide the behavior and accessibility.

---

## When to Use `effect()`

`effect()` is a low-level reactive primitive. In most cases, the compiler handles reactivity for you through JSX. Reach for `effect()` only when you need side effects that the compiler cannot express:

### Appropriate Uses

```tsx
import { effect, onCleanup } from '@vertz/ui';

function Analytics() {
  let page = '/home';

  // Side effect: send analytics
  effect(() => {
    sendPageView(page);
  });

  // Third-party library integration
  effect(() => {
    chart.updateData(chartData);
  });

  // DOM operations the compiler can't handle
  effect(() => {
    element.scrollTo({ top: scrollPosition, behavior: 'smooth' });
  });

  // localStorage sync
  effect(() => {
    localStorage.setItem('preference', preference);
  });
}
```

### NOT Appropriate

```tsx
// DON'T: manual DOM text updates -- use JSX interpolation instead
effect(() => { span.textContent = String(count); });
// DO:
<span>{count}</span>

// DON'T: manual attribute updates -- use JSX attributes instead
effect(() => { div.className = isActive ? 'on' : 'off'; });
// DO:
<div className={isActive ? 'on' : 'off'} />

// DON'T: manual child rendering -- use JSX conditionals and .map() instead
effect(() => {
  container.innerHTML = '';
  if (show) container.appendChild(createChild());
});
```

`effect()` returns a dispose function. It auto-registers with the current disposal scope, so cleanup happens automatically when the parent scope is disposed:

```tsx
const dispose = effect(() => {
  console.log('count is', count);
});

// Manual cleanup if needed:
dispose();
```

### `batch()`

Group multiple signal writes to avoid redundant effect runs:

```tsx
import { batch } from '@vertz/ui';

batch(() => {
  firstName = 'Jane';
  lastName = 'Doe';
  age = 30;
});
// Effects that depend on any of these signals run once, not three times.
```

### `untrack()`

Read a signal without subscribing to it:

```tsx
import { untrack } from '@vertz/ui';

effect(() => {
  const tracked = count;                    // subscribes to count
  const notTracked = untrack(() => other);  // reads other without subscribing
});
```
