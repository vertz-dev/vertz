# Phase 2 — Lifecycle: AbortSignal + iterator.return + refetch + reactive-key + source-type lock

## Context

Phase 1 landed the stream overload and accumulation. Phase 2 makes it production-safe: real `AbortSignal` threading, graceful `iterator.return?.()` on cancel, `refetch()` that resets state, automatic restart on reactive dep change, and a hard error when a thunk's source type swaps mid-flight.

Read [`query-subscriptions.md`](../query-subscriptions.md) Implementation Notes #1, #5, #6 and the Detection / source-type-invariance section.

## Tasks

### Task 1: AbortSignal + iterator.return on dispose / refetch

**Files (2):**
- `packages/ui/src/query/query.ts` (modify)
- `packages/ui/src/query/__tests__/query-stream.test.ts` (extend)

**What to implement:**
1. Each iterator pump owns an `AbortController`. The signal is passed to the thunk on every fresh invocation.
2. On `dispose()`: `controller.abort(new QueryDisposedReason())`, then `void Promise.resolve(currentIterator?.return?.()).catch(() => {})`. The catch ensures rejected `return()` calls never produce unhandled-rejection warnings.
3. On `refetch()`: same as dispose for the *current* iterator, then reset `data.value = []`, `error.value = undefined`, set `reconnecting.value = true` (only when data already had items pre-refetch), set `loading.value = true` only on the very first run, then bump a refetch trigger so the effect re-runs and constructs a new controller + iterator.
4. The pump checks `signal.aborted` between yields (defense in depth) so producers that ignore the signal can't keep appending after dispose.

**Test cases (RED first):**
- `Given an iterator that respects AbortSignal / When dispose() is called mid-iteration / Then the signal aborts with QueryDisposedReason and no further yields land`
- `Given a stream that has yielded once / When refetch() is called / Then reconnecting is true between cancel and the next first yield`
- `Given a stream that ignores the abort signal / When dispose() / Then yields stop landing in data anyway`

**Acceptance criteria:**
- [ ] Three describe-blocks pass
- [ ] No unhandled-rejection warnings in test output
- [ ] No `setTimeout` / `setInterval` leaks reported by `vtz test`
- [ ] Quality gates clean

---

### Task 2: Reactive-key change → automatic restart

**Files (2):**
- `packages/ui/src/query/query.ts` (modify — wire effect re-run to abort old + start new)
- `packages/ui/src/query/__tests__/query-stream.test.ts` (extend)

**What to implement:**
The effect already re-runs on reactive dep change for the existing Promise path (`callThunkWithCapture`). For streams, the re-run must:
1. Abort the previous controller
2. Discard `iterator.return?.()` rejection
3. Reset `data.value = []`, `error.value = undefined`, set `reconnecting.value = true`
4. Construct a new controller, call thunk with new signal, classify, pump

**Test case (RED first):**
- `Given a stream backed by a reactive sessionId / When the sessionId changes / Then the previous iterator aborts and a new iterator starts for the new id`

The implementation should reuse the existing `callThunkWithCapture` machinery so the dep hash is computed identically to the Promise path. The cache key for streams is the result of `serializeQueryKey(options.key)` (tuples flattened in Phase 1).

**Acceptance criteria:**
- [ ] Reactive-key test passes
- [ ] Aborted iterators receive the abort signal exactly once
- [ ] No iterator double-start (the same `streamFor(id)` is not invoked twice for the same id within one effect run)

---

### Task 3: Source-type lock + invariance error

**Files (2):**
- `packages/ui/src/query/query.ts` (modify — track first-classified mode, throw on swap)
- `packages/ui/src/query/__tests__/query-stream.test.ts` (extend)

**What to implement:**
After the first non-null thunk return is classified, store the mode (`'stream' | 'promise'`) on a private variable in the closure. On every subsequent classification, compare. If different, throw a `VertzException` (or canonical equivalent) with the exact message defined in the design doc:

> `query()` was first invoked with an AsyncIterable source and is locked to stream mode. The most recent thunk call returned a Promise. Conditional source-type swaps are not supported — split the work into two queries with distinct keys, or normalize both branches to one source shape.

(And the symmetric inverse for promise→stream swaps.)

The throw fires *before* `rawData` is mutated and before any new iterator is opened.

**Test case (RED first):**
- `Given the thunk returns AsyncIterable on first run and Promise on second / When deps change / Then VertzException is thrown naming the source-type swap`

**Acceptance criteria:**
- [ ] Swap test passes
- [ ] `null` thunk returns do not flip the lock
- [ ] Error message matches design doc verbatim (case-insensitive `/source-type/i` regex)
- [ ] Quality gates clean

---

### Task 4: Phase 2 commit + adversarial review

**Files (1):**
- `reviews/query-subscriptions/phase-02-lifecycle.md`

**What to do:**
Same flow as Phase 1 task 3. Reviewer specifically checks:
- Abort cancellation order: signal → return() → state reset, no race
- `reconnecting` transitions are correct (only true between cancel and next first yield, only when data already had items pre-cancel)
- Reactive key change does not leak the old controller
- Source-type lock cannot be bypassed by interleaving null returns
- No regressions in existing `query.test.ts`

**Acceptance criteria:**
- [ ] Phase 2 commit on branch
- [ ] Review markdown with all findings resolved
- [ ] Quality gates green
