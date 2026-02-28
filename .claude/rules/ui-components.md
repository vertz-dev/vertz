# Writing @vertz/ui Components

Rules for writing components and examples using `@vertz/ui`. These conventions ensure consistency across all example code and serve as the reference implementation for framework users.

## Component Signatures

### Destructure props in parameters

```tsx
// WRONG
export function TaskCard(props: TaskCardProps): HTMLElement {
  const { task, onClick } = props;

// RIGHT
export function TaskCard({ task, onClick }: TaskCardProps) {
```

Never destructure props in the function body. The only exception is unused props, where `_props: PropsType` is acceptable to satisfy the type signature.

### Don't annotate return types

Let TypeScript infer component return types. The JSX factory already maps tag names to specific element types via `HTMLElementTagNameMap` (e.g., `<form>` returns `HTMLFormElement`, `<div>` returns `HTMLDivElement`). Explicit `: HTMLElement` annotations are a lossy upcast.

```tsx
// WRONG — loses type specificity
export function TaskForm({ onSuccess }: TaskFormProps): HTMLElement {

// RIGHT — TypeScript infers the correct element type
export function TaskForm({ onSuccess }: TaskFormProps) {
```

### Props interface naming

Use `ComponentNameProps` for the interface. Callback props use `on` prefix (`onClick`, `onSuccess`, `onDelete`).

## Reactivity

### `let` for local state

The compiler transforms `let` declarations into signals. Mutate state via direct assignment.

```tsx
let count = 0;
let isOpen = false;

return (
  <button onClick={() => { count++; isOpen = true; }}>
    {count}
  </button>
);
```

Never call `signal()` manually for local state — use `let`.

### `const` for derived values

The compiler wraps `const` declarations that depend on signals/query/form in `computed()`.

```tsx
const tasks = query(() => fetchTasks(), { key: 'task-list' });

// Compiler classifies these as computed automatically
const errorMsg = tasks.error ? `Failed: ${tasks.error.message}` : '';
const filtered = statusFilter === 'all'
  ? tasks.data.items
  : tasks.data.items.filter((t) => t.status === statusFilter);
```

Never use `let` + `effect()` as a bridge to sync derived values.

### `watch()` for side effects, not `effect()`

Use `watch()` to react to external signal changes. Reserve `effect()` for rare cases where `const` derivation is insufficient.

```tsx
// RIGHT — watch() for side effects
watch(
  () => settings.theme.value,
  (theme) => {
    console.log(`Theme changed to: ${theme}`);
  },
);

// WRONG — effect() as a bridge
let currentTheme = '';
effect(() => {
  currentTheme = settings.theme.value;
});
```

## JSX

### Fully declarative — no imperative DOM manipulation

**The rule:** All code that uses `@vertz/ui` must be fully declarative. No `appendChild`, `innerHTML`, `textContent` assignment, `className` assignment, `setAttribute`, `document.createElement`, or any other imperative DOM API. This applies to components, pages, the app shell, examples — everything.

```tsx
// WRONG — imperative
const el = <div />;
el.textContent = title;
el.className = styles.panel;

// RIGHT — declarative
return <div class={styles.panel}>{title}</div>;
```

**The only exception:** `@vertz/ui-primitives`. Primitives are the lowest layer — they create and wire up raw DOM elements, ARIA attributes, and event listeners imperatively by design. That's their job. Imperative DOM code belongs there and nowhere else.

**If you can't express something declaratively, it's a framework gap.** Do not work around it with imperative code. Stop, identify the missing abstraction in `@vertz/ui` or `@vertz/ui-primitives`, and fix the framework. A component author should never need `appendChild`, `setAttribute`, or `document.createElement` — if they do, the framework is incomplete.

Examples of gaps that were caught this way:
- Needed imperative route swapping → built `RouterView` (declarative)
- Needed imperative theme wiring → built `ThemeProvider` context (declarative)

**Review gate question:** Does any code outside `@vertz/ui-primitives` use imperative DOM APIs? If yes, either move that logic into a primitive, add a declarative abstraction to `@vertz/ui`, or fix the component to use existing declarative APIs.

### Use JSX for custom components — never call them as functions

Custom components must be rendered via JSX, not invoked as function calls. Calling a component as a function bypasses the declarative model — it's imperative execution disguised as composition.

```tsx
// WRONG — imperative function call
const card = TaskCard({ task, onClick: handleClick });
return <div>{card}</div>;

// WRONG — inline function call
return (
  <div>
    {TaskCard({ task, onClick: handleClick })}
  </div>
);

// RIGHT — declarative JSX
return (
  <div>
    <TaskCard task={task} onClick={handleClick} />
  </div>
);
```

This applies to all custom components. If a component can't be used via JSX, that's a framework gap — fix the component or the framework, don't fall back to function calls.

### Conditionals use `&&` or ternary

```tsx
{isLoading && <div>Loading...</div>}
{error ? <div>{errorMsg}</div> : <div>{content}</div>}
```

### Lists use `.map()` with `key`

```tsx
{tasks.map((task) => (
  <TaskCard key={task.id} task={task} onClick={handleClick} />
))}
```

### Reactive attributes

Signal-derived expressions flow directly into attributes:

```tsx
<div
  aria-hidden={isOpen ? 'false' : 'true'}
  style={isOpen ? '' : 'display: none'}
  class={button({ intent: isActive ? 'primary' : 'ghost', size: 'sm' })}
  disabled={form.submitting}
/>
```

## Styling

### `css()` for scoped styles, `variants()` for parameterized styles

```tsx
const styles = css({
  panel: ['bg:background', 'rounded:lg', 'p:6'],
  title: ['font:lg', 'font:semibold', 'text:foreground'],
});

// Usage: class={styles.panel}
```

```tsx
const button = variants({
  base: ['inline-flex', 'rounded:md', 'font:medium'],
  variants: {
    intent: {
      primary: ['bg:primary.600', 'text:white'],
      danger: ['bg:danger.500', 'text:white'],
    },
    size: { sm: ['text:xs', 'px:3'], md: ['text:sm', 'px:4'] },
  },
  defaultVariants: { intent: 'primary', size: 'md' },
});

// Usage: class={button({ intent: 'danger', size: 'sm' })}
```

Use inline `style` only for truly dynamic values or one-off layout (flex gaps, margins).

## Data Fetching & Forms

### `query()` — auto-disposed

```tsx
const tasks = query(() => fetchTasks(), { key: 'task-list' });
```

`query()` auto-registers disposal with the current component/page scope via `_tryOnCleanup()`. No manual `onMount(() => () => tasks.dispose())` needed. The dispose stops reactive effects, timers, and in-flight tracking — but preserves the shared cache so navigating back serves data instantly.

Signal properties (`.data`, `.loading`, `.error`) auto-unwrap in JSX. Use `.value` only outside JSX (in `watch()`, event handlers, etc.).

### `form()` with schema

```tsx
const taskForm = form(taskApi.create, {
  schema: createTaskSchema,
  onSuccess,
});

return (
  <form action={taskForm.action} method={taskForm.method} onSubmit={taskForm.onSubmit}>
    <input name="title" />
    <span>{taskForm.title.error}</span>
    <button type="submit" disabled={taskForm.submitting}>Submit</button>
  </form>
);
```

## Context

Use `createContext()` + `.Provider()` + `useContext()`. Always create a convenience `use*` accessor that throws on missing provider.

```tsx
export const SettingsContext = createContext<SettingsContextValue>();

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be called within SettingsContext.Provider');
  return ctx;
}
```

## Router

### `RouterContext` + `useRouter()` for navigation

Pages access the router via `useRouter()` context instead of receiving a `navigate` prop. This eliminates prop threading and keeps page signatures clean.

```tsx
// App shell — wrap in RouterContext.Provider
RouterContext.Provider(appRouter, () => {
  const view = RouterView({ router: appRouter });
  // ... shell layout uses {view}
});

// App-level typed router hook (recommended)
// Create once in router.ts, use everywhere for typed navigate()
import type { InferRouteMap } from '@vertz/ui';
import { useRouter } from '@vertz/ui';
export function useAppRouter() {
  return useRouter<InferRouteMap<typeof routes>>();
}

// Page component — access typed router via useAppRouter()
export function TaskListPage() {
  const { navigate } = useAppRouter();
  navigate('/tasks/new');   // typed — only valid paths accepted
}

// Page with typed route params — use useParams<TPath>()
export function TaskDetailPage() {
  const { id: taskId } = useParams<'/tasks/:id'>();
  // taskId: string — fully typed, throws if no route matched
}

// Alternative: untyped access via useRouter() (backward compat)
export function SomeWidget() {
  const router = useRouter();
  router.navigate('/anything'); // accepts any string
  const taskId = router.current.value?.params.id ?? '';
}
```

### `RouterView` for declarative route rendering

Use `RouterView` instead of manual `watch()` + DOM swapping. It handles sync components, async/lazy components, stale resolution guards, and page cleanup automatically.

```tsx
// WRONG — manual imperative route rendering
watch(() => appRouter.current.value, (match) => {
  main.innerHTML = '';
  main.appendChild(match.route.component());
});

// RIGHT — declarative with RouterView
const view = RouterView({
  router: appRouter,
  fallback: () => <div>Page not found</div>,
});
```

### Route definitions — no prop threading

Route component factories call page functions without props. Pages get everything they need from `useRouter()`.

```tsx
// WRONG — threading navigate through every route
'/': { component: () => TaskListPage({ navigate: (url) => router.navigate(url) }) }

// RIGHT — pages use useRouter() internally
'/': { component: () => TaskListPage() }
```
