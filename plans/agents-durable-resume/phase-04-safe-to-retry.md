# Phase 4: `tool({ safeToRetry: true })` Opt-in — follow-up sweetener

## Context

Phases 1–3 deliver the MVP: side-effecting tools never double-fire; if a
crash loses the tool_result, resume surfaces `ToolDurabilityError` to the LLM
and it decides what to do.

This phase adds the opt-out: pure-read tools declare `safeToRetry: true`, and
on orphan detection, the framework **re-invokes the handler** instead of
surfacing the error. Saves the LLM a detour for reads that are safe to rerun.

**This is a follow-up sweetener** — it can ship in the same PR or a separate
one. Triagebot's motivating tool (`postSlack`) is side-effecting and does NOT
opt in.

---

## Tasks

### Task 1: Add `safeToRetry?: boolean` to `ToolConfig` + `ToolDefinition`

**Files:** (3)
- `packages/agents/src/types.ts` (modified — add optional field to both
  `ToolConfig` and `ToolDefinition` interfaces; update `ToolContext` docs
  if anything references it)
- `packages/agents/src/tool.ts` (modified — forward the flag from config to
  definition in the freeze step)
- `packages/agents/src/tool.test.ts` (modified — test: `tool({ ..., safeToRetry: true })`
  produces a definition with `safeToRetry === true`; test: omitting the flag
  yields `safeToRetry === undefined`)

**What to implement:**

```ts
// types.ts
export interface ToolConfig<...> {
  // ...existing...
  /**
   * When true, this tool's handler may be automatically re-invoked by the
   * framework on session resume if the previous attempt's tool_result was
   * not persisted. Set only on pure reads or handlers that are safe to
   * execute twice. Default: undefined/false (framework surfaces
   * ToolDurabilityError on orphan instead of retrying).
   */
  readonly safeToRetry?: boolean;
}

export interface ToolDefinition<...> {
  // ...existing...
  readonly safeToRetry?: boolean;
}
```

```ts
// tool.ts
const def: ToolDefinition<TInput, TOutput> = {
  kind: 'tool',
  description: config.description,
  input: config.input as SchemaAny,
  output: config.output as SchemaAny,
  handler: config.handler,
  parallel: config.parallel,
  safeToRetry: config.safeToRetry, // new
};
```

**Acceptance criteria:**
- [ ] `tool({ ..., safeToRetry: true })` compiles and `.safeToRetry === true`.
- [ ] `tool({ ... })` without the flag compiles and `.safeToRetry === undefined`.
- [ ] Type test in `types.test-d.ts`: `@ts-expect-error` on `safeToRetry: 'yes'`
      (string where boolean expected).
- [ ] `vtz run typecheck --filter=@vertz/agents` passes.

---

### Task 2: Re-invoke handler on resume when `safeToRetry` is set

**Files:** (3)
- `packages/agents/src/run.ts` (modified — in the orphan-detection branch
  from Phase 3, inspect the tool's `safeToRetry` flag; if true, re-invoke
  the handler via the same path `executeToolCall` uses, capture the result
  or error, and write it as the real tool_result; if false, continue to
  surface `ToolDurabilityError` as before)
- `packages/agents/src/run.test.ts` (modified — test: resume with
  `safeToRetry: true` tool → handler called again, real result persisted,
  no `ToolDurabilityError`; test: mixed tools in one orphan — some retry,
  some surface error)
- `packages/agents/src/__tests__/durable-resume.test.ts` (modified — GREEN
  the second scenario: `safeToRetry: true` tool re-invokes on resume)

**What to implement:**

In the orphan-handling block of `run.ts` (added in Phase 3), for each
missing tool_call:

```ts
const toolDef = agent.tools[toolCall.name];
if (toolDef?.safeToRetry) {
  // Re-invoke the handler via the same path reactLoop uses.
  const result = await invokeToolHandler(toolDef, toolCall, toolProvider, toolContext);
  // result is either a success { content: JSON } or error tool_result
  resumeWrites.push({
    role: 'tool',
    content: result.content,
    toolCallId: toolCall.id,
    toolName: toolCall.name,
  });
} else {
  // Existing Phase 3 path: synthesize ToolDurabilityError
  resumeWrites.push(syntheticDurabilityError(toolCall));
}
```

**Acceptance criteria:**
- [ ] Test: `tool({ safeToRetry: true })` + orphan state → handler invoked
      exactly once during resume; real tool_result persisted; no
      `ToolDurabilityError` in history.
- [ ] Test: mixed orphan — tool A is `safeToRetry`, tool B is not → A's
      handler invoked, B's `ToolDurabilityError` surfaced.
- [ ] Test: handler throws during resume re-invocation → error persisted as
      normal error tool_result (same encoding as handler errors today).
- [ ] The second scenario in `durable-resume.test.ts` (`safeToRetry` re-invokes)
      passes.
- [ ] `vtz test packages/agents` passes with no failures.
- [ ] `vtz run typecheck --filter=@vertz/agents` passes.

---

## Out of scope for Phase 4

- Docs (Phase 5).
- Any network-retry / transient-error behavior. `safeToRetry` is
  exclusively about resume replay, NOT HTTP retries. The docs FAQ in
  Phase 5 clarifies this.

## Expected state at end of Phase 4

Both E2E scenarios in `durable-resume.test.ts` pass:
- Side-effecting tool (no flag) → orphan surfaces `ToolDurabilityError`.
- Read tool (`safeToRetry: true`) → orphan re-invokes handler automatically.
