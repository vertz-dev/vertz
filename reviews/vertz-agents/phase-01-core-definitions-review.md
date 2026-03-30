# Phase 1: Core Definitions + Tool Execution

- **Author:** viniciusdacal (via Claude)
- **Reviewer:** Adversarial Review Agent
- **Commits:** be180d377..c307c9c9a
- **Date:** 2026-03-30

## Changes

- packages/agents/src/types.ts (new)
- packages/agents/src/agent.ts (new)
- packages/agents/src/tool.ts (new)
- packages/agents/src/run.ts (new)
- packages/agents/src/loop/react-loop.ts (new)
- packages/agents/src/loop/validate-tool-input.ts (new)
- packages/agents/src/providers/tool-description.ts (new)
- packages/agents/src/providers/types.ts (new)
- packages/agents/src/index.ts (new)
- packages/agents/src/types.test-d.ts (new)
- packages/agents/src/agent.test.ts (new)
- packages/agents/src/tool.test.ts (new)
- packages/agents/src/run.test.ts (new)
- packages/agents/src/loop/react-loop.test.ts (new)
- packages/agents/src/loop/validate-tool-input.test.ts (new)
- packages/agents/src/providers/tool-description.test.ts (new)

## CI Status

- [ ] Quality gates passed at <pending>

## Review Checklist

- [x] Delivers what the ticket asks for
- [ ] TDD compliance (tests before/alongside implementation)
- [ ] No type gaps or missing edge cases
- [ ] No security issues (injection, XSS, etc.)
- [x] Public API changes match design doc

## Findings

### Changes Requested

---

### BLOCKER B1: ReAct loop hard-codes `ToolContext` with dummy values

**File:** `packages/agents/src/loop/react-loop.ts`, line 151-153

The loop passes `{ agentId: 'loop', agentName: 'loop' }` as the `ToolContext` to every tool handler. This means tool handlers can never know which agent is executing them.

```typescript
const result = await toolDef.handler(validation.data, {
  agentId: 'loop',    // <-- always 'loop', not the real agent ID
  agentName: 'loop',  // <-- always 'loop', not the real agent name
});
```

`run()` creates a proper `AgentContext` with `agent.id` and `agent.name`, but this information is never threaded into `reactLoop()`. The `ReactLoopOptions` interface has no field for agent context.

**Fix:** Add `agentId` and `agentName` (or a full `ToolContext`) to `ReactLoopOptions`. Thread it from `run()` into `reactLoop()`, then into tool handler calls.

---

### BLOCKER B2: `stuckThreshold` / `onStuck` behavior is completely unimplemented

**File:** `packages/agents/src/loop/react-loop.ts`

The design doc specifies:
- "Progress" detection: tool calls that return non-error results count as progress
- `stuckThreshold`: consecutive iterations without progress trigger stuck behavior
- `onStuck` behavior: `'escalate'` / `'stop'` / `'retry'` each have specific semantics
- LoopStatus should include `'stuck'` as a distinct status

The implementation:
- Never tracks progress
- Never counts consecutive no-progress iterations
- Never uses `stuckThreshold`
- Only returns `'complete'` or `'max-iterations'`, never `'stuck'`
- `ReactLoopOptions` doesn't even accept `stuckThreshold` or `onStuck`
- The `'stuck'` and `'error'` members of `LoopStatus` are dead code (never produced)

`run.ts` line 78 checks for `result.status === 'stuck'` and calls `agentDef.onStuck`, but the loop never returns `'stuck'`. The `onStuck` lifecycle hook only fires on `'max-iterations'`, which conflates two semantically different states.

**Fix:** Implement progress tracking in the loop. Count consecutive iterations where all tool calls returned errors. When `stuckThreshold` consecutive no-progress iterations occur, return `{ status: 'stuck' }`. Keep `'max-iterations'` separate for when the hard cap is hit. Thread `stuckThreshold` and `onStuck` behavior through `ReactLoopOptions`.

---

### BLOCKER B3: `'error'` LoopStatus is dead — never produced, never handled

**File:** `packages/agents/src/loop/react-loop.ts`, line 39

`LoopStatus` includes `'error'` but no code path ever produces it. The design doc specifies error recovery for LLM provider failures (429, 5xx) — none of that is implemented. If `llm.chat()` throws, the entire `reactLoop()` function throws an unhandled rejection.

**Fix at minimum:** Wrap the `llm.chat()` call in try/catch. If it throws, return `{ status: 'error', response: errorMessage }`. Document that retry/backoff is deferred. Alternatively, remove `'error'` from `LoopStatus` if it's intentionally deferred, but update the design doc to reflect this.

---

### SHOULD-FIX S1: `run()` does not pass agent context to tools — context is disconnected

**File:** `packages/agents/src/run.ts`, lines 40-51

`run()` creates an `AgentContext` with a `state` property, but this state is never accessible to tool handlers. The design doc shows tool handlers accessing `ctx.state` to read/write agent state:

```typescript
handler(input, ctx) {
  ctx.state.findings = [...ctx.state.findings, input];
}
```

But `ToolContext` only has `agentId` and `agentName`. There is no `state` property. This is a fundamental gap — the agent's state is created in `run()` but is invisible to all tools.

This is marked should-fix rather than blocker because Phase 1 acceptance criteria test that `onStart`/`onComplete` hooks receive state (which they do), and tool state access could be argued as Phase 2. But the design doc API surface shows it in Phase 1 examples, and it's the primary way tools interact with agent state.

---

### SHOULD-FIX S2: `ToolCall` has no `id` field — breaks multi-model compatibility

**File:** `packages/agents/src/loop/react-loop.ts`, lines 19-22

```typescript
export interface ToolCall {
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}
```

Most LLM providers (OpenAI, Anthropic, Cloudflare) return a unique `id` for each tool call, and expect the tool result to reference that `id`. The current implementation generates synthetic IDs (`call_${iteration}_${toolCall.name}`), but these don't correspond to what the LLM sent. When the LLM receives tool results with IDs it didn't generate, it may get confused or reject them (depending on the provider).

**Fix:** Add `readonly id?: string` to `ToolCall`. Use `toolCall.id ?? callId` as the fallback.

---

### SHOULD-FIX S3: No test for `run()` using a custom `instanceId`

**File:** `packages/agents/src/run.test.ts`

`RunOptions.instanceId` is documented but never tested. There is no test verifying that passing `instanceId` results in it being used as `ctx.agent.id`.

---

### SHOULD-FIX S4: `tool()` does not validate handler-required-for-server

**File:** `packages/agents/src/tool.ts`

A tool with `execution: 'server'` (the default) and no `handler` is silently accepted. The ReAct loop then hits the `!toolDef.handler` check at runtime and returns an error to the LLM. This should be caught at definition time.

**Fix:** In `tool()`, throw if `execution !== 'client'` and `handler` is undefined.

---

### SHOULD-FIX S5: `agent()` does not validate `loop.maxIterations > 0`

**File:** `packages/agents/src/agent.ts`

`maxIterations: 0` or `maxIterations: -1` would cause the ReAct loop to immediately return `{ status: 'max-iterations', response: '' }` or create an infinite loop (negative won't since `iteration < maxIterations` would be false immediately, but 0 is degenerate). No validation exists for this.

**Fix:** Validate `maxIterations >= 1` in `agent()`.

---

### SHOULD-FIX S6: Object.freeze is shallow — nested objects on AgentDefinition are mutable

**File:** `packages/agents/src/agent.ts`, line 74

`Object.freeze(def)` only freezes the top-level properties. `def.tools`, `def.loop`, `def.prompt`, `def.access`, `def.inject` are all nested objects that remain mutable after freeze:

```typescript
const a = agent('test', { ... });
a.loop.maxIterations = 999; // This mutates the "frozen" definition
a.tools.myTool = otherTool; // This mutates the tools record
```

Same issue in `tool.ts` line 27 — `approval` and nested objects are not deeply frozen.

The design doc says "frozen AgentDefinition." The current implementation is only shallowly frozen.

**Fix:** Either deep-freeze (recursive `Object.freeze`) or document that freeze is intentionally shallow. Deep freeze is the safer option since definitions are supposed to be immutable config objects.

---

### SHOULD-FIX S7: `reactLoop` messages array leaks mutable internal state

**File:** `packages/agents/src/loop/react-loop.ts`, line 98

The `LoopResult.messages` field returns the raw mutable `messages` array. Callers (including `run()`) receive a reference to the loop's internal message buffer. Any mutation by a caller (e.g., pushing extra messages) would corrupt the loop's conversation history if it were still running.

In practice this is safe because the loop is done when it returns, but the `readonly` modifier on `LoopResult.messages` only prevents `.push()` at the type level — at runtime, the array is still mutable. For defensive correctness, return a copy or freeze the array.

---

### NIT N1: Inconsistent `eslint-disable` placement in `types.ts`

**File:** `packages/agents/src/types.ts`, lines 97/107 and 132/141

The `eslint-enable` comment is placed on the same line as the first property after the generic parameters, making it hard to read:

```typescript
export interface AgentConfig<...> {
  /* eslint-enable @typescript-eslint/no-explicit-any */ readonly description?: string;
```

The enable comment should be on its own line.

---

### NIT N2: `makeTool` helper in react-loop.test.ts uses `s.object({})` for all tools

**File:** `packages/agents/src/loop/react-loop.test.ts`, line 11

Every tool created with `makeTool()` has `input: s.object({})`, which means validation always passes (empty schema accepts anything). This means the validation integration test at line 226 is the ONLY test that exercises the validation path with a real schema. Consider making `makeTool` accept an optional input schema parameter for better coverage.

---

### NIT N3: Missing test for `onCheckpoint` not being called when `checkpointInterval` is not set

**File:** `packages/agents/src/loop/react-loop.test.ts`

There is a test for checkpoints being called at the right intervals, but no test verifying that the callback is NOT called when `checkpointInterval` is omitted or `0`.

---

### NIT N4: No negative type test for `ToolContext` — handler receiving wrong context type

**File:** `packages/agents/src/types.test-d.ts`

The type tests verify input/output type flow and agent state, but don't verify that `ToolContext` is correctly typed in the handler. For example, there is no `@ts-expect-error` test confirming you can't access `ctx.state` in a tool handler (since `ToolContext` doesn't have it).

---

### NIT N5: `run.test.ts` doesn't verify the message array content for tool execution

**File:** `packages/agents/src/run.test.ts`

The first test in `run.test.ts` verifies `result.status`, `result.response`, and `result.iterations`, but doesn't inspect `result.messages` to confirm that the tool was actually called and its result was properly formatted. The react-loop tests do this, but `run()` adds its own wiring (system prompt, lifecycle) that could interfere.

---

## Design Doc Compliance Summary

| Design Doc Requirement | Status | Notes |
|---|---|---|
| `agent()` factory with frozen definition | Implemented | Shallow freeze only (S6) |
| `tool()` factory with schema validation | Implemented | Missing server handler validation (S4) |
| ReAct loop with iteration limits | Implemented | |
| ReAct loop with stuck detection | NOT IMPLEMENTED | B2 — stuckThreshold is ignored |
| ReAct loop error recovery (429, 5xx) | NOT IMPLEMENTED | B3 — LLM errors propagate as unhandled rejections |
| `LLMAdapter` interface | Implemented | Missing tool call ID (S2) |
| `run()` entry point | Implemented | Dummy tool context (B1) |
| Tool input validation | Implemented | |
| `onStart`/`onComplete`/`onStuck` hooks | Partially | `onStuck` never fires for actual stuck (B2) |
| `toolsToDescriptions` for providers | Implemented | |
| Access rule evaluation | NOT IMPLEMENTED | Phase 1 acceptance criteria mention it; index.ts doesn't export it |
| Server registration (`createServer`) | NOT IMPLEMENTED | Phase 1 acceptance criteria mention it; no `@vertz/server` integration |

**Note on server integration and access rules:** The Phase 1 acceptance criteria in the design doc include "Given an agent with access rules / Then returns an access denied error" and "Given an agent registered in createServer() / Then accepts agent definitions in the agents array." Neither is implemented. These may be intentionally deferred to later in Phase 1, but they're listed as acceptance criteria.

---

## Resolution

Pending author fixes. Blockers B1-B3 must be resolved before proceeding to Phase 2. Should-fixes S1-S7 should be addressed in this phase to avoid compounding tech debt.
