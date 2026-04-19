# Phase 1: Store Transactions + Failing E2E Test (TDD RED) — MVP

## Context

P0 correctness hole in `@vertz/agents` (issue #2835): the ReAct loop writes
messages to the store only at end-of-run, so a crash mid-loop loses tool_result
rows while tool handlers' side effects already committed. The full design is
`plans/agents-durable-resume.md` (approved Rev 2).

This phase lays the durability primitive (`appendMessagesAtomic`) across all
three stores, adds the memory-store safety rail (throw at `run()` entry when
combined with `sessionId`), ships a crash-injection test harness, and lands
the E2E test as **TDD RED** — failing at exactly the "does not re-invoke
handler" assertion. Phases 2 and 3 make it green.

**Design invariants the code must honor:**
- `appendMessagesAtomic` never `await`s between the first and last underlying
  write — it is atomic by being a single driver call (D1 `db.batch(...)`,
  SQLite `db.transaction(() => { ... })()`).
- Memory store throws `MemoryStoreNotDurableError` at `run()` entry — not on
  first write — whenever `store` is the memory store and `sessionId` is
  provided. This catches chat-only agents that never call a tool.
- The crash harness wraps any `AgentStore` and throws on the **second**
  `appendMessagesAtomic` call, simulating a crash after handler dispatch.
  (Phases 2+ will call this method twice per step; Phase 1 only tests the
  harness mechanics.)

**Key files to study before starting:**
- `packages/agents/src/stores/types.ts` — `AgentStore` interface (add one method).
- `packages/agents/src/stores/memory-store.ts`, `sqlite-store.ts`, `d1-store.ts` —
  three impls (add one method each).
- `packages/agents/src/stores/errors.ts` — existing store errors (add one class).
- `packages/agents/src/run.ts` — public `run()`; entry check for memory + sessionId.
- `packages/agents/src/run.test.ts:12-32` — `mockLLM` pattern (inline in new tests).
- `packages/sqlite/src/index.ts` — `Database.transaction<T>(fn: () => T): () => T`
  returns a callable; sync, no-await.
- `packages/agents/src/stores/sqlite-store.ts:174` — example of using
  `db.transaction(() => { ... })()` over `.run()` statements.

---

## Tasks

### Task 1: Add `appendMessagesAtomic` to the store interface + memory-store throw + `MemoryStoreNotDurableError`

**Files:** (4)
- `packages/agents/src/stores/types.ts` (modified — add method signature)
- `packages/agents/src/stores/errors.ts` (modified — add `MemoryStoreNotDurableError`)
- `packages/agents/src/stores/memory-store.ts` (modified — implement method that always throws `MemoryStoreNotDurableError`)
- `packages/agents/src/stores/errors.test.ts` (modified — add RED test asserting `MemoryStoreNotDurableError` is exported + has correct message)

**What to implement:**

Extend `AgentStore` with:

```ts
appendMessagesAtomic(
  sessionId: string,
  messages: Message[],
  session: AgentSession,
): Promise<void>;
```

Add `MemoryStoreNotDurableError` to `errors.ts`:

```ts
export class MemoryStoreNotDurableError extends Error {
  readonly code = 'MEMORY_STORE_NOT_DURABLE' as const;
  constructor() {
    super(
      'memoryStore() cannot provide durable resume. Pass sessionId with a ' +
      'durable store (sqliteStore, d1Store) or omit sessionId to run statelessly.',
    );
    this.name = 'MemoryStoreNotDurableError';
  }
}
```

Memory store implementation:

```ts
async appendMessagesAtomic(
  _sessionId: string,
  _messages: Message[],
  _session: AgentSession,
): Promise<void> {
  throw new MemoryStoreNotDurableError();
}
```

**Acceptance criteria:**
- [ ] `AgentStore.appendMessagesAtomic` is a required method on the interface.
- [ ] `MemoryStoreNotDurableError` is exported from `@vertz/agents` (add to `src/index.ts`).
- [ ] Calling `memoryStore().appendMessagesAtomic('s', [], session)` throws
      `MemoryStoreNotDurableError` with the documented message.
- [ ] `vtz test packages/agents` passes.
- [ ] `vtz run typecheck --filter=@vertz/agents` passes.

---

### Task 2: Implement `appendMessagesAtomic` for the SQLite store

**Files:** (2)
- `packages/agents/src/stores/sqlite-store.ts` (modified — add method, wrap inserts + upsert in a sync `db.transaction(...)`)
- `packages/agents/src/stores/sqlite-store.test.ts` (modified — add tests: atomic success, atomic rollback on a throw mid-transaction, no-await invariant)

**What to implement:**

In `sqlite-store.ts`, implement the method using `db.transaction(() => { ... })()`:

```ts
async appendMessagesAtomic(sessionId, messages, session) {
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    // 1. UPSERT session (created_at preserved on conflict, updated_at bumped)
    upsertSessionStmt.run(
      session.id, session.agentName, session.userId, session.tenantId,
      session.state, session.createdAt, now,
    );
    // 2. Get current max seq for this session
    const maxSeq = (selectMaxSeqStmt.get(sessionId)?.max_seq ?? 0) as number;
    // 3. Insert each message with incrementing seq
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i]!;
      insertMessageStmt.run(
        sessionId, maxSeq + i + 1, m.role, m.content,
        m.toolCallId ?? null, m.toolName ?? null,
        m.toolCalls ? JSON.stringify(m.toolCalls) : null,
        now,
      );
    }
  });
  tx(); // execute the sync transaction — no await inside
}
```

**Acceptance criteria:**
- [ ] `sqliteStore({ path: ':memory:' })` implements `appendMessagesAtomic`.
- [ ] Test: atomic success — after call, `loadMessages` returns the new messages + `loadSession` reflects updated fields.
- [ ] Test: atomic rollback — if insertion throws partway (e.g., forced duplicate seq), no messages appear and session row is unchanged.
- [ ] Test: invariant — the method must not `await` inside the transaction (static lint — grep the implementation for `await` inside the `db.transaction` callback in a simple test, OR inspect by code review; mark as a type-level note if automated detection is not feasible).
- [ ] All existing sqlite-store tests still pass.
- [ ] `vtz test packages/agents` passes.

---

### Task 3: Implement `appendMessagesAtomic` for the D1 store

**Files:** (2)
- `packages/agents/src/stores/d1-store.ts` (modified — add method using `db.batch([stmt1, stmt2, ...])`)
- `packages/agents/src/stores/d1-store.test.ts` (modified — add tests using the test D1 fake)

**What to implement:**

D1's `db.batch([...statements])` submits as one unit and is implicitly
transactional per https://developers.cloudflare.com/d1/worker-api/prepared-statements/#batch-statements.
The whole batch must be constructed synchronously (no `await` between
`db.prepare()` calls and `db.batch()` invocation).

```ts
async appendMessagesAtomic(sessionId, messages, session) {
  const now = new Date().toISOString();
  const statements = [
    // 1. UPSERT session
    db.prepare(
      `INSERT INTO agent_sessions ... ON CONFLICT(id) DO UPDATE SET ...`
    ).bind(...),
    // 2. ...for each message, a prepared INSERT bound with seq = (current max + i + 1)
  ];
  // D1 has no "SELECT then INSERT in same batch" — compute seq from a subquery
  // in the INSERT itself: `INSERT INTO agent_messages (session_id, seq, ...)
  // VALUES (?, COALESCE((SELECT MAX(seq) FROM agent_messages WHERE session_id = ?), 0) + ?, ...)`
  // where the last `?` is the per-message offset (1, 2, 3...).
  await db.batch(statements);
}
```

**Note:** the SQL subquery pattern is required because D1 can't pause a batch
to read an intermediate result. Each statement's `seq` is computed as
`COALESCE((SELECT MAX(seq) FROM agent_messages WHERE session_id = ?), 0) + N`
where N is the per-message offset. This is safe: the batch runs as one
transactional unit, so no external inserts can interleave.

**Acceptance criteria:**
- [ ] `d1Store(db)` implements `appendMessagesAtomic`.
- [ ] Test: atomic success — messages and session write together.
- [ ] Test: if `db.batch()` rejects (the D1 fake throws), no partial writes are visible.
- [ ] All existing d1-store tests pass.
- [ ] `vtz test packages/agents` passes.

---

### Task 4: Add `run()` entry check for memory store + sessionId + export errors

**Files:** (3)
- `packages/agents/src/run.ts` (modified — entry check before any work)
- `packages/agents/src/index.ts` (modified — export `MemoryStoreNotDurableError`)
- `packages/agents/src/run.test.ts` (modified — test: memory + sessionId throws at entry, not on first write; both no-tool and with-tool agents fail loudly)

**What to implement:**

At the top of `run()` (before session load), detect the combination:

```ts
if (opts.sessionId && opts.store && isMemoryStore(opts.store)) {
  throw new MemoryStoreNotDurableError();
}
```

Use a branded/nominal check: add a symbol or a `.__kind` property to
`memoryStore()` so `isMemoryStore(store)` is reliable without `instanceof`.

```ts
// In memory-store.ts
const MEMORY_STORE_KIND = Symbol.for('@vertz/agents::memoryStore');
export function memoryStore(): AgentStore {
  return {
    [MEMORY_STORE_KIND]: true,
    // ...existing methods...
  } as AgentStore & { [MEMORY_STORE_KIND]: true };
}
export function isMemoryStore(store: AgentStore): boolean {
  return (store as { [MEMORY_STORE_KIND]?: boolean })[MEMORY_STORE_KIND] === true;
}
```

**Acceptance criteria:**
- [ ] `run()` with `memoryStore() + sessionId` throws `MemoryStoreNotDurableError` **before** the agent loop starts (assert error happens before LLM is ever called).
- [ ] `run()` with `memoryStore()` and no `sessionId` continues to work unchanged.
- [ ] `run()` with any non-memory store (sqlite) and `sessionId` does NOT throw.
- [ ] `MemoryStoreNotDurableError` is exported from `@vertz/agents`.
- [ ] All existing `run.test.ts` tests pass.
- [ ] `vtz test packages/agents` passes.
- [ ] `vtz run typecheck --filter=@vertz/agents` passes.

---

### Task 5: Crash harness + `@vertz/agents/testing` subpath + export

**Files:** (3)
- `packages/agents/src/testing/crash-harness.ts` (new — `crashAfterToolResults(store)` factory)
- `packages/agents/src/testing/index.ts` (new — barrel for the testing subpath)
- `packages/agents/package.json` + `packages/agents/tsconfig.typecheck.json` (modified — add `./testing` subpath export + include glob)

**What to implement:**

`crashAfterToolResults(store)` returns a wrapper `AgentStore` that:
- Delegates every method to the underlying store.
- Counts calls to `appendMessagesAtomic`.
- Throws `Error('simulated crash after tool results')` on the **second** call (the tool-results-commit write that Phase 2 will add).

```ts
// packages/agents/src/testing/crash-harness.ts
import type { AgentSession, AgentStore } from '../stores/types';
import type { Message } from '../loop/react-loop';

export function crashAfterToolResults(store: AgentStore): AgentStore {
  let atomicCallCount = 0;
  return {
    ...store, // delegate all other methods
    loadSession: (id) => store.loadSession(id),
    saveSession: (s) => store.saveSession(s),
    loadMessages: (id) => store.loadMessages(id),
    appendMessages: (id, msgs) => store.appendMessages(id, msgs),
    pruneMessages: (id, keep) => store.pruneMessages(id, keep),
    deleteSession: (id) => store.deleteSession(id),
    listSessions: (f) => store.listSessions(f),
    async appendMessagesAtomic(
      sessionId: string, messages: Message[], session: AgentSession,
    ) {
      atomicCallCount++;
      if (atomicCallCount >= 2) {
        throw new Error('simulated crash after tool results');
      }
      await store.appendMessagesAtomic(sessionId, messages, session);
    },
  };
}
```

Add subpath export:

```json
// packages/agents/package.json exports
"./testing": {
  "import": "./dist/testing/index.js",
  "types": "./dist/testing/index.d.ts"
}
```

**Acceptance criteria:**
- [ ] `import { crashAfterToolResults } from '@vertz/agents/testing'` resolves.
- [ ] Calling the wrapper's `appendMessagesAtomic` once delegates; calling it a second time throws `'simulated crash after tool results'`.
- [ ] All other wrapper methods pass through unchanged (verify via spy on the underlying store).
- [ ] `vtz test packages/agents` passes.
- [ ] `vtz run typecheck --filter=@vertz/agents` passes.
- [ ] `vtz run build --filter=@vertz/agents` produces `dist/testing/index.js` and `dist/testing/index.d.ts`.

---

### Task 6: Land the RED E2E test + one-shot perf probe

**Files:** (2)
- `packages/agents/src/__tests__/durable-resume.test.ts` (new — the RED E2E from the design doc)
- `packages/agents/src/__tests__/durable-resume.perf.local.ts` (new — Phase-1 one-shot perf probe, `.local.ts` per `.claude/rules/integration-test-safety.md`)

**What to implement:**

Paste the E2E test from the design doc's "E2E Acceptance Test" section,
adjusting imports to match what actually exists:

```ts
import { afterEach, describe, expect, it } from '@vertz/test';
import { s } from '@vertz/schema';
import { agent, run, sqliteStore, tool, memoryStore, MemoryStoreNotDurableError } from '@vertz/agents';
import { crashAfterToolResults } from '@vertz/agents/testing';
import type { LLMAdapter } from '@vertz/agents';

function mockLLM(
  responses: Array<{ text?: string; toolCalls?: Array<{ id?: string; name: string; arguments: Record<string, unknown> }> }>,
): LLMAdapter {
  let i = 0;
  return {
    async chat() {
      const r = responses[i++] ?? { text: 'No more responses' };
      return { text: r.text ?? '', toolCalls: r.toolCalls ?? [] };
    },
  };
}

describe('Feature: durable tool execution', () => {
  describe('Given a side-effecting tool + store + sessionId', () => {
    describe('When the process crashes after handler ran but before tool_result persisted', () => {
      it('Then a subsequent run() does NOT re-invoke the handler', async () => {
        // ... as in the design doc ...
      });
    });
  });

  describe('Given store + sessionId is memory store', () => {
    it('Then run() entry throws MemoryStoreNotDurableError before the loop starts', async () => {
      // ... from design doc; assert no LLM calls happened ...
    });
  });

  describe('Type-level', () => {
    it('rejects misspelled tool config at compile time', () => {
      tool({
        description: 'x',
        input: s.object({}),
        output: s.object({}),
        // @ts-expect-error — 'safeToRetry' does not exist yet (Phase 4)
        safeToRetry: true,
      });
    });
  });
});
```

**Expected state at end of Phase 1 (RED):**
- The "does not re-invoke handler" test **fails** with a runtime error (the
  crash harness triggers before the framework has resume logic, so the loop
  aborts and the test expectation that `postSlackCallCount === 1` after the
  resumed run fails with "no second run happened" or similar).
- The memory-store entry-check test **passes** (Task 4 implemented it).
- The type-level `@ts-expect-error` **passes** (`safeToRetry` doesn't exist yet
  — the directive fires because the field is unknown).

The perf one-shot `durable-resume.perf.local.ts` measures wall time of a
10-step scripted loop against `sqliteStore({ path: ':memory:' })` (in-memory
SQLite is the closest thing we can exercise in a unit test; a real-D1 measurement
lives in Phase 5's manual checklist). Print the measured time; record in the
retrospective. Not a CI gate.

**Acceptance criteria:**
- [ ] `durable-resume.test.ts` exists and fails **only** at the "does not re-invoke" assertion — all other assertions pass.
- [ ] `durable-resume.perf.local.ts` exists, runs under `vtz test src/__tests__/durable-resume.perf.local.ts`, and prints a measured time.
- [ ] `vtz test packages/agents` has exactly one failing test (the Phase-1 RED assertion) and everything else green.
- [ ] `vtz run typecheck --filter=@vertz/agents` passes.

---

## Out of scope for Phase 1

- Per-step atomic writes in the ReAct loop (Phase 2).
- Resume detection & `ToolDurabilityError` (Phase 3).
- `safeToRetry` flag on tools (Phase 4).
- Documentation updates (Phase 5).

## Notes for the implementing agent

1. **TDD strictly per phase.** Inside this phase, the RED test lands last
   (Task 6). Tasks 1–5 each get their own red→green→refactor micro-cycles
   (unit tests for each new method).
2. **No `@ts-ignore`, no `as any`.** Every cast should use `as unknown as T`
   or a narrower type (see `.claude/rules/policies.md`).
3. **Commit per task** — six commits for Phase 1, each referencing `#2835`.
4. **Keep the design doc as the source of truth.** If you find a design
   conflict while implementing, stop and escalate instead of deviating
   silently.
