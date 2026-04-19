# Phase 1 — Foundation: tuple key serialization + stream overload + accumulation E2E

## Context

Implements the foundational pieces of [`query-subscriptions.md`](../query-subscriptions.md) (issue #2846): tuple-key serialization, the new stream overload signature, runtime classification via `Symbol.asyncIterator`, and the iterator-pump that appends yields to a `Signal<T[]>`.

Goal: a stream-backed `query()` that yields N items and exposes them in order via `.data`, with the right `loading` / `error` semantics. Lifecycle (abort, refetch) lands in Phase 2.

Read the design doc for the full API surface, manifesto alignment, and non-goals.

## Tasks

### Task 1: `serializeQueryKey` utility + tests

**Files (3):**
- `packages/ui/src/query/key-serialization.ts` (new)
- `packages/ui/src/query/__tests__/key-serialization.test.ts` (new)
- `packages/ui/src/query/index.ts` (modify — re-export)

**What to implement:**
Pure utility: `serializeQueryKey(key: string | readonly unknown[]): string`. String keys pass through. Tuple keys → `JSON.stringify(key, sortObjectKeys)` where `sortObjectKeys` recursively sorts object keys so `{a:1,b:2}` and `{b:2,a:1}` produce the same string. Functions / symbols / class instances throw a typed error naming the offending position in the tuple.

**Acceptance criteria:**
- [ ] `serializeQueryKey('foo') === 'foo'`
- [ ] `serializeQueryKey(['session', 'abc'])` returns deterministic string
- [ ] `serializeQueryKey([{ b: 2, a: 1 }])` === `serializeQueryKey([{ a: 1, b: 2 }])`
- [ ] `serializeQueryKey([() => {}])` throws with message naming index 0
- [ ] `serializeQueryKey([Symbol('x')])` throws with message naming index 0
- [ ] No reliance on `JSON.stringify` ordering nondeterminism — proven by a test with deeply nested objects with reversed key order
- [ ] Quality gates clean (`vtz test`, typecheck, lint)

---

### Task 2: Stream overload signature + classification + first E2E test

**Files (3):**
- `packages/ui/src/query/query.ts` (modify — add types + classification + iterator pump)
- `packages/ui/src/query/__tests__/query-stream.test.ts` (new — accumulation + error path)
- `packages/ui/src/query/__tests__/query.test-d.ts` (modify — add stream type tests)

**What to implement:**
1. New exports in `query.ts`:
   - `class QueryDisposedReason extends Error` (for use in Phase 2 — defined now to keep the public API additive in one place)
   - `interface QueryStreamOptions { key: string | readonly unknown[]; }`
   - `interface QueryStreamResult<T> { data, loading, reconnecting, error, idle, refetch, revalidate, dispose }`
   - New overload **placed before** the existing Promise overload so TypeScript prefers it for thunks returning `AsyncIterable`:
     ```ts
     export function query<T>(
       thunk: (signal: AbortSignal) => AsyncIterable<T> | null,
       options: QueryStreamOptions,
     ): QueryStreamResult<T>;
     ```
2. Internal classification: when the function-thunk path is hit, call the thunk once with a placeholder `AbortController().signal` (real signal wired in Phase 2). If the return value is `AsyncIterable`, branch into the stream pump; otherwise fall through to the existing Promise path.
3. Stream pump: `for await (const item of iter)` appends to a `Signal<T[]>` initialized to `[]`. After the first yield, `loading.value = false`. If the iterator throws, `error.value = err` and pumping stops. After completion (StopIteration), `loading.value = false` and `data` retains accumulated items.
4. **Mutual exclusion** check: if `options.refetchInterval` is set in this code path, throw `VertzException` (or whatever error class is canonical here) before opening the iterator.
5. The signal threading is real but no abort wiring yet — Phase 2 hooks `dispose()` and `refetch()` to call `controller.abort()`.

**Reactive-dep tracking:** for Phase 1 the thunk runs once inside `lifecycleEffect` like the existing path so reactive deps are captured for Phase 2's reactive-key behavior. Re-runs that change the source type are not handled in this phase (Phase 2 adds the source-type lock).

**Test cases (RED first):**
- `Given an AsyncIterable that yields three items / When created / Then loading flips and data accumulates in order`
- `Given an iterator that throws after one yield / Then error is set and data preserves what was yielded`
- `Given refetchInterval and a stream thunk together / Then construction throws`

**Type tests in `query.test-d.ts`:**
- `// @ts-expect-error key is required` on stream overload
- `data: AgentEvent[]` (not `T | undefined`) inferred for stream queries
- Promise overload signatures unchanged (regression)

**Acceptance criteria:**
- [ ] First three describe-blocks of the design doc's E2E suite pass
- [ ] `query.test-d.ts` type tests pass (no `@ts-expect-error` regressions)
- [ ] No regressions in existing `query.test.ts`
- [ ] Quality gates clean across `packages/ui`

---

### Task 3: Phase 1 commit + adversarial review

**Files (1):**
- `reviews/query-subscriptions/phase-01-foundation.md` (new — review markdown)

**What to do:**
1. Stage and commit Phase 1 work as a single conventional-commit message: `feat(ui): add stream overload to query() (#2846)`.
2. Spawn an adversarial review agent. The review checks:
   - TDD compliance (tests written before implementation)
   - No type gaps (every overload exercised in `.test-d.ts`)
   - No imports of internal-only modules from outside `@vertz/ui`
   - Stream pump cancels cleanly when the test exits (no hanging `for-await`)
   - Existing query() behaviour unchanged
   - Refetch/dispose interaction with the new state machine doesn't leak (even though full lifecycle lands in Phase 2)
3. Fix any blockers/should-fix items. Re-run quality gates. Re-review if blockers were found.
4. Only proceed to Phase 2 when the review approves.

**Acceptance criteria:**
- [ ] Phase 1 commit on the branch
- [ ] Review markdown written with author/reviewer/commit-range/findings/resolution
- [ ] All review blockers resolved
- [ ] Quality gates green at the resolved commit
