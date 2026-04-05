# Phase 1: Client-Side State Collection

- **Author:** main agent
- **Reviewer:** review agent
- **Commits:** 385e1d0f6
- **Date:** 2026-04-05

## Changes

- `packages/ui/src/query/query.ts` (modified) -- added `_queryGroup` marker to query signals
- `packages/ui/src/query/__tests__/query-group-marker.test.ts` (new) -- 3 tests for `_queryGroup`
- `packages/ui-server/src/bun-plugin/state-inspector.ts` (new) -- `safeSerialize()`, `collectStateSnapshot()`, helpers
- `packages/ui-server/src/__tests__/state-inspector.test.ts` (new) -- 15 + 12 tests

## CI Status

- [x] Quality gates passed at 385e1d0f6

## Review Checklist

- [ ] Delivers what the ticket asks for
- [ ] TDD compliance (tests before/alongside implementation)
- [x] No type gaps or missing edge cases
- [ ] No security issues
- [ ] Public API changes match design doc

## Findings

### Changes Requested

---

### BLOCKER-1: `buildQuerySnapshot` positional mapping is wrong for real `query()` signals

**File:** `packages/ui-server/src/bun-plugin/state-inspector.ts`, lines 316-339

The `buildQuerySnapshot` function has two paths: a `named` path (using `_hmrKey`) and a positional `unnamed` fallback. However, **real query signals created by `query()` in `query.ts` do NOT have `_hmrKey`** -- signals are created as `signal<boolean>(false)` without a second argument. The `_hmrKey` is only set by the compiler for user-declared `let` variables.

This means in production, ALL query signals fall into the `unnamed` array. The positional mapping then assigns:

- `unnamed[0]` -> `data` (WRONG: this is actually `depHashSignal` -- a hash string)
- `unnamed[1]` -> `loading` (WRONG: this is `rawData`)
- `unnamed[2]` -> `revalidating` (WRONG: this is `loading`)
- ... and so on

The root cause is that `_queryGroup` is set on ALL 8 signals created by `query()` (including internal ones: `depHashSignal`, `entityBacked`, `refetchTrigger`), but the positional mapping assumes only the 5 user-facing signals exist.

**The test at line 224-265 masks this bug** because it creates signals WITH `_hmrKey` set (e.g., `signal(undefined, 'data')`), which exercises the `named` path -- a path that never executes for real query signals.

**Fix options (pick one):**

1. **Set `_hmrKey` on query signals in `query.ts`**: Add the key name as second arg: `signal<boolean>(false, 'loading')`, etc. This makes the named path work. Only set `_queryGroup` on the 5 user-facing signals, not on `depHashSignal`/`entityBacked`/`refetchTrigger`.

2. **Only mark the 5 user-facing signals with `_queryGroup`**: Remove `depHashSignal`, `entityBacked`, and `refetchTrigger` from the `_queryGroup` loop. This makes the positional mapping correct.

Option 1 is preferred because it's more robust -- named mapping doesn't depend on signal creation order.

---

### BLOCKER-2: Test mock does not match real `query()` signal creation pattern

**File:** `packages/ui-server/src/__tests__/state-inspector.test.ts`, lines 224-265

The test for query grouping creates signals with explicit `_hmrKey` names (`signal(undefined, 'data')`) and sets `_queryGroup` manually. In reality, `query()` creates signals WITHOUT `_hmrKey`. The test exercises the `named` map path in `buildQuerySnapshot`, which is dead code in production.

The test should either:
- Create signals without `_hmrKey` to test the actual production path, OR
- Be split into two tests: one for the named path and one for the positional path

This test currently gives false confidence that query grouping works correctly.

---

### SHOULD-FIX-1: `QuerySnapshot` type diverges from design doc

**File:** `packages/ui-server/src/bun-plugin/state-inspector.ts`, lines 38-45

The design doc specifies:
```typescript
interface QuerySnapshot {
  data: SerializedValue;
  loading: boolean;
  revalidating: boolean;
  error: SerializedValue;
  idle: boolean;
  key?: string;
}
```

But the implementation uses `SerializedValue` for ALL fields including `loading`, `revalidating`, and `idle`. While using `SerializedValue` is technically safer (the value is serialized from `peek()` which could theoretically return anything), it makes the type less useful for consumers who expect boolean fields. The design doc's narrower types are better for LLM consumers since they communicate the expected shape.

**Fix:** Either update the types to match the design doc (`loading: boolean`, etc.) or update the design doc to match the implementation. Prefer matching the design doc since it was reviewed and approved.

---

### SHOULD-FIX-2: `safeSerialize` does not handle `NaN`, `Infinity`, `-Infinity`

**File:** `packages/ui-server/src/bun-plugin/state-inspector.ts`, line 97

`NaN`, `Infinity`, and `-Infinity` are `typeof 'number'`, so `safeSerialize` returns them as-is. But these are NOT valid JSON values -- `JSON.stringify(NaN)` produces `"null"`, `JSON.stringify(Infinity)` produces `"null"`. The function's docstring says it produces "JSON-safe representation" but it silently lets non-JSON-safe numbers through.

This won't crash (JSON.stringify handles it), but it's a silent data loss: an `Infinity` signal value becomes `null` in the snapshot with no indication it was `Infinity`.

**Fix:** Add handling after the number check:
```typescript
if (typeof value === 'number') {
  if (!Number.isFinite(value)) return value !== value ? '[NaN]' : '[Infinity]';
  return value;
}
```

No test covers this case either.

---

### SHOULD-FIX-3: `truncateSnapshot` may not actually reduce size below 2MB

**File:** `packages/ui-server/src/bun-plugin/state-inspector.ts`, lines 341-354

The truncation strategy (keep first 3 instances per component) has two issues:

1. It doesn't re-check the size after truncation. If 3 instances per component still exceed 2MB (e.g., huge signal data), the response is returned as-is with `truncated: true` but still over the cap.
2. It doesn't reduce the number of components. If the snapshot is large because of thousands of component types (not instances), truncation does nothing.

**Fix:** Add a re-check loop or truncate more aggressively (reduce instances to 1, then reduce components, then truncate signal data). At minimum, add a comment documenting that this is a best-effort truncation.

---

### SHOULD-FIX-4: Missing test for `bigint` serialization

**File:** `packages/ui-server/src/__tests__/state-inspector.test.ts`

`safeSerialize` handles `bigint` (line 99) by calling `.toString()`, but there's no test for this. BigInt values can appear in signal state (e.g., IDs, timestamps).

---

### SHOULD-FIX-5: `afterEach` imported but never used in state-inspector test

**File:** `packages/ui-server/src/__tests__/state-inspector.test.ts`, line 1

`afterEach` is imported but never called. The cleanup (registry clear + DOM clear) only happens in `beforeEach`. While `beforeEach` is sufficient for test isolation, the unused import should be removed to avoid lint warnings, and per integration-test-safety rules, cleanup should ideally also happen in `afterEach` (especially the DOM clearing).

---

### NIT-1: `__DEV__` check is re-evaluated on every `query()` call

**File:** `packages/ui/src/query/query.ts`, line 286

```typescript
const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';
```

This evaluates `process.env.NODE_ENV` on every `query()` call. While not a performance issue (it's a property read), it's conventional to hoist this to module scope or use a framework-level `__DEV__` constant. The Vertz codebase likely has a canonical way to check dev mode.

---

### NIT-2: `vi` imported but never used in state-inspector test

**File:** `packages/ui-server/src/__tests__/state-inspector.test.ts`

`vi` is not imported in this file, but `afterEach` is imported and unused. Just flagging for cleanup.

---

### NIT-3: `seen.delete()` pattern allows duplicate serialization of shared objects

**File:** `packages/ui-server/src/bun-plugin/state-inspector.ts`, lines 163-179

The `seen.delete(obj)` call after recursion means a shared object referenced in two branches of a tree gets serialized twice instead of showing `[Circular]` the second time. This is **intentional and correct** for a state serializer (you want to see the full value in both places), but it could cause unexpectedly large output if a large object is referenced many times. Worth a comment noting this design choice.

---

### NIT-4: No test for `peekSafe` error handling

`peekSafe` wraps `sig.peek()` in try/catch and returns `[Error: message]` on failure. This is a key safety feature (dirty computed recomputation can throw), but there's no test for it. A test with a mock signal whose `peek()` throws would exercise this path.

## Resolution

<to be filled after fixes>
