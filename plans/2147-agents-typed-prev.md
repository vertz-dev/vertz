# Typed `ctx.prev` Accumulation for Workflow Steps

**Issue:** #2147
**Status:** Draft
**Date:** 2026-04-06

---

## Problem

`StepContext.prev` is typed as `Record<string, unknown>`. Developers get no type safety when accessing previous step outputs:

```typescript
// Current — no type help, no errors on wrong keys
step('summarize', {
  input: (ctx) => ctx.prev['greet'].greeting, // any — no autocomplete, no compile error
});
```

The design doc (`plans/vertz-agents.md`, lines 896-908) specifies that `ctx.prev` should be strongly typed based on preceding steps' output schemas. This was originally scoped as a Phase 2 deliverable (line 1119: "Workflow step type accumulation (`.test-d.ts` proof)") but deferred because it requires either a builder pattern or recursive tuple types. Issue #2147 picks this up.

---

## API Surface

### Before (v1 — config object, untyped prev)

```typescript
const pipeline = workflow('my-pipeline', {
  input: s.object({ userName: s.string() }),
  steps: [
    step('greet', {
      agent: greeterAgent,
      output: s.object({ greeting: s.string() }),
    }),
    step('summarize', {
      agent: summarizerAgent,
      input: (ctx) => ctx.prev['greet'].greeting, // Record<string, unknown> — no safety
      output: s.object({ summary: s.string() }),
    }),
  ],
});
```

### After (v2 — builder pattern, typed prev)

```typescript
const pipeline = workflow('my-pipeline', { input: s.object({ userName: s.string() }) })
  .step('greet', {
    agent: greeterAgent,
    output: s.object({ greeting: s.string() }),
  })
  .step('summarize', {
    agent: summarizerAgent,
    input: (ctx) => {
      // ctx.prev.greet.greeting is string — full autocomplete
      return { message: ctx.prev.greet.greeting };
    },
    output: s.object({ summary: s.string() }),
  })
  .build();
```

### Why builder pattern over config object

TypeScript cannot flow types between array elements. In `steps: [step('a', ...), step('b', ...)]`, step B's `input` callback is typed when `step('b', ...)` is called — before the array is ever seen by `workflow()`. The `prev` type is locked to `Record<string, unknown>` at `step()` call time.

A builder pattern solves this by chaining: each `.step()` call returns a new `WorkflowBuilder` with an updated `TPrev` generic that includes the current step's output. The next `.step()` call sees the accumulated type.

### API details

```typescript
// Utility type to flatten intersections in hover previews
type Prettify<T> = { [K in keyof T]: T[K] } & {};

// workflow() returns a builder instead of a definition
function workflow<TInputSchema extends SchemaAny>(
  name: string,
  config: { input: TInputSchema; access?: Partial<Record<'start' | 'approve', unknown>> },
): WorkflowBuilder<InferSchema<TInputSchema>>;

// Builder accumulates step output types through chaining
interface WorkflowBuilder<TInput, TPrev extends Record<string, unknown> = {}> {
  // Step with output schema — adds InferSchema<TOutputSchema> to TPrev
  step<TName extends string, TOutputSchema extends SchemaAny | undefined = undefined>(
    name: TName,
    config: {
      agent?: AgentDefinition<any, any, any>;
      input?: (ctx: StepContext<TInput, TPrev>) => string | { message: string };
      output?: TOutputSchema;
      approval?: StepApprovalConfig<TInput, TPrev>;
    },
  ): WorkflowBuilder<
    TInput,
    Prettify<
      TPrev &
        Record<
          TName,
          TOutputSchema extends SchemaAny ? InferSchema<TOutputSchema> : { response: string }
        >
    >
  >;

  build(): WorkflowDefinition;
}

// StepContext now carries TPrev generic
interface StepContext<TWorkflowInput = unknown, TPrev = Record<string, unknown>> {
  readonly workflow: { readonly input: TWorkflowInput };
  readonly prev: Readonly<TPrev>;
}

// StepApprovalConfig message callback also benefits from typed prev.
// Exported form uses defaults (backward-compatible); typed form used internally by builder.
interface StepApprovalConfig<TInput = unknown, TPrev = Record<string, unknown>> {
  readonly message: string | ((ctx: StepContext<TInput, TPrev>) => string);
  readonly timeout?: string;
}
```

### Output type resolution

| Step configuration | `TPrev[name]` type |
|---|---|
| `output: s.object({ x: s.string() })` | `{ x: string }` |
| No `output` field (agent step) | `{ response: string }` |
| Approval-only (no agent, no output) | Not added to `TPrev` — gate steps don't produce data |

Approval-only steps are detected when the config has `approval` but no `agent`. At the type level, these steps do not extend `TPrev`. This matches runtime semantics — approval steps return `pending` immediately without writing to `prev`.

### Standalone `step()` factory

The standalone `step()` factory is **removed**. Steps are defined inline via the builder's `.step()` method. There is no use case for pre-defining steps separately — the typing benefit comes from defining them in the builder chain.

### Validation timing

- **Eager (per `.step()` call):** Step name format validation (`/^[a-z][a-z0-9-]*$/`) and duplicate name detection.
- **Deferred (`build()`):** Structural constraints — at least one step required.

Returns a frozen `WorkflowDefinition`.

---

## Manifesto Alignment

### Principle 1 — If it builds, it works

This is the core of the change. Currently, `ctx.prev['nonexistent'].foo` compiles without error. After this change, the compiler catches:
- Accessing a step that doesn't exist
- Accessing a property that isn't in the step's output schema
- Accessing an approval-only step's output (not in `prev`)

### Principle 2 — One way to do things (acknowledged deviation)

The builder pattern is the single way to define workflows. The old config-object-with-step-array pattern is removed, not kept as an alternative.

**Convention deviation:** Every other top-level Vertz API (`entity()`, `service()`, `agent()`, `tool()`) uses config objects. `workflow()` now uses a builder chain. This is an intentional exception: TypeScript cannot flow types between array elements in a config object, making typed `prev` impossible without chaining. The type safety gain (Principle 1) outweighs the consistency cost. The original design doc's "no chaining" guideline (`plans/vertz-agents.md`, Principle 2) is revised for this specific case — the constraint is fundamental to TypeScript's type system, not a preference.

### Principle 3 — AI agents are first-class users

Builder patterns are well-known to LLMs (Prisma, Zod, tRPC). The chaining API is predictable and self-documenting. An LLM gets autocomplete on `ctx.prev.` — it can see exactly which steps exist and what their outputs look like.

### What was rejected

**Config object + recursive tuple types:** TypeScript can't flow types between array elements' callbacks. Each `step()` call is independent — it can't know the outputs of sibling steps in the same array. This approach was investigated and is fundamentally impossible without the builder pattern.

**Config object + cast helpers:** Adding `as WorkflowSteps<[...]>` casts would be error-prone and defeat the purpose of type safety.

---

## Non-Goals

- **Conditional/parallel step execution.** This is a linear sequential builder. Branching/parallelism is a separate future feature.
- **Runtime changes.** The builder produces the same `WorkflowDefinition` at runtime. `runWorkflow()` logic is unchanged.
- **Position-aware prev (only preceding steps).** Each step's `prev` includes all steps defined before it in the chain. This is naturally handled by the builder pattern — step N only sees steps 0..N-1. This is NOT a non-goal, it's a natural consequence of the builder.
- **Typed `previousResults` in `RunWorkflowOptions`.** Resumption results remain `Record<string, StepResult>`. Typing this requires knowing the workflow's step types at the call site, which is a separate concern.

---

## Unknowns

### U1: Intersection type readability

**Question:** Does `TPrev & Record<TName, TOutput>` produce readable hover types after 5+ steps?

**Resolution:** `Prettify<T>` (`{ [K in keyof T]: T[K] } & {}`) flattens intersections into a single object type in hover previews. This is the standard approach used by tRPC, Prisma, and Zod. The `Prettify` utility is a 1-liner and will live in `packages/agents/src/workflow.ts`. Low risk.

### U2: TypeScript inference depth with many steps

**Question:** Does TypeScript hit recursion limits with 10+ chained `.step()` calls?

**Resolution:** Each `.step()` is a single generic instantiation, not recursion. TypeScript handles 10+ levels of generic chaining without issues (demonstrated by Prisma's fluent API, tRPC's router builder). The depth is O(n) for n steps, not exponential. Low risk.

---

## POC Results

Not required — the builder pattern for type accumulation is a well-established TypeScript pattern (tRPC `router().query().mutation()`, Zod `.object().extend()`, Prisma fluent queries). No novel type machinery is needed.

---

## Type Flow Map

```
workflow('name', { input: TInputSchema })
  ↓
  InferSchema<TInputSchema> → TInput
  ↓
WorkflowBuilder<TInput, {}>
  ↓
  .step('step-a', { output: SchemaA })
  ↓
  InferSchema<SchemaA> → TOutputA
  ↓
WorkflowBuilder<TInput, Prettify<{ 'step-a': TOutputA }>>
  ↓
  .step('step-b', { input: (ctx) => ... })
  ↓
  ctx: StepContext<TInput, { 'step-a': TOutputA }>
  ctx.prev['step-a']  → TOutputA ✓
  ctx.prev['step-a'].x → string ✓ (if SchemaA has x: s.string())
  ctx.prev['missing']  → compile error ✗
  ↓
WorkflowBuilder<TInput, Prettify<{ 'step-a': TOutputA; 'step-b': TOutputB }>>
  ↓
  .step('approval-gate', { approval: { message: '...' } })
  ↓
  No change to TPrev (approval-only steps don't produce output)
  ↓
WorkflowBuilder<TInput, Prettify<{ 'step-a': TOutputA; 'step-b': TOutputB }>>
  ↓
  .build()
  ↓
WorkflowDefinition (runtime type — TInputSchema preserved, TPrev erased)
```

**Every generic reaches the developer:**
- `TInput` → `ctx.workflow.input` in every step callback
- `TPrev` → `ctx.prev` in every step callback, accumulating per `.step()` call
- `TOutputSchema` → `InferSchema<TOutputSchema>` → `TPrev[name]` in subsequent steps
- No dead generics

---

## E2E Acceptance Test

```typescript
import { s } from '@vertz/schema';
import { agent, workflow } from '@vertz/agents';

// --- Setup ---

const greeterAgent = agent('greeter', {
  state: s.object({}),
  initialState: {},
  tools: {},
  model: { provider: 'cloudflare', model: 'test' },
});

const summarizerAgent = agent('summarizer', {
  state: s.object({}),
  initialState: {},
  tools: {},
  model: { provider: 'cloudflare', model: 'test' },
});

// --- Positive: typed prev accumulation ---

const pipeline = workflow('typed-pipeline', { input: s.object({ userName: s.string() }) })
  .step('greet', {
    agent: greeterAgent,
    output: s.object({ greeting: s.string() }),
  })
  .step('analyze', {
    agent: summarizerAgent,
    input: (ctx) => {
      // ctx.prev.greet.greeting is string
      const greeting: string = ctx.prev.greet.greeting;
      return { message: greeting };
    },
    output: s.object({ sentiment: s.number() }),
  })
  .step('summarize', {
    agent: summarizerAgent,
    input: (ctx) => {
      // Can access both preceding steps
      const g: string = ctx.prev.greet.greeting;
      const n: number = ctx.prev.analyze.sentiment;
      return { message: `${g} (${n})` };
    },
  })
  .build();

// --- Positive: single-step workflow ---

workflow('one-step', { input: s.object({}) })
  .step('only', { agent: greeterAgent, output: s.object({ x: s.string() }) })
  .build();

// --- Positive: workflow input is typed ---

workflow('input-typed', { input: s.object({ count: s.number() }) })
  .step('use-input', {
    agent: greeterAgent,
    input: (ctx) => {
      const n: number = ctx.workflow.input.count;
      return { message: `Count: ${n}` };
    },
  })
  .build();

// --- Positive: step without output schema gives { response: string } ---

workflow('no-output', { input: s.object({}) })
  .step('raw', {
    agent: greeterAgent,
  })
  .step('consumer', {
    agent: greeterAgent,
    input: (ctx) => {
      const r: string = ctx.prev.raw.response;
      return { message: r };
    },
  })
  .build();

// --- Positive: explicit output: undefined gives { response: string } ---

workflow('explicit-undefined', { input: s.object({}) })
  .step('raw', {
    agent: greeterAgent,
    output: undefined,
  })
  .step('consumer', {
    agent: greeterAgent,
    input: (ctx) => {
      const r: string = ctx.prev.raw.response;
      return { message: r };
    },
  })
  .build();

// --- Negative: nonexistent step ---

workflow('bad-access', { input: s.object({}) })
  .step('first', { agent: greeterAgent, output: s.object({ x: s.string() }) })
  .step('second', {
    agent: greeterAgent,
    input: (ctx) => {
      // @ts-expect-error — 'nonexistent' step doesn't exist in prev
      ctx.prev.nonexistent;
      return '';
    },
  })
  .build();

// --- Negative: wrong property on step output ---

workflow('bad-prop', { input: s.object({}) })
  .step('first', { agent: greeterAgent, output: s.object({ x: s.string() }) })
  .step('second', {
    agent: greeterAgent,
    input: (ctx) => {
      // @ts-expect-error — 'y' doesn't exist on first's output { x: string }
      ctx.prev.first.y;
      return '';
    },
  })
  .build();

// --- Negative: wrong type assignment ---

workflow('bad-type', { input: s.object({}) })
  .step('first', { agent: greeterAgent, output: s.object({ x: s.string() }) })
  .step('second', {
    agent: greeterAgent,
    input: (ctx) => {
      // @ts-expect-error — x is string, not number
      const _n: number = ctx.prev.first.x;
      return '';
    },
  })
  .build();

// --- Negative: approval-only step not in prev ---

workflow('approval-excluded', { input: s.object({}) })
  .step('review', { approval: { message: 'Approve?' } })
  .step('execute', {
    agent: greeterAgent,
    input: (ctx) => {
      // @ts-expect-error — approval-only step has no output in prev
      ctx.prev.review;
      return '';
    },
  })
  .build();

// --- WorkflowDefinition is returned from build() ---

const _def: import('@vertz/agents').WorkflowDefinition = pipeline;
void _def;
```

---

## Export Changes

| Export | Before | After |
|---|---|---|
| `workflow` | Function returning `WorkflowDefinition` | Function returning `WorkflowBuilder` |
| `step` | Standalone factory function | **Removed** |
| `StepConfig` | Exported type | **Removed** |
| `WorkflowConfig` | Exported type | **Removed** |
| `StepDefinition` | Exported type | **Kept** (used in `WorkflowDefinition.steps`) |
| `StepContext` | Exported type (1 generic) | Updated (2 generics, backward-compatible defaults) |
| `StepApprovalConfig` | Exported type (0 generics) | Updated (2 generics, backward-compatible defaults) |
| `WorkflowBuilder` | N/A | **New** exported type |
| `WorkflowDefinition` | Exported type | Unchanged |
| `runWorkflow` | Exported function | Unchanged |

---

## Migration

**Breaking change.** Pre-v1, no external users. No migration guide needed per policy.

| Before | After |
|---|---|
| `workflow('name', { input, steps: [step('a', ...), step('b', ...)] })` | `workflow('name', { input }).step('a', ...).step('b', ...).build()` |
| `step()` standalone factory | Removed — use `.step()` on builder |
| `StepContext.prev` is `Record<string, unknown>` | `StepContext.prev` is typed per accumulated steps |

### Test migration

~17 existing tests need rewriting (4 `step()`, 5 `workflow()`, 8 `runWorkflow()`). All changes are mechanical — same assertions, different construction API. Existing `as` casts on `ctx.prev` and `ctx.workflow.input` in test callbacks become unnecessary and should be removed (the builder infers correct types).

---

## Sign-offs

- [x] **DX** — Approved. Builder chain is intuitive, autocomplete on `ctx.prev` is the key DX win.
- [x] **Product/scope** — Approved after addressing convention deviation acknowledgment.
- [x] **Technical** — Approved. Type machinery is standard, runtime unchanged, ~17 mechanical test rewrites.
- [ ] **Human** — Final approval
