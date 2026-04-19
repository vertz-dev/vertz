# Phase 3: Resume Detection + `ToolDurabilityError` — MVP (GREEN milestone)

## Context

Phase 2 made the ReAct loop write per step atomically. After a crash between
write #1 (assistant-with-toolCalls) and write #2 (tool_results), the store
contains an orphan: an `assistant` row with non-empty `toolCalls` and zero
matching `tool_result` rows for this session.

This phase adds the resume primitive: at `run()` entry with `store + sessionId`,
scan for the orphan; for each missing tool_call_id, persist a synthetic
`ToolDurabilityError` as a `tool` message (committed in a single atomic write
with a bumped session.updatedAt). The loop then proceeds from the next LLM
call — the LLM sees the error in the message history and decides recovery.

**This is the GREEN milestone for the MVP**: Phase 1's RED E2E test at
`packages/agents/src/__tests__/durable-resume.test.ts` must pass on the
"does not re-invoke handler" assertion after this phase.

**Design invariants:**
- Resume runs **before** the first LLM call — `loadMessages(sessionId)`
  happens in `run.ts` already; extend that path.
- The synthetic `tool_result` content matches the shape existing handler
  errors use (`react-loop.ts:459-467` / `528-538` encode errors as JSON like
  `{ error: string }`); the synthetic result adds a `kind: 'tool-durability-error'`
  discriminator so callers + LLMs can pattern-match.
- Resume writes the synthetic tool_results via `appendMessagesAtomic` as
  **one atomic write**, preserving the per-step invariant.
- If the orphan has N tool_calls, we emit N `tool_result` messages in a
  single atomic write, not N separate writes.

**Key files:**
- `packages/agents/src/stores/errors.ts` — add `ToolDurabilityError`.
- `packages/agents/src/run.ts` — entry-time orphan scan + synthetic write.
- `packages/agents/src/__tests__/durable-resume.test.ts` — the Phase 1 E2E,
  now expected to go GREEN on the "does not re-invoke handler" + "error
  surfaces in history" assertions.

---

## Tasks

### Task 1: Add `ToolDurabilityError` + helper to serialize as a tool_result

**Files:** (3)
- `packages/agents/src/errors.ts` (new — top-level `errors.ts`; the existing
  `stores/errors.ts` stays; cross-cutting errors like this belong one level
  up; if the repo convention is single `errors.ts` per package, use that
  instead)
- `packages/agents/src/index.ts` (modified — export `ToolDurabilityError`
  from the main barrel)
- `packages/agents/src/errors.test.ts` (new — class shape + error content
  encoding tests)

**What to implement:**

```ts
// packages/agents/src/errors.ts
export class ToolDurabilityError extends Error {
  readonly code = 'TOOL_DURABILITY_ERROR' as const;
  readonly kind = 'tool-durability-error' as const;
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
    this.name = 'ToolDurabilityError';
    this.toolCallId = toolCallId;
    this.toolName = toolName;
  }
}

/** Serialize a ToolDurabilityError as the JSON content of a `tool` role message. */
export function serializeToolDurabilityError(err: ToolDurabilityError): string {
  return JSON.stringify({
    error: err.message,
    kind: err.kind,
    toolName: err.toolName,
    toolCallId: err.toolCallId,
  });
}
```

**Acceptance criteria:**
- [ ] `ToolDurabilityError` class exists with `code`, `kind`, `toolCallId`,
      `toolName` fields.
- [ ] `ToolDurabilityError` exported from `@vertz/agents`.
- [ ] `serializeToolDurabilityError` returns a JSON string with all four fields.
- [ ] Unit test asserts the serialized shape.
- [ ] `vtz run typecheck --filter=@vertz/agents` passes.

---

### Task 2: Orphan detection on `run()` entry

**Files:** (2)
- `packages/agents/src/run.ts` (modified — after `loadMessages`, detect
  orphaned assistant-with-toolCalls; if detected, synthesize tool_result
  messages for each missing tool_call_id and call `appendMessagesAtomic`
  once with all of them)
- `packages/agents/src/run.test.ts` (modified — tests: orphan detection
  triggers when last assistant has toolCalls and tool_results are missing;
  does NOT trigger when all tool_results are present; does NOT trigger when
  last message is a `user` or complete `assistant`)

**What to implement:**

In `run.ts`, after loading previous messages (around line 176) and before
constructing the loop inputs:

```ts
if (sessionId && store && !isMemoryStore(store)) {
  const orphan = findOrphanAssistantWithToolCalls(previousMessages);
  if (orphan) {
    const session = /* current loaded session */;
    const syntheticResults: Message[] = orphan.missingToolCalls.map((tc) => ({
      role: 'tool',
      content: serializeToolDurabilityError(
        new ToolDurabilityError(tc.id, tc.name),
      ),
      toolCallId: tc.id,
      toolName: tc.name,
    }));
    await store.appendMessagesAtomic(sessionId, syntheticResults, {
      ...session,
      updatedAt: new Date().toISOString(),
    });
    previousMessages.push(...syntheticResults);
  }
}
```

Where:

```ts
function findOrphanAssistantWithToolCalls(
  messages: Message[],
): { missingToolCalls: ToolCall[] } | null {
  // Find the last assistant message that has toolCalls.
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === 'assistant' && m.toolCalls?.length) {
      // Collect tool_result messages AFTER this assistant message.
      const laterToolResults = messages
        .slice(i + 1)
        .filter((x) => x.role === 'tool' && x.toolCallId)
        .map((x) => x.toolCallId!);
      const missing = m.toolCalls.filter(
        (tc) => tc.id && !laterToolResults.includes(tc.id),
      );
      return missing.length > 0 ? { missingToolCalls: missing } : null;
    }
    if (m.role !== 'tool') break; // tool rows are fine to skip over
  }
  return null;
}
```

**Acceptance criteria:**
- [ ] Test: stored state = `[user, assistant(toolCalls: [A, B])]` →
      orphan detected, 2 synthetic tool_results written, loop proceeds.
- [ ] Test: stored state = `[user, assistant(toolCalls: [A, B]), tool(A), tool(B)]`
      → no orphan, no synthetic write.
- [ ] Test: stored state = `[user, assistant(toolCalls: [A, B]), tool(A)]` →
      orphan for B only; 1 synthetic write.
- [ ] Test: stored state = `[user, assistant(no toolCalls)]` → no orphan.
- [ ] The synthetic write goes through `appendMessagesAtomic` (not
      `appendMessages`) with all synthetic messages in one call.

---

### Task 3: Verify the Phase 1 RED E2E test is now GREEN

**Files:** (1)
- `packages/agents/src/__tests__/durable-resume.test.ts` (modified — drop
  the "expected RED" comments now that the test passes; strengthen
  assertions)

**What to implement:**

Confirm the `it('Then a subsequent run() does NOT re-invoke the handler', ...)`
assertion passes. Add assertions that verify the synthetic tool_result
content shape:

```ts
const messages = await store.loadMessages('sess_test');
const durabilityMsg = messages.find(
  (m) => m.role === 'tool' && m.toolCallId === 'call_1',
);
expect(durabilityMsg).toBeDefined();
const parsed = JSON.parse(durabilityMsg!.content);
expect(parsed.kind).toBe('tool-durability-error');
expect(parsed.toolName).toBe('postSlack');
expect(parsed.toolCallId).toBe('call_1');
```

**Acceptance criteria:**
- [ ] `durable-resume.test.ts` — the "does not re-invoke handler" assertion
      passes.
- [ ] The `@ts-expect-error` on `safeToRetry: true` STILL fires (the field
      does not exist yet — Phase 4 adds it; if this directive becomes unused,
      the tool config type was widened prematurely).
- [ ] `vtz test packages/agents` passes with no failures.
- [ ] `vtz run typecheck --filter=@vertz/agents` passes.
- [ ] `vtz run lint --filter=@vertz/agents` passes.

---

## Out of scope for Phase 3

- `safeToRetry: true` opt-in (Phase 4).
- Docs (Phase 5).

## Expected state at end of Phase 3 — MVP COMPLETE

Phases 1–3 closed the P0 correctness hole. If scope pressure required it,
the feature could ship here as a minor release with:

- Durable stores (D1, SQLite).
- `appendMessagesAtomic` as the primitive.
- Per-step atomic writes when `store + sessionId` are present.
- Resume detection that surfaces `ToolDurabilityError` for non-safeToRetry tools.
- Memory store safely rejects durable use.

Phase 4 (safeToRetry) and Phase 5 (docs + retro + PR) follow immediately in
the same feature branch but can be merged separately if scope pressure
emerges.
