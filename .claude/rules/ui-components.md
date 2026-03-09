# Writing @vertz/ui Components

## Component Signatures

### Destructure props in parameters

```tsx
// WRONG
export function TaskCard(props: TaskCardProps): HTMLElement {
  const { task, onClick } = props;

// RIGHT
export function TaskCard({ task, onClick }: TaskCardProps) {
```

Exception: `_props: PropsType` for unused props.

### Don't annotate return types

Let TypeScript infer — JSX factory maps tags to specific element types. `: HTMLElement` is a lossy upcast.

```tsx
// WRONG
export function TaskForm({ onSuccess }: TaskFormProps): HTMLElement {

// RIGHT
export function TaskForm({ onSuccess }: TaskFormProps) {
```

### Props interface naming

`ComponentNameProps`. Callback props use `on` prefix (`onClick`, `onSuccess`).

## Reactivity

### `let` for local state — compiler transforms to signals

```tsx
let count = 0;
let isOpen = false;

return (
  <button onClick={() => { count++; isOpen = true; }}>
    {count}
  </button>
);
```

Never call `signal()` manually for local state.

### `const` for derived values — compiler wraps in `computed()`

```tsx
const tasks = query(() => fetchTasks(), { key: 'task-list' });
const errorMsg = tasks.error ? `Failed: ${tasks.error.message}` : '';
const filtered = statusFilter === 'all'
  ? tasks.data.items
  : tasks.data.items.filter((t) => t.status === statusFilter);
```

Never use `let` + `effect()` to sync derived values.

### `watch()` for side effects, not `effect()`

```tsx
watch(
  () => settings.theme.value,
  (theme) => { console.log(`Theme changed to: ${theme}`); },
);
```

## JSX

### Fully declarative — no imperative DOM manipulation

No `appendChild`, `innerHTML`, `textContent`, `className`, `setAttribute`, `document.createElement` outside `@vertz/ui-primitives`. If you can't express it declaratively, it's a framework gap — fix the framework.

```tsx
// WRONG
const el = <div />;
el.textContent = title;

// RIGHT
return <div class={styles.panel}>{title}</div>;
```

### Use JSX for custom components — never call as functions

```tsx
// WRONG
const card = TaskCard({ task, onClick: handleClick });

// RIGHT
<TaskCard task={task} onClick={handleClick} />
```

### Conditionals, lists, reactive attributes

```tsx
{isLoading && <div>Loading...</div>}
{error ? <div>{errorMsg}</div> : <div>{content}</div>}

{tasks.map((task) => (
  <TaskCard key={task.id} task={task} onClick={handleClick} />
))}

<div
  aria-hidden={isOpen ? 'false' : 'true'}
  class={button({ intent: isActive ? 'primary' : 'ghost', size: 'sm' })}
  disabled={form.submitting}
/>
```

## Styling

### `css()` for scoped styles, `variants()` for parameterized

```tsx
const styles = css({
  panel: ['bg:background', 'rounded:lg', 'p:6'],
  title: ['font:lg', 'font:semibold', 'text:foreground'],
});

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
```

Inline `style` only for truly dynamic values or one-off layout.

## Data Fetching & Forms

### `query()` — auto-disposed, signal properties auto-unwrap in JSX

```tsx
const tasks = query(() => fetchTasks(), { key: 'task-list' });
```

Use `.value` only outside JSX (in `watch()`, event handlers).

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

`createContext()` + `.Provider()` + `useContext()`. Always create a `use*` accessor that throws on missing provider.

```tsx
export const SettingsContext = createContext<SettingsContextValue>();

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be called within SettingsContext.Provider');
  return ctx;
}
```

## Router

### `useRouter()` for navigation — no prop threading

```tsx
// Page — access via hook
export function TaskListPage() {
  const { navigate } = useRouter();
  navigate('/tasks/new');
}

// Route params
export function TaskDetailPage() {
  const { id: taskId } = useParams<'/tasks/:id'>();
}
```

Scaffolded apps include `.vertz/generated` in `tsconfig.json`, so the generated
`router.d.ts` file makes `useRouter()` typed by default after codegen runs.

### `RouterView` for declarative route rendering

```tsx
const view = RouterView({
  router: appRouter,
  fallback: () => <div>Page not found</div>,
});
```

### Route definitions — pages use `useRouter()` internally

```tsx
// WRONG
'/': { component: () => TaskListPage({ navigate: (url) => router.navigate(url) }) }

// RIGHT
'/': { component: () => TaskListPage() }
```
