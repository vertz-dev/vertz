# `@vertz/agents` ReAct Loop Improvements

**Status:** Rev 2 — review findings addressed, awaiting human sign-off
**Author:** Vinicius Dacal
**Date:** 2026-03-31
**Package:** `packages/agents`

---

## Motivation

The current ReAct loop in `@vertz/agents` is functional but minimal. It handles the core think → act → observe cycle with stuck detection and max iterations, but lacks the robustness needed for production agent workloads — especially long-running workflows (50+ iterations) and cloud deployment on Cloudflare Workers.

After studying Claude Code's open-sourced agentic loop, we identified four areas where battle-tested patterns can dramatically improve our loop without over-engineering.

**This is not about building an IDE.** It's about making the loop robust enough for:
1. Cloud deployment on Cloudflare (token budgets, context limits)
2. The dev workflow orchestrator (long-running, multi-hour agent sessions)
3. Future IDE-like tooling built on the Rust runtime

---

## API Surface

### 1. Token Budget Tracking

New optional config on `AgentLoopConfig`:

```typescript
import { agent, tool } from '@vertz/agents';
import { s } from '@vertz/schema';

const reviewAgent = agent('code-reviewer', {
  state: s.object({ status: s.string() }),
  initialState: { status: 'idle' },
  tools: { /* ... */ },
  model: { provider: 'cloudflare', model: 'kimi-k2' },
  loop: {
    maxIterations: 50,
    // NEW — token budget config
    tokenBudget: {
      max: 100_000,                    // hard cap in tokens
      warningThreshold: 0.8,          // warn LLM at 80%
      stopThreshold: 0.9,             // stop loop at 90%
      warningMessage: (pct, used, max) =>
        `Budget at ${pct}%. Summarize findings and wrap up.`,
    },
  },
});
```

The `LLMAdapter` interface gets an optional `usage` field on responses:

```typescript
export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface LLMResponse {
  readonly text: string;
  readonly toolCalls: readonly ToolCall[];
  readonly usage?: TokenUsage;  // NEW — optional, adapter reports if available
}
```

New exit statuses:

```typescript
// Before
export type LoopStatus = 'complete' | 'max-iterations' | 'stuck' | 'error';

// After
export type LoopStatus =
  | 'complete'
  | 'max-iterations'
  | 'stuck'
  | 'error'
  | 'token-budget-exhausted'  // hit the hard token cap
  | 'diminishing-returns';    // spinning with low token delta per iteration
```

New fields on `LoopResult`:

```typescript
export interface LoopResult {
  readonly status: LoopStatus;
  readonly response: string;
  readonly iterations: number;
  readonly messages: readonly Message[];
  readonly tokenUsage?: TokenUsageSummary;        // NEW — only present when adapter reports usage
  readonly compressionCount?: number;             // NEW — only present when contextCompression is configured
  readonly toolCallSummary?: readonly ToolCallSummaryEntry[];  // NEW — what tools were called
}

export interface TokenUsageSummary {
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalTokens: number;
  readonly budgetUsedPercent: number;  // 0-100
}

export interface ToolCallSummaryEntry {
  readonly toolName: string;
  readonly callCount: number;
}
```

**Behavior:**
- If `tokenBudget` is not set, behavior is unchanged (no token tracking).
- When set, the loop tracks cumulative token usage from `LLMResponse.usage`.
- At `warningThreshold` (default 80%), a system message is injected **once** (tracked via `warningSent` flag on the internal `BudgetTracker`). Default message: `"You have used {pct}% of your token budget ({used}/{max}). Prioritize completing the task."`. Customizable via `warningMessage`.
- At `stopThreshold` (default 90%), the loop exits with `status: 'token-budget-exhausted'`.
- Diminishing returns: if `diminishingReturns` config is set and the last N consecutive iterations each had a token delta below `minDeltaTokens`, exit with `status: 'diminishing-returns'`. This is a separate concept from budget exhaustion — the agent is spinning, not out of budget.
- If the adapter doesn't report `usage`, token budget tracking is silently skipped — `result.tokenUsage` will be `undefined`.

### 2. Parallel Tool Execution

New optional property on `ToolConfig`:

```typescript
const readFile = tool({
  description: 'Read a file from the repository',
  input: s.object({ path: s.string() }),
  output: s.object({ content: s.string() }),
  parallel: true,  // NEW — this tool can run alongside other parallel tools
  async handler(input, ctx) {
    return { content: await fs.readFile(input.path, 'utf-8') };
  },
});

const writeFile = tool({
  description: 'Write content to a file',
  input: s.object({ path: s.string(), content: s.string() }),
  output: s.object({ success: s.boolean() }),
  // parallel defaults to false — writes run alone
  async handler(input, ctx) {
    await fs.writeFile(input.path, input.content);
    return { success: true };
  },
});
```

**Batching algorithm:** When the LLM returns multiple tool calls, they are partitioned into maximal consecutive runs:

```
Tool calls: [parallel-A, parallel-B, serial-C, parallel-D, parallel-E]
→ Batch 1: [parallel-A, parallel-B] — concurrent (Promise.all)
→ Batch 2: [serial-C] — alone
→ Batch 3: [parallel-D, parallel-E] — concurrent (Promise.all)
```

Each batch executes sequentially (Batch 1 completes before Batch 2 starts). Within a concurrent batch, tools run in parallel up to `maxToolConcurrency`.

**Behavior:**
- Default: `parallel: false` (fail-closed, same as current behavior).
- Max concurrency: configurable via `loop.maxToolConcurrency` (default: 5). Conservative default for Cloudflare Workers which has subrequest limits.
- Tool errors in concurrent batches: each tool runs independently. An error in one does not cancel siblings — all results are collected and fed back to the LLM.

New optional config:

```typescript
loop: {
  maxIterations: 50,
  maxToolConcurrency: 5,  // NEW — max parallel tool executions (default: 5)
},
```

### 3. Context Compression Hooks

Rather than building a specific compression strategy (which is model-dependent), we provide **hooks** that let the developer control how messages are managed:

```typescript
export interface ContextCompressionConfig {
  readonly maxMessages?: number;         // trigger compression when messages exceed this
  readonly maxTokenEstimate?: number;    // trigger when estimated tokens exceed this (rough: ~4 chars/token)
  readonly compress: (messages: readonly Message[]) => Promise<Message[]> | Message[];
}
```

**Important:** `maxTokenEstimate` uses a rough character-based estimation (`content.length / 4`). This is NOT the same as `tokenBudget.max`, which uses authoritative counts from the LLM adapter. Set `maxTokenEstimate` conservatively (e.g., 50-70% of your model's context window) to account for estimation error. `tokenBudget` tracks cost; `contextCompression` manages context window size.

The `compress` callback receives conversation messages **without the system prompt**. The framework automatically preserves and re-prepends the system prompt after compression. This prevents accidental system prompt loss:

```typescript
const reviewAgent = agent('code-reviewer', {
  // ...
  loop: {
    maxIterations: 50,
    contextCompression: {
      maxMessages: 100,
      compress: async (messages) => {
        // `messages` does NOT include the system prompt — framework handles it.
        const recent = messages.slice(-10);
        const oldMessages = messages.slice(0, -10);

        const summary = await summarize(oldMessages);

        return [
          { role: 'system', content: `Previous conversation summary:\n${summary}` },
          ...recent,
        ];
      },
    },
  },
});
```

**Behavior:**
- Checked at the start of each iteration, before calling the LLM.
- If `maxMessages` is set and `messages.length > maxMessages`, call `compress()`.
- If `maxTokenEstimate` is set and estimated tokens exceed it, call `compress()`.
- The system prompt (messages[0] where `role === 'system'`) is automatically excluded from `compress()` input and re-prepended to the output.
- Post-compression validation: if `compress()` returns an empty array, throw a `VertzException` with message `"Context compression returned empty message array"`.

**Session persistence interaction:** When compression fires mid-loop, `result.messages` contains the compressed messages. If the agent uses an `AgentStore`, the compressed messages are what gets persisted. This is intentional — the session resumes with the compressed context, matching what the LLM saw. Developers who need full history retention should persist raw messages separately outside the agent loop.

### 4. Exit Statuses & Result Metadata

Terminal `LoopStatus` values:

```typescript
export type LoopStatus =
  | 'complete'                // LLM responded without tool calls (finished)
  | 'max-iterations'          // hit maxIterations limit
  | 'stuck'                   // consecutive iterations without progress (no tools succeeded)
  | 'error'                   // unrecoverable error (provider failure, etc.)
  | 'token-budget-exhausted'  // hit token budget stopThreshold
  | 'diminishing-returns';    // consecutive iterations with low token delta
```

`'diminishing-returns'` is distinct from `'stuck'`:
- `'stuck'` = no tools succeeded for N consecutive iterations (existing behavior)
- `'diminishing-returns'` = tools run but each iteration adds very few tokens (spinning on low-value work)

`'token-budget-exhausted'` is distinct from `'diminishing-returns'`:
- `'token-budget-exhausted'` = hard cap reached, increase budget or restructure task
- `'diminishing-returns'` = agent is spinning, decompose the task or tune prompt

**Lifecycle hook integration:** In `run.ts`, the `onStuck` lifecycle hook fires for: `'max-iterations'`, `'stuck'`, `'token-budget-exhausted'`, and `'diminishing-returns'`. All four represent "agent didn't finish cleanly" and warrant the same escalation path (state persistence, notification, etc.).

**Workflow integration:** `StepResult.status` in `workflow.ts` must use `LoopStatus` (imported) instead of a hardcoded literal union. This ensures new statuses flow through automatically.

**Tool call summary:** `LoopResult.toolCallSummary` provides a quick overview of what tools were invoked during the run, without parsing the full message array. Computed at loop exit from the accumulated tool call messages.

---

## Complete Type Definitions

```typescript
// --- Token Budget ---

export interface TokenBudgetConfig {
  readonly max: number;
  readonly warningThreshold?: number;          // default: 0.8 (80%)
  readonly stopThreshold?: number;             // default: 0.9 (90%)
  readonly warningMessage?: string | ((pct: number, used: number, max: number) => string);
}

export interface DiminishingReturnsConfig {
  readonly consecutiveThreshold: number;       // consecutive low-delta iterations (e.g., 3)
  readonly minDeltaTokens: number;             // delta below this = "low progress" (e.g., 500)
}

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface TokenUsageSummary {
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalTokens: number;
  readonly budgetUsedPercent: number;  // 0-100
}

export interface ToolCallSummaryEntry {
  readonly toolName: string;
  readonly callCount: number;
}

// --- Context Compression ---

export interface ContextCompressionConfig {
  readonly maxMessages?: number;
  readonly maxTokenEstimate?: number;  // rough estimation (~4 chars/token), NOT authoritative
  readonly compress: (messages: readonly Message[]) => Promise<Message[]> | Message[];
}

// --- Updated Loop Config ---

export interface AgentLoopConfig {
  readonly maxIterations: number;
  readonly onStuck?: OnStuckBehavior;
  readonly stuckThreshold?: number;
  readonly checkpointInterval?: number;
  readonly tokenBudget?: TokenBudgetConfig;                 // NEW
  readonly diminishingReturns?: DiminishingReturnsConfig;   // NEW — separate from tokenBudget
  readonly maxToolConcurrency?: number;                      // NEW — default: 5
  readonly contextCompression?: ContextCompressionConfig;    // NEW
}

// --- Updated Tool Config ---

export interface ToolConfig<TInput, TOutput, TInputSchema, TOutputSchema> {
  readonly description: string;
  readonly input: TInputSchema;
  readonly output: TOutputSchema;
  readonly handler?: (input: TInput, ctx: ToolContext) => TOutput | Promise<TOutput>;
  readonly approval?: ToolApprovalConfig<TInput>;
  readonly execution?: ToolExecution;
  readonly parallel?: boolean;  // NEW — default: false
}

// --- Updated Loop Status ---

export type LoopStatus =
  | 'complete'
  | 'max-iterations'
  | 'stuck'
  | 'error'
  | 'token-budget-exhausted'
  | 'diminishing-returns';

// --- Updated LLM Response ---

export interface LLMResponse {
  readonly text: string;
  readonly toolCalls: readonly ToolCall[];
  readonly usage?: TokenUsage;
}

// --- Updated Loop Result ---

export interface LoopResult {
  readonly status: LoopStatus;
  readonly response: string;
  readonly iterations: number;
  readonly messages: readonly Message[];
  readonly tokenUsage?: TokenUsageSummary;
  readonly compressionCount?: number;
  readonly toolCallSummary?: readonly ToolCallSummaryEntry[];
}
```

---

## Manifesto Alignment

### Principle 1: If it builds, it works

- `TokenBudgetConfig` is fully typed — invalid thresholds are caught by schema validation at definition time.
- `parallel` is a boolean, not a callback — no runtime ambiguity.
- `compress` function signature enforces correct input/output shapes.
- Post-compression validation catches empty arrays at runtime (framework guard).
- System prompt is automatically preserved — no developer foot-gun.

### Principle 2: One way to do things

- Token tracking is config-based, not middleware. One place to set it: `loop.tokenBudget`.
- Parallel execution is opt-in per tool, not per invocation. One way: `parallel: true`.
- Context compression has one trigger point (start of iteration) and one callback shape.
- Diminishing returns detection is its own config (`loop.diminishingReturns`), not mixed into token budget.

### Principle 3: AI agents are first-class users

- The loop improvements are invisible to the LLM — it sees the same message format.
- Warning messages at token budget thresholds guide the LLM to complete efficiently.
- Customizable `warningMessage` lets developers tailor the guidance per agent.

### Principle 5: Type safety wins

- `LoopStatus` union expanded with literal types — exhaustive switch/case is enforced.
- `TokenUsageSummary` is a concrete type, not `Record<string, number>`.
- `ToolConfig.parallel` flows through to `ToolDefinition.parallel`.
- `StepResult.status` in workflows uses `LoopStatus` import (not hardcoded union).

### Principle 7: Performance is not optional

- Parallel tool execution reduces latency when LLMs request multiple read operations.
- Token budget tracking prevents wasteful iterations (cost optimization for cloud).
- Context compression keeps the loop viable for 50+ iteration sessions.

### What was rejected

- **Built-in summarization strategy** — rejected because summarization is model-dependent. The hook pattern lets developers use whatever strategy fits their model.
- **Streaming tool execution** — rejected for v1. Requires tight coupling with the LLM adapter's streaming API.
- **Tool cancellation on sibling error** — rejected. We let all tools complete and feed all results back. Simpler, and the LLM handles partial failures better with full information.
- **API-side context management** — rejected. Claude Code uses Anthropic-specific `cache_edits`. These are vendor-specific and don't align with our runtime-agnostic design.
- **Separate `onBudgetExhausted` lifecycle hook** — rejected. `onStuck` already handles "agent didn't finish cleanly." Adding another hook fragments the recovery path for minimal value.

---

## Non-Goals

1. **Streaming/SSE support** — The loop returns complete results. Streaming tool execution and token-by-token streaming are deferred.
2. **Automatic summarization** — We provide the hook; the developer provides the strategy. No built-in LLM-based summarization.
3. **Per-tool token budgets** — Budget is per-loop, not per-tool. Tool-level budgets add complexity for minimal value.
4. **Tool dependency graphs** — Tools are independent. No "tool A must complete before tool B" declarations.
5. **Conversation branching** — No fork/merge of conversation history. Linear message array only.
6. **Provider-specific optimizations** — No Anthropic prompt caching, no OpenAI function calling optimization. Runtime-agnostic.

---

## Unknowns

### U1: Token estimation accuracy (resolved — acceptable)

Rough estimation (`content.length / 4`) is sufficient for triggering compression. Exact counts come from `LLMResponse.usage` which is authoritative. The estimation only needs to be in the right ballpark to trigger the compress callback at approximately the right time.

### U2: Parallel tool error handling (resolved — feed all back)

When tools run in parallel and multiple fail, the LLM receives multiple error messages. This is acceptable — LLMs handle multiple error results well. No special aggregation needed. Validated by Claude Code's approach.

---

## Type Flow Map

### Token Budget

```
TokenBudgetConfig (user config)
  → agent() validates thresholds (0 < warning < stop ≤ 1)
  → AgentDefinition.loop.tokenBudget (frozen)
  → run() passes to reactLoop() as ReactLoopOptions.tokenBudget
  → reactLoop() creates BudgetTracker (mutable: totalInput, totalOutput, warningSent, deltas[])
  → Each iteration: LLMResponse.usage → updateBudget(tracker, usage)
  → checkBudget(tracker, config) → 'continue' | 'warn' | 'stop'
  → Warn: inject message ONCE (warningSent flag), continue
  → Stop: LoopResult.status = 'token-budget-exhausted'
  → LoopResult.tokenUsage: TokenUsageSummary (readonly, frozen)
```

### Diminishing Returns

```
DiminishingReturnsConfig (user config, separate from tokenBudget)
  → agent() validates (consecutiveThreshold ≥ 1, minDeltaTokens ≥ 0)
  → AgentDefinition.loop.diminishingReturns (frozen)
  → reactLoop() tracks delta tokens per iteration (requires LLMResponse.usage)
  → If last N deltas all < minDeltaTokens: LoopResult.status = 'diminishing-returns'
  → If adapter doesn't report usage: diminishing returns detection is skipped
```

### Parallel Tool Execution

```
ToolConfig.parallel (user config, boolean)
  → tool() freezes into ToolDefinition.parallel (default: false)
  → reactLoop() receives tools Record
  → On tool calls: partitionToolCalls(toolCalls, tools) → Batch[]
  → Batch { concurrent: true, calls: ToolCall[] } → Promise.all with maxConcurrency
  → Batch { concurrent: false, calls: [ToolCall] } → sequential
  → All results collected as Message[] → appended to conversation
```

### Context Compression

```
ContextCompressionConfig (user config)
  → agent() preserves in AgentDefinition.loop.contextCompression
  → run() passes to reactLoop() as ReactLoopOptions.contextCompression
  → Each iteration start: shouldCompress(messages, config) → boolean
  → If true: strip system prompt → compress(nonSystemMessages) → validate non-empty → re-prepend system prompt
  → Loop continues with compressed messages
  → LoopResult.compressionCount incremented
```

---

## E2E Acceptance Test

```typescript
import { agent, tool, run } from '@vertz/agents';
import { s } from '@vertz/schema';

describe('Feature: ReAct loop improvements', () => {
  // --- Token Budget ---

  describe('Given an agent with tokenBudget.max = 1000', () => {
    describe('When the LLM adapter reports cumulative usage exceeding 900 tokens (90%)', () => {
      it('Then the loop exits with status "token-budget-exhausted"', () => {});
      it('Then result.tokenUsage.totalTokens reflects cumulative usage', () => {});
      it('Then result.tokenUsage.budgetUsedPercent >= 90', () => {});
    });

    describe('When usage reaches 800 tokens (80% = warningThreshold)', () => {
      it('Then a system message is injected warning the LLM about budget', () => {});
      it('Then the warning is injected only once (not on subsequent iterations)', () => {});
      it('Then the loop continues (does not exit)', () => {});
    });

    describe('When warningMessage is a custom function', () => {
      it('Then the custom message is injected instead of the default', () => {});
    });

    describe('When the LLM adapter does not report usage', () => {
      it('Then token budget tracking is silently skipped', () => {});
      it('Then result.tokenUsage is undefined', () => {});
    });
  });

  // --- Diminishing Returns (separate from budget) ---

  describe('Given an agent with diminishingReturns config', () => {
    describe('When 3 consecutive iterations each have token delta < 500', () => {
      it('Then the loop exits with status "diminishing-returns"', () => {});
    });

    describe('When adapter does not report usage', () => {
      it('Then diminishing returns detection is skipped', () => {});
    });
  });

  // --- Parallel Tool Execution ---

  describe('Given an agent with two parallel tools and one non-parallel tool', () => {
    describe('When the LLM returns 3 tool calls: [parallel-A, parallel-B, serial-C]', () => {
      it('Then parallel-A and parallel-B execute concurrently', () => {});
      it('Then serial-C executes after both parallel tools complete', () => {});
      it('Then all 3 results are fed back to the LLM', () => {});
    });

    describe('When the LLM returns interleaved calls: [parallel-A, serial-B, parallel-C, parallel-D]', () => {
      it('Then batch 1 is [parallel-A] concurrent', () => {});
      it('Then batch 2 is [serial-B] alone', () => {});
      it('Then batch 3 is [parallel-C, parallel-D] concurrent', () => {});
    });

    describe('When two concurrent tools are called and one throws an error', () => {
      it('Then the other tool still completes', () => {});
      it('Then both results (success + error) are returned to the LLM', () => {});
    });
  });

  describe('Given maxToolConcurrency = 2 and 4 parallel tool calls', () => {
    describe('When the tools execute', () => {
      it('Then at most 2 tools run at the same time', () => {});
    });
  });

  // --- Context Compression ---

  describe('Given an agent with contextCompression.maxMessages = 10', () => {
    describe('When messages exceed 10 at the start of an iteration', () => {
      it('Then the compress callback is called with messages (excluding system prompt)', () => {});
      it('Then the system prompt is automatically re-prepended', () => {});
      it('Then the loop continues with the compressed messages', () => {});
      it('Then result.compressionCount is 1', () => {});
    });

    describe('When compress returns an empty array', () => {
      it('Then throws a VertzException', () => {});
    });

    describe('When compression triggers multiple times during a long session', () => {
      it('Then compressionCount reflects the total number of compressions', () => {});
    });
  });

  describe('Given an agent with contextCompression.maxTokenEstimate = 5000', () => {
    describe('When estimated tokens exceed 5000', () => {
      it('Then the compress callback is called', () => {});
    });
  });

  // --- Tool Call Summary ---

  describe('Given an agent that calls tools during execution', () => {
    describe('When the loop completes', () => {
      it('Then result.toolCallSummary contains { toolName, callCount } entries', () => {});
    });
  });

  // --- Exit Statuses ---

  describe('Given the expanded LoopStatus type', () => {
    it('Then "token-budget-exhausted" is a valid LoopStatus', () => {});
    it('Then "diminishing-returns" is a valid LoopStatus', () => {});

    // @ts-expect-error — "aborted" is not a valid LoopStatus
    it('Then invalid statuses are rejected by the type system', () => {
      const _invalid: LoopStatus = 'aborted';
    });
  });

  // --- Backward Compatibility ---

  describe('Given an agent with NO new config', () => {
    describe('When the agent runs', () => {
      it('Then behavior is identical to the current implementation', () => {});
      it('Then result.tokenUsage is undefined', () => {});
      it('Then result.compressionCount is undefined', () => {});
      it('Then result.toolCallSummary is undefined', () => {});
    });
  });

  // --- Lifecycle Hook Integration ---

  describe('Given an agent with onStuck hook', () => {
    describe('When loop exits with "token-budget-exhausted"', () => {
      it('Then onStuck is called', () => {});
    });
    describe('When loop exits with "diminishing-returns"', () => {
      it('Then onStuck is called', () => {});
    });
  });

  // --- Workflow Integration ---

  describe('Given a workflow step that exits with "diminishing-returns"', () => {
    describe('When the workflow processes the step result', () => {
      it('Then the workflow aborts with status "error" and failedStep set', () => {});
      it('Then StepResult.status is "diminishing-returns" (LoopStatus flows through)', () => {});
    });
  });
});
```

---

## Implementation Plan

### Phase 1: Token Budget Tracking + Adapter Usage

**Goal:** Add token budget tracking to the ReAct loop with usage reporting, warning injection, stop threshold, diminishing returns detection, and adapter usage extraction.

**Why adapter usage in Phase 1 (not Phase 4):** Token budget tracking is silently skipped without adapter-reported usage. Deferring adapter changes to Phase 4 means the primary consumer (Cloudflare) can't exercise the feature end-to-end until all phases complete. Including adapter usage here enables immediate validation.

**Acceptance Criteria:**
```typescript
describe('Feature: Token budget tracking', () => {
  describe('Given a reactLoop with tokenBudget config', () => {
    describe('When LLM reports cumulative usage exceeding stopThreshold', () => {
      it('Then exits with status "token-budget-exhausted"', () => {});
      it('Then result.tokenUsage reflects cumulative usage', () => {});
    });
    describe('When usage reaches warningThreshold', () => {
      it('Then injects a warning system message once', () => {});
    });
    describe('When warningMessage is a custom callback', () => {
      it('Then the custom message is used', () => {});
    });
    describe('When adapter reports no usage', () => {
      it('Then budget tracking is skipped, loop behaves as before', () => {});
    });
  });
  describe('Given a reactLoop with diminishingReturns config', () => {
    describe('When consecutive low-delta iterations exceed threshold', () => {
      it('Then exits with status "diminishing-returns"', () => {});
    });
  });
  describe('Given the Cloudflare adapter', () => {
    describe('When the API response includes usage data', () => {
      it('Then LLMResponse.usage.inputTokens matches usage.prompt_tokens', () => {});
      it('Then LLMResponse.usage.outputTokens matches usage.completion_tokens', () => {});
    });
  });
});
```

**Deliverables:**
- `TokenBudgetConfig`, `DiminishingReturnsConfig`, `TokenUsage`, `TokenUsageSummary`, `ToolCallSummaryEntry` types
- `BudgetTracker` internal state object (create, update, check, warningSent flag)
- `LLMResponse.usage` optional field
- `LoopStatus` expanded with `'token-budget-exhausted'` and `'diminishing-returns'`
- `LoopResult.tokenUsage`, `LoopResult.compressionCount`, `LoopResult.toolCallSummary` optional fields
- Validation in `agent()` factory (thresholds in range)
- Cloudflare adapter: extract `usage` from Workers AI response
- MiniMax adapter: extract `usage` from API response
- `.test-d.ts` for new types
- Update `run.ts`: `onStuck` fires for new statuses
- Update `workflow.ts`: `StepResult.status` uses `LoopStatus` import

### Phase 2: Parallel Tool Execution

**Goal:** Allow parallel tools to execute concurrently when the LLM returns multiple tool calls in one response.

**Acceptance Criteria:**
```typescript
describe('Feature: Parallel tool execution', () => {
  describe('Given tools with parallel: true', () => {
    describe('When LLM returns multiple parallel tool calls', () => {
      it('Then they execute concurrently', () => {});
    });
    describe('When interleaved parallel/serial calls are returned', () => {
      it('Then partitioned into maximal consecutive batches', () => {});
    });
    describe('When a concurrent tool errors', () => {
      it('Then sibling tools still complete', () => {});
    });
    describe('When maxToolConcurrency is set', () => {
      it('Then no more than N tools run simultaneously', () => {});
    });
  });
});
```

**Deliverables:**
- `ToolConfig.parallel` and `ToolDefinition.parallel`
- `AgentLoopConfig.maxToolConcurrency`
- `partitionToolCalls()` function (explicit batching algorithm)
- `runToolBatch()` with concurrency control (Promise.all with semaphore)
- Tests verifying parallel execution timing and interleaved batching

### Phase 3: Context Compression Hooks

**Goal:** Allow developers to provide a compression callback that triggers when message count or token estimate exceeds a threshold.

**Acceptance Criteria:**
```typescript
describe('Feature: Context compression', () => {
  describe('Given contextCompression.maxMessages = 10', () => {
    describe('When messages exceed threshold', () => {
      it('Then compress callback is invoked with non-system messages', () => {});
      it('Then system prompt is auto-re-prepended', () => {});
      it('Then loop continues with compressed messages', () => {});
      it('Then compressionCount increments', () => {});
    });
    describe('When compress returns empty array', () => {
      it('Then throws VertzException', () => {});
    });
  });
  describe('Given contextCompression.maxTokenEstimate = 5000', () => {
    describe('When estimated tokens exceed threshold', () => {
      it('Then compress callback is invoked', () => {});
    });
  });
  describe('Given no contextCompression config', () => {
    describe('When loop runs', () => {
      it('Then no compression occurs', () => {});
      it('Then compressionCount is undefined', () => {});
    });
  });
});
```

**Deliverables:**
- `ContextCompressionConfig` type
- `shouldCompress()` check function
- `estimateTokens()` utility (content.length / 4)
- System prompt auto-preservation (strip before compress, re-prepend after)
- Post-compression validation (non-empty check)
- `LoopResult.compressionCount` field

### Phase 4: Integration & Documentation

**Goal:** Full E2E validation, backward compatibility verification, documentation.

**Acceptance Criteria:**
- E2E acceptance test passes (full agent definition → run → verify all features)
- Backward compatibility: existing agents work without changes, optional fields are undefined
- Docs updated in `packages/docs/`
- Changeset (patch)

**Deliverables:**
- E2E integration tests (agent → run → verify token budget, parallel tools, compression together)
- Backward compatibility test suite
- Documentation page for loop configuration
- Changeset

---

## Dependencies Between Phases

```
Phase 1 (Token Budget + Adapters) ← independent, includes LoopStatus + LoopResult changes
Phase 2 (Parallel Tools)          ← depends on Phase 1 for LoopResult shape changes
Phase 3 (Context Compress)        ← depends on Phase 1 for LoopResult shape changes
Phase 4 (Integration + Docs)      ← depends on Phases 1-3
```

Phase 1 establishes the updated type shapes. Phases 2 and 3 can run in parallel after Phase 1.

---

## Review History

### Rev 1 → Rev 2 (2026-03-31)

**Reviewers:** DX (Claude Sonnet), Product (Claude Sonnet), Technical (Claude Sonnet)

**Blockers addressed:**
- B1 (all reviews): Diminishing returns exit status changed from `'token-budget-exhausted'` to `'diminishing-returns'`. Separated `DiminishingReturnsConfig` from `TokenBudgetConfig` into its own config.
- B2 (DX + Tech): `compressionCount` and `toolCallSummary` made optional on `LoopResult` (consistent with `tokenUsage?`).
- B3 (DX + Tech): Removed `'context-compressed'` from `LoopStatus` entirely. Only terminal statuses remain.
- B4 (Tech): Documented `run.ts` lifecycle hook changes — `onStuck` fires for new statuses.
- B5 (Tech): Documented `workflow.ts` `StepResult.status` must use `LoopStatus` import.
- B6 (Product): Documented compression + session persistence interaction explicitly.

**Should-fixes addressed:**
- S1 (DX + Product): Renamed `concurrencySafe` → `parallel`.
- S2 (DX): Added customizable `warningMessage` to `TokenBudgetConfig`.
- S3 (Tech): Warning injection is now idempotent — `warningSent` flag prevents re-injection.
- S4 (Tech + DX): `compress()` receives messages WITHOUT system prompt; framework auto-re-prepends. Post-compression validation throws on empty array.
- S5 (DX + Product + Tech): Documented dual token counting (`maxTokenEstimate` vs `tokenBudget.max`).
- S6 (Tech): Batching algorithm explicitly specified with interleaved example.
- S7 (Product): Moved adapter usage extraction to Phase 1 (not Phase 4).
- S8 (Product): Added `toolCallSummary` to `LoopResult`.

**Nits addressed:**
- N1 (DX): Renamed `budgetUsedPct` → `budgetUsedPercent`.
- N2 (Tech): `maxToolConcurrency` default lowered from 10 to 5 with rationale (CF Workers subrequest limits).
