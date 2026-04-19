# Phase 4 — HMR test, docs page, changeset

## Context

Phases 1–3 ship the implementation. Phase 4 closes the loop: a real-server `.local.ts` integration test (proves the helpers work end-to-end and HMR teardown is leak-free), a docs page in `packages/mint-docs/`, and a changeset.

Read [`query-subscriptions.md`](../query-subscriptions.md) — Definition of Done section.

## Tasks

### Task 1: `.local.ts` real-server + HMR teardown integration test

**Files (1):**
- `packages/ui/src/query/__tests__/query-stream.local.ts` (new)

**What to implement:**
Following `.claude/rules/integration-test-safety.md` to the letter:
1. Spin up a real `WebSocketServer` on an OS-assigned port in `beforeEach`; tear it down in `afterEach`.
2. Track all open `WebSocket` instances and the server in arrays; close them in `afterEach` regardless of test outcome.
3. Use real timers (no `vi.useFakeTimers()` for this file).
4. **Test cases:**
   - `Given a real WebSocket server that broadcasts events / When fromWebSocket is wired into query() / Then the data array fills with parsed events in arrival order`
   - `Given a query is running / When dispose() is called / Then the WebSocket closes within 100ms (proven by the server seeing a close event)`
   - **HMR teardown** — simulate the HMR contract: capture the current `controller.signal` from a query, call `dispose()`, assert `signal.aborted === true`, then construct a fresh query and assert the previous signal is *still* aborted (i.e., the new query did not somehow share the old signal).
5. Add `test:integration` script to `packages/ui/package.json` that explicitly runs `*.local.ts`.

**Acceptance criteria:**
- [ ] All test cases pass on a fresh checkout
- [ ] No process hangs after the suite ends (verify by running with a 30s overall timeout)
- [ ] Documented in the file header as `.local.ts` per the safety rules
- [ ] Quality gates clean

---

### Task 2: Docs page in `packages/mint-docs/`

**Files (3):**
- `packages/mint-docs/(query-subscriptions docs page)` (new — exact path to be picked from neighboring docs structure)
- `packages/mint-docs/mint.json` or equivalent index (modify — add page link)
- (one slot reserved)

**What to write:**
Headings:
1. **Overview** — what `query()` with an `AsyncIterable` source gives you, when to use it.
2. **Quick start** — agent-stream example (the canonical doc-doc example), then a WebSocket example with `fromWebSocket`.
3. **The shape of the result** — `data: T[]`, `loading`, `reconnecting`, `error`, `idle`, `refetch`, `dispose`. Lead with the rendering pattern: `messages.data.map(...)` is always safe (no undefined check).
4. **Lifecycle** — AbortSignal threading, what `dispose()` and `refetch()` do, HMR behaviour.
5. **Reactive keys** — show the `sessionId` example: changing the reactive value automatically restarts the iterator.
6. **What this is *not*** — non-goals from the design doc:
   - No SSR for streams (data starts empty, fills on hydration)
   - No accumulated-state cache across nav (use cursor semantics in your iterator)
   - No `refetchInterval` on streams (mutually exclusive)
   - No multi-tenant re-auth (component remount on auth change)
   - No reducer / select hooks
7. **Recipes:**
   - Dedup wrapper (`async function* dedupById(src) { ... }`)
   - Cursor / replay pattern (`agent.stream(id, { since: lastSeenId })`)
   - Forgetting to wire the AbortSignal — what goes wrong, how to spot it

Use the developer-facing types convention (per memory): show plain types like `T[]`, `boolean`, never `Signal<T>`.

**Acceptance criteria:**
- [ ] Page renders in the mint-docs preview
- [ ] All code samples copy-pasted from the page run unchanged in the example app
- [ ] No links to deleted/renamed paths

---

### Task 3: Changeset + Phase 4 commit + adversarial review

**Files (2):**
- `.changeset/(generated name).md` (new — `patch`)
- `reviews/query-subscriptions/phase-04-hmr-docs.md`

**What to do:**
1. Create a changeset summarizing the new public API surface: stream overload of `query()`, `QueryStreamOptions`, `QueryStreamResult`, `QueryDisposedReason`, `serializeQueryKey`, `fromWebSocket`, `fromEventSource`. Type: `patch` (per `.claude/rules/policies.md`).
2. Commit Phase 4 work.
3. Spawn the adversarial reviewer. Specifically check:
   - HMR test actually proves teardown ordering (not just "no error")
   - Docs page covers every numbered open-question decision from the design doc
   - Changeset names every new public symbol
   - `.local.ts` test is excluded from default `vtz test` run

**Acceptance criteria:**
- [ ] Changeset present
- [ ] Phase 4 commit on branch
- [ ] Review markdown with all findings resolved
- [ ] Quality gates green
