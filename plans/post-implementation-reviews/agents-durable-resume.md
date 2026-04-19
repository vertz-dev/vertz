# Post-Implementation Review — `@vertz/agents` Durable Tool Execution

**Issue:** [#2835](https://github.com/vertz-dev/vertz/issues/2835)
**Design:** `plans/agents-durable-resume.md` (Rev 2, approved 2026-04-19)
**Phases:** `plans/agents-durable-resume/phase-01..05.md`
**Branch:** `feat/agents-durable-resume`
**Date:** 2026-04-19
**Author:** Vinicius Dacal (with Claude Opus 4.7)

---

## Delivered

The MVP (Phases 1–3) plus the optional `safeToRetry` opt-in (Phase 4) shipped
as one feature branch. Public surface:

- `AgentStore.appendMessagesAtomic(sessionId, messages, session)` — required
  method on the interface; implemented in memory (throw), SQLite (sync
  `db.transaction`), D1 (single `db.batch`).
- `MemoryStoreNotDurableError` — thrown at `run()` entry when
  `memoryStore()` is paired with `sessionId`. Covers chat-only agents that
  would otherwise silently lose data.
- `ToolDurabilityError` — surfaced as a tool_result when an orphaned,
  non-`safeToRetry` call is detected on resume. Exported from the barrel so
  callers can pattern-match.
- `tool({ safeToRetry: true, ... })` — optional, boolean. `true` means "the
  framework may re-invoke this handler on resume." Default (omitted) = safer
  fallback (surface the error, LLM decides).
- `@vertz/agents/testing` subpath — `crashAfterToolResults(store, N)`
  harness for simulating a crash between writes.

Removed (pre-v1, no shim): `AgentLoopConfig.checkpointInterval` +
`ReactLoopOptions.onCheckpoint`. The `types.test-d.ts` regression guard
now asserts the field is rejected.

## Numbers

- **7 commits** on the feature branch (1 docs + 5 Phase 1 tasks + 1 each
  for Phases 2, 3, 4, and this retro).
- **240 tests** in `packages/agents/` pass end-to-end. No RED left.
- **Perf**: 10-step durable loop on in-memory SQLite completes in ~4ms.
  Target was < 200ms. Real D1 same-region is expected higher; captured
  in the manual-verification section below.
- **Type flow**: no new generics introduced; `safeToRetry` is a pure
  runtime flag. Dead-generic check passes.

## What went well

1. **Design discipline paid off.** Three reviewer sign-offs (DX, Product,
   Technical) caught multiple real issues at the design stage:
   - DX blocked on `idempotent` → `safeToRetry` (industry collision with
     Stripe-idempotency-key semantics). The rename saved every external
     consumer.
   - Technical flagged that `toolCallStatus` as a schema column was
     incompatible with D1/SQLite transaction semantics. Dropping it
     removed both a schema migration AND a subtle correctness gap.
   - Product killed `durableResume: true/false` as a flag. Making
     activation implicit from `store + sessionId` reduced API surface
     and matched Principle 2 ("one way to do things").

2. **TDD-RED-at-Phase-1 worked exactly as planned.** The E2E test landed
   red, stayed red through Phase 2 (atomic writes), and flipped green
   at Phase 3 (resume detection). Each phase had a clear, concrete
   goalpost.

3. **Zero new generics.** The whole feature is runtime behavior toggled
   by two pre-existing facts (durable store + sessionId) plus one optional
   boolean flag. No type-flow gymnastics; nothing for future-me to
   debug.

4. **No schema migration.** The "orphaned assistant + missing
   tool_result" sentinel is derivable from the existing message
   history. Stores deployed against the old schema continue to work
   unchanged.

## What went wrong

1. **Test-migration scope creep in Phase 1 Task 4.** 12 existing
   `run.test.ts` tests used `memoryStore() + sessionId` for non-durable
   session continuity. When I added the entry guard, they all broke.
   Migrating them to `sqliteStore({ path: ':memory:' })` was mechanical
   but was not called out in the phase file. Should have been a
   sub-task with explicit acceptance criteria.

2. **First durable E2E failed on "session not found."** The design's
   walkthrough passes a fixed `sessionId` (e.g., a Durable Object ID)
   to `run()` on every call, but the existing `run.ts` requires the
   session row to exist in the store before that call succeeds. The
   test papered over this by pre-seeding the session row. Not
   necessarily wrong — the DO platform creates the row on the first
   request — but worth flagging as a UX gap: a first-time caller with a
   known sessionId gets `SessionNotFoundError` today.

3. **The `.local.ts` perf-test convention didn't run under `vtz test`.**
   The design plan said to use `.local.ts` per
   `.claude/rules/integration-test-safety.md`, but the runner's default
   collector pattern is `**/*.test.ts`. Renamed to
   `durable-resume.perf.test.ts` and gated with `expect(elapsed).toBeLessThan(200)`.
   Acceptable but not what the rule prescribed. Follow-up: update the
   rule to reflect runner reality or add a distinct test pattern for
   `.local.ts`.

## How to avoid it next time

- **Pre-phase sweep for contract-breaking changes.** When a phase changes
  an invariant (like "memoryStore + sessionId is an error"), run a
  global grep for existing callers FIRST and bake the migration into
  the same task/commit. This avoids cascade-break surprises.

- **Add a "first-call create-if-not-exists" story to `run()`.** If the
  DO walkthrough is the canonical pattern, the framework should handle
  the first-time call without requiring a side-door `saveSession`. Not
  in scope for #2835, but worth an issue.

- **Document the `.local.ts` vs `.test.ts` decision explicitly** in
  `.claude/rules/integration-test-safety.md`, with the CI-gate
  trade-off called out.

## Phase 1 perf measurement

Recorded at commit `aa96522b7` (Phase 1 Task 6 landing):

- 10-step loop, `sqliteStore({ path: ':memory:' })`, scripted LLM, no
  tool-handler work: **~4ms wall time**.
- 200ms budget leaves ~50x headroom for real-world handler work +
  serialization + driver overhead.
- Real D1 same-region measurement (triagebot in CF): pending
  manual-verification checklist below.

## Manual verification — Cloudflare Durable Object

**Checklist for triagebot staging deployment:**

- [ ] Deploy triagebot with `@vertz/agents` at this branch + `d1Store`
      wired to staging D1.
- [ ] Prime a DO with a `postSlack` tool call that will succeed.
      Verify one Slack post lands and `tool_result` is persisted.
- [ ] Force a crash in the `postSlack` handler (throw after the Slack
      API responds but before returning). Verify the DO alarms / next
      request triggers `run()` again with the same `sessionId`.
- [ ] Confirm: exactly one Slack post in the channel (no duplicate);
      the session's stored history contains a `tool-durability-error`
      tool_result for the orphaned call; the LLM's subsequent response
      acknowledges the partial state.
- [ ] Repeat with a `safeToRetry: true` read tool — verify it IS
      re-invoked on resume and the real result lands.
- [ ] Record D1 same-region atomic-write p50 and p95 latency under
      10-step load. Write to this retro.

**Results:** _pending — will be filled in after the PR merges and the
staging deploy completes. The framework tests pass independently of
the manual verification; this is release gating, not merge gating._

## Open follow-ups

1. **First-call `run()` with a pre-chosen `sessionId` should auto-create
   the session row.** Current behavior throws `SessionNotFoundError`. The
   DO walkthrough works around this by having the DO create the row on
   first request, but that's a hidden contract. File a follow-up issue.

2. **`findOrphanAssistantWithToolCalls` assumes LLM-provided
   `tool_call.id`.** For providers that don't supply stable ids, the
   sentinel fails gracefully (no orphan detected, normal loop). Worth
   documenting which providers are supported.

3. **Perf under large parallel tool batches.** The implementation
   commits all N tool_results in one atomic write at step end. For N=20
   concurrent tools, that's a single D1 batch — should be fine but
   unmeasured.

## Status

Ready for PR → main. Awaiting CF staging verification before closing
the issue.
