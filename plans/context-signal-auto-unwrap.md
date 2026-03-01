# Context Signal Auto-Unwrap

## Problem

The compiler abstracts signals from users — `let` becomes a signal, `const` becomes computed, and APIs like `query()` and `form()` auto-unwrap their signal properties (`.data`, `.loading`, `.error`) so users never write `.value` or `.peek()`.

**Context values break this abstraction.** When a context returns an object with `Signal<T>` properties, users are forced to manually call `.peek()` or `.value`:

```tsx
// Current: signal abstraction leaks
const settings = useSettings();
let currentTheme = settings.theme.peek();  // user must know about .peek()
```

This violates the framework's core principle: users should never interact with signal internals. They use `let` and `const` — the compiler handles reactivity.

## Affected Code

### Context definitions exposing `Signal<T>` in their types

- `examples/task-manager/src/lib/settings-context.ts` — `theme: Signal<Settings['theme']>`, `defaultPriority: Signal<TaskPriority>`
- `examples/entity-todo/src/lib/settings-context.ts` — `theme: Signal<ThemeMode>`

### Consumer code using `.peek()` / `.value`

- `examples/task-manager/src/app.tsx` — `settings.theme.peek()` (lines 94, 162)
- `examples/task-manager/src/pages/settings.tsx` — `settings.theme.peek()`, `settings.defaultPriority.peek()` (lines 40-41)
- `examples/entity-todo/src/app.tsx` — `settings.theme.peek()` (lines 57, 92)
- `packages/ui/src/router/router-context.ts` — `router.current.value?.params` (line 27)

### Custom `use*` hooks wrapping `useContext`

- `examples/task-manager/src/lib/settings-context.ts` — `useSettings()`
- `examples/entity-todo/src/lib/settings-context.ts` — `useSettings()`
- `packages/ui/src/router/router-context.ts` — `useRouter()`, `useParams()`

## Root Cause Analysis

The signal API registry (`packages/ui-compiler/src/signal-api-registry.ts`) tells the compiler which functions return objects with signal properties:

```typescript
const SIGNAL_API_REGISTRY = {
  query:        { signalProperties: new Set(['data', 'loading', 'error']), ... },
  form:         { signalProperties: new Set(['submitting', 'dirty', 'valid']), ... },
  createLoader: { signalProperties: new Set(['data', 'loading', 'error']), ... },
};
```

`useContext` is not in this registry. And even if it were, the registry uses a **static shape** — every `query()` returns the same signal properties. Context values have **user-defined shapes** that vary per context. The registry model doesn't fit.

### Why cross-file analysis is NOT needed

The compiler is per-file, single-pass (like Babel). Initially this seemed like a blocker — the Provider and consumer are in different files, so the compiler can't see the Provider's signals when compiling the consumer.

But the compiler already solves this exact problem for **component props**. When a parent passes a reactive value as a prop:

```tsx
<TaskItem task={tasks.data} />
```

The compiler transforms it to a **getter at the call site** (the parent):

```tsx
TaskItem({ get task() { return tasks.data.value; } })
```

The child accesses `props.task` normally — the getter fires, reads the signal, effects track it. No cross-file analysis needed. All the work happens in the parent's compilation unit.

## Proposed Solution

Apply the same getter mechanism to Provider `value` props. The compiler already knows which variables are signals at the Provider site.

### Before (current)

User writes:

```tsx
function SettingsProvider({ children }: { children: unknown }) {
  let theme: ThemeMode = 'light';
  const setTheme = (t: ThemeMode) => { theme = t; };

  return (
    <SettingsContext.Provider value={{ theme, setTheme }}>
      {children}
    </SettingsContext.Provider>
  );
}
```

Compiler output today (signals transformed, but value object passes raw signals):

```tsx
function SettingsProvider({ children }: { children: unknown }) {
  const theme = signal<ThemeMode>('light');
  const setTheme = (t: ThemeMode) => { theme.value = t; };

  return (
    SettingsContext.Provider({
      value: { theme: theme.value, setTheme },  // reads value once, not reactive!
      children: () => children,
    })
  );
}
```

Consumer must use `.peek()` because the context type exposes `Signal<T>`:

```tsx
const settings = useContext(SettingsContext);
let currentTheme = settings.theme.peek();  // manual unwrap
```

### After (proposed)

Same user code, but the compiler generates getters for signal properties in the `value` object:

```tsx
function SettingsProvider({ children }: { children: unknown }) {
  const theme = signal<ThemeMode>('light');
  const setTheme = (t: ThemeMode) => { theme.value = t; };

  return (
    SettingsContext.Provider({
      value: { get theme() { return theme.value; }, setTheme },  // getter!
      children: () => children,
    })
  );
}
```

Consumer just accesses the property — the getter fires, reads the signal, effects track it:

```tsx
const settings = useContext(SettingsContext);
let currentTheme = settings.theme;  // just works — getter unwraps the signal
```

### What changes

1. **Context type definitions** — Properties change from `Signal<T>` to `T`:
   ```typescript
   // Before
   interface SettingsContextValue {
     theme: Signal<ThemeMode>;
     setTheme: (theme: ThemeMode) => void;
   }

   // After
   interface SettingsContextValue {
     theme: ThemeMode;
     setTheme: (theme: ThemeMode) => void;
   }
   ```

2. **Compiler JSX transformer** — When the compiler sees a `.Provider` call with a `value` prop containing an object literal, it applies the same getter transformation it already uses for component props: signal-classified variables become getters, everything else stays plain.

3. **Consumer code** — Remove all `.peek()` / `.value` calls on context-returned values. Just access the property directly.

4. **Custom `use*` hooks** — These become optional convenience wrappers (for the error-on-missing-provider pattern). They don't need signal awareness. For v1, it's acceptable to require `useContext(SomeContext)` directly in the component, same as `query()` and `form()` must be called directly. Custom hooks can be supported later.

### Constraints (v1)

- `useContext()` must be called directly inside the component (same as `query()` and `form()`). The compiler needs to see the call to know it's a context access.
- Custom `use*` hooks that wrap `useContext` won't get auto-unwrapping from the compiler. Users should call `useContext` directly for now. This creates some friction but keeps the compiler simple.
- Context values should be provided via object literals in the `value` prop so the compiler can analyze the shape statically. Dynamic value objects (e.g., passing a variable) would not get getter transformation.

## Manifesto Alignment

- **Explicit over implicit** — The context type shows plain values (`theme: ThemeMode`), not wrapped signals. What you see is what you get.
- **Compile-time over runtime** — Getters are generated at compile time. No runtime proxy, no wrapper objects.
- **One way to do things** — Same mechanism as component props. Signals are always hidden by the compiler, whether in props, query results, or context values.
- **LLM-first** — An LLM generating code doesn't need to know about `.peek()` or `.value`. It just uses the context value's properties directly.

## Non-Goals

- **Custom `use*` hook support** — Deferred. For v1, `useContext()` must be called directly in the component.
- **Dynamic value objects** — If the Provider passes a variable instead of an object literal, the compiler won't transform it. The object literal pattern is the supported path.
- **Nested signal properties** — Only top-level properties of the value object are getter-transformed. Deeply nested signals are out of scope for v1.

## Unknowns

### How does the JSX transformer currently handle Provider value props?

**Needs investigation.** The JSX transformer already generates getters for component props. We need to verify:
- Does it recognize `SomeContext.Provider` as a component call?
- Does it analyze the `value` prop's object literal for reactive properties?
- If not, what changes are needed to the JSX analyzer + transformer?

### Does `useContext` need compiler recognition?

**Discussion-resolvable.** If the Provider generates getters correctly, the consumer side might not need any compiler changes — `useContext` returns the object as-is, and getters just work. But the consumer's type would need to reflect the unwrapped values, not `Signal<T>`. This may require changes to how `createContext<T>` is typed.

### What about `watch()` on context values?

If a consumer wants to react to context changes via `watch()`:
```tsx
const settings = useContext(SettingsContext);
watch(() => settings.theme, (newTheme) => { ... });
```
The getter returns a plain value, so `watch()` would work correctly — it re-evaluates the getter expression, which reads the signal, which is tracked. This should work but needs verification.

## E2E Acceptance Test

```tsx
// Provider component
function ThemeProvider({ children }: { children: unknown }) {
  let theme: 'light' | 'dark' = 'light';
  const setTheme = (t: 'light' | 'dark') => { theme = t; };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// Consumer component — NO .peek(), NO .value
function ThemeDisplay() {
  const ctx = useContext(ThemeContext);
  // ctx.theme is 'light' | 'dark', not Signal<'light' | 'dark'>
  return <div data-testid="theme">{ctx.theme}</div>;
}

// Test
const root = ThemeProvider({ children: () => ThemeDisplay() });
expect(root.querySelector('[data-testid="theme"]').textContent).toBe('light');

// Trigger change
ctx.setTheme('dark');
expect(root.querySelector('[data-testid="theme"]').textContent).toBe('dark');
```

The test passes without any `.peek()` or `.value` — the getter mechanism handles reactivity transparently.
