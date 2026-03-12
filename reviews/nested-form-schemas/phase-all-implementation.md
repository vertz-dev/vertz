# Nested Form Schemas — Full Implementation Review

- **Author:** Implementation agent
- **Reviewer:** Adversarial review agent (Claude Opus 4.6)
- **Scope:** All 4 phases (form-data, chain proxy, compiler, types + integration)
- **Date:** 2026-03-12

## Changes

- `packages/ui/src/form/form-data.ts` (modified) — `nested` option, `setNestedValue()` helper
- `packages/ui/src/form/form.ts` (modified) — Chain proxy, nested types, updated FormInstance
- `packages/ui/src/form/public.ts` (modified) — New type exports
- `packages/ui/src/form/field-state.ts` (unchanged, reviewed for interaction)
- `packages/ui/src/form/validation.ts` (unchanged, reviewed for interaction)
- `packages/ui/src/form/__tests__/form-data.test.ts` (modified) — Nested parsing tests
- `packages/ui/src/form/__tests__/form.test.ts` (modified) — Chain proxy and nested field tests
- `packages/ui/src/form/__tests__/form.test-d.ts` (modified) — Type-level tests
- `packages/ui-compiler/src/transformers/signal-transformer.ts` (modified) — N-level chains, ElementAccessExpression
- `packages/ui-compiler/src/analyzers/jsx-analyzer.ts` (modified) — N-level reactivity detection
- `packages/ui-compiler/src/transformers/__tests__/signal-transformer.test.ts` (modified) — N-level chain tests
- `packages/ui-compiler/src/signal-api-registry.ts` (unchanged, reviewed for interaction)
- `packages/integration-tests/src/__tests__/form-walkthrough.test.ts` (modified) — Nested integration tests

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before/alongside implementation)
- [ ] No type gaps or missing edge cases — **issues found**
- [ ] No security issues — **issue found**
- [x] Public API changes match design doc
- [ ] Test coverage adequate for new behavior — **gaps found**
- [x] Performance considerations (proxy chains, caching)
- [x] Backward compatibility preserved

---

## Findings

### BUG-1: Prototype Pollution in `setNestedValue` (Security — HIGH)

**File:** `packages/ui/src/form/form-data.ts`, line 43-56

`setNestedValue` takes a dot-separated path from FormData keys and uses each segment to create/traverse nested objects. There is no sanitization of dangerous property names. An attacker-controlled form submission (or malicious input) with keys like `__proto__.polluted` or `constructor.prototype.polluted` can pollute `Object.prototype`.

```
// Attacker crafts FormData with:
//   key: "__proto__.isAdmin"  value: "true"
//
// setNestedValue(result, "__proto__.isAdmin", "true")
//   segments = ["__proto__", "isAdmin"]
//   current = result
//   segment = "__proto__" → current["__proto__"] is Object.prototype (exists, so no new obj)
//   current = Object.prototype
//   current["isAdmin"] = "true"  ← prototype pollution!
```

**Fix:** Guard against `__proto__`, `constructor`, and `prototype` in path segments:

```ts
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function setNestedValue(obj: Record<string, unknown>, dotPath: string, value: unknown): void {
  const segments = dotPath.split('.');
  for (const seg of segments) {
    if (DANGEROUS_KEYS.has(seg)) return; // silently skip dangerous paths
  }
  // ... rest of implementation
}
```

Similarly, `resolveNestedInitial` in `form.ts` (line 189-200) traverses user-provided initial objects using attacker-controllable dot-path strings. While the risk is lower (reading, not writing), accessing `__proto__` on an object returns `Object.prototype`, which could leak unexpected data. The same guard should be applied.

---

### BUG-2: `resolveNestedInitial` called on every field creation, factory function invoked multiple times

**File:** `packages/ui/src/form/form.ts`, lines 189-217

When `options.initial` is a function, `resolveNestedInitial` calls `options.initial()` every time a new nested field is created. Similarly, the flat path branch in `getOrCreateField` calls `options.initial()` for each flat field creation. If the factory function has side effects or returns different objects each time, field initial values can be inconsistent.

```ts
// resolveNestedInitial calls options.initial() on every invocation
const initialObj =
  typeof options?.initial === 'function' ? options.initial() : options?.initial;
```

If a developer provides `initial: () => fetchDefaultsFromStore()`, and fields are lazily created at different times, each field may get a different snapshot of the store.

**Severity:** Medium. The design doc lists "Reactive initial values" as a non-goal, but calling a factory multiple times with potentially different results is a subtle correctness bug.

**Fix:** Resolve the initial object once at form creation time (or lazily on first access, but cache it):

```ts
let resolvedInitial: DeepPartial<TBody> | undefined;
function getInitialObj() {
  if (resolvedInitial === undefined) {
    resolvedInitial = typeof options?.initial === 'function'
      ? options.initial()
      : options?.initial ?? null; // use null as sentinel for "resolved but empty"
  }
  return resolvedInitial === null ? undefined : resolvedInitial;
}
```

---

### BUG-3: `FieldPath<T>` does not include array element paths

**File:** `packages/ui/src/form/form.ts`, lines 93-99

The `FieldPath` type recursion only enters `Record<string, unknown>` branches — it does not descend into arrays. For an `OrderBody = { items: Array<{ product: string }> }`, `FieldPath<OrderBody>` produces `"items"` only. It does NOT produce `"items.0.product"` or `"items.${number}.product"`.

This means `setFieldError('items.0.product', 'Required')` is a **type error** at compile time, even though it works at runtime. This is a type gap.

```ts
// Current FieldPath:
type FieldPath<T, Prefix extends string = ''> =
  | `${Prefix}${keyof T & string}`
  | {
      [K in keyof T & string]: T[K] extends Record<string, unknown>
        ? FieldPath<T[K], `${Prefix}${K}.`>
        : never;
    }[keyof T & string];

// Array<{ product: string }> does NOT extend Record<string, unknown>
// (it extends object, but the mapped type check fails)
// So the recursion stops at "items"
```

**Fix:** Add an array branch to `FieldPath`:

```ts
type FieldPath<T, Prefix extends string = ''> =
  | `${Prefix}${keyof T & string}`
  | {
      [K in keyof T & string]: T[K] extends Array<infer U>
        ? U extends Record<string, unknown>
          ? `${Prefix}${K}.${number}` | FieldPath<U, `${Prefix}${K}.${number}.`>
          : never
        : T[K] extends Record<string, unknown>
          ? FieldPath<T[K], `${Prefix}${K}.`>
          : never;
    }[keyof T & string];
```

**Note:** There is also no type-level test in `form.test-d.ts` that validates `FieldPath` for array types. The type test for `setFieldError` on the `orderForm` is missing.

---

### BUG-4: `DeepPartial<T>` does not handle `BuiltInObjects`

**File:** `packages/ui/src/form/form.ts`, lines 84-90

`NestedFieldAccessors<T>` correctly guards against recursion into `BuiltInObjects` (Date, RegExp, File, Blob, Map, Set). However, `DeepPartial<T>` does not have the same guard. It checks `extends Array<infer U>` and `extends Record<string, unknown>`, but `Date`, `Map`, and `Set` all extend `Record<string, unknown>` via their index signatures.

For a type like `{ createdAt: Date }`, `DeepPartial` will attempt to make Date's properties optional, producing a weird partial Date type instead of just `Date | undefined`.

**Severity:** Low-Medium. In practice this may not cause visible issues because `DeepPartial<Date>` still accepts `Date` values. But it's inconsistent with the BuiltInObjects guard in NestedFieldAccessors.

**Fix:** Add BuiltInObjects guard to DeepPartial:

```ts
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends BuiltInObjects
    ? T[K]
    : T[K] extends Array<infer U>
      ? Array<DeepPartial<U>>
      : T[K] extends Record<string, unknown>
        ? DeepPartial<T[K]>
        : T[K];
};
```

---

### GAP-1: No JSX-level test coverage for N-level chain reactivity detection

**File:** `packages/ui-compiler/src/analyzers/__tests__/jsx-analyzer.test.ts`

The design doc (Phase 3 acceptance criteria) explicitly lists:

> ```
> describe('Feature: N-level JSX reactivity detection', () => {
>   describe('Given a 4-level chain in a JSX expression', () => {
>     it('Then marks the expression as reactive', () => {});
>   });
>   describe('Given bracket notation in a JSX expression', () => {
>     it('Then marks the expression as reactive', () => {});
>   });
> });
> ```

These tests are completely missing. The `jsx-analyzer.test.ts` file has no tests for `fieldSignalProperties`, N-level chains, or `ElementAccessExpression`. The implementation in `jsx-analyzer.ts` has the logic (lines 92-167), but it is not tested.

This is a TDD compliance violation. Untested code may contain latent bugs.

---

### GAP-2: No test for `taskForm.dirty` ambiguity (2-level vs field chain)

`dirty` appears in both `signalProperties` and `fieldSignalProperties` in the signal API registry. The design doc explicitly calls this out as a "Critical constraint" (Section 4, Unknown 3, and Section 10). The correct behavior is:

- `taskForm.dirty` (2-level) should be handled by Pass 2 as a signal property (form-level dirty)
- `taskForm.title.dirty` (3-level) should be handled by Pass 1 as a field chain (per-field dirty)

There is **no explicit test** for this ambiguity. The existing test "auto-unwraps new form-level signal property dirty" only tests the 2-level case. There is no test for the 3-level `taskForm.title.dirty` case specifically.

While the N-level chain detection has the `chainLength < 3` guard (line 214 of signal-transformer.ts), the lack of a test for this specific edge case is concerning since it's called out as critical in the design doc.

**Fix:** Add a test:

```ts
it('auto-unwraps 3-level field chain with dirty (taskForm.title.dirty)', () => {
  const result = transform(
    `function TaskForm() {\n  const taskForm = form({});\n  const d = taskForm.title.dirty;\n  return <div>{d}</div>;\n}`,
    [formVar],
  );
  expect(result).toContain('taskForm.title.dirty.value');
});
```

---

### GAP-3: No test for `setFieldError` runtime accepting arbitrary strings

**File:** `packages/ui/src/form/form.ts`, line 331

At runtime, `setFieldError` accepts any string:

```ts
setFieldError: (field: string, message: string) => {
  getOrCreateField(field).error.value = message;
},
```

The runtime signature is `(field: string, message: string)` while the TypeScript type is `(field: FieldPath<TBody>, message: string)`. This is correct and expected (types constrain, runtime accepts). However, there is no test for what happens when `setFieldError` is called with a deeply nested dot-path at runtime (e.g., `'a.b.c.d'`). The test in `form.test.ts` only tests `'address.street'` (2 levels deep). This is a minor gap.

---

### GAP-4: `setNestedValue` does not handle pre-existing conflicting types

**File:** `packages/ui/src/form/form-data.ts`, line 43-56

If FormData contains both `address=foo` and `address.street=bar`, the code will:
1. Set `result.address = 'foo'` (flat key)
2. Then try `setNestedValue(result, 'address.street', 'bar')`, which does `current = result['address']` (the string `'foo'`), then tries to set a property on a string — which silently fails in non-strict mode or throws in strict mode.

There is no test for this conflicting-key scenario. The behavior should be documented or guarded.

**Severity:** Low. Unlikely in practice (malformed form submission), but the silent failure is concerning.

---

### GAP-5: `handleInputOrChange` for nested inputs — no runtime test with dot-path names

**File:** `packages/ui/src/form/form.ts`, lines 301-306

The design doc states (Section 9): "The existing `handleInputOrChange` and `handleFocusout` handlers use `target.name` to look up fields. For nested inputs, `target.name` is already the dot-path string (e.g., `"address.street"`), so `getOrCreateField(target.name)` works unchanged."

There is no test for this. The `__bindElement` tests in `form.test.ts` only test flat field names (`'title'`). A test with `name="address.street"` dispatched through the form element's input/focusout event delegation would validate this claim.

---

### OBSERVATION-1: Chain proxy catches all Symbol access, returns undefined

**File:** `packages/ui/src/form/form.ts`, lines 223-237

The chain proxy's `get` trap returns `undefined` for non-string properties. This means:
- `Symbol.toPrimitive` returns `undefined` (acceptable, no string coercion supported)
- `Symbol.iterator` returns `undefined` (acceptable, no iteration)
- `Symbol.toStringTag` returns `undefined`

This is consistent with the design doc's rejection of `Symbol.toPrimitive` for the `fields` proxy. No issue, but worth noting: logging a chain proxy object (e.g., `console.log(form.address)`) will produce `[object Object]` with no useful introspection. DevTools may show an empty object. This could confuse developers during debugging.

---

### OBSERVATION-2: `fieldGeneration` signal for reactive dirty/valid

The `fieldGeneration` signal pattern (line 171) is a clever solution for making `dirty` and `valid` computed signals react to new field additions. Reading `fieldGeneration.value` inside the computed callback creates a subscription, and incrementing it in `getOrCreateField` triggers re-evaluation.

However, this means EVERY field access (even reading an existing field's error) does NOT trigger re-evaluation — only field creation does. The computed signals also iterate over `fieldCache.values()`, reading each field's `dirty`/`error` signal. This correctly subscribes to individual field changes.

No issue. This is well-designed.

---

### OBSERVATION-3: Performance characteristics are sound

- Chain proxies are cached in `chainProxyCache` (Map<string, object>) — no allocation on repeated access
- FieldState objects are cached in `fieldCache` (Map<string, FieldState>) — lazy creation
- N-level compiler detection walks up chains on each PropertyAccessExpression, but this is bounded by chain depth (typically 3-5) and runs at compile time, not runtime

No performance concerns identified.

---

### OBSERVATION-4: `FieldPath` is not exported for external use

`FieldPath` is exported in `public.ts` as a type-only export, which is correct. Developers can import it for custom helper functions that need to accept field paths. No issue.

---

### DESIGN ALIGNMENT: Matches design doc

The implementation closely follows the design doc at `plans/nested-form-schemas.md`:

- **Phase 1** (formDataToObject): Opt-in `nested` option, `setNestedValue`, backward compatible. Matches exactly.
- **Phase 2** (chain proxy): `getOrCreateChainProxy`, `chainProxyCache`, `resolveNestedInitial`, `DeepPartial` initial values. Matches.
- **Phase 3** (compiler): N-level chain detection with `chainLength >= 3`, ElementAccessExpression handling. Matches.
- **Phase 4** (types): `NestedFieldAccessors`, `ArrayFieldAccessors`, `FieldPath`, `DeepPartial`, `BuiltInObjects` guard, reserved name guard. Matches.

No design deviations detected.

---

## Summary

| ID | Category | Severity | Description |
|----|----------|----------|-------------|
| BUG-1 | Security | HIGH | Prototype pollution in `setNestedValue` — no guard on `__proto__`/`constructor`/`prototype` |
| BUG-2 | Correctness | Medium | `resolveNestedInitial` calls factory function on every field creation |
| BUG-3 | Type gap | Medium | `FieldPath<T>` does not recurse into array element types |
| BUG-4 | Type gap | Low-Medium | `DeepPartial<T>` does not guard against BuiltInObjects |
| GAP-1 | Test coverage | Medium | No JSX analyzer tests for N-level chain reactivity |
| GAP-2 | Test coverage | Medium | No test for `dirty` ambiguity (2-level signal vs 3-level field) |
| GAP-3 | Test coverage | Low | No test for deeply nested dot-path runtime setFieldError |
| GAP-4 | Edge case | Low | No test/guard for conflicting flat+nested FormData keys |
| GAP-5 | Test coverage | Low | No runtime test for nested input name event delegation |

## Verdict

**Changes Requested**

BUG-1 (prototype pollution) is a must-fix before merge. BUG-2 and BUG-3 should be fixed in this PR. GAP-1 and GAP-2 are TDD compliance issues that should be addressed. The remaining items can be addressed in follow-up if needed.

## Resolution

_Pending — awaiting fixes for findings above._
