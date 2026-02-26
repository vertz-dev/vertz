# Fix Hydration vs JSX Evaluation Order

## Problem

The task-manager `app.tsx` uses internal DOM helpers (`__element`, `__enterChildren`, `__exitChildren`, `__append`) directly instead of JSX. This is because JSX and the hydration cursor have conflicting evaluation orders, and no developer should ever have to write this:

```ts
const container = __element('div', { 'data-testid': 'app-root' });
__enterChildren(container);

SettingsContext.Provider(settings, () => {
  RouterContext.Provider(appRouter, () => {
    const themeWrapper = ThemeProvider({ theme: 'dark', children: [] });
    __append(container, themeWrapper);
    __enterChildren(themeWrapper);

    const shell = __element('div', { class: layoutStyles.shell });
    __append(themeWrapper, shell);
    __enterChildren(shell);
    // ... 100 more lines of manual DOM construction
    __exitChildren();
    __exitChildren();
  });
});

__exitChildren();
```

The same applies to `ThemeProvider`, `RouterView`, and `Link` inside `packages/ui/` — all use manual DOM helpers instead of JSX because they participate in hydration.

### Root Cause

**The hydration cursor walks top-down; JSX evaluates bottom-up.**

The hydration system uses a global cursor (`currentNode`) that walks the SSR DOM tree in document order. Each `__element(tag)` call claims the next matching sibling. `__enterChildren(el)` pushes the cursor into a child scope; `__exitChildren()` pops it back.

This works perfectly when elements are created in DOM tree order (parent before children). The compiler's IIFE output for plain HTML elements achieves this:

```ts
// <div><h1>Hello</h1></div> compiles to:
(() => {
  const __el0 = __element('div');     // 1. Claim parent
  __enterChildren(__el0);              // 2. Cursor → div's first child
  const __el1 = __element('h1');      // 3. Claim child
  __enterChildren(__el1);
  __append(__el1, __staticText('Hello'));
  __exitChildren();
  __append(__el0, __el1);
  __exitChildren();                    // 4. Cursor back to parent's scope
  return __el0;
})()
```

**But component calls break this.** The compiler transforms uppercase JSX tags into function calls:

```tsx
// <ThemeProvider theme="dark"><App /></ThemeProvider>
// compiles to:
ThemeProvider({ theme: "dark", children: [App({})] })
```

JavaScript evaluates arguments before calling the function. So `App({})` runs first — it calls `__element`, `__enterChildren`, etc. — **before** `ThemeProvider` has a chance to claim its own wrapper div and enter its children scope. The cursor is now in the wrong position.

### Why This Matters

1. **Examples are the framework's first impression.** Developers will look at task-manager and see manual DOM construction in the app shell. That's terrifying.
2. **Internal framework components are affected.** `ThemeProvider`, `RouterView`, and `Link` all use manual helpers instead of JSX.
3. **The DX journal already flags this** (F2: "Context Provider uses callback pattern — awkward for app composition, MEDIUM impact").
4. **It will get worse.** As apps add more providers (auth, i18n, feature flags), the manual construction grows linearly.

### Affected Files

| File | Lines | Why manual |
|------|-------|-----------|
| `examples/task-manager/src/app.tsx` | 149 | Nested providers + layout shell |
| `packages/ui/src/css/theme-provider.ts` | 48 | Claims SSR wrapper div |
| `packages/ui/src/router/router-view.ts` | 99 | Claims SSR container div |
| `packages/ui/src/router/link.ts` | 108 | Claims SSR anchor element |

---

## Approach A: Compiler Fix — Top-Down Component Calls

### Idea

Teach the compiler to emit component calls in a way that preserves top-down element creation order. Instead of passing children as eagerly-evaluated arguments, wrap them in thunks (lazy functions) so the parent component can control when children execute.

### How It Works Today

```tsx
<ThemeProvider theme="dark">
  <div class={styles.shell}>
    <nav>Sidebar</nav>
    <main>Content</main>
  </div>
</ThemeProvider>
```

Compiles to:

```ts
ThemeProvider({
  theme: "dark",
  children: [
    (() => {
      const __el0 = __element('div');        // Runs BEFORE ThemeProvider!
      __enterChildren(__el0);
      // ... nav, main ...
      __exitChildren();
      return __el0;
    })()
  ]
})
```

The div IIFE runs immediately (as an array element), so `__element('div')` claims from the wrong cursor position.

### Proposed Change

The compiler wraps children of component calls in thunks:

```ts
ThemeProvider({
  theme: "dark",
  children: () => {                         // Thunk — not evaluated yet
    const __el0 = __element('div');
    __enterChildren(__el0);
    // ... nav, main ...
    __exitChildren();
    return __el0;
  }
})
```

Now `ThemeProvider` controls execution order:
1. ThemeProvider calls `__element('div', { 'data-theme': 'dark' })` — claims its wrapper
2. ThemeProvider calls `__enterChildren(wrapper)` — cursor enters children scope
3. ThemeProvider calls `children()` — the thunk runs, children claim in correct order
4. ThemeProvider calls `__exitChildren()` — cursor exits

### What Changes

**Compiler (`jsx-transformer.ts`):**
- When transforming `<Component>...children...</Component>`, emit `children: () => { ... }` instead of `children: [...]`
- Only for component calls (uppercase tags), not HTML elements (lowercase tags)
- Single child: `children: () => childIIFE`
- Multiple children: `children: () => [child1IIFE, child2IIFE]`

**Runtime components:**
- `ThemeProvider`, `RouterView`, `Link`, `ErrorBoundary`, `Suspense` — update to call `children()` as a function instead of iterating `children[]`
- Add a `children()` helper (already exists in `@vertz/ui`) that unwraps both array and thunk children for backward compat

**Context Provider:**
- `Context.Provider(value, fn)` callback pattern could be replaced with a JSX-style component: `<SettingsContext.Provider value={settings}>...</SettingsContext.Provider>`
- The Provider component calls `children()` inside its `try/finally` scope block

### Complexity

**Medium-High.** The compiler change is surgical (children output format), but the runtime needs to handle both `children: Node[]` (existing code, tests, user code) and `children: () => Node | Node[]` (new compiler output). A `resolveChildren()` helper bridges both.

### Risks

- **Breaking change for manual `children` usage.** Any user code that passes `children: [someNode]` to a component would still work (resolveChildren handles arrays). But code that does `props.children.map(...)` would break because `children` might be a function.
- **Component authoring DX.** Component authors need to call `resolveChildren(props.children)` instead of iterating directly. Alternatively, the compiler could inject this call.
- **Thunk execution timing.** If a component stores `children` and calls it later (async), the cursor state will be gone. Children must be resolved synchronously during component initialization.
- **Fragment children.** `<Component><>A</><>B</></Component>` — fragments produce `DocumentFragment` which doesn't participate in hydration cursor. Need to verify this still works.

### Manifesto Alignment

- **"Write JSX. Done."** — This is the whole point. Developers should never see `__element`.
- **Compile-time over runtime** — The compiler handles the thunk wrapping. No runtime overhead for components that don't use children.
- **One way to do things** — JSX is the one way. Manual DOM construction becomes unnecessary.

---

## Approach B: Runtime Fix — Order-Independent Hydration

### Idea

Make the hydration cursor resilient to out-of-order element claims. Instead of a single sequential cursor that advances sibling-by-sibling, use a strategy that can find matching elements regardless of claim order.

### Option B1: ID-Based Matching

During SSR, assign unique IDs (e.g., `data-hk="0"`, `data-hk="1"`) to every element. During hydration, `claimElement(tag)` looks up the element by ID instead of walking siblings:

```ts
let hydrationCounter = 0;

// SSR side: add data-hk to every element
function ssrElement(tag) {
  return `<${tag} data-hk="${hydrationCounter++}">`;
}

// Client side: claim by ID
function claimElement(tag) {
  const id = hydrationCounter++;
  const el = root.querySelector(`[data-hk="${id}"]`);
  return el;
}
```

**Pros:** Completely order-independent. Any code can claim any element at any time.

**Cons:**
- Adds `data-hk="N"` to every SSR element — HTML size bloat
- `querySelector` for every element is O(n) per claim (vs O(1) cursor advance)
- SSR and client must generate IDs in exactly the same order — which is the same ordering constraint we're trying to remove
- Removes tolerant hydration (can't skip browser extension nodes gracefully)

### Option B2: Tag + Position Matching

Instead of a sequential cursor, use a child-index-based lookup:

```ts
function claimElement(parent, tag, childIndex) {
  const child = parent.children[childIndex];
  if (child?.tagName === tag.toUpperCase()) return child;
  // Fallback: scan siblings
  return null;
}
```

**Pros:** Order-independent within a parent scope.

**Cons:**
- Requires the compiler to track child indices
- Browser extensions that inject elements shift indices
- More complex cursor state (per-parent index vs global cursor)

### Option B3: Two-Pass Hydration

First pass: walk the component tree without claiming, build a plan of which elements go where. Second pass: execute the plan in DOM order.

**Pros:** Cleanly separates "what to render" from "how to hydrate".

**Cons:**
- Double the work — two passes instead of one
- Significantly more complex implementation
- Memory overhead for the plan data structure
- Components with side effects (event listeners, effects) can't run in the first pass

### Complexity

**High.** All runtime options require rethinking the fundamental hydration architecture. The current cursor is elegant precisely because it's simple — one pointer, one stack, O(1) advances. Any order-independent scheme adds complexity and likely performance cost.

### Risks

- **Performance regression.** The current cursor is O(1) per claim. ID-based matching is O(n). For large pages with hundreds of elements, this adds up.
- **Tolerant hydration loss.** The current cursor gracefully skips browser extension nodes. ID-based or index-based matching is fragile to DOM mutations.
- **SSR coupling.** ID-based matching requires SSR to emit IDs in lockstep with client-side claim order — a new constraint that doesn't exist today.
- **Testing burden.** Every hydration test (20+ test files) would need to be rewritten for the new matching strategy.

---

## Recommendation: Approach A (Compiler Fix)

Approach A is the right choice because:

1. **Smaller blast radius.** Changes are in the compiler (children output format) and a handful of runtime components. The hydration cursor stays untouched.
2. **No performance cost.** Thunks are free — they're just function wrappers. No extra DOM traversal, no ID attributes, no second pass.
3. **Preserves tolerant hydration.** The cursor-based walker continues to gracefully skip browser extension nodes.
4. **Solves the actual problem.** The issue isn't that hydration is order-dependent — it's that JSX evaluates children eagerly. Making children lazy is the minimal fix.
5. **Enables JSX providers.** Once children are thunks, `Context.Provider` can become a JSX component: `<SettingsContext.Provider value={settings}><App /></SettingsContext.Provider>`.
6. **Aligns with the manifesto.** "Write JSX. Done." The compiler should handle this, not the developer.

Approach B solves a more general problem (order-independent hydration) that we don't actually need. The only reason for out-of-order claims is eager children evaluation — and Approach A eliminates that at the source.

---

## Non-Goals

- **Controlled mode for primitives.** The `@vertz/ui-primitives` controlled mode limitation (noted in README gotchas) is a separate issue.
- **SSR streaming.** This design is for full-page SSR + hydration. Streaming SSR with progressive hydration is a future concern.
- **Automatic `provide()` flattening.** The DX journal suggests a `provide([...])` helper. That's orthogonal — JSX providers are a better solution, and Approach A enables them.

---

## Unknowns

### 1. Children format: thunk vs array of thunks (Discussion-resolvable)

Should the compiler emit:
- `children: () => [child1, child2]` (single thunk returning array)
- `children: [() => child1, () => child2]` (array of thunks)
- `children: () => child1` for single child, `children: () => [child1, child2]` for multiple

The single-thunk approach is simpler — one function call resolves all children. Components that need per-child access can still iterate the result.

### 2. Backward compatibility for `children: Node[]` (Discussion-resolvable)

Existing user code may pass `children: [someNode]` to components. The `resolveChildren()` helper should handle both formats:

```ts
function resolveChildren(children: (() => Node | Node[]) | Node[]): Node[] {
  if (typeof children === 'function') {
    const result = children();
    return Array.isArray(result) ? result : [result];
  }
  return children;
}
```

### 3. Does thunk children work with `__list` and `__conditional`? (Needs POC)

`__list` and `__conditional` already use function arguments for deferred rendering. Need to verify that thunk children compose correctly when a component's children contain lists or conditionals:

```tsx
<ThemeProvider theme="dark">
  {showSidebar && <Sidebar />}
  <main>{tasks.map(t => <TaskCard task={t} />)}</main>
</ThemeProvider>
```

The compiler already wraps conditionals in `() =>` and lists in `renderFn`. A POC should verify these nest correctly inside a thunk children wrapper.

### 4. Context.Provider as JSX component (Discussion-resolvable)

The current `Context.Provider(value, fn)` is callback-based. To support `<Ctx.Provider value={v}>...</Ctx.Provider>`, the Provider needs to:
1. Accept `{ value, children }` props
2. Set up the context scope
3. Call `resolveChildren(children)` inside the scope
4. Return the resolved children (or a fragment wrapper)

This is straightforward but changes the Provider API. Since we're pre-v1, breaking changes are encouraged.

---

## E2E Acceptance Test

```tsx
// This JSX must work with SSR hydration — no manual __element calls
function App() {
  let count = 0;

  return (
    <SettingsContext.Provider value={createSettings()}>
      <ThemeProvider theme="dark">
        <div data-testid="app-root">
          <h1>Task Manager</h1>
          <button onClick={() => count++}>Count: {count}</button>
          {count > 0 && <p>Clicked!</p>}
        </div>
      </ThemeProvider>
    </SettingsContext.Provider>
  );
}

// SSR renders to HTML string
const html = ssrRenderToString(App);
// Client hydrates — adopts SSR nodes, attaches reactivity
mount(App, '#app');
// Click handler works, conditional renders, no cursor errors
```

The test passes when:
1. SSR output contains the full HTML tree
2. Hydration adopts all SSR nodes (no "Creating new element" warnings)
3. Click handler fires, count updates, conditional appears
4. Zero `__element`/`__enterChildren` imports in application code
