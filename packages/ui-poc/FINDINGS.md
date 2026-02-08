# @vertz/ui POC Findings

POC to validate the core unknowns in the @vertz/ui design plan. Each section corresponds to a gap identified in the design that could only be resolved through implementation.

## Summary

| Area | Verdict | Notes |
|------|---------|-------|
| Signal runtime performance | Validated | 433 bytes gzipped, 37K-61K ops/sec |
| TypeScript type preservation | Validated | `tsc --noEmit` works on both source and compiled output |
| Compiler transform correctness | Validated with caveats | ts-morph + MagicString works; two-pass taint analysis required |
| Prop getter wrapping | Validated | Getters propagate reactivity across function boundaries |
| Conditional rendering | Validated | Synchronous effect execution simplifies the API |
| List reconciliation | Validated | Keyed reconciliation reuses DOM nodes correctly |
| watch() semantics | Validated | Both forms work; no infinite loops with separate signals |
| Bundle size budget | Exceeded expectations | Full runtime: 1.13 KB gzipped (budget was 4.5 KB) |

---

## 1. Signal Runtime Performance

**Question:** Can we hit the 4.5KB budget? What's cold-start time?

**Finding:** The signal runtime (`signal()`, `computed()`, `effect()`, `batch()`) is **433 bytes gzipped** (866 bytes minified). The full runtime including DOM helpers and lifecycle is **1.13 KB gzipped** (2.45 KB minified). This is well under the 4.5 KB budget, leaving substantial room for the router, query(), and form() modules.

**Benchmark results (Apple Silicon, Bun 1.3.8):**

| Benchmark | ops/sec |
|-----------|---------|
| signal create + get + set (1000x) | 37,798 |
| computed chain (depth=10, 100 updates) | 36,260 |
| effect with 100 signals, batch update | 51,635 |
| 1000 subscribers on one signal | 13,707 |
| diamond dependency (100 updates) | 61,590 |

**Conclusion:** Performance is excellent. The diamond dependency graph benchmark shows computed values handle common reactive patterns without glitches.

---

## 2. TypeScript Type Preservation

**Question:** Does `tsc --noEmit` work on source files where `let count = 0` gets compiled to `signal(0)`? Does this require a TS plugin?

**Finding: No TS plugin required.** Both the source and compiled output type-check cleanly.

### Source files (pre-transform)

Because source files are valid `.tsx`, standard `tsc` type-checks them without any plugin or custom configuration. `let count = 0` is just a normal `let` declaration that TypeScript understands natively. This is the key advantage over Svelte's `.svelte` files.

### Compiled output (post-transform)

The compiled output also type-checks against the signal runtime type declarations. The compiler transforms:
- `let count = 0` to `const __count = __signal(0)` -- TypeScript infers `Signal<number>`
- `count` reads to `__count.get()` -- returns `number`
- `count++` to `__count.update(v => v + 1)` -- `v` inferred as `number`
- `count = !count` to `__count.set(!__count.get())` -- types flow through

**Validated with 9 type-check tests** covering number, string, boolean, and derived types across source and compiled output.

**Caveat:** The POC validated this with ts-morph's in-memory TypeScript. A full implementation should also validate with the real `tsc` binary on disk, especially for cross-file imports. Expect this to work since the output is standard TypeScript.

---

## 3. Compiler Transform Correctness

**Question:** Can ts-morph + MagicString handle real-world patterns?

**Finding: Yes, with caveats.**

### What works well

- **Two-pass taint analysis** correctly identifies reactive variables even through transitive `const` chains. `let quantity = 1; const total = quantity * 10; <p>{total}</p>` correctly marks both `quantity` (as signal) and `total` (as computed).
- **MagicString** produces correct source maps for all transformations.
- **Component detection** via PascalCase naming + JSX return detection works reliably.
- **Multiple reactive variables** in the same component transform correctly.
- **Various mutation patterns**: `++`, `--`, `=`, `+=`, `-=` all transform correctly.
- **RHS rewriting**: Assignment RHS `active = !active` correctly becomes `__active.set(!__active.get())`.

### Caveats and surprises

1. **ts-morph's `VariableDeclarationKind` is a string enum** (`"let"`, `"const"`, `"var"`), not numeric. The TypeScript compiler API uses numbers, but ts-morph wraps them as strings. This was a discovery during implementation.

2. **`containsJsx()` check is fragile** for in-memory files. The ts-morph project must be configured with `jsx: JsxPreserve` (numeric `4`) and the filename must end in `.tsx` for JSX parsing to work.

3. **Word-boundary regex for variable name matching** (`\bname\b`) works for most cases but would fail for variable names that are substrings of other names (e.g., `let x = 0; let xMax = 10;` -- `\bx\b` would also match inside `xMax` if the regex is not properly applied). The POC uses ts-morph's AST-based identifier finding for read/write positions, but uses regex for rewriting computed body text. A full implementation should use AST-based rewriting for the computed body as well.

4. **JSX transform is not implemented.** The POC focuses on the reactivity transform (`let` -> `signal()`, `const` -> `computed()`). The JSX-to-DOM-calls transform (e.g., `<div>{count}</div>` -> `__element("div")` + `__text(() => __count.get())`) was validated through the DOM helper tests instead of through compiler output. This is a significant chunk of work for Phase 2.

5. **Spread props are not handled in the compiler.** The POC validates that getter-based prop wrapping works at runtime (see section 4), but the compiler doesn't yet detect and transform `<Child {...props} />` or `<Child value={count} />` into getter-wrapped calls.

### Design change needed

The design document describes a single-pass analysis where "a `let` variable is reactive if it is referenced in JSX." The POC discovered this is insufficient -- a **two-pass taint analysis** is required:

1. Pass 1: Collect all `let` and `const` declarations with their dependency graphs.
2. Pass 2: Find names in JSX, then propagate reactivity backwards through the dependency graph.

This is because a `let` can be reactive without appearing directly in JSX (e.g., `let x = 0; const y = x * 2; <p>{y}</p>` -- `x` is reactive because `y` depends on it and `y` is in JSX).

---

## 4. Prop Getter Wrapping

**Question:** Can the compiler reliably wrap reactive props as getters? What about spread props, conditional expressions?

**Finding: The runtime pattern works perfectly. Compiler implementation is feasible.**

### What was validated

The getter pattern described in the design works as expected:

```typescript
// Compiled: Child({ get value() { return __count.get() } })
```

When the child reads `props.value` inside an effect (or any reactive context like `text()`), it auto-tracks the parent's signal through the getter. When the parent's signal changes, only the specific DOM nodes reading that prop update.

### Specific patterns validated

| Pattern | Works? | Notes |
|---------|--------|-------|
| Single getter prop | Yes | `{ get value() { return __count.get() } }` |
| Multiple getter props | Yes | Each prop independently tracked |
| Static + dynamic mixed | Yes | Static props as plain values, dynamic as getters |
| Spread props with getters | Yes | `Object.defineProperties()` approach works |
| Conditional getter expression | Yes | `{ get content() { return show ? text : null } }` |

### Surprise

`Object.defineProperties` is needed for spread + getter combination. A simpler approach might be to always use `Object.create(null)` with `defineProperties` for component props, which avoids prototype chain issues.

---

## 5. Conditional and List Rendering

**Question:** How does cleanup work when switching branches? Lazy vs eager creation? What's list reconciliation performance?

### Conditional rendering

**Finding: Synchronous effect execution simplifies everything.**

Because `effect()` runs synchronously on creation, `conditional()` can return the first-rendered node directly instead of returning an anchor that gets replaced later. This avoids a class of bugs where the anchor isn't in the DOM yet when the first render happens.

Branch creation is **lazy** -- branches are only created when their condition is true for the first time. Branch switching works by `replaceChild()` in the DOM.

**Caveat:** Branch cleanup (disposing signals/effects created within a branch) is not yet implemented. A full implementation needs an ownership/scope system where each branch's effects are tracked and disposed when the branch is removed.

### List reconciliation

**Finding: Keyed reconciliation works correctly and reuses DOM nodes.**

The POC implements a simple keyed reconciliation algorithm:
1. Map new keys to existing DOM nodes.
2. Remove nodes whose keys are no longer present.
3. Reorder remaining nodes to match the new key order.

DOM node reuse was verified: reordering items does NOT recreate DOM nodes -- it moves them. This is critical for preserving focus state, animation state, and other DOM properties.

**Performance note:** The simple algorithm is O(n) per update where n is the list length. For very large lists (1000+ items), a more sophisticated diffing algorithm (like Ivi's LIS-based approach) would be needed.

---

## 6. watch() Semantics

**Question:** Auto-track in callback leads to infinite loops? No auto-track sufficient for real cases?

**Finding: The two-form design works as described.**

### Form 1: `watch(() => { ... })` -- mount only

Runs once, never re-runs. Does NOT track signals read inside the callback. `onCleanup()` runs on dispose.

### Form 2: `watch(() => dep, (value) => { ... })` -- reactive

The dependency expression `() => dep` runs inside an effect for auto-tracking. The callback receives the current value. `onCleanup()` runs before each re-execution.

### Infinite loop analysis

| Scenario | Result |
|----------|--------|
| Write to a DIFFERENT signal in callback | No loop -- callback doesn't track the written signal |
| Write to the SAME signal in callback | Self-loop -- runs until the condition stabilizes |
| Write to a signal the dep expression reads | Re-triggers (this is correct behavior) |

The self-loop case (`watch(() => s.get(), (v) => { if (v < 3) s.set(v + 1); })`) terminates when the condition becomes false. This matches the design's intent and Solid's `createEffect` behavior.

**Recommendation:** For production, add a max iteration guard (e.g., 100 re-runs) to catch accidental infinite loops with a clear error message.

---

## 7. Bundle Size Analysis

| Module | Minified | Gzipped |
|--------|----------|---------|
| Signal core (signal, computed, effect, batch) | 866 B | 433 B |
| DOM helpers (element, text, attr, on, conditional, list) | ~1.1 KB | ~550 B |
| Lifecycle (watch, onMount, onCleanup) | ~450 B | ~200 B |
| **Full runtime** | **2.45 KB** | **1.13 KB** |

The design estimated 4.5 KB gzipped for the full runtime. The POC achieves 1.13 KB -- roughly 4x under budget. This leaves ample room for:
- Suspense + ErrorBoundary (~0.5 KB estimated)
- Context system (~0.3 KB estimated)
- Router core (~2 KB estimated)
- query() + form() (~3 KB estimated, loaded separately)

---

## 8. Design Changes Recommended

Based on the POC findings, these changes to the design document are recommended:

### Must change

1. **Two-pass taint analysis (Section 3):** The design says "a `let` variable is reactive if it is referenced in JSX." This should be updated to describe the two-pass taint propagation: a `let` is reactive if it is referenced in JSX directly **or** transitively through a `const` that is itself referenced in JSX (or through another const that is, etc.).

### Should consider

2. **Branch cleanup ownership:** The design should describe a scope/ownership system for conditional and list rendering. Each branch/item should own its effects and dispose them on removal. This is standard in Solid and Svelte.

3. **Max iteration guard for effects/watch:** Add a production safety valve to prevent accidental infinite loops, with a clear error message pointing to the offending watch() call.

4. **Computed body rewriting:** The compiler should use AST-based rewriting (not regex) when rewriting the body of computed expressions. Regex-based replacement can produce incorrect results with variable names that are substrings of other identifiers.

5. **Props object creation:** Consider standardizing on `Object.defineProperties(Object.create(null), { ... })` for component props to ensure getter-based reactivity works reliably with all prop patterns including spreads.

---

## Test Coverage

| File | Tests | Status |
|------|-------|--------|
| signal.ts | 22 | All passing |
| dom.ts | 17 | All passing |
| lifecycle.ts | 13 | All passing |
| compiler.ts | 16 | All passing |
| props (runtime validation) | 5 | All passing |
| typecheck-validation.ts | 9 | All passing |
| **Total** | **82** | **All passing** |

All tests run in ~3.3 seconds (2.7s of which is type-check validation using ts-morph).
