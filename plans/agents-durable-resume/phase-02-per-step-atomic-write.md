# Phase 2: Per-Step Atomic Write in the ReAct Loop + Delete `checkpointInterval` — MVP

## Context

Phase 1 added `appendMessagesAtomic` to all stores + the crash harness + the
RED E2E. This phase rewires the ReAct loop to use the primitive: each tool
step does two atomic writes (pre-dispatch assistant-with-toolCalls, then
post-dispatch tool_results). End-of-run batch persistence is kept **only** for
non-durable runs (no `sessionId` or no store).

This phase also deletes the now-obsolete `checkpointInterval` + `onCheckpoint`
config (pre-v1 policy: consolidate aggressively, no shims).

**After Phase 2 the E2E test still fails** on the "does not re-invoke handler"
assertion (no resume logic yet), but the store state inspection should show
the orphaned assistant-with-toolCalls after crash. Phase 3 makes it green.

**Design invariants this phase must honor:**
- Pre-dispatch write #1 and post-dispatch write #2 are **two separate**
  `appendMessagesAtomic` calls. We do not attempt to span dispatch with a
  single transaction (see design doc §Crash taxonomy — impossible on
  SQLite sync-transaction + D1 no-await-in-batch).
- Provider adapter invariant: adapters must return the final (post-retry)
  LLM response. The framework persists whichever `tool_call_id`s arrive from
  the adapter; resume matches from storage.
- When durable execution is active, **do not** duplicate writes at
  end-of-run. Only the non-durable path keeps the current
  `saveSession`+`appendMessages` pair.

**Key files:**
- `packages/agents/src/loop/react-loop.ts:145-380` — the loop.
- `packages/agents/src/run.ts:130-370` — where messages are flushed today.
- `packages/agents/src/types.ts:163-178` — `AgentLoopConfig` (delete
  `checkpointInterval`).
- `packages/agents/src/agent.ts:18` — `agent()` factory, reads
  `checkpointInterval`.
- Tests that touch `checkpointInterval`/`onCheckpoint`:
  - `packages/agents/src/loop/react-loop.test.ts:241-262`
  - `packages/agents/src/agent.test.ts:51-79`
  - `packages/agents/src/types.test-d.ts:185-194`

---

## Tasks

### Task 1: Thread a durable-write callback into `reactLoop`

**Files:** (3)
- `packages/agents/src/loop/react-loop.ts` (modified — add optional
  `persistStep({ messages, phase })` callback in `ReactLoopOptions`; call it
  twice per step when set)
- `packages/agents/src/run.ts` (modified — provide `persistStep` only when
  durable execution is active; otherwise keep end-of-run flush)
- `packages/agents/src/run.test.ts` (modified — add a test that with
  `sqliteStore + sessionId`, `appendMessagesAtomic` is called twice per step
  for each tool-call step)

**What to implement:**

Add to `ReactLoopOptions`:

```ts
export interface ReactLoopOptions {
  // ...existing...
  /**
   * Called at step boundaries when the caller wants durable-per-step writes.
   * Phase A: right after an assistant-with-toolCalls message is pushed.
   * Phase B: right after all tool_result messages for that step are pushed.
   * The callback receives a snapshot of the messages array for that write
   * (the new messages, not the entire conversation).
   */
  persistStep?: (args: {
    phase: 'assistant-with-tool-calls' | 'tool-results';
    newMessages: Message[];
  }) => Promise<void>;
}
```

In the loop body, after pushing the assistant-with-toolCalls message:

```ts
messages.push({ role: 'assistant', content, toolCalls });
if (options.persistStep) {
  await options.persistStep({
    phase: 'assistant-with-tool-calls',
    newMessages: [messages[messages.length - 1]!],
  });
}
```

And after all tool-result messages for this step are pushed:

```ts
// at end of batch loop, track newMessages added this step
if (options.persistStep && toolResultMessagesThisStep.length > 0) {
  await options.persistStep({
    phase: 'tool-results',
    newMessages: toolResultMessagesThisStep,
  });
}
```

In `run.ts`, wire `persistStep` only when `sessionId && store` and
`isMemoryStore(store) === false`. The `persistStep` implementation calls
`store.appendMessagesAtomic(sessionId, newMessages, session)` with the
current session metadata (bump `updatedAt`).

**Acceptance criteria:**
- [ ] `ReactLoopOptions.persistStep` is wired through.
- [ ] Test: run with `sqliteStore + sessionId` + a 2-step scripted LLM + a
      tool that always succeeds → `appendMessagesAtomic` called 2 times (once
      per step × 1 "tool-results" phase; plus "assistant-with-tool-calls"
      phases = 4 calls total over 2 steps).
- [ ] Test: run with NO sessionId → `persistStep` never invoked; existing
      end-of-run flush path still runs.
- [ ] All Phase 1 tests still pass (Phase 1 RED still RED).
- [ ] `vtz test packages/agents` passes (Phase 1 RED still the only failing
      assertion, and only on the durable scenario).
- [ ] `vtz run typecheck --filter=@vertz/agents` passes.

---

### Task 2: Skip end-of-run flush when durable writes are active

**Files:** (2)
- `packages/agents/src/run.ts` (modified — conditionally skip the current
  end-of-run `saveSession + appendMessages` pair)
- `packages/agents/src/run.test.ts` (modified — test: under durable execution,
  no double-write at end-of-run)

**What to implement:**

In `run.ts`, locate the post-`reactLoop` block (currently around lines
318–354). Before calling `saveSession`/`appendMessages`, check whether
durable execution was used. If yes, skip — the per-step writes already
persisted everything. If no (non-durable path), keep the current behavior
intact.

Track durability in a local flag at the top of `run()` rather than re-deriving it.

**Acceptance criteria:**
- [ ] Test: 2-step durable run → `appendMessagesAtomic` called N times (per
      step); `appendMessages` (non-atomic) is **not** called after `reactLoop`.
- [ ] Test: stateless run (no sessionId) → unchanged behavior — `appendMessages`
      not called (no store). No regressions.
- [ ] Test: non-durable-but-stored run (no sessionId, just `store`) → still
      works as today.
- [ ] All existing tests pass.
- [ ] `vtz test packages/agents` passes.

---

### Task 3: Delete `checkpointInterval` + `onCheckpoint` + every reference

**Files:** (5 — at the 5-file task cap; if more are needed, split into a
task 3b)
- `packages/agents/src/types.ts` (modified — remove `checkpointInterval`
  from `AgentLoopConfig`)
- `packages/agents/src/loop/react-loop.ts` (modified — remove
  `checkpointInterval`, `onCheckpoint`, and the `if (checkpointInterval...)`
  block at ~line 372)
- `packages/agents/src/agent.ts` (modified — drop `checkpointInterval`
  pass-through)
- `packages/agents/src/run.ts` (modified — drop `checkpointInterval` wiring
  into `reactLoop`)
- `packages/agents/src/types.test-d.ts` + `packages/agents/src/agent.test.ts`
  + `packages/agents/src/loop/react-loop.test.ts` (modified — remove or
  rewrite every test that references the deleted symbols; NOTE: this spans
  three test files and counts as one logical unit because the task is "make
  every reference go away"; if the resulting change set exceeds 5 files
  total across Task 3, split as 3a/3b)

**What to implement:**

Grep for `checkpointInterval` and `onCheckpoint` across `packages/agents/`:

```bash
grep -rn 'checkpointInterval\|onCheckpoint' packages/agents/
```

Delete every reference. Tests that asserted the callback fires should be
deleted (not rewritten — the feature is gone pre-v1). Tests that asserted
`AgentLoopConfig` shape should drop the field from expectations.

**Acceptance criteria:**
- [ ] `grep -rn 'checkpointInterval\|onCheckpoint' packages/agents/` returns
      zero results.
- [ ] All agents tests pass.
- [ ] `vtz run typecheck --filter=@vertz/agents` passes.
- [ ] `vtz run lint --filter=@vertz/agents` passes.

---

## Out of scope for Phase 2

- Resume detection on `run()` entry (Phase 3).
- `ToolDurabilityError` class + surface (Phase 3).
- `safeToRetry` flag (Phase 4).
- Docs updates (Phase 5).

## Expected state at end of Phase 2

- Phase 1 E2E test still fails at "does not re-invoke handler" — but now the
  failure reason is different: the first `run()` call crashes
  mid-step (crash harness throws on write #2), the second `run()` call
  re-enters the loop from the persisted state. Since no resume logic exists
  yet, the LLM sees the orphaned assistant-with-toolCalls in history, and
  depending on model behavior, may or may not ask for the tool again.
  Either way the handler count assertion will fail until Phase 3 lands the
  resume path. Document this expected behavior in the test's comment.
- `checkpointInterval` is fully gone.

## Notes

1. The two `persistStep` phases are NOT atomic with each other. This is by
   design — see design doc crash taxonomy. Phase 3 handles the fallout.
2. When the crash happens between write #1 and write #2, `appendMessagesAtomic`
   has already persisted the assistant-with-toolCalls in write #1. On resume,
   the store contains that orphan. Good — that is exactly what Phase 3 uses.
