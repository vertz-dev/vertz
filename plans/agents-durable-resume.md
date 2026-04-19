# Design Doc — Durable Tool Execution & Transactional Resume for `@vertz/agents`

**Issue:** [#2835](https://github.com/vertz-dev/vertz/issues/2835)
**Related:** [#2834](https://github.com/vertz-dev/vertz/issues/2834) (Anthropic adapter — **merged**; triagebot production path now unblocked on the adapter side; this feature is the remaining gate).
**Status:** Rev 2 — approved (3 agent reviews + human sign-off 2026-04-19); implementation in progress.
**Author:** Vinicius Dacal (with Claude Opus 4.7)
**Date:** 2026-04-19

---

## Problem

`@vertz/agents` today has no durable resume primitive. In `packages/agents/src/run.ts:318-354`, session state + messages are flushed to the store **only after `reactLoop()` returns**. The ReAct loop in `packages/agents/src/loop/react-loop.ts:216-375` accumulates messages in memory:

1. LLM response arrives with `toolCalls`.
2. Assistant-with-toolCalls message is pushed to the in-memory `messages` array (line 314).
3. Each tool handler runs (line 352 / `runConcurrentBatch`).
4. Tool-result messages are pushed to the in-memory array (line 346/353).
5. The loop continues — or returns, at which point `run.ts` persists everything at once.

If the process is killed between (3) and (5) — a Cloudflare Durable Object alarm preemption, a Worker OOM, a deploy mid-request — the tool handler ran (side effects committed) but the `tool_result` message was never persisted. The next invocation re-enters the loop from the last durable state (the user message) and the LLM, seeing no record of the tool call, **asks for it again**. `slack.postMessage` fires twice.

For side-effecting tools (Slack, email, billing, external paid APIs), this is a P0 correctness hole. It limits Vertz agents to read-only / naturally-idempotent use cases and blocks the first external consumer ([`triagebot`](https://github.com/viniciusdacal/triagebot)).

The existing `checkpointInterval` config (`react-loop.ts:372-374`) is a notification callback, not a durable resume primitive. **This design deletes it** — it's ambiguous with real durability and pre-v1 policy is "consolidate aggressively, no back-compat shims" (`.claude/rules/policies.md`).

---

## Goals

1. **At-most-once execution** of side-effecting tool handlers across process restarts, within a single `run()` session.
2. **Automatic resume, zero config** — passing `store + sessionId` to `run()` is the opt-in. No separate `resume()` API, no new flag, no mode to discover.
3. **Transactional store writes** for the critical step boundary: messages written in the store are always consistent with handler execution reality.
4. **Explicit-retry opt-in via `safeToRetry: true`** — pure-read tools can declare themselves safe to re-invoke on resume and skip the "surface to LLM" fallback. Default behavior (side-effecting) is safe.
5. **Degrades gracefully** — memory store is non-durable by construction and must fail loudly if used with `sessionId` — at `run()` entry, before any work starts, so a chat-only agent (no tool calls) doesn't silently appear to work and lose data on restart.

## Why now

Agents has one named external consumer (`triagebot`), and that consumer is blocked on this correctness hole. The competing priorities from project memory are vtz test runner (internal tooling, no external block), cloud platform (active design, not yet shipping), and multi-level tenancy (design-approved, not on the critical path for triagebot). Durable resume is the smallest atomic gate between Vertz agents and any production side-effecting use case — Slack, email, billing, paid APIs all want it on day one. Shipping this unblocks agents from "read-only demo" to "production-ready for the interesting market segment" with ~1 week of focused work on code paths we already own. Deferring it stays on the "read-only demo" ceiling indefinitely. The trade-off is accepting that the vtz test runner work is pushed by that week.

## Non-Goals

- **Cross-session coordination.** Two runners running the same `sessionId` concurrently is undefined behavior; the caller owns sessionId ownership (CF Durable Object input gate already provides serialization per DO for the intended use case).
- **Generic distributed transactions across arbitrary side effects.** We don't compensate. A tool whose result is persisted returns its stored result on replay; we do not undo side effects.
- **Streaming resume.** All providers today return non-streaming `LLMResponse` (`packages/agents/src/providers/`). Streaming durability is a separate design.
- **Tool-handler-internal crash recovery.** If a handler crashes halfway through a 3-step side effect, this design does not make those steps atomic. Handler authors own internal idempotency / compensation. We only guarantee the *framework* doesn't re-fire the whole handler.
- **Automatic retry of failed tool calls.** A handler error is persisted as an error `tool_result`. On resume, the LLM sees the error and decides. We don't silently retry.
- **Multi-level tenancy semantics.** Sessions continue to follow whatever `userId` / `tenantId` contract `run()` already surfaces. If the multi-level tenancy work (#1787) changes that contract, this design inherits the change — no new primitives.
- **Observability hooks** (replacement for `checkpointInterval`). Out of scope for this design; can be added later if a real need emerges. Crash signals surface as typed `ToolDurabilityError` tool_results in the message history.

---

## API Surface

### Canonical `run()` call — one shape, used everywhere

```ts
import { createAnthropicAdapter, run } from '@vertz/agents';
import { d1Store } from '@vertz/agents/cloudflare';
import { triageAgent } from './agents/triage';
import { createSlackProvider } from './tools/slack';
import { createIssueProvider } from './tools/issue';

const result = await run(triageAgent, {
  message: 'An issue came in: ...',
  sessionId: 'sess_abc123',
  store: d1Store(env.DB),
  llm: createAnthropicAdapter({ apiKey: env.ANTHROPIC_API_KEY, model: 'claude-sonnet-4-6' }),
  tools: {
    getIssue: createIssueProvider(env),
    postSlack: createSlackProvider(env),
  },
  userId: 'u_42',     // optional
  tenantId: 't_1',    // optional
});
```

This is the **only** shape. Walkthrough, E2E tests, and docs all use it verbatim.

If this invocation crashes after `postSlack`'s handler fires but before the `tool_result` row is persisted, a subsequent `run()` call with the same `sessionId` loads the session, detects the orphaned assistant-with-toolCalls (has tool_calls, missing matching tool_result rows), and:

- For each missing tool_result, if the tool is declared `safeToRetry: true` → re-invoke the handler.
- Otherwise → persist a synthetic `ToolDurabilityError` tool_result and let the LLM decide recovery (check external state, ask the user, abort the thread, etc.).

### Tool declaration — new optional `safeToRetry` flag

```ts
import { tool } from '@vertz/agents';
import { s } from '@vertz/schema';

// Pure read. Safe to re-invoke on resume.
export const getIssue = tool({
  description: 'Fetch a Sentry issue by ID',
  input: s.object({ id: s.string() }),
  output: s.object({ title: s.string(), status: s.string() }),
  safeToRetry: true, // ← new
});

// Side-effecting — default. Framework surfaces ToolDurabilityError on orphaned calls.
export const postSlackMessage = tool({
  description: 'Post a message to a Slack channel',
  input: s.object({ channel: s.string(), text: s.string() }),
  output: s.object({ ts: s.string() }),
  // No `safeToRetry` → default: NOT safe; surface error on resume.
});
```

**Naming rationale:** `safeToRetry` names exactly what the framework does with the flag — the framework may re-invoke the handler. `idempotent` was considered and rejected because an idempotent operation (e.g., `stripe.charge({ idempotencyKey })`) can still have side effects and still needs the durable-bookkeeping path. An LLM writing `stripe.charge` would correctly call it "idempotent" and incorrectly opt out of safety. `safeToRetry` maps 1:1 to framework behavior, so the failure mode is obvious to both humans and LLMs.

### Store interface — new `appendMessagesAtomic()`

```ts
// packages/agents/src/stores/types.ts
export interface AgentStore {
  // ... existing methods unchanged ...

  /**
   * Atomically append messages AND upsert the session row in a single
   * transaction (or the store's strongest equivalent — D1 batch, SQLite
   * transaction). Readers must either see all of the writes or none.
   *
   * Used on every step boundary under durable execution. Replaces the
   * end-of-run `saveSession` + `appendMessages` pair for that path.
   */
  appendMessagesAtomic(
    sessionId: string,
    messages: Message[],
    session: AgentSession,
  ): Promise<void>;
}
```

Three implementations land:
- **D1** — `db.batch([...inserts, sessionUpsert])` — a single batch call is implicitly transactional on D1 per https://developers.cloudflare.com/d1/worker-api/prepared-statements/#batch-statements. Crucially, the batch must NOT straddle an `await` — the whole batch is one atomic unit with no async gap.
- **SQLite** (via `@vertz/sqlite`) — `db.transaction(() => { ... })` over already-resolved inserts. `@vertz/sqlite`'s `transaction()` is synchronous (better-sqlite3 style); we must not `await` inside it. This is an invariant the implementation enforces.
- **Memory** — non-atomic. If called with `sessionId` under durable execution, **throws a runtime error**: `MemoryStoreNotDurableError`. Memory store is for tests and stateless runs; it cannot provide durability.

### Durability sentinel — message history alone, no new fields

Resume detection does **not** introduce a new column or a new message field. The sentinel is the existing message shape:

> An `assistant` message with non-empty `toolCalls` is "orphaned" if there is no `tool` message in the same session whose `toolCallId` matches one of the assistant message's tool_call ids.

This detection runs on `run()` startup before the first LLM call. It needs zero schema changes. Rationale: adding a `toolCallStatus` column introduces a migration problem (existing `agent_messages` tables have no such column) AND a race (a `pending` status written in transaction T1 has to be flipped to `committed` in transaction T2 — there's no atomic way to "span the handler dispatch" across the two transactions, so the column's value only encodes what the row array already tells us).

### Step-boundary write sequence

Under durable execution (`store + sessionId` present and store is durable):

```
LLM returns response with toolCalls
  ↓
[atomic write #1 — appendMessagesAtomic]
  append assistant-with-toolCalls message
  upsert session (updatedAt)
  ↓
run tool handlers (parallel or sequential, normal today)
  ↓
[atomic write #2 — appendMessagesAtomic]
  append tool_result messages (successes and errors)
  upsert session (updatedAt)
  ↓
loop continues to next LLM call
```

**Crash taxonomy** (what resume sees + does):

| Crash window | Store state | Resume behavior |
|-------------|-------------|-----------------|
| Before write #1 | no assistant msg for this step | No orphan. Next LLM call starts fresh from prior state. |
| Between write #1 and handler dispatch | assistant w/ toolCalls, no tool_results | Orphan. For each call: if tool is `safeToRetry`, re-invoke handler (safe — handler never ran). Else surface `ToolDurabilityError`. |
| Mid-handler | assistant w/ toolCalls, no tool_results | **Same as above.** We cannot distinguish "handler never started" from "handler ran, side-effect committed, result lost" without an additional pre-dispatch marker — and that marker is infeasible given SQLite sync-transaction semantics (see `stores/sqlite-store.ts:174-189`). The honest story: crash in this window = ambiguous = surface to LLM unless `safeToRetry`. |
| After handler dispatch, before write #2 | assistant w/ toolCalls, no tool_results | Same again. Same behavior. |
| Mid-write #2 | atomic — either all tool_results present or none | Either case is well-defined. |
| After write #2 | assistant + all tool_results | No orphan. Loop resumes normally at next LLM call. |

The pessimism for non-`safeToRetry` tools in the middle windows is **intentional**: the framework cannot know if the side effect landed. Surfacing to the LLM is the only correct answer. Developers who can tolerate a re-invocation declare `safeToRetry: true`.

### `ToolDurabilityError` — surfaced as a tool_result

```ts
// packages/agents/src/errors.ts
export class ToolDurabilityError extends Error {
  readonly kind = 'tool-durability-error';
  readonly toolCallId: string;
  readonly toolName: string;
  constructor(toolCallId: string, toolName: string) {
    super(
      `Tool '${toolName}' (call ${toolCallId}) was requested but its execution ` +
      `did not complete durably before the process ended. The tool is not ` +
      `declared 'safeToRetry: true', so the framework will not automatically ` +
      `re-invoke it. Decide recovery based on observable external state — e.g., ` +
      `check whether the side effect already occurred. If this tool is a pure ` +
      `read with no side effects, add \`safeToRetry: true\` to its declaration.`,
    );
    this.toolCallId = toolCallId;
    this.toolName = toolName;
  }
}
```

The error instance is **serialized into the `tool_result` message's content** as JSON (`{ error: '...', kind: 'tool-durability-error', toolName, toolCallId }`) — matching how handler errors are already encoded today (`react-loop.ts:459-467`, `528-538`). The LLM sees the error in-band; no new schema.

The class is exported for callers who want to pattern-match on resumed message history (e.g., to log / page when a session resumed with a durability error).

### Removed API — `checkpointInterval` + `onCheckpoint`

Deleted (pre-v1, no shim). Rationale: ambiguous with durable execution; "one way to do things" (Principle 2). If callers need step-boundary observability in the future, we add a typed hook — the door is open, but this design doesn't force a particular shape.

### Memory store — hard runtime error under durable execution

```ts
// packages/agents/src/stores/memory-store.ts
export class MemoryStoreNotDurableError extends Error {
  constructor() {
    super(
      `memoryStore() cannot provide durable resume. Pass sessionId with a durable ` +
      `store (d1Store, sqliteStore) or omit sessionId to run statelessly.`,
    );
  }
}
```

The memory store's `appendMessagesAtomic` throws this immediately. Tests that want to exercise durable-resume paths use `sqliteStore({ path: ':memory:' })` — SQLite in-memory DBs ARE transactional.

---

## Manifesto Alignment

### 1. If it builds, it works (Principle 1)

Durability is a property of the store + sessionId combination. The `AgentStore` interface requires `appendMessagesAtomic`; memory store implements it as a runtime throw. No silent degradation. A caller mixing memory store with sessionId gets a loud error on first use, not a quiet data loss at 3am.

### 2. One way to do things (Principle 2)

- One entry point: `run()`. No `resume()`.
- One activation: `store + sessionId`. No `durableResume` flag.
- One mental model: "durability is automatic when you persist."
- One opt-out: `safeToRetry: true` on safe tools. (Rejection note: `tool({ idempotent })` and `agent({ loop: { durableResume } })` from Rev 1 were both cut because each created a second way to describe what the call shape already says.)
- `checkpointInterval` is **deleted** — no ambiguity with durable execution.

### 3. AI agents are first-class users (Principle 3)

The LLM sees `ToolDurabilityError` in-band as an error tool_result and reasons about recovery the same way it reasons about any handler error. No special protocol. An LLM reading the error message above can immediately decide: "check if the Slack post already landed, then either acknowledge and continue or resend with a deduplication header."

### 4. Test what matters, nothing more (Principle 4)

The E2E Acceptance Test (below) is the only behavioral test required. TDD RED lands in Phase 1. No speculative retry policies, no exponential backoff configs.

### 5. If you can't test it, don't build it (Principle 5)

Crash injection is trivial: a test-harness store that throws after the first atomic write but before the second. That harness IS the durable-resume test. The E2E test below exercises this shape end-to-end.

### 6. Performance is not optional (Principle 7)

Two atomic writes per step (was one at end-of-run). For a 10-iteration loop with 2 tool calls/step, we go from 1 write to ~20 writes. On D1 same-region, ~5–10ms per batch → ~100–200ms added per session. Budget in Phase 1: measure actual D1 same-region and same-DO-colo latency; target < 200ms added per 10-step session. If we blow the budget, fallback is batching multiple steps per write during compaction — deferred to a follow-up unless measurement forces it.

### What was rejected vs. Rev 1

- **`durableResume: true/false` flag** — cut. Default-off contradicted "zero config happy path"; default-on was just noise. Activation is `store + sessionId` already.
- **`toolCallStatus: 'pending' | 'committed'` field** — cut. The two-transaction design can't atomically span handler dispatch on any backend (D1 batch can't straddle awaits; SQLite `transaction()` is sync). The status column would just encode what the message history already tells us, while requiring a schema migration.
- **`idempotent: true`** (Rev 1 name) — renamed to `safeToRetry: true`. Matches actual framework behavior; avoids collision with industry "idempotency key" semantics.
- **Separate `resume(sessionId)` API** (from issue sketch) — cut. Violates Principle 2.
- **Content-addressed idempotency keys** (from issue sketch) — cut. The LLM's `tool_call_id` on the assistant message is stable *because we persist it pre-dispatch*, and resume matches on it. Hashing inputs adds complexity without adding guarantees.

---

## Unknowns

1. **Actual D1 same-colo write latency for two batches/step.** Target < 200ms/10-step session. Resolved in Phase 1 by instrumenting the E2E test and an integration run against a real D1 instance.

2. **Anthropic `tool_call_id` stability across replays.** Not an issue for this design — we persist the assistant-with-toolCalls message in atomic write #1 BEFORE any LLM retry could change ids. Resume matches ids from the stored message, not from a fresh LLM call. Callout in `ToolDurabilityError` docs: if the LLM is re-prompted mid-session (new ids), the assistant history is the source of truth.

3. **Tool-set drift across deploys.** If a tool is removed between crash and resume, resume encounters a persisted tool_call for a tool that no longer exists. `react-loop.ts:456-467` already handles "Tool not found" as an error tool_result; we reuse that path. No new handling.

4. **CF Durable Object eviction after D1 batch issued but before response.** D1 may have committed; DO never saw the response. Next `run()` sees the durable state → replays correctly. Invariant: step-commit is defined by D1's view, not the DO's. Documented.

5. **Concurrent-batch tool failures.** `runConcurrentBatch` (current behavior at `react-loop.ts:338-357`): on partial failure, all successes + the error are written in atomic write #2 as a mixed set of tool_result messages. Already how errors are encoded. No new schema.

---

## POC Results

**None required.** Each ingredient is a known quantity:
- D1 `batch()` as single atomic unit — documented.
- SQLite `transaction()` over sync operations — standard.
- Two-phase write with no cross-phase atomicity — the honest story we owe users.
- No new generics, no new schema column.

The only measured unknown is D1 perf at 2 writes/step, addressed in Phase 1.

---

## Type Flow Map

Every new generic and its consumer:

**There are no new generics.** Every change is runtime behavior + one optional flag:

```
tool<TInput, TOutput>({ safeToRetry?: boolean, ... })
  ↓
ToolDefinition<TInput, TOutput> { safeToRetry?: boolean }
  ↓
reactLoop() reads def.safeToRetry at resume-dispatch time
  (no generic impact — runtime check only)
```

```
AgentStore.appendMessagesAtomic(
  sessionId: string,
  messages: Message[],        // public type, unchanged
  session: AgentSession,      // public type, unchanged
): Promise<void>
  ↓
Store implementations — concrete classes, no generic surface.
```

**Dead-generic check:** `tool()`'s `TInput`/`TOutput` still flow to `ToolDefinition.input` / `.output` / `.handler`. `AgentConfig<TState, TTools, TOutputSchema>` unchanged. No added dead generics. No removed used generics.

**Existing generic flow preserved:** Resume doesn't change how tool inputs/outputs are typed — it just controls whether the handler is re-invoked or a synthetic error tool_result is persisted. Both paths produce the same output shape the LLM expects.

---

## E2E Acceptance Test

```ts
// packages/agents/src/__tests__/durable-resume.test.ts
import { afterEach, describe, expect, it } from '@vertz/test';
import { s } from '@vertz/schema';
import { agent, run, sqliteStore, tool } from '@vertz/agents';
import { crashAfterToolResults } from '@vertz/agents/testing';
import { mockLLM } from './helpers'; // local helper, same shape as run.test.ts:12-32

describe('Feature: durable tool execution', () => {
  describe('Given a side-effecting tool + store + sessionId', () => {
    describe('When the process crashes after handler ran but before tool_result persisted', () => {
      it('Then a subsequent run() does NOT re-invoke the handler', async () => {
        let postSlackCallCount = 0;

        const postSlack = tool({
          description: 'Post to Slack',
          input: s.object({ text: s.string() }),
          output: s.object({ ts: s.string() }),
          // no safeToRetry — default side-effecting semantics
        });

        const sentinel = agent('sentinel', {
          state: s.object({}),
          initialState: {},
          tools: { postSlack },
          model: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
          loop: { maxIterations: 5 },
        });

        const store = sqliteStore({ path: ':memory:' });

        const llm = mockLLM([
          {
            text: 'Posting to Slack.',
            toolCalls: [{ id: 'call_1', name: 'postSlack', arguments: { text: 'hello' } }],
          },
          { text: 'Done.' },
        ]);

        // Crash harness: wraps the store so that the SECOND atomic write
        // (tool_results) throws, simulating a crash after handler dispatch.
        const crashingStore = crashAfterToolResults(store);

        await expect(
          run(sentinel, {
            message: 'An issue came in.',
            sessionId: 'sess_test',
            store: crashingStore,
            llm,
            tools: {
              postSlack: async ({ text }) => {
                postSlackCallCount++;
                return { ts: `ts_${postSlackCallCount}` };
              },
            },
          }),
        ).rejects.toThrow(/simulated crash/);

        expect(postSlackCallCount).toBe(1); // handler ran once pre-crash

        // Resume with a healthy store + fresh scripted LLM (only the final response).
        const llm2 = mockLLM([{ text: 'Done.' }]);
        const result = await run(sentinel, {
          message: 'An issue came in.',
          sessionId: 'sess_test', // same sessionId
          store,                   // healthy now
          llm: llm2,
          tools: {
            postSlack: async ({ text }) => {
              postSlackCallCount++;
              return { ts: `ts_${postSlackCallCount}` };
            },
          },
        });

        expect(result.ok).toBe(true);
        expect(postSlackCallCount).toBe(1); // ← the point: NOT 2

        // The LLM's second response sees a ToolDurabilityError tool_result
        // in the message history and responded "Done." accordingly.
        const messages = await store.loadMessages('sess_test');
        const durabilityError = messages.find(
          (m) =>
            m.role === 'tool' &&
            m.toolCallId === 'call_1' &&
            m.content.includes('tool-durability-error'),
        );
        expect(durabilityError).toBeDefined();
      });
    });
  });

  describe('Given a safeToRetry tool + crash mid-step', () => {
    it('Then the handler IS re-invoked automatically on resume', async () => {
      let getIssueCallCount = 0;

      const getIssue = tool({
        description: 'Fetch an issue',
        input: s.object({ id: s.string() }),
        output: s.object({ title: s.string() }),
        safeToRetry: true,
      });

      // ... same crash-injection setup as above ...
      // expected: after resume, getIssueCallCount === 2 (that's the point —
      //           safeToRetry opts into automatic re-invocation) and
      //           result.ok === true.
    });
  });

  describe('Given store + sessionId is memory store', () => {
    it('Then the first durable write throws MemoryStoreNotDurableError', async () => {
      // ... exercises the memory-store safeguard ...
    });
  });

  describe('Type-level', () => {
    it('rejects misspelled tool config at compile time', () => {
      tool({
        description: 'x',
        input: s.object({}),
        output: s.object({}),
        // @ts-expect-error — 'safeToRetry' must be boolean
        safeToRetry: 'yes',
      });

      tool({
        description: 'x',
        input: s.object({}),
        output: s.object({}),
        // @ts-expect-error — unknown flag
        idempotent: true,
      });
    });
  });
});
```

**What this test proves:**
1. Side-effecting tool handler fires exactly once across a crash + resume.
2. `safeToRetry: true` re-invokes automatically.
3. Memory store + sessionId fails loudly instead of silently losing durability.
4. Type-level: misconfigured tools rejected at compile time; the old `idempotent` name is rejected (protects against anyone carrying the Rev 1 habit forward).

---

## Phases

Five phases. **Phases 1–3 are the shippable MVP** — they close the P0 correctness hole (no double-fire side effects) and unblock triagebot's production use case. **Phases 4–5 are follow-ups**: Phase 4 is the `safeToRetry` usability sweetener (`postSlack` — the motivating tool — is side-effecting and does NOT opt in); Phase 5 is docs + CF DO verification + changeset. If scope pressure emerges, Phase 4 can ship as a follow-up PR without blocking the MVP. Each phase is independently mergeable because the behavior change is activated by `store + sessionId` presence, not by a flag.

### Phase 1 — Store transactions + failing E2E test (TDD RED) — MVP

- Add `appendMessagesAtomic` to `AgentStore` interface.
- Implement in D1 (single `db.batch()`; the whole batch must NOT straddle an `await`), SQLite (`db.transaction()` over already-resolved inserts — no `await` inside), memory store (stored for completeness; see below).
- Add `MemoryStoreNotDurableError` export. Emit it at **`run()` entry** — not lazily on first write — whenever `store` is memory AND `sessionId` is present. Chat-only agents with no tool calls must still fail loudly.
- Commit to `packages/agents/src/testing/crash-harness.ts` with an exported `crashAfterToolResults(store: AgentStore): AgentStore` factory, re-exported from `@vertz/agents/testing`. This is the only new module.
- Land the E2E test at `packages/agents/src/__tests__/durable-resume.test.ts` — **RED** against current code.
- Add a perf one-shot at `packages/agents/src/__tests__/durable-resume.perf.local.ts` (`.local.ts` per `.claude/rules/integration-test-safety.md`) — measures 10-step D1 same-region latency once against a real D1 instance. Record the measured number in the retrospective (not a CI regression gate; the `< 200ms` budget is a release-gate decision, not per-commit). If the measurement exceeds budget, design decision escalates back to this doc.

**Acceptance:**
- `AgentStore.appendMessagesAtomic` exists with three implementations.
- `MemoryStoreNotDurableError` thrown at `run()` entry (not first write).
- `durable-resume.test.ts` compiles, runs, and fails only on the "does not re-invoke handler" assertion.
- `crash-harness.ts` + `@vertz/agents/testing` re-export land.

### Phase 2 — Per-step atomic write in the ReAct loop — MVP

- On each step in `reactLoop`, when store + sessionId are present:
  - After LLM returns toolCalls: call `appendMessagesAtomic` with the assistant-with-toolCalls message + session upsert.
  - After handlers resolve: call `appendMessagesAtomic` with all tool_result messages + session upsert.
- Remove the end-of-run batch persistence in `run.ts` when durable execution is active; keep it for the non-durable path (no sessionId, or stateless).
- **Delete `checkpointInterval` + `onCheckpoint`** from `AgentLoopConfig`, `reactLoop` wiring, and all tests that reference them (`packages/agents/src/loop/react-loop.test.ts`, `packages/agents/src/agent.test.ts`, `packages/agents/src/types.test-d.ts`). Any currently-passing test referencing the old callback is deleted or rewritten to exercise the new durability story.
- **Provider adapter invariant (callout):** LLM provider adapters must return the final, non-retried response to the loop. If an adapter retries internally and returns different `tool_call_id`s on the second attempt, the framework persists those final ids in atomic write #1 — resume reads from storage and is self-consistent. Adapters must never deliver a mid-retry response to the loop.

**Acceptance:**
- Phase 1's E2E test: the "handler count after resume" assertion still fails (no resume logic yet), but store state shows the orphaned assistant message after crash.
- All remaining tests pass. No test still references `checkpointInterval` or `onCheckpoint`.

### Phase 3 — Resume detection + ToolDurabilityError — MVP

- On `run()` entry with store + sessionId:
  - Load messages.
  - Detect orphaned assistant-with-toolCalls (no matching tool_result).
  - For each orphan tool_call: surface `ToolDurabilityError` as a synthetic error `tool_result` (content shape matches existing handler-error encoding at `react-loop.ts:459-467`).
  - Write the synthetic tool_results via `appendMessagesAtomic`.
  - Proceed into the loop as if step had completed.

**Acceptance:**
- Phase 1's E2E test GREEN on the "does not re-invoke handler" + "error surfaces in history" assertions.
- **This is the end of the MVP slice.** Merging here closes #2835's P0 correctness hole. Phases 4–5 can ship as follow-up PRs if scope pressure demands.

### Phase 4 — `tool({ safeToRetry })` opt-in — follow-up sweetener

- Add `safeToRetry?: boolean` to `ToolConfig` + `ToolDefinition`.
- On resume detection: if `safeToRetry: true`, re-invoke the tool handler instead of surfacing `ToolDurabilityError`; persist the real result.
- Add the `safeToRetry` E2E test scenario.

**Acceptance:**
- E2E test's "safeToRetry re-invokes" assertion GREEN.

### Phase 5 — Docs + CF DO verification + changeset — follow-up

- `packages/mint-docs/` update: durable-resume guide, `safeToRetry` flag, cost guidance ("expect ~2 D1 writes per step; for high-volume read-heavy agents consider stateless mode"), FAQ entry clarifying that `safeToRetry` is about **resume replay**, not HTTP/network retries.
- Manual verification checklist against triagebot in a CF DO environment (requires #2834 merged for production run; the framework E2E tests pass independently).
- Changeset (patch bump).
- Retrospective in `plans/post-implementation-reviews/agents-durable-resume.md`, including the Phase 1 perf measurement number.

**Acceptance:**
- Docs live.
- Manual CF DO verification recorded in the retrospective.

---

## Developer Walkthrough

Someone building `triagebot`:

1. Declare tools — the read is `safeToRetry: true`; the write is left as the side-effecting default.
   ```ts
   // tools.ts
   import { tool } from '@vertz/agents';
   import { s } from '@vertz/schema';

   export const getIssue = tool({
     description: 'Fetch a Sentry issue by ID',
     input: s.object({ id: s.string() }),
     output: s.object({ title: s.string(), status: s.string() }),
     safeToRetry: true,
   });

   export const postSlack = tool({
     description: 'Post to Slack',
     input: s.object({ channel: s.string(), text: s.string() }),
     output: s.object({ ts: s.string() }),
   });
   ```

2. Define the agent:
   ```ts
   // agent.ts
   import { agent } from '@vertz/agents';
   import { s } from '@vertz/schema';
   import { getIssue, postSlack } from './tools';

   export const triageAgent = agent('triage', {
     state: s.object({}),
     initialState: {},
     tools: { getIssue, postSlack },
     model: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
     loop: { maxIterations: 10 },
   });
   ```

3. In the Durable Object:
   ```ts
   // triagebot-do.ts
   import { createAnthropicAdapter, run } from '@vertz/agents';
   import { d1Store } from '@vertz/agents/cloudflare';
   import { triageAgent } from './agent';
   import { createIssueProvider } from './providers/issue';
   import { createSlackProvider } from './providers/slack';

   export class TriagebotDO {
     async fetch(request: Request) {
       const { issueId, message } = await request.json();
       await run(triageAgent, {
         message,
         sessionId: this.state.id.toString(),
         store: d1Store(this.env.DB),
         llm: createAnthropicAdapter({ apiKey: this.env.ANTHROPIC_API_KEY, model: 'claude-sonnet-4-6' }),
         tools: {
           getIssue: createIssueProvider(this.env),
           postSlack: createSlackProvider(this.env),
         },
       });
       return new Response('ok');
     }
   }
   ```

4. DO crashes mid-`postSlack` — CF reroutes the next request to the same DO (input-gate serialization). `run()` re-enters with the same `sessionId`. Resume logic sees the orphaned assistant-with-toolCalls for `postSlack`, persists `ToolDurabilityError` as the tool_result, and the LLM — seeing the error in-band — either asks the user, checks Slack for the message, or aborts the thread. `postSlack`'s handler is **not** re-invoked. No double-post.

5. For `getIssue` specifically, had the crash happened inside its handler, resume would re-invoke automatically (it's `safeToRetry`). The LLM sees a valid tool_result and continues.

That's the whole story. Two flags, one store. No `durableResume`, no `resume()`, no `idempotent`.

**Don't want durability for this agent?** Omit `sessionId` to run statelessly (fresh conversation every call), or use `memoryStore()` *without* `sessionId` for in-process scratch state. Durability activates only when both `store + sessionId` are present AND the store is a durable backend.

---

## Changes Against Rev 1 (for reviewers tracking diffs)

- **Removed:** `durableResume` flag (now implicit from `store + sessionId`).
- **Removed:** `toolCallStatus: 'pending' | 'committed'` field (incompatible with SQLite sync-transaction + D1 batch semantics; message history alone suffices).
- **Removed:** separate `resume()` API (never had one, but Rev 1 considered it).
- **Renamed:** `idempotent: true` → `safeToRetry: true`.
- **Deleted:** `checkpointInterval` + `onCheckpoint` (pre-v1, no shim).
- **Tightened:** memory store under durable execution throws `MemoryStoreNotDurableError`.
- **Added:** canonical `run()` call shape used consistently across the entire doc (no drift between API Surface, Walkthrough, and E2E).
- **Added:** explicit crash taxonomy table — what resume sees, what it does, for each crash window.
- **Added:** #2834 sequencing note (framework lands independently; production triagebot activation requires both).
- **Reduced phases:** 6 → 5 (Phase 1 now includes the E2E test as RED per TDD, matching Principle 5).
