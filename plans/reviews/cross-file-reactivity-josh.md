# Review: Cross-File Reactivity Analysis

**Reviewer:** josh (Developer Advocate)
**Perspective:** Developer Experience
**Date:** 2026-03-07
**Design doc:** `plans/cross-file-reactivity-analysis.md`

---

## Summary

This design addresses three real pain points: callbacks wrongly wrapped in `computed()`, a hardcoded signal API registry that can't grow, and cross-file blindness. The two-layer approach is sound -- fix the immediate bug first, then build the infrastructure. The developer-facing surface is zero-new-API, which is excellent.

That said, I found several issues ranging from a potential behavioral breaking change to gaps in the error experience and edge cases the doc does not address. Details below.

---

## 1. DX Impact

**NON-BLOCKING** -- The "zero new API" claim is accurate but slightly misleading.

The design correctly states developers write the same code today. Good. The improvement is invisible and automatic, which is the gold standard for DX. However, the doc glosses over two DX-relevant changes:

1. **Custom hook authors silently get correct behavior for free.** Today, wrapping `query()` in `useTasks()` silently breaks auto-unwrapping. After this change, it just works. This is a significant DX improvement that should be called out prominently in release notes -- developers who learned the workaround (inlining `query()` instead of extracting hooks) need to know the workaround is no longer necessary.

2. **Package authors have a new concept: `.reactivity.json`.** The doc says this is optional, but the moment a third-party Vertz ecosystem package returns signal-bearing objects, the author needs to know about this file, its schema, and how to produce it. This is a new concept, even if it only applies to a small audience. The doc should specify: is there a CLI command to generate this? A validation step? Or is the author hand-writing JSON and hoping it's correct?

**NON-BLOCKING** -- The `manifests` option in `VertzPluginOptions` is user-facing configuration. Even if "most users never configure it," its existence is discoverable. What error does a developer get if their config is malformed? The doc should specify error behavior for invalid manifest entries.

---

## 2. Error Experience

**BLOCKING** -- The doc does not describe what happens when the manifest system classifies an export as `unknown`.

Section 2.2.1 defines the `unknown` type, and the architecture decisions table says "Treat as potentially reactive." But what does that mean concretely for the developer?

- If `unknown` is treated as potentially reactive, does the compiler insert `.value` on property accesses? That would be wrong for genuinely static values -- it would crash at runtime.
- If `unknown` means "do nothing special," then cross-file imports from unmanifested packages behave the same as today -- no auto-unwrapping, no computed classification. That's safe but invisible.
- If `unknown` triggers a compiler warning, the developer has a path to debug. But the doc never mentions warnings.

The doc must answer: **Does the compiler emit any diagnostic (warning, info, error) when it encounters `unknown`?** My recommendation: emit a `[vertz:reactivity]` warning for `unknown` classifications in dev mode, with a message like:

```
[vertz:reactivity] Cannot determine reactivity shape of 'useTasks' imported from '../hooks/use-tasks'.
Signal properties may not auto-unwrap. If this is a signal-returning API, ensure the source file
is included in the compilation or provide a .reactivity.json manifest.
```

Without this, developers will hit silent correctness bugs when the manifest inference misses their pattern (the 4% gap in user code from the POC), and they will have zero indication of what went wrong.

**NON-BLOCKING** -- When a circular dependency causes `unknown` classification (Section 6.3), the developer should see a specific warning that mentions the cycle, not a generic "unknown" message. Circular reactivity dependencies are a developer mistake -- the compiler should help them find it.

---

## 3. Mental Model

**NON-BLOCKING** -- The mental model changes subtly and the doc should acknowledge this.

Today the mental model is:
- `let` = signal (state that changes)
- `const` depending on signal = computed (derived value)
- `const` arrow function depending on signal = also computed (BUG)

After Layer 1, the model becomes:
- `let` = signal
- `const` *value expression* depending on signal = computed
- `const` *function definition* = always static, regardless of what it references

This is a *better* mental model, but it is a *different* mental model. The distinction between "value expression" and "function definition" is new. A developer who wrote:

```tsx
const getLabel = () => count > 5 ? 'high' : 'low';
```

...and expected `getLabel` itself to be reactive (not its call site) now needs to understand that the function *definition* is static but the *call site* in JSX gets wrapped by the runtime. This is correct behavior, but it introduces a subtlety: the same `const` keyword behaves differently depending on whether the initializer is a function or a value expression.

The doc should explicitly state: **"The developer's mental model does not change for value expressions. For function definitions, the model becomes: the function itself is always a static reference; reactivity is tracked at the call site by the JSX runtime."**

---

## 4. Edge Cases Developers Will Hit

### 4.1 Custom hook wrapping `query()`

**QUESTION** -- The design shows `useTasks()` returning `query()` directly. What about conditional patterns?

```tsx
export function useTasks(initialData?: Task[]) {
  if (initialData) {
    return { data: initialData, loading: false, error: null, refetch: () => {} };
  }
  return query(() => fetchTasks(), { key: 'tasks' });
}
```

This function sometimes returns a `signal-api` and sometimes returns a plain object. What does the manifest say? If the AST analysis sees both return paths, does it:
- Pick the reactive one (optimistic)?
- Mark as `unknown` (conservative)?
- Pick the first return statement?

The 96% POC accuracy is reassuring, but this conditional-return pattern is common in real hooks. The doc should specify the resolution strategy.

### 4.2 Shared `lib/` utilities

**NON-BLOCKING** -- The doc doesn't address what happens with non-component, non-hook files in `lib/` or `utils/` directories.

Consider:

```tsx
// src/lib/format.ts
export function formatDate(date: Date): string {
  return date.toLocaleDateString();
}
```

The manifest generator scans this file and classifies `formatDate` as `{ type: 'static' }`. Good. But what about:

```tsx
// src/lib/task-helpers.ts
import { query } from '@vertz/ui';

export function createTaskQuery(id: string) {
  return query(() => fetchTask(id));
}
```

Does the manifest generator follow the `query()` call and classify `createTaskQuery` as returning `signal-api`? The doc implies yes (Section 2.2.2 point 2), but the POC accuracy of 96% on user code suggests some patterns are missed. Which patterns specifically fall through in this scenario?

### 4.3 Third-party libraries returning reactive values

**NON-BLOCKING** -- The doc says third-party packages default to `unknown`. This is correct, but the practical consequence needs spelling out.

If a developer installs a hypothetical `@some-lib/vertz-store` that returns signal-bearing objects, and that library does not ship `.reactivity.json`, the developer's code silently falls back to no auto-unwrapping. The developer may not realize this until they see that `store.count` doesn't update in the UI.

Recommendation: when a function result is used with property access and the manifest says `unknown`, emit a dev-mode hint suggesting the package author add a `.reactivity.json`. This is the kind of "just-in-time education" that turns a confusing debugging session into a 30-second fix.

### 4.4 `.loading` in callbacks -- breaking change analysis

**BLOCKING** -- The doc does not analyze whether Layer 1 is a breaking change for existing apps.

Consider code that exists today:

```tsx
const tasks = query(() => fetchTasks());
const isLoading = () => tasks.loading;
```

**Today:** `isLoading` is classified as `computed` (because `collectDeps` walks into the arrow body and finds `tasks.loading`). So the compiled output is `const isLoading = computed(() => () => tasks.loading.value)`. This is wrong (function-returning-function), but if any code currently calls `isLoading.value()` or uses `isLoading` in JSX as `{isLoading}` (not `{isLoading()}`), it might be "working" in a broken way that the developer adapted to.

**After Layer 1:** `isLoading` is classified as `static`. The compiled output is `const isLoading = () => tasks.loading.value`. This is correct, but any code that was referencing `isLoading.value` will now break because `isLoading` is no longer a `Computed`.

This is technically fixing a bug, but from the developer's perspective, **code that worked before now doesn't.** The doc must:

1. Acknowledge this is a behavioral change
2. Assess the blast radius (how many existing Vertz apps have adapted to the buggy behavior?)
3. Recommend a migration strategy (at minimum: compile-time warning for the transitional period, something like "callback `isLoading` was previously classified as computed; it is now correctly classified as static")

Given that all packages are pre-v1 and the breaking changes policy says "breaking changes are encouraged," this may be acceptable. But the doc should be explicit about it rather than silent.

### 4.5 IIFE (Immediately Invoked Function Expressions)

**QUESTION** -- Is an IIFE a "function definition" or a "value expression"?

```tsx
let count = 0;
const result = (() => {
  return count * 2;
})();
```

The outer expression is a call expression whose callee is an arrow function. Should `result` be classified as `computed`? The `isFunctionDefinition` check would say "the initializer's outer node is a CallExpression, not an ArrowFunction" -- so this should still be classified as `computed`. But the doc should confirm this edge case is handled, since the code literally contains an arrow function as the initializer's inner structure.

---

## 5. The Callback Fix (Layer 1) -- Is "Never Computed" Too Aggressive?

**BLOCKING** -- Yes, there is at least one case where the rule breaks.

Consider:

```tsx
let count = 0;
const doubled = () => count * 2;

return (
  <div>
    <span>{doubled}</span>  {/* NOT doubled() — the function itself is passed */}
  </div>
);
```

If the developer passes `doubled` (the function reference, not a call) as a JSX child, and expects the UI to reactively re-render when `count` changes, what happens?

- **Today:** `doubled` is classified as `computed`. The compiled output is `const doubled = computed(() => () => count.value * 2)`. In JSX, `{doubled}` would render... a function object. This is already broken today, so the new behavior doesn't make it worse.

But here is a more realistic case:

```tsx
let count = 0;
const label = count > 5 ? 'high' : 'low';  // value expression -> computed (correct)
const getLabel = () => count > 5 ? 'high' : 'low';  // function def -> static (Layer 1)

// In JSX:
<span>{label}</span>         // Works: label is computed, auto-unwrapped
<span>{getLabel()}</span>    // Works: JSX wraps call site in __child(() => getLabel())
```

Both work correctly. The doc's claim holds here.

But what about this pattern, which is common in callback-driven architectures:

```tsx
let visible = false;
const show = () => { visible = true; };
const style = () => visible ? 'display: block' : 'display: none';

return <div style={style()}>{content}</div>;
```

After Layer 1, `style` is classified as `static`. In JSX, `style={style()}` -- is this a non-literal expression that gets wrapped in a reactive attribute setter? If so, it works. But the doc should explicitly confirm that **all JSX attribute expressions involving function calls get reactive tracking**, not just children.

**QUESTION** -- The doc says "JSX call sites (`{fn()}`) are already handled by the literal/non-literal strategy (PR #926)." Does this strategy cover JSX *attributes* (`style={fn()}`, `class={fn()}`, `disabled={fn()}`) in addition to JSX *children* (`{fn()}`)? The examples in the doc only show children. If attributes are not covered, then `const style = () => visible ? 'block' : 'none'` used as `style={style()}` would break.

Looking at the task-detail.tsx example, I see patterns like:

```tsx
class={button({ intent: activeTab === 'details' ? 'primary' : 'ghost', size: 'sm' })}
```

This is a function call in an attribute position that depends on a signal (`activeTab`). If this function call expression is already wrapped by the JSX transformer's literal/non-literal strategy for attributes, then Layer 1 is safe. If not, Layer 1 breaks this pattern. **The doc must confirm this explicitly.**

---

## 6. Manifest Debugging

**BLOCKING** -- The doc provides no way for a developer to inspect what the compiler thinks about their exports.

Section 2.2.4 describes manifests as "in-memory during build." This means a developer cannot see what the manifest generator inferred about their files. When something goes wrong (auto-unwrapping doesn't work, a `const` that should be computed isn't), the developer has no tools.

The design must include at least one of:

1. **A CLI command:** `vertz inspect manifests` that dumps all generated manifests to stdout or a file. This is the minimum viable debugging story.

2. **A diagnostic endpoint:** Add manifest data to the existing `/__vertz_diagnostics` endpoint in dev mode (the endpoint already exists per the dev server debugging rules).

3. **A `VERTZ_DEBUG=manifest` category:** Integrate with the existing `VERTZ_DEBUG` diagnostic logging system. When enabled, log each manifest as it's generated with the file path and export shapes.

Option 3 is the lowest-cost and integrates with existing infrastructure. I'd recommend all three eventually, but option 3 should be in the initial implementation.

---

## 7. Migration Path

**NON-BLOCKING** -- The doc implies this is a drop-in improvement, but it is not entirely.

Layer 1 (callback fix) is a behavior change that could break existing code that adapted to the buggy `computed()` wrapping (see Section 4.4 above). The doc should:

1. State clearly: "Layer 1 is a bugfix that changes compiler output. Existing code that depended on the incorrect behavior may need updating."
2. Recommend that Layer 1 ships with a dev-mode warning for any `const` arrow function that *would have been* classified as `computed` under the old rules but is now classified as `static`. This helps developers audit their code. The warning can be removed in the next release cycle.

Layer 2 (manifest system) is purely additive -- it makes things work that didn't work before. No migration issues.

**QUESTION** -- What is the rollout plan? Are Layer 1 and Layer 2 shipped together, or can Layer 1 ship independently? The doc structures them as two layers but doesn't specify whether they're one release or two. I'd strongly recommend shipping Layer 1 first, alone, and letting it soak for a release cycle before adding Layer 2. This isolates behavioral changes and makes debugging easier if something goes wrong.

---

## 8. Documentation

**NON-BLOCKING** -- The following need to be documented when this ships:

### For all developers:
- **Release notes** explaining the callback fix: "Arrow functions are no longer wrapped in `computed()`. If you have callbacks that access signals, they now work correctly without wrapping."
- **Updated reactivity rules** in the component authoring guide (`ui-components.md`): the section "const for derived values" should clarify that `const` arrow functions are not derived values -- they are static function definitions where reactivity is tracked at call sites.
- **A troubleshooting entry** for "my custom hook's signal properties don't auto-unwrap" pointing to the manifest system and the `.reactivity.json` escape hatch.

### For package authors:
- **`.reactivity.json` spec** -- a reference page documenting the schema, all possible `ReactivityShape` types, and examples for each.
- **How to generate it** -- is there a `vertz build --emit-manifest` flag? Or do they hand-write it?
- **Validation** -- what happens if the manifest is wrong (e.g., declares `data` as a `signalProperty` but the actual API returns a plain value)?

### For the team:
- **Update `dev-server-debugging.md`** with new manifest-related diagnostic markers. If `VERTZ_DEBUG=manifest` is added, document the log format and what to look for.

---

## 9. Additional Issues

### 9.1 Manifest Staleness in Monorepos

**QUESTION** -- In a monorepo where multiple packages import from each other (e.g., `@app/hooks` importing from `@app/api`), how does the manifest pre-pass handle cross-package boundaries? Does it only scan files in `src/`? Or does it scan workspace packages too?

If a developer has:
```
packages/
  hooks/src/use-tasks.ts    # imports query from @vertz/ui
  app/src/pages/tasks.tsx   # imports useTasks from @app/hooks
```

Does the manifest generator process `@app/hooks` as a "user file" (yes manifest) or a "package" (needs `.reactivity.json`)? The doc does not address this scenario. In a monorepo, the boundary between "user code" and "package code" is fuzzy.

### 9.2 `reactive-source` vs `signal-api` Consumer Experience

**QUESTION** -- The schema distinguishes `reactive-source` (all properties reactive, like `useContext`) from `signal-api` (specific properties reactive). But how does the compiler treat property access on a `reactive-source`?

For `signal-api`, the compiler knows exactly which properties need `.value` and which don't. For `reactive-source`, the compiler must insert `.value` on *every* property access. What if the developer accesses a method? `ctx.someMethod()` would become `ctx.someMethod.value()` -- is this correct?

The doc should clarify the access pattern for `reactive-source` exports, especially since `useContext` returns getter-wrapped objects where the behavior may differ from plain signal properties.

### 9.3 Performance Budget and the "100ms" Target

**NON-BLOCKING** -- The POC benchmarks 78ms for 203 files. The doc calls this "well under the 100ms budget." But:

- Where is the 100ms budget defined? Is it startup time? Per-build time? HMR cycle time?
- 78ms is for manifest generation alone. What's the total added latency when you include the import graph construction (Section 2.2.4 Phase 1, step 3-4)?
- The incremental update path (Section 2.2.6) says "regenerate manifest for changed file." What if a change to a deeply-imported utility causes a cascade of manifest regenerations? What's the worst-case HMR latency?

These numbers matter for DX. A 200ms HMR delay is fine. A 500ms delay is noticeable. The doc should specify the budget more precisely and include the total Phase 1 time (manifest generation + import graph + propagation), not just the parser benchmark.

### 9.4 Manifest Format Versioning

**NON-BLOCKING** -- The `.reactivity.json` schema will evolve. The doc defines no version field in the schema. When the schema changes (e.g., adding a new `ReactivityShape` type), how do old manifests interoperate? Package authors who shipped `.reactivity.json` in v1 of their package will have stale manifests when the Vertz compiler upgrades.

Add a `version` field to the manifest schema. Parse errors or unknown versions should fall back to `unknown` with a warning.

---

## Verdict

**Conditional approval.** The design is strong and well-researched. The POC work resolves the biggest unknowns. The zero-new-API promise is genuine for application developers.

However, three items must be resolved before this design moves to implementation:

1. **Error experience for `unknown` classifications** (Section 2) -- define what the developer sees.
2. **Breaking change analysis for Layer 1** (Section 4.4) -- acknowledge and specify the migration path.
3. **Manifest debugging story** (Section 6) -- provide at least one way for developers to inspect manifests.
4. **JSX attribute coverage confirmation** (Section 5) -- confirm that PR #926's literal/non-literal strategy covers attributes, not just children.

The non-blocking and question items should be addressed in a follow-up revision but do not block implementation planning.

---

*Reviewed by josh (vertz-advocate), 2026-03-07*
