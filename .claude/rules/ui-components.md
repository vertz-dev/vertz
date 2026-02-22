# Writing @vertz/ui Components

Rules for writing components and examples using `@vertz/ui`. These conventions ensure consistency across all example code and serve as the reference implementation for framework users.

## Component Signatures

### Destructure props in parameters

```tsx
// WRONG
export function TaskCard(props: TaskCardProps): HTMLElement {
  const { task, onClick } = props;

// RIGHT
export function TaskCard({ task, onClick }: TaskCardProps): HTMLElement {
```

Never destructure props in the function body. The only exception is unused props, where `_props: PropsType` is acceptable to satisfy the type signature.

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

### Fully declarative — no DOM manipulation

Components must be pure declarative JSX. No `appendChild`, `innerHTML`, `textContent` assignment, `className` assignment, or `setAttribute` in component code.

```tsx
// WRONG
const el = <div />;
el.textContent = title;
el.className = styles.panel;

// RIGHT
return <div class={styles.panel}>{title}</div>;
```

The only acceptable DOM manipulation is in the app shell (router page swapping, ThemeProvider wiring) where framework infrastructure requires it.

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

// Usage: class={styles.classNames.panel}
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

### `query()` with cleanup

```tsx
const tasks = query(() => fetchTasks(), { key: 'task-list' });

onMount(() => {
  onCleanup(() => tasks.dispose());
});
```

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
