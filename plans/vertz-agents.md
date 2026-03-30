# `@vertz/agents` — Design Document (Rev 2)

> "AI agents are first-class users." — Vertz Vision, Principle 3

## Revision History

| Rev | Date | Changes |
|---|---|---|
| 1 | 2026-03-30 | Initial draft |
| 2 | 2026-03-30 | Address review findings: portability strategy, runtime mapping, schema clarification, workflow simplification, testing strategy, phase restructuring, API surface fixes |

### Rev 2 Changes Summary

**Blockers resolved:**
- Added "Runtime Mapping" section (Tech B1) — codegen approach for CF class generation
- Simplified workflows to linear-only for v1, deferred DAG typing (Tech B2, DX B2/B3)
- Documented why `@vertz/schema` is used directly with `toJSONSchema()` (Tech B3)
- Added portability strategy — core is runtime-agnostic, CF bindings in adapter (Prod B3)
- Stated priority sequencing relative to test runner (Prod B1)
- Added POC gates for U2/U3 before Phase 1 proceeds to CF integration (Prod B2)
- Documented why tools use `input`/`output` (LLM function-calling convention) (DX B1)

**Should-fixes resolved:**
- Removed Phase 4 from phase list — separate design doc (Prod S1)
- Moved server integration into Phase 1 for vertical slice (Prod S2)
- Separated model provider config from agent behavior config (Prod S3, DX S2)
- Added testing strategy section (Prod S4, Tech #7)
- Picked Daytona as v1 sandbox provider (Prod S5)
- Replaced `agents()` wrapper with plain array (DX S1)
- Moved `invoke()` to `ctx.agents.invoke()` (DX S3)
- Accepted `goto` as stringly-typed for v1 with documentation (DX S4)
- Accepted `when` callbacks for v1, acknowledged divergence from `rules.*` (DX S5)
- Added `description` field to `agent()` (DX S6)
- Deferred `execution: 'client'` to v2 (DX S7, Tech #10)
- Added agent-level `sandbox` default (DX S8)
- Added error recovery design to ReAct loop (Tech #4)
- Simplified sandbox to Daytona-only, added lifecycle hooks (Tech #5)
- Specified state persistence proxy mechanism (Tech #6)
- Fixed package dependency direction (Tech #8)
- Added `output` schema to `agent()`, defined `invoke()` return type (Tech #9)

---

## Executive Summary

Build `@vertz/agents` — a declarative, runtime-agnostic abstraction for AI agents that lets Vertz developers define agents, tools, and workflows using the same patterns they already know from `entity()`, `service()`, and `rules.*`.

The core API (`agent()`, `tool()`, `workflow()`) is **runtime-agnostic** — it produces frozen definition objects like `entity()` does. A separate **Cloudflare adapter** maps these definitions to Durable Objects, Workers AI, and Cloudflare Workflows. Future adapters (Vertz Runtime, self-hosted) can target the same definitions.

Cloudflare provides the infrastructure: durable state, hibernation, scheduling, WebSocket connections, human-in-the-loop gates. Vertz provides the developer experience: typed schemas, declarative access rules, one way to do things, and an LLM-native API surface.

The first consumer is the Vertz dev orchestrator — an agent system that automates the full development workflow (design → review → implement → PR → merge). But `@vertz/agents` is a general-purpose package: any Vertz developer can use it to build agents.

### Priority Sequencing

`@vertz/agents` runs **in parallel** with the Vertz Runtime test runner work. The test runner targets the Rust+V8 runtime; agents target Cloudflare's platform. There is no dependency between them — agents use Cloudflare's infrastructure directly, not the Vertz Runtime.

---

## The Problem

### Today's Agent DX

Cloudflare's Agents SDK is powerful but low-level. Building an agent requires:

1. Extending a class (`Agent`, `AIChatAgent`, or `McpAgent`)
2. Manually wiring state management, WebSocket lifecycle, and tool definitions
3. No schema validation on tool inputs — you write Zod schemas by hand
4. No access control integration — you check permissions imperatively
5. No typed RPC between agents — you pass raw messages through Durable Object stubs
6. No ReAct loop primitive — you build the think→act→observe cycle yourself

This means every agent project reinvents the same infrastructure: validation, auth, inter-agent communication, agentic loops, error handling, and state management.

### What Vertz Can Solve

Vertz already has declarative primitives for all of these:

| Problem | Vertz primitive |
|---|---|
| Schema validation | `@vertz/schema` (`s.*`) |
| Access control | `rules.*` descriptors |
| Typed operations | `entity()` + `service()` + `action()` |
| Dependency injection | `inject` config |
| Error handling | `Result<T>` pattern |

The gap is a **binding layer** that maps these primitives to agent infrastructure.

---

## Schema System: Why `@vertz/schema` Directly

Entities and services use `SchemaLike<T>` from `@vertz/db` — a structural interface that accepts any schema library. Agents use `@vertz/schema` (`s.*`) **directly** because:

1. **`toJSONSchema()` is required.** LLM function-calling requires JSON Schema descriptions of tool parameters. `@vertz/schema` provides `toJSONSchema(schema)` natively. `SchemaLike` has no equivalent — it only requires `parse()`.

2. **`Infer<T>` for state typing.** Agent state types are extracted from the schema using `InferSchema<T>`. This requires `SchemaAny` (which has `_output` phantom type), not `SchemaLike` (which only has `parse()`).

3. **Runtime validation.** Tool inputs from LLMs are untrusted. `schema.parse(input)` provides structured error messages that get fed back to the LLM for self-correction.

4. **Consistency within the package.** All `@vertz/agents` schemas (tool input/output, agent state, workflow input) use the same schema system.

This is an intentional divergence from `entity()`/`service()`. Entities need DB-agnostic schemas; agents need LLM-compatible schemas. Different consumers, different requirements.

---

## API Surface

### `agent()` — Define an agent

```typescript
import { agent, tool } from '@vertz/agents';
import { rules } from '@vertz/server';
import { s } from '@vertz/schema';
import { tasksEntity, usersEntity } from './entities';

const codeReviewAgent = agent('code-review', {
  description: 'Reviews code changes and produces structured findings',

  // Schema for the agent's durable state
  state: s.object({
    repository: s.string(),
    branch: s.string(),
    status: s.enum(['idle', 'reviewing', 'waiting-for-human', 'done']),
    findings: s.array(s.object({
      file: s.string(),
      line: s.number(),
      severity: s.enum(['blocker', 'should-fix', 'nit']),
      message: s.string(),
    })),
  }),

  // Initial state (required when state is defined)
  initialState: {
    repository: '',
    branch: '',
    status: 'idle',
    findings: [],
  },

  // Agent output — what invoke() returns on completion
  output: s.object({
    summary: s.string(),
    findings: s.array(s.object({
      file: s.string(),
      severity: s.string(),
      message: s.string(),
    })),
  }),

  // Access control — who can interact with this agent
  access: {
    invoke: rules.authenticated(),
    approve: rules.entitlement('review:approve'),
  },

  // Entity injection — typed CRUD access to entities
  inject: {
    tasks: tasksEntity,
    users: usersEntity,
  },

  // Tools the agent can use
  tools: {
    readFile: tool({
      description: 'Read a file from the repository',
      input: s.object({
        path: s.string(),
        startLine: s.number().optional(),
        endLine: s.number().optional(),
      }),
      output: s.object({ content: s.string(), lines: s.number() }),
      async handler(input, ctx) {
        // ctx.state — read/write agent state
        // ctx.entities.tasks — typed entity access
        // ctx.agent — agent metadata (id, name)
        const content = await fetchFileFromRepo(ctx.state.repository, input.path);
        return { content, lines: content.split('\n').length };
      },
    }),

    createFinding: tool({
      description: 'Record a review finding',
      input: s.object({
        file: s.string(),
        line: s.number(),
        severity: s.enum(['blocker', 'should-fix', 'nit']),
        message: s.string(),
      }),
      output: s.object({ id: s.number() }),
      handler(input, ctx) {
        ctx.state.findings = [...ctx.state.findings, input];
        return { id: ctx.state.findings.length };
      },
    }),
  },

  // Default sandbox for all tools in this agent
  sandbox: daytonaSandbox,

  // LLM model selection (provider config is environment-level)
  model: {
    provider: 'cloudflare',
    model: 'kimi-k2',
  },

  // Agent behavior config (separate from model)
  prompt: {
    system: 'You are a code reviewer. Be thorough and adversarial.',
    maxTokens: 4096,
  },

  // ReAct loop configuration
  loop: {
    maxIterations: 50,           // hard cap on think→act→observe cycles
    onStuck: 'escalate',         // 'escalate' | 'stop' | 'retry'
    stuckThreshold: 5,           // consecutive iterations without progress
    checkpointInterval: 5,       // persist conversation to durable state every N iterations
  },

  // Lifecycle hooks
  onStart(ctx) {
    ctx.state.status = 'reviewing';
  },

  onComplete(ctx) {
    ctx.state.status = 'done';
  },

  onStuck(ctx) {
    ctx.state.status = 'waiting-for-human';
  },
});
```

### `tool()` — Define a tool

Tools are the unit of agent capability. They use `input`/`output` naming (not `body`/`response` from `action()`) because this aligns with the **LLM function-calling convention** — every major LLM provider uses "input parameters" and "output" in their tool/function schemas. An LLM trained on tool-calling documentation will naturally use `input`/`output`. Vertz actions use `body`/`response` because they model HTTP semantics.

```typescript
import { tool } from '@vertz/agents';
import { s } from '@vertz/schema';

// Standalone tool (reusable across agents)
const gitCommit = tool({
  description: 'Create a git commit with the given message',
  input: s.object({
    message: s.string(),
    files: s.array(s.string()),
  }),
  output: s.object({ sha: s.string() }),
  async handler(input, ctx) {
    const sha = await git.commit(input.message, input.files);
    return { sha };
  },
});

// HITL tool — pauses for human approval
const deployTool = tool({
  description: 'Deploy to production',
  input: s.object({ version: s.string() }),
  output: s.object({ url: s.string() }),
  approval: {
    required: true,
    message: (input) => `Deploy version ${input.version} to production?`,
    timeout: '7d',                // how long to wait for human
  },
  async handler(input, ctx) {
    return await deploy(input.version);
  },
});
```

> **Note:** `execution: 'client'` (browser-side tool execution) is **deferred to v2**. It requires a WebSocket protocol for server-to-browser tool delegation, disconnection handling, timeout, multi-client arbitration, and a client-side tool registry. All tools in v1 execute on the server.

### `workflow()` — Multi-step orchestrated pipelines (v1: linear only)

Workflows coordinate multiple agents and approval gates. **v1 supports linear sequential steps only.** Parallel execution, conditional branching (`when`/`goto`), and DAG-based dependency resolution are deferred to v2 — the type system for accumulating outputs across parallel/conditional paths requires recursive mapped types that need validation via `.test-d.ts` before shipping.

Every step callback receives the same unified `StepContext` object:

```typescript
import { workflow, step } from '@vertz/agents';
import { rules } from '@vertz/server';
import { s } from '@vertz/schema';

const designPipeline = workflow('design-pipeline', {
  // Input to start the workflow
  input: s.object({
    issueNumber: s.number(),
    repository: s.string(),
  }),

  // Access control
  access: {
    start: rules.authenticated(),
    approve: rules.entitlement('design:approve'),
  },

  // Linear steps — each receives a unified StepContext
  steps: [
    step('write-design-doc', {
      agent: designWriterAgent,
      // Every step gets StepContext with workflow input + previous step outputs
      input: (ctx) => ({
        issue: ctx.workflow.input.issueNumber,
        repo: ctx.workflow.input.repository,
      }),
      output: s.object({
        docPath: s.string(),
        sections: s.array(s.string()),
      }),
    }),

    step('dx-review', {
      agent: dxReviewAgent,
      // Same StepContext shape — ctx.prev has all previous step outputs
      input: (ctx) => ({ docPath: ctx.prev['write-design-doc'].docPath }),
      output: s.object({
        approved: s.boolean(),
        findings: s.array(s.object({ issue: s.string(), severity: s.string() })),
      }),
    }),

    step('technical-review', {
      agent: technicalReviewAgent,
      input: (ctx) => ({ docPath: ctx.prev['write-design-doc'].docPath }),
      output: s.object({
        approved: s.boolean(),
        findings: s.array(s.object({ issue: s.string(), severity: s.string() })),
      }),
    }),

    // Human approval gate
    step('human-approval', {
      approval: {
        message: (ctx) => `Design doc ready: ${ctx.prev['write-design-doc'].docPath}`,
        timeout: '7d',
      },
    }),
  ],
});
```

**v1 step input callback — unified `StepContext`:**

```typescript
interface StepContext<TPrev, TWorkflowInput> {
  /** Workflow-level input */
  readonly workflow: { input: TWorkflowInput };
  /** Accumulated outputs from all preceding steps, keyed by step name */
  readonly prev: TPrev;
}
```

Every step callback receives the same `StepContext` shape. The first step has `prev: {}` (empty). Each subsequent step accumulates previous step outputs in `prev`.

### `sandbox()` — Compute environments for code execution

**v1 targets Daytona only.** Cloudflare Containers are deferred until validated by POC (see U1). Daytona has a proven TypeScript SDK, persistent filesystem with git support, and sufficient resources for `bun test` / `bun run typecheck` workloads.

```typescript
import { sandbox } from '@vertz/agents';
import { s } from '@vertz/schema';

const devSandbox = sandbox('daytona', {
  image: 'vertz/dev-env:latest',
  resources: { cpu: 2, memory: '4GB' },
  persistence: 'workspace',      // 'ephemeral' | 'workspace' (git-backed)
  onInit: async (ctx) => {
    await ctx.exec('bun', ['install']);
  },
  onDestroy: async (ctx) => {
    // Cleanup: remove temp files, close connections
  },
});

// Use as agent-level default
const implementationAgent = agent('implementer', {
  sandbox: devSandbox,           // All tools inherit this sandbox
  tools: {
    runTests: tool({
      description: 'Run the test suite',
      input: s.object({ packages: s.array(s.string()).optional() }),
      output: s.object({
        passed: s.number(),
        failed: s.number(),
        output: s.string(),
      }),
      // No per-tool sandbox — inherits agent default
      async handler(input, ctx) {
        const result = await ctx.sandbox.exec('bun', ['test', ...(input.packages ?? [])]);
        return {
          passed: result.exitCode === 0 ? 1 : 0,
          failed: result.exitCode === 0 ? 0 : 1,
          output: result.stdout,
        };
      },
    }),

    runTypecheck: tool({
      description: 'Run TypeScript type checking',
      input: s.object({ packages: s.array(s.string()).optional() }),
      output: s.object({ clean: s.boolean(), output: s.string() }),
      // Per-tool sandbox override
      sandbox: sandbox('daytona', {
        image: 'vertz/dev-env:latest',
        resources: { cpu: 4, memory: '8GB' },  // more resources for typecheck
        persistence: 'workspace',
      }),
      async handler(input, ctx) {
        const result = await ctx.sandbox.exec('bun', ['run', 'typecheck']);
        return { clean: result.exitCode === 0, output: result.stdout };
      },
    }),
  },
  // ...
});
```

### `AgentContext` — Typed context for handlers

Following the `EntityContext` / `ServiceContext` pattern:

```typescript
interface AgentContext<TState, TInject> {
  // Auth (from BaseContext)
  userId: string | null;
  tenantId: string | null;
  authenticated(): boolean;

  // Agent-specific
  agent: { id: string; name: string };
  state: TState;                           // typed durable state (read/write Proxy)
  entities: InjectToOperations<TInject>;   // typed entity CRUD access

  // Agent-to-agent communication (on ctx, not standalone import)
  agents: {
    invoke<TAgent extends AgentDefinition>(
      agent: TAgent,
      options: InvokeOptions,
    ): Promise<InferAgentOutput<TAgent>>;
  };

  // Sandbox (when configured — agent-level or tool-level)
  sandbox: SandboxHandle;

  // Communication
  emit(event: string, data: unknown): void;  // WebSocket broadcast

  // Observability
  log(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>): void;
}
```

### Agent-to-Agent Communication

Agents invoke each other through `ctx.agents.invoke()` — on the context, not a standalone import. This ensures auth propagation and consistency with `ctx.entities`:

```typescript
// Inside a tool handler
async handler(input, ctx) {
  const reviewResult = await ctx.agents.invoke(codeReviewAgent, {
    // Instance ID — determines which Durable Object handles the request
    instance: `review-${prNumber}`,
    // Input message
    message: 'Review the changes in PR #123',
    // Wait strategy
    waitFor: 'complete',          // 'complete' | 'started'
    timeout: '30m',               // max wait time
  });

  // reviewResult is typed as InferAgentOutput<typeof codeReviewAgent>
  // i.e., { summary: string; findings: Array<...> }
}
```

**`invoke()` return type:** Determined by the agent's `output` schema. If no `output` schema is defined, `invoke()` returns `{ response: string }` (the LLM's final text response).

**`waitFor` mechanism:** Implemented via Durable Object alarm-based callbacks. The invoking agent's DO sets an alarm that polls the target agent's completion status. This avoids WebSocket complexity and works with DO hibernation.

### Registration — Wire agents into the Vertz app

```typescript
import { createServer } from '@vertz/server';

const server = createServer({
  entities: [tasksEntity, usersEntity],
  services: [notificationService],
  // Plain array — no wrapper function needed (same as entities/services)
  agents: [
    codeReviewAgent,
    designWriterAgent,
    dxReviewAgent,
  ],
});
```

---

## Runtime Mapping: How Definitions Become Cloudflare Durable Objects

`agent()` returns a frozen `AgentDefinition` config object — not a class. This matches `entity()` returning `EntityDefinition`. But Cloudflare Durable Objects require exported classes referenced in `wrangler.toml`.

### The Codegen Approach

The Vertz CLI generates the Cloudflare binding layer before `wrangler deploy`:

```
vertz build → generates .vertz/agents/ → wrangler deploy
```

**Step 1: `vertz build` scans agent definitions.**

The build step finds all `AgentDefinition` objects passed to `createServer({ agents: [...] })` and generates:

```typescript
// .vertz/agents/code-review.ts (generated)
import { Agent } from 'agents';
import { createAgentHandler } from '@vertz/agents/cloudflare';
import { codeReviewAgent } from '../../src/agents/code-review';

export class CodeReviewAgent extends Agent {
  handler = createAgentHandler(codeReviewAgent);

  async onRequest(request: Request) {
    return this.handler.fetch(request, this);
  }
}
```

**Step 2: `vertz build` generates `wrangler.toml` bindings.**

```toml
# Auto-generated by vertz build
[durable_objects]
bindings = [
  { name = "CODE_REVIEW_AGENT", class_name = "CodeReviewAgent" },
  { name = "DESIGN_WRITER_AGENT", class_name = "DesignWriterAgent" },
]
```

**Step 3: `createAgentHandler()` bridges the definition to the CF runtime.**

The handler maps: incoming DO requests → ReAct loop execution → state persistence → WebSocket broadcasting. It handles the DO lifecycle (`onStart`, `onAlarm`, state hibernation) and maps them to the definition's lifecycle hooks.

**Why codegen instead of runtime class creation:**
- `wrangler` needs static class exports for tree-shaking and module analysis
- Runtime `eval()` or `new Function()` is blocked in Workers
- Codegen is already the pattern in Vertz (`vertz build` generates routes, types, etc.)

### Alternative Considered: `agent()` Returns a Class

Rejected because:
1. Breaks the config-object pattern (entity/service return frozen objects, not classes)
2. Class exports must be at module top-level for wrangler — can't define inline in `createServer()`
3. Loses the clean separation between definition (portable) and runtime binding (CF-specific)

---

## Model Configuration

Model configuration is split into two concerns:

### Agent-level: Model selection (in code)

```typescript
model: {
  provider: 'cloudflare',       // which provider to use
  model: 'kimi-k2',            // provider-specific model identifier
},
```

### Environment-level: Provider credentials (not in code)

Provider API keys, endpoints, and rate limits are **environment bindings**, not code:

```toml
# wrangler.toml (or .dev.vars for local)
[vars]
ANTHROPIC_API_KEY = "sk-..."
MINIMAX_API_KEY = "..."

# Workers AI uses the built-in AI binding — no key needed
[[ai]]
binding = "AI"
```

The agent's `provider` field selects which credentials to use. The credentials themselves are never in the agent definition.

### Agent-level: Prompt and behavior (in code)

```typescript
prompt: {
  system: 'You are a code reviewer.',
  maxTokens: 4096,
},
```

---

## State Management

### Proxy-based state with schema validation

`ctx.state` is a **Proxy** over the Cloudflare DO's built-in `this.state` storage. The proxy:

1. **Intercepts writes** — validates mutations against the state schema before persisting
2. **Batches persistence** — writes are batched per iteration, not per mutation. At the end of each ReAct loop iteration, the proxy flushes all accumulated changes to DO storage.
3. **Integrates with CF's `onStateUpdate()`** — the proxy triggers `onStateUpdate()` after each flush, enabling WebSocket state sync to connected clients.

```typescript
// Writes are schema-validated at flush time (end of iteration)
ctx.state.status = 'reviewing';           // queued
ctx.state.findings = [...findings, new];  // queued
// → end of iteration: validate full state against schema, persist to DO storage
```

**Schema validation runs at persistence boundaries** (end of iteration, checkpoint), not on every mutation. This avoids the overhead of validating intermediate states during a multi-mutation iteration.

---

## ReAct Loop Error Recovery

### Progress Detection

"Progress" is defined as: **the LLM called at least one tool that returned a non-error result**. Specifically:

- Tool call returned successfully → progress
- Tool call returned an error → NOT progress (LLM is spinning on failures)
- LLM responded with text only → loop ends (completion)
- LLM called a non-existent tool → NOT progress

The `stuckThreshold` counts consecutive iterations without progress.

### Error Handling Per Failure Mode

| Failure | Behavior |
|---|---|
| Malformed tool call (invalid JSON args) | Feed parse error back to LLM as tool result |
| Tool not found | Feed "tool not found, available: [...]" back to LLM |
| Tool handler throws | Feed error message back to LLM as tool result |
| Tool input validation fails | Feed schema validation errors back to LLM |
| LLM refuses to use tools | Treated as text-only response → loop completes |
| LLM provider rate limit (429) | Exponential backoff (1s, 2s, 4s), max 3 retries per iteration |
| LLM provider error (5xx) | Retry once after 2s. If still failing, set status = 'error', return with error details |
| Context window exceeded | Summarize oldest N messages (keeping system prompt + last 5 messages), retry |

### `onStuck` Escalation

When `onStuck: 'escalate'`:
1. Set agent state `status = 'waiting-for-human'`
2. Persist the current conversation state as a checkpoint
3. Emit a WebSocket event `{ type: 'agent:stuck', agentId, instanceId, iteration }`
4. The agent hibernates — near-zero cost while waiting

The delivery mechanism for "notify a human" is **application-level**: the developer wires the WebSocket event to their notification system (Slack, email, dashboard alert). Vertz doesn't embed a notification provider.

---

## Testing Strategy

### What Can Be Tested With `bun test` (No Cloudflare Runtime)

| Component | Testable? | How |
|---|---|---|
| `tool()` factory | Yes | Schema validation, handler execution, frozen output |
| `agent()` factory | Yes | Config validation, defaults, frozen output |
| `workflow()` / `step()` factories | Yes | Step ordering, type extraction |
| ReAct loop logic | Yes | Mock `LLMAdapter`, test iteration/checkpoint/stuck/error paths |
| Tool input validation | Yes | `@vertz/schema` parse against test inputs |
| Tool descriptions (JSON Schema) | Yes | `toJSONSchema()` output verification |
| Type flow (`.test-d.ts`) | Yes | `@ts-expect-error` assertions |
| `run()` entry point | Yes | Mock LLM + tools, verify lifecycle hooks called |

### What Requires `@cloudflare/vitest-pool-workers` (Miniflare)

| Component | Why |
|---|---|
| State persistence (DO storage) | Needs actual Durable Object runtime |
| Agent-to-agent `invoke()` | Needs DO stub routing |
| WebSocket state broadcasting | Needs DO WebSocket API |
| Alarm-based scheduling | Needs DO alarm system |
| Workflow step execution (CF Workflows) | Needs Workflow runtime |
| Access rule evaluation at DO boundary | Needs request context |

### How to Mock Entity Injection for Tool Tests

```typescript
// In bun tests — mock the entity operations
const mockEntities = {
  tasks: {
    list: mock(() => [{ id: '1', title: 'Test' }]),
    get: mock((id: string) => ({ id, title: 'Test' })),
    create: mock((data: unknown) => ({ id: '2', ...data })),
  },
};

// Pass to tool handler via context
await toolDef.handler(input, {
  agentId: 'test',
  agentName: 'test',
  entities: mockEntities,
});
```

### Test File Naming

- Unit tests: `*.test.ts` (run in CI via `bun test`)
- Type tests: `*.test-d.ts` (run via `bun run typecheck`)
- Cloudflare integration tests: `*.cf.test.ts` (run via `vitest` with `@cloudflare/vitest-pool-workers`)
- Local integration tests: `*.local.ts` (manual only, not in CI)

---

## Portability Strategy

### Core Layer (Runtime-Agnostic)

The `@vertz/agents` package contains:
- `agent()`, `tool()`, `workflow()`, `step()` factories → frozen definition objects
- `LLMAdapter` interface → provider-agnostic LLM communication
- ReAct loop implementation → pure TypeScript, no platform dependencies
- Schema validation → `@vertz/schema` only
- Type definitions → no runtime imports

This layer has **zero Cloudflare dependencies**. It runs on any TypeScript runtime.

### Cloudflare Adapter (`@vertz/agents/cloudflare`)

A separate entrypoint (or future separate package) contains:
- `createAgentHandler()` → bridges AgentDefinition to CF Durable Object
- Workers AI adapter → implements `LLMAdapter` for CF's `AI` binding
- State persistence → maps to DO storage
- Codegen → generates DO class wrappers and `wrangler.toml` bindings
- Workflow runtime → maps workflow definitions to CF Workflows

### Future Adapters

- `@vertz/agents/runtime` — for the Vertz Rust+V8 runtime (when ready)
- `@vertz/agents/standalone` — for self-hosted Node.js/Bun with SQLite state

---

## Manifesto Alignment

### Principle 1: If it builds, it works

- `state` schemas are validated at definition time — invalid initial state is a type error
- Tool `input`/`output` schemas enforce type safety end-to-end
- Workflow step `input` functions are typed against previous step outputs (v1: linear accumulation)
- `access` rules use the existing `rules.*` type system
- Agent `output` schema types the return value of `invoke()`

### Principle 2: One way to do things

- One way to define an agent: `agent(name, config)`
- One way to define tools: `tool(config)`
- One way to define workflows: `workflow(name, config)` with `step()`
- No class inheritance, no decorators, no chaining
- Config-object pattern matches `entity()` and `service()` exactly

### Principle 3: AI agents are first-class users

This package is literally building AI agents. But more importantly, the API itself must be LLM-usable:
- `agent()` follows the same pattern as `entity()` — an LLM that knows Vertz can use it immediately
- Tool definitions use `input`/`output` — matching LLM function-calling conventions
- No hidden configuration, no magic strings, no decorator ordering

### Principle 5: Type safety wins

- Agent state type is inferred from the `state` schema
- Agent output type is inferred from the `output` schema
- Tool handler receives typed `input` and must return typed `output`
- `inject` config maps to typed `ctx.entities` (same as entity/service)
- Workflow step outputs accumulate into typed `prev` (v1: linear only)

### Principle 6: If you can't demo it, it's not done

- Agent execution is observable via WebSocket state sync
- Workflow progress is visible step-by-step
- Dashboard shows agent state, current iteration, pending approvals

### Principle 7: Performance is not optional

- Agents hibernate when idle — near-zero cost between tasks
- Sandboxed compute is provisioned on-demand, released after use
- ReAct loop checkpoints prevent re-running expensive iterations on crash

### What was rejected

- **Class-based agent definitions** (Cloudflare's pattern) — rejected because types flow through functions, and config objects are more discoverable for LLMs
- **Decorator-based tool registration** — rejected per manifesto (decorators break type inference)
- **Implicit tool discovery via MCP** — rejected in favor of explicit tool lists per agent; MCP is an optional exposure mechanism, not the definition mechanism
- **Generic "middleware" for agent pipelines** — rejected per "one way to do things"; workflows with explicit steps are more predictable
- **`body`/`response` naming for tools** — rejected because tools serve LLM function-calling, not HTTP. `input`/`output` matches every major LLM provider's convention.
- **Full DAG workflows in v1** — rejected because the type system for parallel/conditional step output accumulation needs `.test-d.ts` validation. Linear-only is a solid v1.

---

## Non-Goals

1. **General-purpose orchestration framework** — This is not Temporal, Inngest, or a generic workflow engine. It's specifically for AI agent workflows.

2. **LLM provider abstraction** — We don't wrap every LLM API. We support specific providers (Cloudflare models, MiniMax, Anthropic) with explicit config, not a universal adapter.

3. **Agent marketplace/registry** — No dynamic agent discovery or plugin system. Agents are defined in code, imported explicitly.

4. **Chat UI** — `AIChatAgent` and `useAgentChat` from Cloudflare's SDK can be used directly. We don't re-abstract chat interfaces.

5. **Replacing Claude Code** — The dev orchestrator uses agents for structured workflow automation, not as a general-purpose coding assistant.

6. **Parallel/conditional workflows in v1** — DAG-based step execution with typed parallel groups, `when` guards, and `goto` loops are v2. v1 is linear sequential steps.

7. **Client-side tool execution in v1** — Browser-side tool delegation requires a WebSocket protocol that's out of scope for v1.

---

## Unknowns

### U1: Cloudflare Containers maturity (needs POC)

Cloudflare Containers are relatively new. Can they reliably run `bun test`, `bun run typecheck`, and git operations? What are the cold start times? Memory limits?

**Resolution:** POC before sandbox integration. If containers are insufficient, Daytona remains the only sandbox provider.

### U2: ReAct loop context window management (needs POC before CF integration)

**POC Gate:** Must validate context window summarization strategy before Phase 2 starts. Long-running agents (50+ iterations) will exceed context windows.

**POC scope:** Run a mock agent through 50+ iterations with Kimi K2 on Workers AI. Measure:
- At what iteration count does context exceed the model's window?
- Does rolling-window summarization (summarize oldest N messages, keep recent 5) preserve task coherence?
- What's the token overhead of summarization vs. simple truncation?

**Resolution options (ranked):**
1. Rolling window with summarization (summarize oldest N messages)
2. Checkpoint-based restart with summary injection
3. Hard iteration cap below context window limit

### U3: Cost model for open-source LLMs on Workers AI (needs POC before CF integration)

**POC Gate:** Must benchmark Workers AI models before committing to Cloudflare as the primary LLM provider for agents.

**POC scope:** Run the ReAct loop test suite against Workers AI with Kimi K2. Measure:
- Latency per chat() call (p50, p95)
- Token throughput (tokens/second)
- Cost per million tokens
- Tool-calling accuracy (does the model reliably output structured tool calls?)

**Resolution:** If Workers AI is too slow or expensive for 50+ iteration agents, fall back to MiniMax or Anthropic for heavy workloads.

### U4: MiniMax API integration

MiniMax's direct API — authentication, rate limits, streaming support, tool calling format.

**Resolution:** Spike during Phase 1.

### U5: Workflow step retry semantics

When a step fails mid-execution (sandbox timeout, LLM error), what's the retry strategy? Cloudflare Workflows have built-in retries, but do they compose well with our step definitions?

**Resolution:** Design during Phase 2 implementation.

---

## POC Results

None yet. POCs planned:
- **U2:** ReAct loop context window management (gate for Phase 2)
- **U3:** Workers AI model benchmarks (gate for Phase 2)
- **U1:** Cloudflare Containers for code execution (gate for sandbox integration)
- **U4:** MiniMax API integration spike (during Phase 1)

---

## Type Flow Map

### `agent()` type flow

```
s.object({ ... })                    → TStateSchema (schema type)
  ↓ InferSchema<TStateSchema>
  TState                             → inferred output type
  ↓
agent('name', { state, initialState, output, tools, inject })
  ↓              ↓           ↓          ↓         ↓
  │     initialState:     output:      tool    AgentContext<TState, TInject>
  │     NoInfer<TState>   s.object()  handler   ctx.state: TState
  │     (prevents         ↓            ↓         ctx.entities: InjectToOperations<TInject>
  │      wrong inference) InferAgentOutput<T>    ctx.agents.invoke(): typed return
  ↓
AgentDefinition<TState, TTools>
```

### `workflow()` type flow (v1: linear accumulation)

```
step('step-a', { output: s.object({ x: s.string() }) })
  ↓
  TOutputA = { x: string }
  ↓
step('step-b', { input: (ctx) => ctx.prev['step-a'].x })
                                     ↑
              ctx.prev is typed: { 'step-a': TOutputA }
              ctx.prev['step-a'].x is string ✓
              ctx.prev['step-a'].y is @ts-expect-error ✗
              ctx.workflow.input is TWorkflowInput ✓
```

### `tool()` type flow

```
s.object({ path: s.string() })  → TInput
s.object({ content: s.string() }) → TOutput
  ↓
tool({ input, output, handler })
  ↓
handler(input: TInput, ctx): TOutput | Promise<TOutput>
           ↑ input.path is string
           ↑ must return { content: string }
```

---

## E2E Acceptance Test

### Developer walkthrough: Define and run an agent

```typescript
// acceptance-test.ts — tests the full developer experience

import { agent, tool, workflow, step, run } from '@vertz/agents';
import { rules } from '@vertz/server';
import { s } from '@vertz/schema';

// 1. Define a tool with typed input/output
const greetTool = tool({
  description: 'Generate a greeting',
  input: s.object({ name: s.string() }),
  output: s.object({ greeting: s.string() }),
  handler(input) {
    return { greeting: `Hello, ${input.name}!` };
  },
});

// 2. Define an agent with state, tools, and output
const greeterAgent = agent('greeter', {
  description: 'Greets users by name',
  state: s.object({
    greetingsGiven: s.number(),
  }),
  initialState: { greetingsGiven: 0 },
  output: s.object({
    greeting: s.string(),
    totalGreetings: s.number(),
  }),
  access: {
    invoke: rules.public,
  },
  tools: {
    greet: greetTool,
  },
  model: {
    provider: 'cloudflare',
    model: 'llama-3.3-70b-instruct-fp8-fast',
  },
  prompt: {
    system: 'You are a friendly greeter.',
  },
  loop: {
    maxIterations: 10,
    onStuck: 'stop',
  },
});

// 3. Type safety: wrong state shape is a compile error
const badAgent = agent('bad', {
  description: 'Test agent',
  state: s.object({ count: s.number() }),
  // @ts-expect-error — initialState doesn't match schema
  initialState: { count: 'not a number' },
  tools: {},
  model: { provider: 'cloudflare', model: 'llama-3.3-70b-instruct-fp8-fast' },
});

// 4. Type safety: tool handler must return correct shape
const badTool = tool({
  description: 'Bad tool',
  input: s.object({ x: s.string() }),
  output: s.object({ y: s.number() }),
  // @ts-expect-error — return type doesn't match output schema
  handler(input) {
    return { y: 'not a number' };
  },
});

// 5. Define a workflow with typed step transitions (v1: linear)
const pipeline = workflow('greeting-pipeline', {
  input: s.object({ userName: s.string() }),
  access: { start: rules.public },
  steps: [
    step('greet', {
      agent: greeterAgent,
      input: (ctx) => ({ message: `Greet ${ctx.workflow.input.userName}` }),
      output: s.object({ greeting: s.string() }),
    }),
    step('log', {
      agent: greeterAgent,
      // ctx.prev is typed — 'greet' step output is available
      input: (ctx) => ({ message: `Log: ${ctx.prev['greet'].greeting}` }),
      output: s.object({ logged: s.boolean() }),
    }),
  ],
});

// 6. Type safety: referencing non-existent step is a compile error
const badPipeline = workflow('bad-pipeline', {
  input: s.object({}),
  access: { start: rules.public },
  steps: [
    step('only-step', {
      agent: greeterAgent,
      // @ts-expect-error — 'nonexistent' step doesn't exist
      input: (ctx) => ({ message: ctx.prev['nonexistent'].greeting }),
      output: s.object({ done: s.boolean() }),
    }),
  ],
});
```

---

## Implementation Plan

### Phase 1: Core Definitions + Tool Execution + Server Integration

**Goal:** `agent()`, `tool()`, ReAct loop, LLM provider adapters, and basic server registration — a complete vertical slice from definition to HTTP endpoint.

**Acceptance criteria:**
```typescript
describe('Feature: Agent definition and tool execution', () => {
  describe('Given an agent with tools and a mock LLM', () => {
    describe('When the agent receives a message via run()', () => {
      it('Then executes the ReAct loop: think → tool call → observe → respond', () => {});
      it('Then validates tool inputs against the schema', () => {});
      it('Then stops after maxIterations', () => {});
      it('Then calls onStart/onComplete lifecycle hooks', () => {});
      it('Then feeds tool errors back to the LLM for self-correction', () => {});
    });
  });

  describe('Given an agent with access rules', () => {
    describe('When an unauthenticated user invokes the agent', () => {
      it('Then returns an access denied error', () => {});
    });
  });

  describe('Given an agent registered in createServer()', () => {
    describe('When the server starts', () => {
      it('Then accepts agent definitions in the agents array', () => {});
    });
  });
});
```

**Deliverables:**
- `agent()` factory that produces frozen `AgentDefinition`
- `tool()` factory with schema validation
- ReAct loop with configurable iteration limits, checkpointing, and error recovery
- `LLMAdapter` interface with Workers AI and MiniMax adapters
- `run()` entry point for executing agents
- `AgentDefinition` type accepted by `createServer({ agents: [...] })`
- Access rule evaluation on agent invocation
- MiniMax API spike

### Phase 2: Workflows + Sandbox

**Goal:** `workflow()`, `step()`, `sandbox()`, and agent-to-agent communication.

**Prerequisites:** U2 and U3 POC results (context window management, Workers AI cost model).

**Acceptance criteria:**
```typescript
describe('Feature: Multi-step workflows', () => {
  describe('Given a workflow with sequential steps', () => {
    describe('When the workflow starts', () => {
      it('Then executes steps in order, passing outputs forward', () => {});
      it('Then validates step outputs against their schemas', () => {});
      it('Then types ctx.prev correctly for each step', () => {});
    });
  });

  describe('Given a workflow with a human approval step', () => {
    describe('When the approval step is reached', () => {
      it('Then suspends the workflow until approved', () => {});
    });
  });

  describe('Given a tool with a Daytona sandbox', () => {
    describe('When the tool executes', () => {
      it('Then runs the handler inside the sandboxed environment', () => {});
      it('Then returns stdout/stderr from the sandbox', () => {});
    });
  });

  describe('Given agent A invoking agent B via ctx.agents.invoke()', () => {
    describe('When agent B completes', () => {
      it('Then returns the typed output to agent A', () => {});
    });
  });
});
```

**Deliverables:**
- `workflow()` and `step()` factories (linear sequential)
- `sandbox()` with Daytona integration
- `ctx.agents.invoke()` for agent-to-agent communication
- Workflow step type accumulation (`.test-d.ts` proof)
- U2/U3 POC results documented

### Phase 3: Cloudflare Runtime Integration

**Goal:** Codegen for Durable Object class generation, state persistence, WebSocket broadcasting, and deployment pipeline.

**Acceptance criteria:**
```typescript
describe('Feature: Cloudflare runtime integration', () => {
  describe('Given agent definitions and vertz build', () => {
    describe('When the build runs', () => {
      it('Then generates DO class wrappers in .vertz/agents/', () => {});
      it('Then generates wrangler.toml bindings', () => {});
    });
  });

  describe('Given a deployed agent on Cloudflare', () => {
    describe('When the agent runs', () => {
      it('Then persists state to DO storage after each iteration', () => {});
      it('Then broadcasts state changes via WebSocket', () => {});
      it('Then hibernates when idle', () => {});
    });
  });

  describe('Given entity injection configured', () => {
    describe('When a tool handler accesses ctx.entities', () => {
      it('Then provides typed CRUD operations', () => {});
      it('Then enforces entity access rules', () => {});
    });
  });
});
```

**Deliverables:**
- Codegen: `vertz build` generates DO class wrappers and `wrangler.toml` bindings
- `createAgentHandler()` — bridges AgentDefinition to CF Durable Object
- State persistence via DO storage with Proxy-based state management
- WebSocket state broadcasting
- Entity injection via `inject` config
- HTTP routing for agent invocation
- CF Containers POC (for future sandbox option)

> **Note:** Phase 4 (Dev Orchestrator) is a **separate design doc**. It defines the specific agents, workflows, and orchestration for Vertz's development automation. It is the validation that Phases 1-3 deliver the right abstractions.

---

## Package Structure

```
packages/agents/
├── package.json
├── src/
│   ├── index.ts              # Public API: agent, tool, workflow, step, sandbox, run
│   ├── agent.ts              # agent() factory
│   ├── tool.ts               # tool() factory
│   ├── workflow.ts           # workflow() and step() factories
│   ├── sandbox.ts            # sandbox() factory (Daytona)
│   ├── run.ts                # run() entry point
│   ├── loop/
│   │   ├── react-loop.ts     # ReAct loop implementation
│   │   ├── validate-tool-input.ts  # Schema validation for tool inputs
│   │   ├── checkpoint.ts     # Durable state checkpointing
│   │   └── context-mgmt.ts   # Token budget and window management
│   ├── providers/
│   │   ├── workers-ai.ts     # Cloudflare Workers AI adapter
│   │   ├── minimax.ts        # MiniMax direct API adapter
│   │   └── tool-description.ts  # Tool → JSON Schema conversion
│   ├── cloudflare/           # CF-specific adapter (separate entrypoint)
│   │   ├── handler.ts        # createAgentHandler()
│   │   ├── state-proxy.ts    # Proxy-based state over DO storage
│   │   └── codegen.ts        # DO class + wrangler.toml generation
│   └── types.ts              # All public types
├── test/
│   ├── agent.test.ts
│   ├── tool.test.ts
│   ├── workflow.test.ts
│   ├── loop/
│   │   ├── react-loop.test.ts
│   │   ├── validate-tool-input.test.ts
│   │   └── run.test.ts
│   ├── providers/
│   │   └── tool-description.test.ts
│   └── types.test-d.ts       # Type-level tests
└── bunup.config.ts
```

---

## Package Dependencies

| Package | Relationship | Why |
|---|---|---|
| `@vertz/schema` | `dependency` | Schema validation, `toJSONSchema()` for LLM tool descriptions |
| `@vertz/errors` | `dependency` | VertzException subclasses |
| `@vertz/server` | `peerDependency` | `rules.*` for access control, `AgentDefinition` structural type, `createServer()` integration |
| `@vertz/db` | `peerDependency` (optional) | Entity injection — only needed if `inject` is used |
| `agents` (Cloudflare) | `dependency` (in `cloudflare/` adapter only) | Underlying Agent/Workflow runtime |

### Dependency Direction

`AgentDefinition` (the structural type) is defined in `@vertz/server` — matching how `EntityDefinition` and `ServiceDefinition` live there. `@vertz/agents` produces objects that satisfy this structural type. `@vertz/server` accepts them in `createServer({ agents: [...] })`.

This avoids circular references: `@vertz/agents` → `@vertz/server` (peer), `@vertz/server` doesn't import `@vertz/agents`.

---

## Access Rules for Agents

Agent access uses `invoke` and `approve` keys (not entity CRUD keys like `list`/`get`/`create`/`update`/`delete`). The `rules.where()` builder is **not valid** for agent access — there is no "row" to check conditions against. Valid builders for agent access:

```typescript
access: {
  invoke: rules.authenticated(),              // ✓
  invoke: rules.entitlement('agent:invoke'),  // ✓
  invoke: rules.role('admin'),                // ✓
  invoke: rules.public,                       // ✓
  // @ts-expect-error — rules.where() is not valid for agent access
  invoke: rules.where({ createdBy: rules.user.id }),  // ✗
}
```

Workflow access uses `start` and `approve` (convention: `start` for initiating, `invoke` for RPC-style calls).
