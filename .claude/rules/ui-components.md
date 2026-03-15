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

No `appendChild`, `innerHTML`, `textContent`, `className`, `setAttribute`, `document.createElement` — anywhere. This applies to ALL packages including `@vertz/ui-primitives`. If you can't express it declaratively, it's a framework gap — fix the framework.

```tsx
// WRONG
const el = <div />;
el.textContent = title;

// WRONG — even in ui-primitives
const indicator = document.createElement('span');
indicator.setAttribute('data-part', 'indicator');
root.appendChild(indicator);

// RIGHT
return <div class={styles.panel}>{title}</div>;

// RIGHT — in ui-primitives
return (
  <button role="checkbox" class={classes?.root}>
    <span data-part="indicator" class={classes?.indicator} />
  </button>
);
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

## Theme Components — Prefer Over Raw HTML

When a themed component exists, use it instead of raw HTML elements with manual class names.

### Setup

Use `configureTheme()` (not `configureThemeBase`) and export components:

```tsx
// src/styles/theme.ts
import { configureTheme } from '@vertz/theme-shadcn';

const { theme, globals, styles, components } = configureTheme({
  palette: 'zinc',
  radius: 'md',
});

export const appTheme = theme;
export const themeGlobals = globals;
export const themeStyles = styles;
export const themeComponents = components;
```

### Using Components

```tsx
import { themeComponents } from '../styles/theme';

const { Button, Input } = themeComponents;
const { AlertDialog } = themeComponents.primitives;

// RIGHT — use theme components
<Button intent="primary" size="md">Submit</Button>
<Input placeholder="Enter text" />

// WRONG — raw HTML with manual styles
<button class={button({ intent: 'primary', size: 'md' })}>Submit</button>
<input class={inputStyles.base} placeholder="Enter text" />
```

### Available Components

**Direct** (from `themeComponents`): `Button`, `Input`, `Label`, `Badge`, `Textarea`, `Card` suite, `Table` suite, `Avatar` suite, `FormGroup` suite

**Primitives** (from `themeComponents.primitives`): `AlertDialog`, `Dialog`, `Tabs`, `Select`, `DropdownMenu`, `Popover`, `Sheet`, `Tooltip`, `Accordion` — all with sub-components (`.Trigger`, `.Content`, `.Footer`, etc.)

### When to Use `css()` Instead

Use `css()` for layout-specific styles that don't correspond to a theme component — containers, grids, page layout, spacing between sections. Theme components handle their own styling.

## Dialogs

### Composable `<AlertDialog>` for inline confirmations

```tsx
const { Button } = themeComponents;
const { AlertDialog } = themeComponents.primitives;

<AlertDialog>
  <AlertDialog.Trigger>
    <Button intent="danger" size="sm">Delete</Button>
  </AlertDialog.Trigger>
  <AlertDialog.Content>
    <AlertDialog.Title>Delete task?</AlertDialog.Title>
    <AlertDialog.Description>This action cannot be undone.</AlertDialog.Description>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action onClick={handleDelete}>Delete</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog>
```

### `useDialogStack()` for imperative/stacked dialogs

Use when you need promise-based results, multiple stacked dialogs, or dialogs opened from event handlers:

```tsx
const dialogs = useDialogStack();

const confirmed = await dialogs.open(ConfirmDialog, { message: 'Delete?' });
if (confirmed) handleDelete();
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
  navigate({ to: '/tasks/new' });
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
'/': { component: () => TaskListPage({ navigate: (url) => router.navigate({ to: url }) }) }

// RIGHT
'/': { component: () => TaskListPage() }
```

## Writing Library Packages (ui-primitives, theme-shadcn)

### The Vertz compiler builds libraries too

The `createVertzLibraryPlugin()` from `@vertz/ui-compiler` runs the full Vertz compiler on `.tsx` files during library builds. This means **library code gets the same reactive transforms as app code**:

- `let` → `signal()` (reactive local state)
- `const derived = x + y` → `computed()` (derived values)
- JSX attributes referencing reactive values → getter-based reactivity

**There is NO reason to write imperative DOM code.** The old pattern of calling factory APIs (`Checkbox.Root()`, `Slider.Root()`) and imperatively modifying the returned elements is obsolete. Write declarative JSX instead.

### How to write a primitive component

```tsx
// checkbox-composed.tsx — CORRECT: fully declarative JSX

function ComposedCheckboxRoot({
  children,
  classes,
  defaultChecked = false,
  disabled = false,
  onCheckedChange,
}: ComposedCheckboxProps) {
  // `let` becomes a signal — the compiler handles reactivity
  let checked: CheckedState = defaultChecked;

  function toggle() {
    if (disabled) return;
    checked = checked === 'mixed' ? true : !checked;
    onCheckedChange?.(checked);
  }

  // Full declarative JSX structure — no factory wrapping
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={ariaCheckedFor(checked)}
      data-state={dataStateFor(checked)}
      disabled={disabled}
      class={classes?.root}
      onClick={toggle}
    >
      <span data-part="indicator" data-state={dataStateFor(checked)} class={classes?.indicator} />
      {children}
    </button>
  );
}
```

### WRONG: wrapping a factory and modifying the result

```tsx
// WRONG — calling a factory and imperatively modifying the returned element
function ComposedCheckboxRoot({ children, classes, ...opts }: ComposedCheckboxProps) {
  const root = Checkbox.Root(opts);              // ← factory call
  root.className = classes?.root;                // ← imperative
  const indicator = document.createElement('span'); // ← imperative
  indicator.setAttribute('data-part', 'indicator'); // ← imperative
  root.appendChild(indicator);                   // ← imperative
  return root;
}
```

### Build configuration

In `bunup.config.ts`, use `createVertzLibraryPlugin()` to compile `.tsx` files:

```ts
import { createVertzLibraryPlugin } from '@vertz/ui-compiler';
import { defineConfig } from 'bunup';

export default defineConfig({
  entry: ['src/index.ts'],
  dts: true,
  plugins: [createVertzLibraryPlugin()],
  external: ['@vertz/ui', '@vertz/ui/internals'],
});
```

### Test configuration

In `test-compiler-plugin.ts`, use `compile()` from `@vertz/ui-compiler` for `.tsx` files:

```ts
import { compile } from '@vertz/ui-compiler';
import { plugin } from 'bun';

plugin({
  name: 'vertz-test-compiler',
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, async (args) => {
      const source = await Bun.file(args.path).text();
      const result = compile(source, { filename: args.path, target: 'dom' });
      return { contents: result.code, loader: 'ts' };
    });
  },
});
```

### Key points

- **`let` works for reactive state** — the compiler transforms it to signals
- **JSX attributes are reactive** — `aria-checked={checked ? 'true' : 'false'}` updates when `checked` changes
- **`ref()` for element references** — when you need to imperatively call methods like `.focus()` or read `.getBoundingClientRect()`
- **Never call factory APIs** (`Checkbox.Root()`, `Switch.Root()`) when you can build the same structure in JSX
- **Never use `document.createElement`** — use `<span>`, `<div>`, `<button>` JSX instead
- **`.tsx` extension required** — only `.tsx` files go through the compiler; `.ts` files do not get JSX or reactive transforms
