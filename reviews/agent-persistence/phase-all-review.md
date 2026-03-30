# All Phases: Agent Persistence Layer

- **Author:** viniciusdacal/san-diego
- **Reviewer:** adversarial-review-agent
- **Commits:** 8d76589de..7380066ad
- **Date:** 2026-03-30

## Changes

### Phase 1: Store interface + memory store + run() changes
- packages/agents/src/stores/types.ts (new)
- packages/agents/src/stores/errors.ts (new)
- packages/agents/src/stores/errors.test.ts (new)
- packages/agents/src/stores/memory-store.ts (new)
- packages/agents/src/stores/memory-store.test.ts (new)
- packages/agents/src/run.ts (modified — was pre-existing from Phase 1 agents PR)
- packages/agents/src/run.test.ts (modified)
- packages/agents/src/loop/react-loop.ts (modified — `previousMessages` option)
- packages/agents/src/loop/react-loop.test.ts (modified)
- packages/agents/src/types.test-d.ts (modified)
- packages/agents/src/index.ts (modified)

### Phase 2: SQLite store
- packages/agents/src/stores/sqlite-store.ts (new)
- packages/agents/src/stores/sqlite-store.test.ts (new)

### Phase 3: Server integration
- packages/agents/src/create-agent-runner.ts (new)
- packages/agents/src/create-agent-runner.test.ts (new)
- packages/server/src/agent/types.ts (modified — AgentRunnerFn signature)
- packages/server/src/agent/route-generator.ts (modified — sessionId passthrough)
- packages/server/src/agent/route-generator.test.ts (modified)

### Phase 4: D1 store
- packages/agents/src/stores/d1-store.ts (new)
- packages/agents/src/stores/d1-store.test.ts (new)
- packages/agents/src/cloudflare.ts (new)

## CI Status

- [x] Quality gates passed at 7380066ad (all 142 tests pass across agents + server/agent)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before/alongside implementation)
- [x] No type gaps or missing edge cases — see findings below
- [x] No security issues (injection, XSS, etc.) — SQL is parameterized
- [x] Public API changes match design doc

## Findings

### BLOCKER — B1: `maxStoredMessages` accepted but never enforced

**File:** `packages/agents/src/run.ts:32`

`RunOptionsWithStore` accepts `maxStoredMessages?: number` (line 32), which matches the design doc. However, the `run()` function never reads or acts on this value. The design doc specifies (section "Message cap"):

> When persisting, if the total message count exceeds maxStoredMessages, the oldest interaction rounds are pruned.

The option is accepted at the type level (and there is a negative type test confirming `maxStoredMessages` without `store` is an error), but the actual pruning logic is completely missing. A developer who sets `maxStoredMessages: 50` will get unbounded message growth.

**Impact:** High. Sessions will grow unbounded. On D1 this hits the 1MB row limit faster. No test covers this behavior.

---

### BLOCKER — B2: Double `loadSession` call on resume — unnecessary I/O and race condition

**File:** `packages/agents/src/run.ts:112-126` and `packages/agents/src/run.ts:202-206`

When resuming a session, `run()` calls `store.loadSession(sessionId)` at line 114 for validation and ownership checks. Then, after the ReAct loop completes, it calls `store.loadSession(sessionId)` AGAIN at line 203 just to get the `createdAt` value:

```ts
// Line 202-206
if (options.sessionId) {
  const existing = await store.loadSession(sessionId);
  if (existing) {
    createdAt = existing.createdAt;
  }
}
```

This is both wasteful (two round trips for the same data) and has a subtle race condition: if another writer deleted the session between the two loads, `existing` would be null and `createdAt` would incorrectly use `now` instead of the original value.

**Fix:** Cache the `createdAt` from the first `loadSession` call (line 114) in a local variable and reuse it at line 202.

---

### SHOULD-FIX — S1: Route generator returns 500 for SessionNotFoundError/SessionAccessDeniedError

**File:** `packages/server/src/agent/route-generator.ts:134-139`

The route handler catches ALL errors as 500 Internal Server Error:

```ts
catch (error) {
  const errorMessage = error instanceof Error ? error.message : 'Internal server error';
  return jsonResponse(
    { error: { code: 'InternalServerError', message: errorMessage } },
    500,
  );
}
```

`SessionNotFoundError` and `SessionAccessDeniedError` are expected, user-facing errors that should return 404 or 403 (or a unified 404 to prevent enumeration). Returning 500 for these is misleading -- it suggests a server bug rather than an invalid session ID.

The design doc says: "Both 'not found' and 'access denied' return the same error message: Session '${id}' not found or access denied. This prevents session ID enumeration." This is correctly implemented in the error classes, but the HTTP status code is wrong (500 instead of 404).

**Fix:** Import `SessionNotFoundError` and `SessionAccessDeniedError` in the route generator and return 404 for both (using the same message that already exists on the error). This is intentionally NOT 403 for enumeration prevention.

---

### SHOULD-FIX — S2: No test for error turn NOT persisting when resuming an existing session

**File:** `packages/agents/src/run.test.ts:354-375`

The test "does NOT persist messages from the failed turn" only tests the case where a NEW session is created and the LLM immediately fails. There is no test for the more important case: resuming an existing session with messages, the LLM failing, and verifying the pre-existing messages are preserved AND no new messages from the failed turn are added.

This is the more critical scenario because data loss on resume would be devastating.

---

### SHOULD-FIX — S3: `sqliteStore.upsertSessionStmt` does not update `agent_name`, `user_id`, or `tenant_id` on conflict

**File:** `packages/agents/src/stores/sqlite-store.ts:119-123`

The upsert statement only updates `state` and `updated_at`:

```sql
ON CONFLICT(id) DO UPDATE SET
  state = excluded.state,
  updated_at = excluded.updated_at
```

If `run()` ever saves a session where `userId` or `tenantId` changed between saves (unlikely but possible if the session was created without a user and then resumed by an authenticated user), the stored values would be stale. The same applies to `d1-store.ts:160-162`.

The `run.ts` code at line 209-217 constructs the session with current `userId`/`tenantId`, but the upsert silently drops these on update. This could lead to ownership mismatches.

**Fix:** Add `user_id = excluded.user_id, tenant_id = excluded.tenant_id` to the ON CONFLICT clause, or document why this is intentionally immutable (once set, never changed).

---

### SHOULD-FIX — S4: D1 `appendMessages` is not transactional

**File:** `packages/agents/src/stores/d1-store.ts:194-212`

The SQLite store wraps message appending in a transaction (line 172-187), but the D1 store uses individual `INSERT` calls in a for loop (line 194-212). If a D1 write fails partway through (e.g., 1MB row limit hit on the third message), the first two messages are already committed, leaving the conversation in an inconsistent state with partial iteration data.

D1 supports `batch()` for transactional multi-statement execution. The current implementation should use it.

---

### SHOULD-FIX — S5: Missing changeset for `@vertz/agents`

No changeset file was found for the persistence layer changes. The design doc and implementation add new public API surface (`memoryStore`, `sqliteStore`, `d1Store`, `run()` overloads, `createAgentRunner`, session types, error types). Per project policy, every changeset = `patch`.

---

### SHOULD-FIX — S6: Error persistence test does not verify session state is unchanged on resume failure

**File:** `packages/agents/src/run.test.ts:354-375`

The test checks that messages are not persisted on error, but does not check that the session object itself (state, updatedAt) is not modified. The `run()` code at line 197 correctly checks `result.status !== 'error'` before saving, but a test should confirm the session row is untouched after a failed turn.

---

### NICE-TO-HAVE — N1: `memoryStore.loadMessages` returns a shallow copy but shared mutable objects

**File:** `packages/agents/src/stores/memory-store.ts:21-23`

`loadMessages` returns `[...(messages.get(sessionId) ?? [])]` which creates a new array, but the Message objects inside are the same references. If caller mutates a returned Message object, it would corrupt the store's internal state. The stores should return deep copies or the Message type should enforce immutability (which it does via `readonly` props, so this is low-risk).

---

### NICE-TO-HAVE — N2: `listSessions` for D1/SQLite does not filter by `tenantId`

**File:** `packages/agents/src/stores/types.ts:23-27`, `packages/agents/src/stores/sqlite-store.ts:194-216`

The `ListSessionsFilter` interface accepts `agentName` and `userId` but not `tenantId`. The design doc's `listSessions` signature also omits `tenantId`. This means tenant isolation for session listing relies entirely on the application layer. For multi-tenant deployments, this is a gap -- any call to `listSessions({ userId: 'user-a' })` returns sessions across all tenants.

---

### NICE-TO-HAVE — N3: No test for `previousMessages` with tool call messages

**File:** `packages/agents/src/loop/react-loop.test.ts:428-463`

The `previousMessages` tests only inject simple user/assistant messages. There is no test for injecting messages with `toolCallId`, `toolName`, or `toolCalls` fields, which is the realistic scenario when resuming a session where tools were used. The SQLite store correctly round-trips these fields (tested in sqlite-store.test.ts:113-139), but the end-to-end flow from store -> previousMessages -> reactLoop is not tested with tool metadata.

---

### NICE-TO-HAVE — N4: Error classes do not extend from a Vertz base exception

**File:** `packages/agents/src/stores/errors.ts`

Per project convention (`.claude/rules/policies.md`), the `no-throw-plain-error` lint rule prefers VertzException subclasses. `SessionNotFoundError` and `SessionAccessDeniedError` extend plain `Error` rather than a VertzException base class. This is a warn-level lint rule, so not blocking.

---

### OBSERVATION — O1: `AgentRunnerFn` signature is a breaking change but entire package is new

The design doc calls out the `AgentRunnerFn` signature change as breaking (from positional `(name, message, ctx)` to options bag `(name, { message, sessionId }, ctx)`). However, since `packages/server/src/agent/types.ts` is a NEW file (didn't exist on main) and `packages/agents/` is also entirely new in this branch, this is not actually a breaking change to any existing consumer. The breaking change concern from the design doc applies only to the intermediate state between Phase 1 agents PR (#2114/#2117) and this PR. Since those PRs are already merged, the break is real for anyone who adopted the old signature. But since pre-v1, this is acceptable per policy.

---

### OBSERVATION — O2: Design doc specifies "complete iterations only" pruning but no implementation exists

The design doc section "Error persistence strategy" specifies:

> For 'stuck' / 'max-iterations', only complete iterations are stored. A "complete iteration" = assistant message + all corresponding tool results. If the last iteration is partial (assistant requested tools but loop ended before execution), it is excluded.

The `run.ts` code at line 222 only filters out system messages:

```ts
const newMessages = result.messages.filter((m) => m.role !== 'system');
```

There is no logic to detect and exclude partial iterations. If the loop exits due to max-iterations after the assistant requests tools but before they execute, the orphaned assistant message with `toolCalls` is persisted without its tool results. On the next resume, the LLM would see an assistant tool-call message without the corresponding tool results, which may confuse it.

This is related to B1 (maxStoredMessages not implemented) but is a separate concern about structural integrity of stored conversations.

---

## Resolution

All blockers and should-fixes addressed in commit a115e03ec:

- **B1 FIXED**: Added `pruneMessages(sessionId, keepCount)` to `AgentStore` interface. Implemented in all 3 stores (memory, sqlite, d1). `run()` calls `store.pruneMessages()` after appending when `maxStoredMessages` is set. Test verifies pruning to cap after multi-turn growth.
- **B2 FIXED**: Cached `createdAt` from the first `loadSession` call into `existingCreatedAt` variable. Eliminated the second `loadSession` call entirely.
- **S1 FIXED**: Route generator now returns 404 for `SessionNotFoundError` and `SessionAccessDeniedError` (duck-typed via `code` property to avoid cross-package import). Generic errors still return 500. Two new tests added.
- **S2 FIXED**: Added test "pre-existing messages are preserved and no new messages added" for error-on-resume scenario.
- **S3 FIXED**: UPSERT in both sqlite-store and d1-store now updates `user_id` and `tenant_id` on conflict. Tests added for both stores.
- **S4 FIXED**: D1 `appendMessages` now uses `db.batch()` for transactional multi-statement execution. Added `batch()` to `D1Binding` interface. Mock D1 binding updated to wrap batch in a transaction.
- **S5 FIXED**: Changeset added at `.changeset/agent-persistence-layer.md` (patch).
- **S6 FIXED**: Added test "session state and updatedAt are NOT modified" after failed resume.

Nice-to-haves N1–N4 and observations O1–O2 are acknowledged but not addressed in this PR (low risk, deferred).
