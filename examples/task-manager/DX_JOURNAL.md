# DX Journal — @vertz/ui v0.1 Task Manager Demo

**Author:** josh (Developer Advocate)
**Date:** 2026-02-12
**Context:** Post-merge DX audit for @vertz/ui v0.1 (PR #199)

This journal documents every friction point, gotcha, and win encountered while building the Task Manager demo app. The goal is to surface DX issues before they reach external developers.

---

## Wins

### 1. Reactivity model is immediately intuitive

The `signal` / `computed` / `effect` trio just works. If you've used Solid or Preact Signals, there is zero learning curve. The `.value` getter/setter pattern makes tracking explicit and predictable.

```ts
const statusFilter = signal<TaskStatus | 'all'>('all');
const filteredTasks = computed(() => {
  const result = tasksQuery.data.value;
  if (!result) return [];
  const filter = statusFilter.value;
  if (filter === 'all') return result.tasks;
  return result.tasks.filter((t) => t.status === filter);
});
```

This reads cleanly. No magic, no surprise re-renders, no stale closures. The mental model is: "read `.value` inside a tracked context, and the system handles the rest."

**Verdict:** Ship this pattern exactly as-is. It's the best part of the API.

### 2. `query()` is well-designed for real apps

The `query()` API handles the common cases cleanly: loading state, error state, caching, refetch, and reactive dependency tracking. The fact that reactive signals read inside the thunk are automatically tracked is elegant.

```ts
const tasksQuery = query(() => fetchTasks(), { key: 'task-list' });
// tasksQuery.data, .loading, .error are all reactive signals
```

The `.revalidate()` method made it trivial to refresh data after a mutation (e.g., status change on the detail page). Having `.dispose()` for cleanup on unmount was also appreciated.

**Verdict:** Strong foundation. See friction points below for improvements.

### 3. `form()` progressive enhancement is a genuinely good idea

The `form()` API producing `{ action, method }` from SDK method metadata means forms can work without JavaScript. This is rare in modern frameworks and a real differentiator.

```ts
const taskForm = form(taskApi.create, { schema: createTaskSchema });
const { action, method } = taskForm.attrs();
// Set these on a real <form> element for progressive enhancement
```

**Verdict:** This is a great story for marketing. "Your forms work even if JS fails to load."

### 4. `variants()` is exactly what you want for component styling

The API is clean, the TypeScript inference is excellent, and the `defaultVariants` + `compoundVariants` patterns cover real-world needs.

```ts
const btn = button({ intent: 'secondary', size: 'sm' });
// TypeScript errors on `button({ intent: 'invalid' })` — good!
```

**Verdict:** Ship this. It's better than most CSS-in-JS variant APIs I've used.

### 5. Primitives are production-ready

The Dialog and Tabs primitives from `@vertz/primitives` delivered WAI-ARIA compliance out of the box. Focus trap, Escape to close, roving tabindex, proper `role`/`aria-*` attributes — all handled correctly. I didn't have to think about accessibility at all.

**Verdict:** This is how headless UI libraries should work. Big win.

### 6. JSX authoring is clean and natural

After discovering the `@vertz/ui-compiler`'s JSX support, I rewrote all 8 component/page files from `.ts` to `.tsx`. The experience was excellent:

- **HTML elements** work exactly as expected: `<div class={styles.foo}>` compiles to optimized `__element("div")` calls
- **Event handlers** use standard JSX: `onClick={handler}` compiles to `__on(el, "click", handler)`
- **Component calls** work via PascalCase: `<TaskCard task={task} onClick={fn} />` calls the function with props
- **Primitives embed cleanly**: Dialog/Tabs return pre-wired elements that drop into JSX via `{dialog.trigger}`
- **Effects still work**: assign JSX elements to variables, reference them in `effect()` for reactive updates

The combination of JSX for structure + effect() for updates is the sweet spot. It's more explicit than React (no virtual DOM diffing) but far more readable than manual DOM construction.

```tsx
// Components compose naturally in JSX
<div data-testid="task-list-page">
  <div class={layoutStyles.classNames.header}>
    <h1>Tasks</h1>
    <button onClick={() => navigate('/tasks/new')}>+ New Task</button>
  </div>
  {filterBar}
  {loadingEl}
  {listContainer}
</div>
```

**Verdict:** JSX is the intended authoring experience. It should be prominently featured in all getting-started docs.

---

## Friction Points

### ~~F1. No JSX — DOM construction is extremely verbose (CRITICAL)~~ RESOLVED

**Update:** JSX is fully supported via `@vertz/ui-compiler`! I didn't discover this initially because the compiler wasn't mentioned in the getting-started path. After rewriting the entire demo in `.tsx`, the authoring experience is dramatically better.

The compiler transforms JSX into optimized `__element()` / `__on()` / `__text()` / `__attr()` calls with compile-time reactivity analysis. At dev/test time, a lightweight JSX runtime provides the same DOM construction.

```tsx
// Before: 50+ lines of createElement + appendChild
// After: Clean, declarative JSX
export function TaskCard(props: TaskCardProps): HTMLElement {
  const { task, onClick } = props;
  return (
    <article class={cardStyles.classNames.card} onClick={() => onClick(task.id)}>
      <div class={cardStyles.classNames.cardHeader}>
        <h3 class={cardStyles.classNames.cardTitle}>{task.title}</h3>
        <span class={badge({ color: priorityColor(task.priority) })}>{task.priority}</span>
      </div>
      <p class={cardStyles.classNames.cardBody}>{task.description}</p>
    </article>
  ) as HTMLElement;
}
```

The rewrite reduced ~350 lines of DOM construction to clean JSX across 8 files. Components, events, attributes, and children all work as expected. Primitives (Dialog, Tabs) stay imperative since they return pre-wired ARIA elements, and embed cleanly inside JSX via `{expression}` syntax.

**Remaining friction:** The `tsconfig.json` setup for JSX requires `"jsx": "react-jsx"` with a custom `jsxImportSource`, plus a local JSX runtime for Bun's test runner. This should be handled by a project template or `create-vertz` CLI.

**Original ticket status:** Resolved — JSX support exists, just needs better discoverability.

### F2. Context Provider uses callback pattern — awkward for app composition (MEDIUM)

The `Context.Provider(value, fn)` callback pattern works correctly, but it creates an awkward nesting pattern at the app level:

```ts
SettingsContext.Provider(settings, () => {
  // All app code must be inside this callback
  // This is fine for small apps but gets deeply nested
  // for multiple providers
});
```

Compare to what React or Solid developers expect:
```tsx
<SettingsProvider value={settings}>
  <ThemeProvider theme="dark">
    <App />
  </ThemeProvider>
</SettingsProvider>
```

**Impact:** Medium. The callback pattern is functional but will feel foreign to most frontend developers. Multiple nested providers (settings + auth + theme + ...) will create a "callback pyramid."

**Recommendation:** Consider a `provide()` helper that flattens multiple providers:
```ts
provide([
  [SettingsContext, settings],
  [AuthContext, auth],
], () => { /* render app */ });
```

### F3. `css()` shorthand syntax is undocumented — trial and error to learn (MEDIUM)

The css() shorthand syntax (`'p:4'`, `'bg:primary.600'`, `'hover:bg:primary.700'`) is powerful but there is no reference for what shorthands are available. I found myself reading the shorthand parser source code to figure out valid tokens.

Questions I had to answer by reading source:
- Is it `font:xl` or `text:xl`? (Answer: depends on the property)
- How do I reference spacing tokens vs color tokens?
- What pseudo-state prefixes are supported?
- How do I set border width and color together?

**Impact:** Any developer using css() will hit this wall. It's the difference between "this is nice" and "how do I make a border?"

**Recommendation:**
1. Add a shorthand reference document listing all available shorthands
2. Consider TypeScript literal types for shorthand autocompletion (e.g., `'p:${SpacingTokens}'`)
3. Add helpful error messages when an invalid shorthand is used (currently fails silently or produces empty CSS)

### F4. `form()` requires SDK methods with `.url` and `.method` — tight coupling (MEDIUM)

The `form()` API requires an `SdkMethod<TBody, TResult>` which is a callable with `.url` and `.method` properties. This is designed for @vertz/codegen SDK output, but for anyone not using codegen, you have to manually create these:

```ts
const taskApi = {
  create: Object.assign(
    (body: CreateTaskBody) => createTask(body),
    { url: '/api/tasks', method: 'POST' },
  ),
};
```

`Object.assign` to attach metadata to a function is an unusual pattern. It works, but it feels like a workaround.

**Impact:** Anyone using @vertz/ui without the full vertz stack (external API, third-party backend) will find this clunky.

**Recommendation:** Accept a simpler form signature as an alternative:
```ts
// Option A: Current API (for codegen users)
form(sdkMethod, { schema });
// Option B: Plain function + config (for everyone else)
form(submitFn, { schema, action: '/api/tasks', method: 'POST' });
```

### F5. `onMount()` and `onCleanup()` don't have component scope (LOW)

`onMount()` calls `untrack(callback)` immediately — it's not deferred until the component is actually in the DOM. Similarly, `onCleanup()` registers with the current reactive scope, not with a component lifecycle.

This means:
- `onMount()` runs during construction, not after DOM insertion
- `onCleanup()` requires an active disposal scope to register with
- There's no clear "component mounted in DOM" lifecycle

In my demo, I used `onMount()` for logging, but it fired before the element was appended to the document.

**Impact:** Low for v0.1 since there's no component model with mount/unmount. But developers coming from React/Solid will expect `onMount` to fire after the DOM is ready.

**Recommendation:** Document this clearly. The name `onMount` is misleading if it doesn't actually wait for mount. Consider renaming to `onInit()` or `setup()` for clarity, and reserving `onMount` for a future component lifecycle that actually detects DOM insertion.

### F6. `ThemeProvider` returns a wrapper `<div>` — unwanted DOM nesting (LOW)

```ts
const wrapper = ThemeProvider({ theme: 'dark', children: [shell] });
// Creates <div data-theme="dark"><shell></div>
```

Every ThemeProvider adds a wrapper div. For nested themes or theme sections, this creates unnecessary DOM depth. Other approaches (using `document.documentElement.setAttribute`) don't require wrappers.

**Impact:** Low. One extra div per theme scope is usually fine. But developers building complex layouts may notice.

**Recommendation:** Consider an alternative API that doesn't add a wrapper:
```ts
applyTheme('dark'); // Sets data-theme on documentElement
// or
ThemeProvider({ theme: 'dark', element: existingElement }); // Sets on existing element
```

### F7. No `batch()` guidance in docs — multiple signal updates cause multiple effects (LOW)

When updating multiple signals in sequence, each update triggers its own effect run:

```ts
// Each of these triggers separate effect re-runs
filter.value = 'done';
sortBy.value = 'date';
```

`batch()` exists in the API but I only found it by reading the exports. There's no guidance on when to use it.

**Impact:** Low for small apps. Could become a performance issue for complex UIs with many interdependent signals.

**Recommendation:** Add examples of `batch()` usage in the docs. Consider auto-batching in common scenarios (event handlers, async callbacks).

### F8. Router requires manual component↔navigation wiring (LOW)

Every page component needs `navigate` passed as a prop:

```ts
TaskListPage({ navigate: (url) => appRouter.navigate(url) })
```

There is no way to navigate from inside a component without either:
1. Prop drilling the navigate function
2. Creating a context for the router

**Recommendation:** Provide a `RouterContext` out of the box:
```ts
const router = useRouter(); // from RouterContext
router.navigate('/tasks/new');
```

---

## Gotchas

### G1. `compileTheme()` is not publicly exported — but you need it

`defineTheme()` creates a theme object, but the function to compile it into CSS (`compileTheme()`) is only exported from the internals module, not the public API. I needed to either:
1. Import from `@vertz/ui` internals (not intended for consumers)
2. Manually build CSS from the theme object (what I ended up doing)

```ts
// What you want to write:
import { defineTheme, compileTheme } from '@vertz/ui';
const compiled = compileTheme(theme); // ERROR: compileTheme not exported

// What you have to write:
import { defineTheme } from '@vertz/ui';
// ...manually iterate theme.colors and build CSS custom properties
```

The separation between defineTheme (public) and compileTheme (internal) makes sense if the compiler handles compilation at build time. But for development/SSR/runtime usage, developers need compileTheme. Either export it publicly or document that theme compilation is a compiler-only concern.

**Ticket:** Export `compileTheme()` from the public API, or provide a public way to get CSS from a theme.

### G2. `effect()` runs synchronously — DOM may not be ready

Effects run immediately when created. If your effect reads a signal and tries to update DOM that hasn't been appended yet, it works (the DOM elements exist in memory), but it's a footgun if you're expecting deferred execution.

### G3. `form.error()` is not a signal — it's a function that reads signals internally

The `form.error('fieldName')` API returns `string | undefined`, not a signal. You need to call it inside an `effect()` to get reactive updates:

```ts
// This won't reactively update:
const errorMsg = taskForm.error('title');

// This will:
effect(() => {
  errorEl.textContent = taskForm.error('title') ?? '';
});
```

This is actually good design (it tracks the errors signal internally), but the return type doesn't signal (pun intended) that it needs reactive context to update.

### G4. `createLink()` takes a `ReadonlySignal<string>` for current path — manual sync needed

The Link factory needs a signal of the current path to compute active state. The router doesn't expose this directly, so I had to create a separate signal and keep it in sync:

```ts
const currentPath = signal(window.location.pathname);
const Link = createLink(currentPath, (url) => {
  appRouter.navigate(url);
  currentPath.value = url; // Manual sync
});
```

The router has `current` (a `Signal<RouteMatch | null>`) but not a simple `path` signal. This is a minor gap.

### G5. `globalCss()` is exported but not in the main exports list

I found `globalCss` in the CSS module exports but had to check whether it was re-exported from the main `@vertz/ui` entry point. It is — but it's easy to miss.

---

## Summary Scorecard

| Area | Score | Notes |
|------|-------|-------|
| Reactivity | 9/10 | Excellent. signal/computed/effect is best-in-class |
| JSX | 8/10 | Works well, clean output. Needs better project setup docs |
| Styling | 7/10 | Good API, needs shorthand docs and better error messages |
| Forms | 7/10 | Great progressive enhancement, but tight SDK coupling |
| Data Fetching | 8/10 | Clean API, covers common cases, good reactive integration |
| Routing | 7/10 | Functional but lacks convenience (no router context, no path signal) |
| Primitives | 9/10 | WAI-ARIA correct, clean API, just works |
| Testing | 8/10 | Good helpers, `waitFor` is essential, `createTestRouter` is handy |
| DX Overall | 7.5/10 | JSX unlocks the real DX. Remaining gaps: docs, CSS shorthands, router context |

**Bottom line:** With JSX, the framework delivers a genuinely good authoring experience. The reactivity system is best-in-class, the compiler handles JSX → optimized DOM code, and primitives provide instant accessibility. The remaining DX gaps (CSS shorthand docs, router context, form API flexibility) are all solvable and don't block adoption. This is a framework worth recommending.

---

## Tickets to File

1. ~~**P0:** JSX or template literal support for component authoring [F1]~~ **RESOLVED** — JSX exists in `@vertz/ui-compiler`
2. **P1:** CSS shorthand reference documentation [F3]
3. **P1:** `form()` should accept plain functions without SDK metadata [F4]
4. **P1:** Export `compileTheme()` from public API [G1]
5. **P1:** JSX project setup docs / `create-vertz` template with JSX config [F1 follow-up]
6. **P2:** Add `RouterContext` for navigation without prop drilling [F8]
7. **P2:** Add `provide()` helper to flatten nested context providers [F2]
8. **P2:** Consider renaming `onMount` to `onInit` (or document that it runs during construction) [F5]
9. **P3:** Add `batch()` usage examples to docs [F7]
10. **P3:** Router should expose a `path` signal for Link [G4]
11. **P3:** `ThemeProvider` option to apply to existing element [F6]
