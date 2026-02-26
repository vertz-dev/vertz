# Lazy Children Thunks for Hydration-Safe JSX Composition (#744)

## Context

The task-manager `app.tsx` uses 149 lines of manual `__element`/`__enterChildren`/`__exitChildren` calls instead of JSX. Framework components (`ThemeProvider`, `Link`) do the same. The root cause is two-fold:

1. **The compiler drops children for component calls.** `transformJsxElement()` line 135-137: when `isComponent` is true, it returns `${tagName}(${buildPropsObject(...)})` — children between opening/closing tags are ignored entirely.
2. **Even if children were passed, eager evaluation breaks hydration.** JSX evaluates bottom-up (children before parent). The hydration cursor walks top-down (parent before children).

The fix: Compiler wraps component children in thunks (`() => ...`), giving the parent control over when children execute. Components call the thunk after `__enterChildren()`, maintaining correct cursor position.

See `plans/hydration-jsx-ordering.md` for the full problem analysis and alternatives considered.

---

## Phase 1: Compiler — Children Collection + Thunk Wrapping

**Goal**: Make `<Component>children</Component>` work by collecting JSX children and passing them as a `children` thunk prop.

### What changes

**File: `packages/ui-compiler/src/transformers/jsx-transformer.ts`**

#### 1a. New helper: `transformChildAsValue()`

`transformChild()` is **imperative** — it generates `__append(parentVar, ...)` statements. Component children thunks need the opposite: **value expressions** that are returned, not appended. A new function extracts the value-producing part:

| Child type | `transformChild()` output (imperative) | `transformChildAsValue()` output (value) |
|-----------|--------------------------------------|----------------------------------------|
| Text | `__append(p, __staticText("text"))` | `__staticText("text")` |
| Static expr | `__insert(p, expr)` | `expr` |
| Reactive expr | `__append(p, __child(() => expr))` | `__child(() => expr)` |
| Conditional | `__append(p, __conditional(...))` | `__conditional(...)` |
| JSX element | `__append(p, (() => { ... })())` | `(() => { ... })()` (the existing IIFE) |
| JSX fragment | `__append(p, (() => { ... })())` | `(() => { ... })()` (fragment IIFE) |
| Component | `__append(p, Comp({}))` | `Comp({})` |

Text children MUST produce `__staticText("text")`, not raw `"text"`. During hydration, `__staticText()` calls `claimText()` to adopt the existing SSR text node. If the thunk returned a raw string, `resolveChildren()` would call `document.createTextNode()` — creating a NEW text node that isn't in the DOM — and `__append()` would no-op during hydration, causing the text to disappear.

This is NOT a wrapper around `transformChild()` — it's a parallel function that produces expressions instead of statements. It shares sub-helpers like `tryTransformConditional()` and `transformJsxNode()` which already return expressions.

#### 1b. Fix `isJsxChild()` — add `JsxFragment` support

`isJsxChild()` at `jsx-transformer.ts:612-619` does NOT include `SyntaxKind.JsxFragment`. This means `getJsxChildren()` silently drops fragment children from both HTML elements and component calls. This is a pre-existing bug that must be fixed as part of Phase 1:

```ts
function isJsxChild(node: Node): boolean {
  return (
    node.isKind(SyntaxKind.JsxText) ||
    node.isKind(SyntaxKind.JsxExpression) ||
    node.isKind(SyntaxKind.JsxElement) ||
    node.isKind(SyntaxKind.JsxSelfClosingElement) ||
    node.isKind(SyntaxKind.JsxFragment)  // NEW — fragments are valid children
  );
}
```

Both `transformChild()` (HTML element path) and `transformChildAsValue()` (component thunk path) handle fragment children by delegating to `transformJsxNode()`, which already handles fragments via `transformFragment()`.

#### 1c. Reactive lists — explicit non-goal

`__list(container, ...)` requires a persistent parent element for reconciliation (`container.insertBefore()` on line 99 of `list.ts`). Inside a thunk there is no parent element. **Reactive lists inside component children are out of scope for this phase.**

When the compiler encounters a reactive `.map()` inside component children, it should fall through to the generic reactive expression path: `__child(() => items.value.map(...))`. This produces a static snapshot wrapped in an effect — not reconciled, but functional. A follow-up issue should track proper `__list` support (either deferred parent binding or a container-less list primitive).

**Static `.map()` (non-reactive)** works fine — it produces an array of elements at construction time, no reconciliation needed.

#### 1d. `transformJsxElement()` component branch (line 135-137)

Update the `isComponent` branch:
- Call `getJsxChildren(node)` to collect child nodes
- Filter whitespace-only text nodes
- If children exist, call `buildComponentChildrenThunk()` to produce the thunk code
- Pass thunk code to `buildPropsObject()` via new `extraEntries` parameter

#### 1e. `buildComponentChildrenThunk()`

New function that orchestrates child → thunk transformation:

```
function buildComponentChildrenThunk(
  children: Node[],
  reactiveNames: Set<string>,
  jsxMap: Map<number, JsxExpressionInfo>,
  source: MagicString,
  formVarNames: Set<string>,
): string
```

Uses `transformChildAsValue()` for each child. Output depends on child count:

| Children | Output |
|----------|--------|
| None (self-closing) | Not called — no children prop |
| Single text | `() => __staticText("text")` |
| Single element | `() => (() => { const __el0 = __element("div"); ...; return __el0; })()` |
| Single fragment | `() => (() => { const __el0 = document.createDocumentFragment(); ...; return __el0; })()` |
| Single component | `() => Child({})` |
| Multiple | `() => [val1, val2, ...]` |

#### 1f. `buildPropsObject()` — new `extraEntries` parameter

Add optional `extraEntries?: Map<string, string>` parameter. After building attribute props, append each entry. This keeps children injection clean:

```ts
// Called as:
const extra = new Map([['children', thunkCode]]);
buildPropsObject(openingElement, jsxMap, source, extra);
```

**Edge case**: If an explicit `children` JsxAttribute exists (`<Comp children={fn} />`), skip thunk generation — the explicit prop wins.

### Integration tests

File: `packages/ui-compiler/src/transformers/__tests__/jsx-children-thunk.test.ts`

**Unit tests** (verify compiler string output):

1. Single text child: `<MyComp>text</MyComp>` → `MyComp({ children: () => __staticText("text") })`
2. Single element child: `<MyComp><div>hello</div></MyComp>` → children thunk contains `__element("div")`
3. Single component child: `<Outer><Inner /></Outer>` → `Outer({ children: () => Inner({}) })`
4. Multiple children → thunk returns array
5. Props + children: `<MyComp prop="val">text</MyComp>` → both prop and children thunk present
6. Self-closing: `<MyComp />` → `MyComp({})` (no children)
7. Dotted name: `<Ctx.Provider value={v}><App /></Ctx.Provider>` → `Ctx.Provider({ value: v, children: () => App({}) })`
8. Conditional inside children: `<W>{flag && <A />}</W>` → thunk with `__conditional`
9. Explicit `children` prop: `<Comp children={fn}>text</Comp>` → explicit prop wins, JSX text ignored
10. Fragment inside children: `<W><><A /><B /></></W>` → thunk returns fragment IIFE

**Pipeline integration tests** (full compiler transform, not just JSX transformer):

11. Reactive expression child: `let x = 0; <W>{x}</W>` → verify MagicString produces correct `.value` insertion inside the thunk. Must run through the full compiler pipeline (signal transform + JSX transform), not just snapshot expected output.
12. Reactive `.map()` inside component children: `let items = []; <W>{items.map(i => <A key={i.id} />)}</W>` → falls through to `__child(() => items.value.map(...))`, NOT `__list`. Verify with pipeline test.
13. `peek()` in component JSX attribute: `let s = signal(0); <W val={s.peek()} />` → verify `.peek()` is NOT wrapped in a reactive getter.

---

## Phase 2: `resolveChildren` — The Canonical Thunk Resolver

**Goal**: `resolveChildren()` becomes the single utility all components use to handle children — whether thunks, arrays, or direct values. Phases 3-5 depend on and use this function.

**File: `packages/ui/src/component/children.ts`**

### Type changes

```ts
// Before:
export type ChildValue = Node | string | number | null | undefined | ChildValue[];

// After:
export type ChildValue = Node | string | number | null | undefined | ChildValue[] | (() => ChildValue);
```

### Function changes

Add function handling at the top of `resolveChildren()`:

```ts
export function resolveChildren(value: ChildValue): Node[] {
  if (value == null) return [];
  if (typeof value === 'function') {
    return resolveChildren(value());  // Unwrap thunk, re-resolve
  }
  // ... existing string/number/array/Node handling
}
```

### Tests

File: `packages/ui/src/component/__tests__/children.test.ts` (extend existing)

1. `resolveChildren(() => divNode)` → `[divNode]`
2. `resolveChildren(() => [divA, divB])` → `[divA, divB]`
3. `resolveChildren(() => "text")` → `[TextNode]`
4. `resolveChildren(() => null)` → `[]`
5. `resolveChildren(() => () => divNode)` → `[divNode]` (nested thunks)
6. All existing tests still pass

---

## Phase 3: ThemeProvider — Use `resolveChildren()`

**Goal**: ThemeProvider accepts both `ThemeChild[]` (legacy) and `() => ThemeChild | ThemeChild[]` (compiler thunks).

**File: `packages/ui/src/css/theme-provider.ts`**

### Type changes

```ts
// Before:
children: ThemeChild[];

// After:
children: ThemeChild[] | (() => ThemeChild | ThemeChild[]);
```

### Implementation

The key constraint: the thunk MUST be called between `__enterChildren()` and `__exitChildren()` for hydration cursor correctness.

```ts
export function ThemeProvider({ theme = 'light', children }: ThemeProviderProps): HTMLElement {
  const el = __element('div', { 'data-theme': theme });
  __enterChildren(el);
  const nodes = resolveChildren(children as ChildValue);
  for (const node of nodes) {
    __append(el, node);
  }
  __exitChildren();
  return el;
}
```

`resolveChildren()` calls the thunk (if function), then normalizes strings to TextNodes. The call happens inside the `__enterChildren`/`__exitChildren` scope — hydration cursor is correctly positioned.

### Tests

Extend `packages/ui/src/css/__tests__/theme-provider.test.ts`:
1. Thunk single child: `ThemeProvider({ theme: 'dark', children: () => div })` renders correctly
2. Thunk multiple children: `children: () => [nav, main]`
3. Legacy array still works: `children: [div]` (backward compat)
4. Thunk text child: `children: () => "text"`

---

## Phase 4: Link — Accept Children Thunk

**Goal**: Link accepts `string | (() => string)` for children.

**File: `packages/ui/src/router/link.ts`**

### Known limitation

Link only supports text children (`string`). JSX like `<Link href="/"><Icon /> Home</Link>` will not work because the compiler generates a thunk returning `[Icon({}), "Home"]` — not a string. This is a pre-existing limitation (Link already only accepts `string`). Rich children support for Link is tracked separately.

### Type changes

```ts
// Before:
children: string;

// After:
children: string | (() => string);
```

### Implementation

```ts
const text = typeof children === 'function' ? children() : children;
// ... use text as before
```

Note: We do NOT use `resolveChildren()` here because Link needs a raw string for `__staticText()`, not a `Node[]`.

### Tests

Extend existing Link tests:
1. `Link({ href: '/', children: () => 'Home' })` renders `<a href="/">Home</a>`
2. `Link({ href: '/', children: 'Home' })` still works

---

## Phase 5: Context.Provider JSX Support

**Goal**: `<SettingsCtx.Provider value={settings}>children</SettingsCtx.Provider>` works.

**File: `packages/ui/src/component/context.ts`**

### Disambiguation strategy

The compiler generates: `SettingsCtx.Provider({ value: settings, children: () => App({}) })`

Old API: `Ctx.Provider(value, callback)` — **two arguments**.
New API: `Ctx.Provider({ value, children })` — **one argument**.

Use argument count (whether `fn` is provided) as the primary discriminator:

```ts
Provider(valueOrProps: T | ProviderJsxProps<T>, fn?: () => void): void | ChildValue {
  if (fn !== undefined) {
    // Old callback pattern: Provider(value, fn)
    // ... existing implementation unchanged
    return;
  }

  // New JSX pattern: Provider({ value, children })
  if (isProviderJsxProps(valueOrProps)) {
    const { value, children } = valueOrProps;
    ctx._stack.push(value);
    const prevScope = currentScope;
    const scope: ContextScope = prevScope ? new Map(prevScope) : new Map();
    scope.set(asKey(ctx), value);
    currentScope = scope;
    try {
      return children();  // Returns the children result
    } finally {
      ctx._stack.pop();
      currentScope = prevScope;
    }
  }

  // Fallback: Provider(value) with no fn — treat as old pattern with no-op
  // (This case shouldn't happen in practice)
}
```

### Single-child constraint for transparent components

Context.Provider is a "transparent" component — it does NOT create its own DOM element. It sets up context scope and returns whatever `children()` returns. This creates a problem with multi-child returns:

```tsx
// Multi-child — thunk returns [spanA, spanB] (an array)
<Ctx.Provider value={v}>
  <span>A</span>
  <span>B</span>
</Ctx.Provider>
```

The caller does `__append(divVar, Ctx.Provider({ ... }))`, but `__append` expects a single `Node`, not an array.

**Constraint: Context.Provider JSX children MUST have a single root element.** This matches React's practical usage — providers almost always wrap a single root. When multiple children are needed, wrap them in a fragment or element:

```tsx
// CORRECT — single root
<Ctx.Provider value={v}>
  <div><span>A</span><span>B</span></div>
</Ctx.Provider>

// ALSO CORRECT — fragment wraps into a single DocumentFragment node
<Ctx.Provider value={v}>
  <><span>A</span><span>B</span></>
</Ctx.Provider>
```

The `children()` return type is `ChildValue`, which can be a single Node (including DocumentFragment). The compiler's thunk for a single child returns a single value; for a fragment, it returns a single DocumentFragment IIFE. Both are single Nodes that `__append` can handle.

**Runtime guard**: In development mode, if `children()` returns an array, throw a clear error:

```ts
const result = children();
if (process.env.NODE_ENV !== 'production' && Array.isArray(result)) {
  throw new Error(
    'Context.Provider JSX children must have a single root element. ' +
    'Wrap multiple children in a fragment: <><Child1 /><Child2 /></>'
  );
}
return result;
```

### Type ambiguity edge case

`isProviderJsxProps` checks: `typeof valueOrProps === 'object' && valueOrProps !== null && 'children' in valueOrProps && typeof (valueOrProps as any).children === 'function'`.

If `T` itself is `{ value: V; children: () => something }`, the check would false-positive. This is extremely unlikely in practice (context values are typically primitive or data objects), and the 2-arg path takes priority. Document this as a known edge case.

### Interface changes

```ts
// New helper type
interface ProviderJsxProps<T> {
  value: T;
  children: () => ChildValue;
}

// Updated Context interface with overloads
export interface Context<T> {
  Provider(value: T, fn: () => void): void;
  Provider(props: ProviderJsxProps<T>): ChildValue;
  _stack: T[];
  _default: T | undefined;
}
```

### Tests

File: `packages/ui/src/component/__tests__/context.test.ts` (extend existing)

1. JSX pattern: `Ctx.Provider({ value: 'dark', children: () => useContext(Ctx) })` returns `'dark'`
2. Callback pattern still works: `Ctx.Provider('dark', () => { ... })`
3. Nested JSX providers: inner value shadows outer
4. Context scope captured by effects inside JSX children
5. Multi-child array throws in dev mode: `Ctx.Provider({ value: 'v', children: () => [spanA, spanB] })` → error
6. Fragment child works: `Ctx.Provider({ value: 'v', children: () => frag })` → returns frag

**Type tests** (`.test-d.ts`):

5. Both overloads type-check with correct argument shapes
6. `@ts-expect-error` on wrong-shaped calls (e.g., missing `value` key)

---

## Phase 6: Client JSX Runtime Compatibility

**Goal**: The client-side JSX runtime (used in tests/dev without compiler) handles thunked children.

### Client runtime

**File: `packages/ui/src/jsx-runtime/index.ts`**

In `applyChildren()`, add thunk handling:

```ts
if (typeof children === 'function') {
  applyChildren(parent, children());
  return;
}
```

### SSR runtime — NO CHANGES

**File: `packages/ui-server/src/jsx-runtime/index.ts`** — **NOT modified.**

The SSR runtime uses the standard JSX transform (`jsx(tag, props)`), not the compiler. Standard JSX evaluates children eagerly — thunks never reach the SSR runtime. Adding defensive thunk handling to `normalizeChildren()` would be dead code that misleads future readers into thinking SSR receives thunks.

If a future change introduces server-side compilation, the SSR runtime can be updated then.

### Tests

1. Client: `jsx('div', { children: () => 'text' })` resolves thunk and renders text
2. Client: `jsx(MyComp, { children: () => jsx('div', {}) })` resolves thunk for component
3. All existing client jsx tests pass

---

## Phase 7: Task-Manager App Rewrite + Component Author Guide

**Goal**: Pure JSX in `app.tsx` — zero `__element` imports. Plus: document the pattern for user-defined components.

### File: `examples/task-manager/src/app.tsx`

```tsx
export function App() {
  const settings = createSettingsValue();
  return (
    <div data-testid="app-root">
      <SettingsContext.Provider value={settings}>
        <RouterContext.Provider value={appRouter}>
          <ThemeProvider theme={settings.theme.peek()}>
            <div class={layoutStyles.shell}>
              <nav class={layoutStyles.sidebar} aria-label="Main navigation">
                <div class={navStyles.navTitle}>Task Manager</div>
                <div class={navStyles.navList}>
                  <Link href="/" activeClass="font-bold" className={navStyles.navItem}>All Tasks</Link>
                  <Link href="/tasks/new" activeClass="font-bold" className={navStyles.navItem}>Create Task</Link>
                  <Link href="/settings" activeClass="font-bold" className={navStyles.navItem}>Settings</Link>
                </div>
              </nav>
              <main class={layoutStyles.main} data-testid="main-content">
                <RouterView router={appRouter} fallback={() => (
                  <div data-testid="not-found">Page not found</div>
                )} />
              </main>
            </div>
          </ThemeProvider>
        </RouterContext.Provider>
      </SettingsContext.Provider>
    </div>
  );
}
```

### `peek()` in JSX attributes

`settings.theme.peek()` must NOT be treated as reactive by the compiler. The reactivity analysis flags signal `.value` accesses — `.peek()` is explicitly non-reactive. Verify this works in Phase 1 pipeline test #13.

### Component Author Guide

Add to `packages/ui/README.md` (or a new `docs/component-children.md`):

**Pattern for components that wrap children in a DOM element:**

```tsx
import { resolveChildren, type ChildValue } from '@vertz/ui';
import { __append, __element, __enterChildren, __exitChildren } from '@vertz/ui/dom';

interface CardProps {
  title: string;
  children: ChildValue;
}

export function Card({ title, children }: CardProps) {
  const el = __element('div');
  __enterChildren(el);

  // resolveChildren() handles both thunks and direct values
  const nodes = resolveChildren(children);
  for (const node of nodes) {
    __append(el, node);
  }

  __exitChildren();
  return el;
}
```

**Rules:**
1. Always call `resolveChildren(children)` between `__enterChildren(el)` and `__exitChildren()` — never before or after.
2. Children thunks MUST be resolved synchronously during component initialization. Never store the thunk for async invocation.
3. Use `ChildValue` type for the `children` prop — it handles all forms (thunks, arrays, nodes, strings).

### Verification

- Dev server starts, app renders correctly (HMR mode)
- SSR mode produces correct HTML
- Hydration works — no "creating new element" warnings
- All page navigation works
- Existing task-manager tests pass

---

## Phase 8: Hydration E2E Test

**Goal**: Prove the full SSR → hydrate → interactive flow with nested providers and thunked children.

**File: `packages/ui/src/__tests__/hydration-children-thunk.test.ts`**

### Test setup

1. **SSR HTML generation**: Use the SSR runtime (`renderToString`) to render a component tree with nested providers. This produces the HTML string that simulates what the server would send.

2. **DOM setup**: Set `document.body.innerHTML = ssrHtml` to simulate the browser receiving SSR content.

3. **Client hydration**: Call `mount(App, document.body.firstElementChild!)` which triggers `startHydration()` → component tree renders with thunked children → `endHydration()`.

4. **Assertions via DOM reference equality**: Capture references to SSR DOM nodes BEFORE hydration. After hydration, verify the component's returned elements are the SAME references (`===`). This proves nodes were adopted, not recreated.

### Test cases

```ts
describe('hydration with thunked children', () => {
  it('ThemeProvider adopts SSR nodes when children are thunked', () => {
    // 1. SSR render
    const html = renderToString(
      <ThemeProvider theme="dark">
        <h1>Title</h1>
        <p>Content</p>
      </ThemeProvider>
    );

    // 2. Set up DOM
    document.body.innerHTML = html;
    const ssrWrapper = document.body.firstElementChild!;
    const ssrH1 = ssrWrapper.querySelector('h1')!;
    const ssrP = ssrWrapper.querySelector('p')!;

    // 3. Hydrate using the real hydration API
    startHydration(ssrWrapper);
    const result = ThemeProvider({
      theme: 'dark',
      children: () => {
        const h1 = __element('h1');
        __enterChildren(h1);
        __append(h1, __staticText('Title'));
        __exitChildren();
        const p = __element('p');
        __enterChildren(p);
        __append(p, __staticText('Content'));
        __exitChildren();
        return [h1, p];
      },
    });
    endHydration();

    // 4. Assert adoption — same DOM references
    expect(result.querySelector('h1')).toBe(ssrH1);
    expect(result.querySelector('p')).toBe(ssrP);
    // Assert no extra nodes created
    expect(document.body.querySelectorAll('h1').length).toBe(1);
  });

  it('Context.Provider JSX pattern preserves context during hydration', () => {
    // Context value is accessible inside thunked children during hydration
  });

  it('Reactive updates work post-hydration', () => {
    // After hydration, signal changes trigger DOM updates
  });

  it('No DOM mutations during hydration', () => {
    // Use MutationObserver to verify zero insertions/removals
    const observer = new MutationObserver((mutations) => {
      const domChanges = mutations.filter(m =>
        m.type === 'childList' && (m.addedNodes.length > 0 || m.removedNodes.length > 0)
      );
      expect(domChanges).toHaveLength(0);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // ... hydrate ...
    observer.disconnect();
  });
});
```

---

## Dependency Graph

```
Phase 1 (compiler: transformChildAsValue + thunk wrapping)
  ↓
Phase 2 (resolveChildren — canonical utility)
  ↓              ↓             ↓
Phase 3        Phase 4       Phase 5
(ThemeProvider) (Link)        (Context.Provider)
  ↓              ↓             ↓
  └──────────────┴─────────────┘
                 ↓
Phase 6 (client JSX runtime compat)
                 ↓
Phase 7 (task-manager rewrite + component author guide)
                 ↓
Phase 8 (hydration E2E test)
```

Phases 1-2 are strict prerequisites. Phases 3-5 depend on Phase 2 and can run in parallel. Phase 6 is small. Phase 7 requires all prior. Phase 8 validates the full stack.

---

## Non-Goals (Explicit)

| Non-goal | Why | Follow-up |
|----------|-----|-----------|
| Reactive `__list` inside component children | `__list` requires a persistent parent element for reconciliation (`container.insertBefore`). Thunks don't have a parent. | Track as separate issue: "container-less list primitive" or "deferred parent binding for __list" |
| Rich children for Link (`<Link><Icon /> Home</Link>`) | Link currently only accepts `string` children. Changing to `Node[]` is a separate API change. | Track as separate issue |
| SSR runtime thunk handling | SSR uses standard JSX transform — thunks never reach it. Dead code adds confusion. | Add when/if server-side compilation is introduced |
| Automatic `resolveChildren()` injection by compiler | Components must manually call `resolveChildren()`. Compiler injection would be more magical. | Consider post-v1 if component authoring friction is high |

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| `transformChildAsValue()` scope — parallel function to `transformChild()` adds maintenance surface | Medium | Share sub-helpers (`tryTransformConditional`, `transformJsxNode`). Both functions call the same leaf transforms. |
| MagicString position shifting when thunk wrapper is inserted | High | Phase 1 pipeline test #11 specifically tests signal `.value` insertion inside thunks through the full compiler. TDD rule from `.claude/rules/tdd.md` requires multi-transform interaction tests. |
| Explicit `children` prop conflicts with JSX children | Low | Compiler checks: if `children` JsxAttribute exists, skip thunk generation. Phase 1 test #9. |
| Context.Provider overload ambiguity when `T` matches `{ value, children: Function }` | Low | Argument count is primary discriminator (2 args = old, 1 arg = new). Document edge case. |
| Thunk called async breaks hydration cursor | Medium | Document constraint in component author guide. All framework components call synchronously. Runtime could assert `getIsHydrating()` hasn't changed between component entry and thunk call. |
| Fragment children in thunks | Low | DocumentFragment is a Node — `resolveChildren` handles it. `__append` moves fragment children to parent (standard DOM behavior). Phase 1 test #10 covers this. |
| Component authors forget `resolveChildren()` between enter/exit | Medium | Component author guide in Phase 7. Consider a lint rule post-v1. |
| Reactive `.map()` silently degrades to non-reconciled rendering | Medium | When falling through to `__child(() => items.value.map(...))`, the list re-renders fully on every change (no key-based reconciliation). Document this in the non-goals section and track the follow-up. The compiler could emit a dev-mode warning when this fallback triggers. |

---

## Changelog from Initial Design

Changes made after adversarial review:

1. **Replaced "reuses transformChild()"** with new `transformChildAsValue()` — parallel function producing value expressions, not append statements (Critical issue #1)
2. **Reactive `__list` in component children** explicitly scoped as non-goal with graceful fallback to `__child()` wrapper (Critical issue #7)
3. **Phase 2 `resolveChildren` now used by Phases 3-5** — ThemeProvider uses `resolveChildren()` instead of inline `typeof` check, eliminating redundancy (Issue #8)
4. **Phase 6 SSR changes removed** — thunks never reach SSR runtime; dead code removed (Issue #5)
5. **Link string-only limitation** documented explicitly as known limitation with follow-up tracking (Issue #6)
6. **Context.Provider disambiguation** uses argument count (2 args vs 1 arg) as primary discriminator, not value shape inspection (Issue #3)
7. **Phase 1 tests expanded** — added fragment children test (#10), full pipeline MagicString test (#11), reactive `.map()` fallback test (#12), `peek()` test (#13) (Issues #6, #9, #10, #11)
8. **Phase 7 includes Component Author Guide** — documented pattern for user-defined components accepting children thunks (Issue #2)
9. **Phase 8 fully specified** — SSR generation method, DOM reference equality assertions, MutationObserver for zero-mutation verification (Issue #12)

### Round 2 changes (second adversarial review):

10. **`isJsxChild()` fix** — added `SyntaxKind.JsxFragment` to the filter. Pre-existing bug: fragment children of both HTML elements and components were silently dropped. Now Phase 1 section 1b. (Blocking #1)
11. **Text children in thunks produce `__staticText("text")`** instead of raw `"text"`. Raw strings would create NEW text nodes via `document.createTextNode()`, bypassing hydration's `claimText()` — causing text to disappear during hydration since `__append` no-ops. (Blocking #2)
12. **Context.Provider single-child constraint** — Provider is transparent (no DOM element), so multi-child thunks return arrays that `__append` cannot handle. Added constraint: Provider JSX children must have a single root element. Dev-mode runtime guard throws on array returns. Fragment children work since DocumentFragment is a single Node. Phase 5 tests #5-#6 added. (Blocking #3)
13. **Phase 8 test pseudocode** — replaced non-existent `hydrateApp()` with the real hydration API (`startHydration`/`endHydration`). (Non-blocking #6)
