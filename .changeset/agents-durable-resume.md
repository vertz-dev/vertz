---
'@vertz/agents': patch
---

Durable tool execution + transactional resume. When `run()` is called
with `store + sessionId` against a durable store (`sqliteStore` /
`d1Store`), each tool-call step now commits atomically — pre-dispatch
assistant-with-toolCalls in one atomic write, post-dispatch
tool_results in another. If the process dies between the two, a later
`run()` with the same `sessionId` detects the orphan and either
re-invokes handlers declared `safeToRetry: true` or surfaces a
`ToolDurabilityError` tool_result for the LLM to reason about in-band.

**New exports** from `@vertz/agents`:

- `AgentStore.appendMessagesAtomic(sessionId, messages, session)` — the
  durability primitive. Implemented on all three stores.
- `MemoryStoreNotDurableError` — thrown at `run()` entry when
  `memoryStore()` is paired with `sessionId`. Memory store cannot
  guarantee durable writes.
- `ToolDurabilityError` — surfaced as a tool_result when an orphaned
  non-`safeToRetry` tool call is detected on resume.
- `tool({ safeToRetry: true, ... })` — optional per-tool flag. When
  true, the framework may re-invoke the handler on resume. Default
  (omitted) assumes side effects.

**New subpath**: `@vertz/agents/testing` with
`crashAfterToolResults(store, failOnCallNumber = 2)` for writing
resume tests.

**Removed** (pre-v1, no shim): `AgentLoopConfig.checkpointInterval` +
`ReactLoopOptions.onCheckpoint`. They were a notification callback,
not a durability primitive, and they created ambiguity with the new
`store + sessionId` path.

Closes #2835.
