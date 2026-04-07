# @vertz/agents — Type Strengthening Plan

**Status**: Draft
**Date**: 2026-04-07

## Goal

Reduce the surface area of `any` across `@vertz/agents` to improve IDE feedback, catch misuses at compile time, and make the codebase more self-documenting. Each phase is self-contained and independently shippable.

---

## Classification Legend

| Tag | Meaning |
|-----|---------|
| **Fixable** | Can be made fully type-safe with no `any` remaining |
| **Constrainable** | Cannot eliminate `any` entirely, but can narrow it to something tighter (`unknown`, a union, a branded type) |
| **Structural** | Requires a design change that touches the public API surface |
| **Unavoidable** | TypeScript limitation that requires `any`; documented so it is not revisited |

---

## Completed

### InferToolProvider (Done — 2026-04-07)

Added `InferToolProvider<TTools>` to derive strongly-typed provider handler signatures from tool declarations. Individual provider factories (e.g. `createSandboxProvider`, `createGitProvider`) now return `InferToolProvider<typeof tools>` instead of loose `ToolProvider`. The untyped `ToolProvider` is preserved for DI composition roots.

---

## Phase 1 — ToolDefinition Schema Preservation

**Classification**: Fixable
**Impact**: High — eliminates two `as SchemaAny` casts and makes tool introspection type-safe
**Files**: `types.ts`, `tool.ts`

### Problem

`ToolDefinition` stores `input` and `output` as `SchemaAny`, erasing the original `Schema<TInput, unknown>` / `Schema<TOutput, unknown>` type parameters. The `tool()` factory casts with `config.input as SchemaAny`.

### Solution

Add schema type parameters to `ToolDefinition`:

```ts
export interface ToolDefinition<
  TInput = unknown,
  TOutput = unknown,
  TInputSchema extends Schema<TInput, unknown> = Schema<TInput, unknown>,
  TOutputSchema extends Schema<TOutput, unknown> = Schema<TOutput, unknown>,
> {
  readonly kind: 'tool';
  readonly description: string;
  readonly input: TInputSchema;
  readonly output: TOutputSchema;
  readonly handler?: (input: TInput, ctx: ToolContext) => TOutput | Promise<TOutput>;
  readonly approval?: ToolApprovalConfig<TInput>;
  readonly execution: ToolExecution;
  readonly parallel?: boolean;
}
```

Update `tool()` return type to propagate the schema generics. Remove the `as SchemaAny` casts.

### Impact on Consumers

No breaking changes — new parameters have defaults. Places that pass `ToolDefinition<any, any>` still compile since `Schema<any, any>` satisfies the defaults.

### Validation

- Existing tool tests pass unchanged
- Add type test: `typeof myTool.input` resolves to the specific schema type, not `SchemaAny`

---

## Phase 2 — AgentInvoker.invoke() and run() Output Typing

**Classification**: Constrainable
**Impact**: High — typed return values for the two most-used functions
**Files**: `types.ts`, `run.ts`

### Problem

`AgentInvoker.invoke()` accepts `AgentDefinition<any, any, any>` and always returns `Promise<{ response: string }>`. `run()` accepts `AgentDefinition<any, any, any>` and its result types have a hardcoded `response: string`.

### Solution

**2a. `AgentInvoker.invoke()`**

```ts
export interface AgentInvoker {
  invoke<TAgent extends AgentDefinition>(
    agentDef: TAgent,
    options: InvokeOptions,
  ): Promise<InferAgentOutput<TAgent>>;
}
```

Untyped calls still resolve to `{ response: string }` (from `AgentDefinition` defaults). Specific agent constants get inferred output types.

Note: runtime always returns `{ response: string }` today. The typed output requires the react loop to parse through the output schema. Add a TODO marking the runtime gap.

**2b. `run()` signature**

Replace `AgentDefinition<any, any, any>` with a bounded generic:

```ts
export async function run<TAgent extends AgentDefinition>(
  agentDef: TAgent,
  opts: RunOptionsStateless,
): Promise<StatelessLoopResult>;
```

Eliminates `any` on the parameter side. Result types remain string-based until output schema parsing is added to the loop.

**2c. `mergeToolProvider`**

```ts
function mergeToolProvider<TTools extends Record<string, ToolDefinition>>(
  agentTools: TTools,
  provider?: ToolProvider,
): Record<string, ToolDefinition> {
```

Removes the `as Record<string, ToolDefinition<unknown, unknown>>` cast on the call site.

### Validation

- Add type test: `run(agentWithOutput, opts)` satisfies `StatelessLoopResult`
- Add type test: `invoke(agentWithOutput, { message: 'hi' })` infers output type
- All runtime tests pass unchanged

---

## Phase 3 — fromOpenAIResponse Type Narrowing

**Classification**: Fixable
**Impact**: Medium — removes 4+ `as Record<string, unknown>` casts
**Files**: `providers/openai-format.ts`

### Problem

`fromOpenAIResponse(response: unknown)` uses multiple `as Record<string, unknown>` casts instead of proper type narrowing.

### Solution

Add an `OpenAIChatResponse` interface and a type guard:

```ts
interface OpenAIChatResponse {
  choices: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        type: string;
        function?: { name: string; arguments: string };
      }>;
    };
  }>;
}

function isOpenAIChatResponse(value: unknown): value is OpenAIChatResponse {
  if (typeof value !== 'object' || value === null) return false;
  return Array.isArray((value as Record<string, unknown>).choices);
}
```

Single `as Record<string, unknown>` cast inside the type guard is the standard narrowing pattern. The function body uses typed interfaces for property access — no more casts.

### Validation

- Existing `openai-format.test.ts` tests cover malformed inputs, empty choices, valid responses, tool calls — all pass unchanged

---

## Phase 4 — StepDefinition and Builder Cast Narrowing

**Classification**: Unavoidable (stored StepDefinition) + Constrainable (builder return)
**Impact**: Medium — documents the erasure boundary; tightens what can be tightened
**Files**: `workflow.ts`

### Problem

1. `StepDefinition` stores `agent` as `AgentDefinition<any, any, any>` and `input` as `(ctx: StepContext) => ...` without the workflow's generics.
2. `WorkflowBuilderImpl.step()` returns `as any`.

### Why StepDefinition Erasure Is Unavoidable

`StepDefinition` is stored in a heterogeneous array (`readonly StepDefinition[]`). TypeScript cannot track per-element generic type parameters across a growing array. The type safety lives in the `WorkflowBuilder` interface's `.step()` overloads, which correctly thread `TPrev` through each call. This is the same pattern used by tRPC, Drizzle, and other builder libraries.

### What Can Be Tightened

**4a. Narrow the builder return cast**

Replace `as any` with `as unknown as WorkflowBuilder<TInput, Prettify<...>>`. Prevents `any` from propagating and documents the target type.

**4b. Narrow StepDefinition's agent field**

Replace `AgentDefinition<any, any, any>` with plain `AgentDefinition` (defaults to `unknown` params). The `any` in the default's `ToolDefinition` record is unavoidable (Phase 6), but the outer `AgentDefinition` itself no longer uses explicit `any`.

**4c. Add `@internal` JSDoc**

Document that `input` and `approval` fields have erased generics and that type safety is enforced at the builder call site, not at the storage site.

### Validation

- All workflow builder and runtime tests pass unchanged

---

## Phase 5 — createAgentRunner Generic Agent Names

**Classification**: Structural (opt-in, backward compatible)
**Impact**: Medium — compile-time validation of agent names
**Files**: `create-agent-runner.ts`

### Problem

`createAgentRunner` accepts `readonly AgentDefinition<any, any, any>[]` and the returned runner takes `agentName: string` — any string is accepted at compile time.

### Solution

```ts
export function createAgentRunner<
  const TAgents extends readonly AgentDefinition[],
>(
  agents: TAgents,
  options: CreateAgentRunnerOptions,
): (
  agentName: TAgents[number]['name'],
  options: AgentRunOptions,
  ctx: BaseContextLike,
) => Promise<AgentRunResult> {
```

With `const` type parameter, `[agentA, agentB] as const` infers the name union `'agent-a' | 'agent-b'`. Plain arrays fall back to `string` (backward compatible).

Internal map:
```ts
const agentMap = new Map<string, TAgents[number]>();
```

**Server compatibility**: `@vertz/server`'s `AgentRunnerFn` uses `agentName: string`. The narrower union is assignable to `string` — no server changes needed.

### Validation

- Existing tests pass unchanged
- Add type test: const-array runner infers name union; plain array falls back to string

---

## Phase 6 — Unavoidable `any` Documentation

**Classification**: Unavoidable
**Impact**: Low (documentation only) — prevents churn from future attempts

### Items That Require `any` and Why

**6a. `ToolDefinition<any, any>` in Record type defaults**

Appears in: `AgentConfig`, `AgentDefinition`, `CreateAdapterOptions`, `ReactLoopOptions`, `WorkflowBuilder.step()`.

**Why**: TypeScript variance checking. `ToolDefinition` is invariant in its type parameters (handler is both covariant in output and contravariant in input). `Record<string, ToolDefinition<unknown, unknown>>` would NOT accept `Record<string, ToolDefinition<{ name: string }, { greeting: string }>>`. Using `any` makes the constraint bivariant.

**6b. `ToolProvider` loose type**

**Why**: DI composition of heterogeneous providers. `(input: { name: string }) => void` is not assignable to `(input: unknown) => void` due to contravariance. Must use `any`.

**6c. `InferAgentOutput` conditional type bounds**

**Why**: `infer` requires `any` in the constraint to match all possible instantiations.

### Action

Standardize comment format:
```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- variance: see plans/agents-type-strengthening.md#6a
```

---

## Phase 7 — Internal Function Parameter Cleanup

**Classification**: Mostly Unavoidable + 1 fix
**Impact**: Low — internal-only, no API changes
**Files**: `loop/react-loop.ts`, `loop/validate-tool-input.ts`, `providers/tool-description.ts`

### What's Unavoidable

`ToolDefinition<any, any>` in `reactLoop`, `partitionToolCalls`, `executeToolCall`, `toolsToDescriptions`, `toOpenAITools` — all unavoidable for the same variance reason as Phase 6a.

### What's Fixable

`validateToolInput` only accesses `toolDef.input.parse(input)` — it does not call the handler. It can use a structural type:

```ts
export function validateToolInput(
  toolDef: { readonly input: SchemaAny },
  input: unknown,
): ValidationResult {
```

This removes one `ToolDefinition<any, any>` site.

---

## Sequencing

```
Phase 1 (ToolDefinition schemas)
  └─→ Phase 2 (run/invoke output types) — depends on Phase 1
Phase 3 (fromOpenAIResponse) — independent, parallelizable
Phase 4 (StepDefinition/workflow) — independent
Phase 5 (createAgentRunner names) — independent
Phase 6 (documentation) — last, references all decisions
Phase 7 (internal cleanup) — after Phase 6
```

Phases 3, 4, and 5 can be done in any order or in parallel.

---

## Summary

| # | Item | Classification | Breaking? | `any` removed |
|---|------|---------------|-----------|---------------|
| ✅ | InferToolProvider | Fixable | No | 0 (new type) |
| 1 | ToolDefinition schema params | Fixable | No | 2 casts |
| 2 | run()/invoke() output types | Constrainable | No | 5 params |
| 3 | fromOpenAIResponse casts | Fixable | No | 4+ casts |
| 4 | StepDefinition/builder cast | Constrainable | No | 2 sites |
| 5 | createAgentRunner names | Structural | No | 2 params |
| 6 | Unavoidable documentation | N/A | No | 0 (document ~18) |
| 7 | Internal cleanup | 1 fix | No | 1 site |

**Before**: ~30+ untyped `any` sites
**After**: ~18 documented-unavoidable `any` sites (all with canonical reasons)
