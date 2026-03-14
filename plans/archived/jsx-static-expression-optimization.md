# Skip Effect Wrapping for Static JSX Expressions

**Status:** Implemented
**Date:** 2026-03-07
**Author:** mike (tech-lead)
**Issue:** #1006

---

## 0. Historical Context: PR #926

> **This design proposes partially re-enabling a strategy that was deliberately disabled in PR #926. This section explains why.**

PR #926 replaced static-vs-reactive classification with literal-vs-non-literal for JSX codegen. The changelog states:

> "Previously, the compiler used static analysis to determine if an expression was reactive (depends on signals) and only wrapped reactive expressions in `__child()` / `__attr()` / getters. This broke when reactive values flowed through function boundaries (callback parameters, HOFs, proxy-backed objects) because the parameter was classified as static."

The specific bug scenarios from #926:

1. **`.map()` render function parameters** — `items.map((item) => <span>{item.name}</span>)`. The callback parameter `item` was classified as static even though the list source was reactive.
2. **`queryMatch` data handler parameters** — Same pattern: callback param classified static.
3. **User-defined HOFs receiving reactive data** — Functions that pass reactive values through parameters the analyzer couldn't trace.

### Why this optimization is now safe

The safety comes from three factors:

**Factor 1: Dedicated transforms handle the high-risk patterns.** `.map()` calls on reactive sources go through `tryTransformList()` (line 384-390 of `jsx-transformer.ts`), which emits `__list()` — the entire expression is handled as a reactive list, not individual child expressions. Similarly, conditionals go through `tryTransformConditional()`. These dedicated paths are gated by their own checks, not by `JsxExpressionInfo.reactive`.

**Factor 2: The `reactive` flag is conservative.** The `JsxAnalyzer.reactive` flag is `true` when the expression contains ANY reference to a reactive name (signal or computed), signal-api variable, or reactive-source variable. JSX expressions inside callback bodies (like `{item.name}` in a `.map()` render function) are inside the list transform's scope — they don't go through the top-level `transformChild()` decision because the entire `.map()` call is intercepted first.

**Factor 3: Phase 0 fixes the props blind spot (see Section 7).** The JsxAnalyzer currently does NOT classify destructured prop bindings as reactive sources, even though the PropsDestructuringTransformer rewrites them to `__props.xxx` getter accesses. Phase 0 fixes this by passing `component.destructuredProps` to the JsxAnalyzer so that bare prop references (`{title}`, `{name}`) are correctly classified as `reactive: true`. Without this fix, the optimization would silently break reactivity for prop-backed expressions — the most common JSX pattern.

**Remaining risk area:** User-defined HOFs where reactive data flows through parameters that are not in any reactive set. Example:

```tsx
function MyComponent() {
  let count = 0;
  const withLabel = (val: number) => <span>Count: {val}</span>;
  return <div>{withLabel(count)}</div>;
}
```

Here `{val}` inside `withLabel` is `reactive: false` (callback param, not in any set). But `{withLabel(count)}` in the outer JSX IS `reactive: true` (contains `count`). The outer expression gets `__child(() => withLabel(count))`. When the effect re-fires, `withLabel` re-executes and creates a fresh `<span>` with the new value. The inner `{val}` using `__insert()` is correct because the span is freshly created each time.

**The one true risk:** A free-standing JSX expression in a callback body that is NOT inside a `.map()`, conditional, or outer `__child()` wrapping. This would require reactive data to flow through an untracked variable into JSX that is not inside any reactive wrapping — a pathological pattern that would also break under the `computed()` transformer.

**Decision:** Accept this narrow risk. The `JsxAnalyzer`'s `reactive` flag, after the Phase 0 fix, covers all practical patterns.

---

## 1. Problem Statement

The JSX transformer wraps every non-literal expression in an effect — `__child(() => expr)` for children, `__attr(el, name, () => expr)` for attributes. The only expressions that skip wrapping are AST-level literals (`"hello"`, `42`, `true`, `null`).

This means expressions that are genuinely non-reactive — static constants, utility function calls with no signal dependencies — still get wrapped in effects at runtime. Each unnecessary effect means:

1. **A `domEffect()` allocation** — closure + tracking context
2. **An initial synchronous execution** — the effect runs once to capture the "current" value
3. **For `__child()`: a wrapper `<span style="display:contents">`** — an extra DOM node per static child expression

PR #926's changelog states "idle effects with no signal dependencies have zero ongoing cost." This is true for **ongoing reactivity overhead** — idle effects don't participate in signal propagation. However, the **allocation cost** (closure + DOM node) is paid once per component render and persists for the component's lifetime. The optimization targets this allocation cost, not ongoing reactivity cost.

### The Props Blind Spot

Destructured prop bindings (e.g., `title` from `{ title }: Props`) are classified as reactive sources by the ReactivityAnalyzer (line 64-68) for the purpose of classifying `const` declarations — any `const` derived from a destructured prop becomes `computed`. However, destructured props are NOT emitted as `VariableInfo` entries (they're function parameters). Therefore, the JsxAnalyzer does NOT have them in its `reactiveSourceVars` set.

This means `{title}` directly in JSX is currently `reactive: false` — but this is **incorrect**. The PropsDestructuringTransformer rewrites `{title}` to `{__props.title}`, where `__props` is a getter-backed object. When a parent passes `<Child title={count} />`, the compiler generates `Child({ get title() { return count.value; } })`. Reading `__props.title` inside `__child(() => __props.title)` creates an effect that tracks the signal. Reading it inside `__insert(el, __props.title)` reads the getter once with no tracking — losing reactivity.

**Phase 0 of this design fixes this blind spot** by passing `component.destructuredProps` to the JsxAnalyzer, making `{title}` correctly `reactive: true`. This is a prerequisite for the optimization — without it, the most common JSX pattern (rendering props) would break.

### Concrete Example

```tsx
import { query } from '@vertz/ui';

function TaskList({ title }: TaskListProps) {
  const tasks = query(api.todos.list());
  const HEADER = 'Task List';

  return (
    <div>
      <h1>{HEADER}</h1>              {/* static — string const, no deps */}
      <span>{title}</span>            {/* reactive — destructured prop (getter-backed) */}
      <span>{tasks.loading}</span>    {/* reactive — signal-api property */}
    </div>
  );
}
```

**Current compiled output:**

```js
function TaskList(__props) {
  const { title } = __props;
  const tasks = query(api.todos.list());
  const HEADER = 'Task List';

  const __el0 = __element("div");
  const __el1 = __element("h1");
  __append(__el1, __child(() => HEADER));              // WASTEFUL — HEADER is a static const
  __append(__el0, __el1);
  const __el2 = __element("span");
  __append(__el2, __child(() => __props.title));        // CORRECT — prop is getter-backed
  __append(__el0, __el2);
  const __el3 = __element("span");
  __append(__el3, __child(() => tasks.loading.value));  // CORRECT — reactive
  __append(__el0, __el3);
  return __el0;
}
```

3 `domEffect()` allocations, 3 wrapper `<span>` elements. Only 2 are necessary.

**Optimized output (after Phase 0 + Phase 2):**

```js
function TaskList(__props) {
  const { title } = __props;
  const tasks = query(api.todos.list());
  const HEADER = 'Task List';

  const __el0 = __element("div");
  const __el1 = __element("h1");
  __insert(__el1, HEADER);                              // static — direct insert (Phase 2)
  __append(__el0, __el1);
  const __el2 = __element("span");
  __append(__el2, __child(() => __props.title));         // reactive — effect (correctly classified after Phase 0)
  __append(__el0, __el2);
  const __el3 = __element("span");
  __append(__el3, __child(() => tasks.loading.value));   // reactive — effect
  __append(__el0, __el3);
  return __el0;
}
```

2 `domEffect()` allocations, 2 wrapper `<span>` elements. 1 effect and 1 DOM node eliminated.

### Impact Model

The optimization helps with:
- **Truly static consts** with no reactive dependencies (`const HEADER = 'Dashboard'`, `const MAX = 100`)
- **Utility function calls** on static args (`{formatDate(DATE_CONST)}` where both are static)
- **Imported constants** used in JSX (`{APP_NAME}`, `{VERSION}`)
- **Static computed expressions** (`{2 + 2}`, `{items.length}` where `items` is static)

It does NOT help with (correctly):
- **Destructured prop references** — reactive (getter-backed), classified as such after Phase 0
- **Consts derived from props or signals** — already `computed`
- **Signal-api property accesses** — already reactive
- **Expressions inside `.map()` callbacks** — handled by `__list()` transform
- **Ternary/logical-AND in child position** — handled by `__conditional()` transform (fires before reactive check)

**Honest scope assessment:** The optimization's primary benefit is eliminating effects for truly static expressions — constants, imported values, and pure utility calls. This is a narrower class than "all non-reactive non-literal expressions" but still meaningful in components that render labels, headings, formatting, and configuration values. The impact is proportional to how many genuinely static non-literal expressions appear in a codebase.

**Success metrics** (measured, not estimated):
1. **Correctness:** Zero regressions in E2E example tests (entity-todo, task-manager). Same visual output, same hydration behavior.
2. **Optimization count:** Run the compiler on example apps before and after. Report the number of `__child()` and `__attr()` calls eliminated. This is the concrete measure of impact. If the count is negligible, the optimization may not justify its complexity.

## 2. API Surface

No new public API. This is a compiler optimization — the developer writes the same code, the compiled output is more efficient.

### What Changes

The JSX transformer's decision logic for children, attributes, and component children thunks. Currently:

```
Is it a literal? → __insert() / guarded setAttribute()
Otherwise       → __child(() => ...) / __attr(el, name, () => ...)
```

After this change:

```
Is it a literal?                   → __insert() / guarded setAttribute()
Is it a non-reactive expression?   → __insert() / guarded setAttribute()
Otherwise (reactive)               → __child(() => ...) / __attr(el, name, () => ...)
```

### Reactivity Classification Used

The `JsxExpressionInfo.reactive` flag already exists and is already computed by the `JsxAnalyzer`. It's `true` when the expression references any `signal` or `computed` variable, a signal-api property access, or a reactive-source variable access. After Phase 0, it will also be `true` for destructured prop references.

The JSX transformer already receives this data via the `jsxMap` parameter and uses it for list detection (line 384-390 of `jsx-transformer.ts`). The optimization extends its use to three additional codegen paths.

### Four Codegen Paths to Update

1. **`processAttribute()`** (line 314) — Standalone function, currently does not receive `jsxMap`. Must be threaded through. Note: attribute `JsxExpression` nodes DO have entries in `jsxMap` because the JsxAnalyzer (line 46) collects ALL `JsxExpression` descendants in the component body, including those inside attributes.
2. **`transformChild()`** (line 356) — Already receives `jsxMap`. The `reactive` flag is already available but unused for the `__child()` vs `__insert()` decision.
3. **`transformChildAsValue()`** (line 424) — Used for component children thunks. Same pattern as `transformChild()` — wraps non-literals in `__child()`. Must also check the `reactive` flag.
4. **`tryTransformList()` gating** (line 385) — Already uses `exprInfo?.reactive`. After Phase 0, prop-backed arrays like `{items.map(...)}` where `items` is a destructured prop will be correctly classified as reactive, ensuring list reconciliation is applied.

### Static Attribute Guard

**Critical:** Static attributes MUST use the same boolean/null/false guard that literal attributes use (line 347-350 of `jsx-transformer.ts`):

```js
// WRONG — bare setAttribute would break boolean HTML attributes
el.setAttribute("disabled", false);  // → disabled="false" — still disables!

// CORRECT — guarded pattern (same as existing literal attribute path)
{ const __v = expr; if (__v != null && __v !== false) el.setAttribute(name, __v === true ? "" : __v); }
```

The `__attr()` runtime function handles null/false/true correctly (removes attribute for null/false, sets empty string for true). When bypassing `__attr()` for static attributes, the compiler must replicate this logic.

### Component Props

For component props, the current approach uses getters for non-literal expressions. This is a **separate, lower-priority optimization** not addressed by this design. The getter pattern has negligible runtime cost compared to `domEffect()`.

## 3. Manifesto Alignment

### Compile-time over runtime

The ReactivityAnalyzer already does the work to classify every expression's reactivity at compile time. This optimization uses that classification to eliminate runtime overhead — the compiler makes a smarter decision so the runtime does less work.

### Explicit over implicit

The optimization is invisible to the developer — same code in, fewer effects out. The compiler's behavior becomes more precise without introducing any new concepts or configuration.

### Predictability over convenience

The optimization doesn't change behavior — static expressions produce the same DOM output whether wrapped in an effect or not. The only difference is performance: fewer allocations, fewer DOM nodes.

### LLM readability

The mixed `__insert`/`__child` pattern in compiled output is arguably MORE readable for LLMs: `__insert` signals "this value is static" and `__child` signals "this value is reactive." The compiled output becomes a legible map of which expressions are reactive. However, developers and LLMs should read source code, not compiled output — so the impact is negligible.

### Alternatives considered

1. **Runtime detection in `__child()`** — Have `__child()` run the thunk once, check if it accessed any signals, and if not, skip effect setup. Rejected: moves work to runtime, adds complexity to a hot path, and the compiler already has the information.

2. **New `__staticChild()` helper** — Create a separate runtime function for static children. Rejected: `__insert()` already exists and does exactly this. No new abstraction needed.

3. **Opt-in via pragma or config** — Let developers mark expressions as static. Rejected: the compiler already knows. Adding manual annotations contradicts "compile-time over runtime."

## 4. Non-Goals

- **Effect coalescence** — Batching multiple reactive attributes on one element into a single `domEffect()`. Tracked as #1004. Independent optimization with different complexity.
- **Child wrapper elimination** — Replacing `<span style="display:contents">` with Text nodes for text-only reactive children. Tracked as #1005. Runtime change in `__child()`, orthogonal to this compiler change. Note: if #1005 ships, the DOM node reduction benefit of this optimization becomes less significant for reactive expressions, but the effect allocation benefit remains.
- **Component props optimization** — Using direct values instead of getters for static component props. Lower priority, negligible performance impact.
- **Static child ternaries** — A ternary like `{isAdmin ? 'Admin' : 'User'}` in a child position goes through `tryTransformConditional()` BEFORE the `reactive` check (line 376-382). This means static ternaries still get `__conditional()` wrapping with `domEffect()`. Gating `tryTransformConditional` behind the reactive flag is a valid optimization but separate from this design.
- **Template literal analysis** — Template literals with substitutions are correctly handled by the existing `JsxExpressionInfo.reactive` flag (it checks deps of the full expression). No special-casing needed. Note: accuracy depends on the ReactivityAnalyzer's classification of the substitution variables — if the analyzer misclassifies a reactive variable as static, the template literal would be incorrectly flagged as non-reactive. This is the general analyzer accuracy risk, not specific to templates.
- **Spread attributes** — Not currently supported by the JSX transformer. Unaffected by this change.

## 5. Unknowns

### 5.1 Edge case: expressions with side effects

**Status:** Resolved (discussion)

A static expression like `{getTitle()}` (where `getTitle` is a plain function with no reactive deps) would be inserted directly via `__insert()` instead of `__child(() => getTitle())`. Since `getTitle()` is called exactly once either way (effects run synchronously on creation), the behavior is identical.

**Resolution:** No issue. Both paths call the expression exactly once during component initialization.

### 5.2 Interaction with signal/computed transforms

**Status:** Resolved (discussion)

The JSX transformer reads expression text from MagicString (post-transform). The `JsxExpressionInfo` was computed from the original AST (pre-transform).

**Question:** Can a pre-transform `reactive: false` expression become reactive post-transform?

**Resolution:** No. The transforms are additive — they insert `.value` reads on expressions that are already flagged as reactive. A pre-transform static expression has no signal dependencies and therefore no `.value` insertions. The `reactive` flag is stable across transforms.

### 5.3 Layer 2b interaction

**Status:** Resolved (discussion)

Layer 2b (#990, deferred) will improve the analyzer's accuracy by analyzing cross-file dependencies. This will change which expressions are classified as reactive vs static.

**Resolution:** Safe regardless. A false `reactive: true` (more conservative) is a missed optimization — the expression gets `__child()` wrapping like today. A false `reactive: false` is a correctness bug — but that's a Layer 2b bug, not a bug introduced by this optimization. This optimization's correctness depends on the accuracy of the `reactive` flag, which is the analyzer's responsibility.

### 5.4 Impact justification after excluding props

**Status:** Resolved (discussion)

After Phase 0 correctly classifies destructured props as reactive, the optimization's scope is narrower than initially estimated. The primary targets are truly static consts, imported constants, and utility calls.

**Resolution:** Phase 3 includes a success metrics test that measures the actual optimization count on example apps. If the count is negligible (fewer than ~5 eliminations across example apps), the optimization may not justify its complexity and should be reconsidered. The Phase 0 fix (props in JsxAnalyzer) is independently valuable as a correctness improvement regardless of whether Phases 1-2 proceed.

## 5b. POC Results

No POCs required. All unknowns are discussion-resolvable. The implementation changes are localized to existing codegen paths with clear before/after behavior.

## 6. Type Flow Map

No new generic type parameters introduced. The change threads existing `JsxExpressionInfo` data and `DestructuredPropsInfo` to existing call sites.

## 7. Implementation Plan

### Phase 0: Fix JsxAnalyzer props blind spot (prerequisite)

**Problem:** The JsxAnalyzer does not classify destructured prop bindings as reactive sources. Bare prop references (`{title}`, `{name}`) are `reactive: false` even though they compile to `__props.xxx` getter accesses that may track signals. This is a pre-existing correctness gap that also affects `tryTransformList` gating (prop-backed arrays skip list reconciliation).

**Changes:**
- Pass `component.destructuredProps` (or `component` itself) to `JsxAnalyzer.analyze()`
- In the JsxAnalyzer, add each non-rest destructured prop binding name to `reactiveSourceVars`
- This makes `{title}` → `reactive: true`, and `{items.map(...)}` where `items` is a prop → `reactive: true` (enabling list reconciliation)

**This fix is independently valuable** — it corrects a real analyzer bug regardless of whether the static expression optimization proceeds.

**Integration tests:**
```ts
it('classifies bare destructured prop reference as reactive', () => {
  const result = compile(`
    function Badge({ label }: { label: string }) {
      return <span>{label}</span>;
    }
  `);
  // Props are getter-backed — must use __child for reactive tracking
  expect(result.code).toContain('__child(');
});

it('applies list reconciliation for prop-backed arrays', () => {
  const result = compile(`
    function TodoList({ items }: { items: Item[] }) {
      return <ul>{items.map((item) => <li key={item.id}>{item.title}</li>)}</ul>;
    }
  `);
  // Prop array must go through __list, not __child or __insert
  expect(result.code).toContain('__list(');
});

it('classifies destructured prop in attribute as reactive', () => {
  const result = compile(`
    function Card({ className }: { className: string }) {
      return <div class={className}>Content</div>;
    }
  `);
  // Prop attribute must use __attr for reactive tracking
  expect(result.code).toContain('__attr(');
});
```

### Phase 1: Thread `JsxExpressionInfo` to attribute processing

**Changes:**
- `processAttribute()` gains access to `jsxMap` (or a boolean `isReactive` flag derived from the JSX expression's parent)
- For non-literal, non-reactive attribute expressions: emit the **guarded `setAttribute` pattern** (same as existing literal attribute path)
- For non-literal, reactive attribute expressions: emit `__attr()` (current behavior)

**Acceptance test:**

```tsx
// Input
import { query } from '@vertz/ui';
function Dashboard() {
  const tasks = query(api.todos.list());
  const THEME = 'dark';
  return <div class={THEME} data-loading={tasks.loading}>Hello</div>;
}

// Expected output (relevant parts)
// Static const attribute — guarded setAttribute (handles null/false/true correctly)
{ const __v = THEME; if (__v != null && __v !== false) __el0.setAttribute("class", __v === true ? "" : __v); }
// Reactive attribute — __attr with effect
__attr(__el0, "data-loading", () => tasks.loading.value);
```

**Integration tests:**
```ts
it('emits guarded setAttribute for static attribute expressions', () => {
  const result = compile(`
    import { query } from '@vertz/ui';
    function Dashboard() {
      const tasks = query(api.todos.list());
      const THEME = 'dark';
      return <div class={THEME} data-loading={tasks.loading}>Hello</div>;
    }
  `);
  // Static const attribute uses guarded pattern, not __attr
  expect(result.code).toContain('setAttribute("class"');
  // Reactive attribute still uses __attr
  expect(result.code).toContain('__attr(');
  expect(result.code).toContain('tasks.loading.value');
});

it('handles boolean HTML attributes correctly for static expressions', () => {
  const result = compile(`
    function Button() {
      const IS_DISABLED = false;
      return <button disabled={IS_DISABLED}>Click</button>;
    }
  `);
  // Must NOT be bare setAttribute — must have the null/false/true guard
  expect(result.code).toContain('__v !== false');
  expect(result.code).toContain('__v === true ? ""');
  expect(result.code).not.toContain('__attr(');
});

it('keeps __attr for destructured prop attributes (after Phase 0)', () => {
  const result = compile(`
    function Card({ className }: { className: string }) {
      return <div class={className}>Content</div>;
    }
  `);
  // Prop attribute is reactive — must use __attr
  expect(result.code).toContain('__attr(');
});
```

### Phase 2: Use `JsxExpressionInfo.reactive` for child wrapping

**Changes:**
- In `transformChild()`, check `exprInfo?.reactive` before deciding `__child()` vs `__insert()`
- In `transformChildAsValue()`, apply the same check
- Non-literal, non-reactive expressions: emit `__insert()` instead of `__child(() => ...)`
- Non-literal, reactive expressions: emit `__child(() => ...)` (current behavior)

**Acceptance test:**

```tsx
// Input
import { query } from '@vertz/ui';
function TaskList() {
  const tasks = query(api.todos.list());
  const HEADER = 'My Tasks';
  return (
    <div>
      <h1>{HEADER}</h1>
      <span>{tasks.loading}</span>
    </div>
  );
}

// Expected output (relevant parts)
__insert(__el1, HEADER);                              // static const — direct insert
__append(__el3, __child(() => tasks.loading.value));   // reactive — effect
```

**Integration tests:**
```ts
it('emits __insert for static non-literal child expressions', () => {
  const result = compile(`
    import { query } from '@vertz/ui';
    function TaskList() {
      const tasks = query(api.todos.list());
      const HEADER = 'My Tasks';
      return (
        <div>
          <h1>{HEADER}</h1>
          <span>{tasks.loading}</span>
        </div>
      );
    }
  `);
  expect(result.code).toContain('__insert(');
  expect(result.code).not.toContain('__child(() => HEADER)');
  expect(result.code).toContain('__child(() => tasks.loading.value)');
});

it('keeps __child for destructured prop child expressions (after Phase 0)', () => {
  const result = compile(`
    function Badge({ label }: { label: string }) {
      return <span>{label}</span>;
    }
  `);
  // Prop is reactive — must use __child
  expect(result.code).toContain('__child(');
  expect(result.code).not.toContain('__insert(');
});

it('emits bare expression for static children in component children thunks', () => {
  const result = compile(`
    function App() {
      const TITLE = 'Hello';
      return <div>{TITLE}</div>;
    }
  `);
  // TITLE is a static const — transformChildAsValue should not wrap in __child
  expect(result.code).not.toMatch(/__child\(\(\) => TITLE\)/);
  expect(result.code).toContain('__insert(');
});
```

### Phase 3: Hydration validation, edge cases, and success metrics

**Changes:**
- Runtime E2E test verifying hydration correctness
- Measure optimization count on example apps
- Edge case coverage

**Runtime hydration test:**
```ts
it('hydrates correctly with mixed static/reactive children', () => {
  // SSR: render component with static and reactive children
  // Client: hydrate against the SSR HTML
  // Verify: (a) correct DOM structure, (b) reactive children update, (c) no hydration errors
  //
  // Model after existing tests in packages/ui/src/__tests__/mount-hydration.test.ts
  //
  // Component: static const HEADER + reactive tasks.loading
  // SSR output: no <span style="display:contents"> for HEADER, yes for tasks.loading
  // Hydrate: verify cursor alignment, reactive updates still fire
});
```

**Success metrics test:**
```ts
it('reports optimization count on example apps', () => {
  // Compile entity-todo and task-manager examples
  // Count __child() and __attr() calls before optimization (Phases 1-2)
  // Count after optimization
  // Report the delta
  // If delta < 5, reconsider whether Phases 1-2 justify their complexity
});
```

**Additional edge case tests:**
- Mixed: some children static, some reactive in same element
- Static utility function calls: `{formatDate(DATE_CONST)}`
- Existing list transform still gated by `reactive` flag (no regression)
- Conditional transform still fires before reactive check (no regression)
- Destructured prop in child → `__child()` (after Phase 0)
- Destructured prop in attribute → `__attr()` (after Phase 0)
- `.map()` on destructured prop array → `__list()` (after Phase 0)

## 8. Risks and Mitigations

### Risk: False negative — static expression treated as reactive

If `JsxExpressionInfo.reactive` is `true` for a genuinely static expression, the expression gets wrapped in an effect unnecessarily. This is the **current behavior** — it's a missed optimization, not a correctness bug. No regression.

### Risk: False positive — reactive expression treated as static

If `JsxExpressionInfo.reactive` is `false` for a reactive expression, the expression is inserted once and never updates. This would be a **correctness bug**.

**Mitigation:** The `JsxAnalyzer` is conservative — it checks all identifier references against the full set of reactive names, signal-api vars, and reactive-source vars. After Phase 0, destructured props are also in this set. The specific patterns that caused #926's bugs (`.map()` params, `queryMatch` params) are handled by dedicated transforms that don't depend on the `reactive` flag.

**Debugging escape hatch:** If a developer encounters a frozen UI element caused by misclassification:
1. **Diagnosis:** Inspect the compiled output — `__insert()` for an expression that should update indicates the compiler classified it as static. The developer can check which variables are in scope and whether any are reactive.
2. **Workaround:** Wrap the expression in a trivially reactive computed: `const forcedReactive = computed(() => expr)`. This forces `computed` classification, making `{forcedReactive}` always use `__child()`.
3. **Long-term:** A `--debug-reactivity` compiler flag that prints the `JsxExpressionInfo` map per component would help diagnose misclassifications. This is out of scope for this design but worth tracking.

### Risk: Hydration protocol change

`__child()` creates a `<span style="display:contents">` wrapper. During hydration, it claims this span element. `__insert()` does not create a wrapper — it claims a text node or inserts directly.

This is a **structural change in the compiled output**. Both SSR and CSR use the same compiled code, so within a single deployment they always match. However:

**Rolling deployment risk:** If a server serves SSR HTML compiled with the old strategy (wrapper spans for static children) while the client loads JS compiled with the new strategy (no wrapper spans), hydration will mismatch. The hydration cursor expects a text node but finds a `<span>`.

**Mitigation:** This risk exists for ANY compiler change that alters DOM structure. It is not unique to this optimization. Standard deploy practice (atomic deploys where SSR and client bundles are from the same build) eliminates it. Vertz is pre-v1 with no external users, so this is accepted. SSR and client bundles MUST be compiled with the same compiler version — this is already true for all compiler changes.

**Verification:** Phase 3 includes a runtime hydration test that validates the SSR→hydrate path works correctly with the new mixed `__insert`/`__child` output.

### Risk: `__insert()` value type handling

`__insert()` (line 234-242 of `element.ts`) handles: `Node`, `string`, `number`, `boolean` (skipped), `null`/`undefined` (skipped), functions (resolved), and arrays (recursive). This covers all value types that static expressions can produce. Verified by existing tests in `insert.test.ts`.

### Risk: Reduced optimization impact

After correctly excluding destructured props (Phase 0), the optimization targets a narrower class of expressions. If the success metrics test in Phase 3 shows negligible eliminations (< 5 across example apps), the complexity of Phases 1-2 may not be justified. In that case, Phase 0 alone ships as a standalone correctness fix.

**Mitigation:** Phase 0 is independently valuable. Phases 1-2 are gated by the success metrics result. This is an explicit go/no-go decision point after Phase 0.
