# `@vertz/agents` — Design Document (Rev 1)

> "AI agents are first-class users." — Vertz Vision, Principle 3

## Revision History

| Rev | Date | Changes |
|---|---|---|
| 1 | 2026-03-30 | Initial draft |

---

## Executive Summary

Build `@vertz/agents` — a declarative abstraction over Cloudflare's Agents SDK that lets Vertz developers define AI agents, multi-step workflows, and tools using the same patterns they already know from `entity()`, `service()`, and `rules.*`.

Cloudflare provides the infrastructure: durable state, hibernation, scheduling, WebSocket connections, human-in-the-loop gates. Vertz provides the developer experience: typed schemas, declarative access rules, one way to do things, and an LLM-native API surface.

The first consumer is the Vertz dev orchestrator — an agent system that automates the full development workflow (design → review → implement → PR → merge). But `@vertz/agents` is a general-purpose package: any Vertz developer can use it to build agents on Cloudflare.

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

The gap is a **binding layer** that maps these primitives to Cloudflare's agent infrastructure.

---

## API Surface

### `agent()` — Define an agent

```typescript
import { agent, tool } from '@vertz/agents';
import { rules } from '@vertz/server';
import { s } from '@vertz/schema';
import { tasksEntity, usersEntity } from './entities';

const codeReviewAgent = agent('code-review', {
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

  // LLM configuration
  model: {
    provider: 'cloudflare',      // 'cloudflare' | 'anthropic' | 'minimax' | 'openai'
    model: 'kimi-k2',            // provider-specific model identifier
    systemPrompt: 'You are a code reviewer. Be thorough and adversarial.',
    maxTokens: 4096,
  },

  // ReAct loop configuration
  loop: {
    maxIterations: 50,           // hard cap on think→act→observe cycles
    onStuck: 'escalate',         // 'escalate' | 'stop' | 'retry'
    stuckThreshold: 5,           // consecutive iterations without progress
    checkpointEvery: 5,          // persist conversation to durable state every N iterations
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

Tools are the unit of agent capability. They follow the same `action()` pattern:

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

// Client-side tool — runs in the browser
const screenshotTool = tool({
  description: 'Take a screenshot of the current page',
  input: s.object({ selector: s.string().optional() }),
  output: s.object({ dataUrl: s.string() }),
  execution: 'client',           // 'server' (default) | 'client'
});
```

### `workflow()` — Multi-step orchestrated pipelines

Workflows coordinate multiple agents and approval gates. Built on Cloudflare's `Workflow` with Vertz's typed step definitions:

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

  // Ordered steps
  steps: [
    step('write-design-doc', {
      agent: designWriterAgent,
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
      input: (prev) => ({ docPath: prev['write-design-doc'].docPath }),
      output: s.object({
        approved: s.boolean(),
        findings: s.array(s.object({ issue: s.string(), severity: s.string() })),
      }),
    }),

    step('technical-review', {
      agent: technicalReviewAgent,
      input: (prev) => ({ docPath: prev['write-design-doc'].docPath }),
      output: s.object({
        approved: s.boolean(),
        findings: s.array(s.object({ issue: s.string(), severity: s.string() })),
      }),
      // Runs in parallel with dx-review
      parallel: ['dx-review'],
    }),

    step('product-review', {
      agent: productReviewAgent,
      input: (prev) => ({ docPath: prev['write-design-doc'].docPath }),
      output: s.object({
        approved: s.boolean(),
        findings: s.array(s.object({ issue: s.string(), severity: s.string() })),
      }),
      // Runs in parallel with dx-review and technical-review
      parallel: ['dx-review', 'technical-review'],
    }),

    // Fix-review loop: if any reviewer rejects, go back to design
    step('address-feedback', {
      agent: designWriterAgent,
      input: (prev) => ({
        docPath: prev['write-design-doc'].docPath,
        dxFindings: prev['dx-review'].findings,
        techFindings: prev['technical-review'].findings,
        productFindings: prev['product-review'].findings,
      }),
      // Conditional: only runs if any reviewer rejected
      when: (prev) =>
        !prev['dx-review'].approved ||
        !prev['technical-review'].approved ||
        !prev['product-review'].approved,
      // Loop back to reviews after addressing
      goto: 'dx-review',
    }),

    // Human approval gate
    step('human-approval', {
      approval: {
        message: (prev) => `Design doc ready for review: ${prev['write-design-doc'].docPath}`,
        timeout: '7d',
      },
    }),
  ],
});
```

### `sandbox()` — Compute environments for code execution

Agents that need to run code (tests, builds, git operations) require a sandboxed environment:

```typescript
import { sandbox } from '@vertz/agents';
import { s } from '@vertz/schema';

// Cloudflare Container (preferred — zero config)
const cfSandbox = sandbox('cloudflare', {
  image: 'vertz/dev-env:latest',
  memory: '512MB',
  timeout: '10m',
});

// Daytona (fallback — for heavy workloads)
const daytonaSandbox = sandbox('daytona', {
  image: 'vertz/dev-env:latest',
  resources: { cpu: 2, memory: '4GB' },
});

// Use in agent tools
const runTests = tool({
  description: 'Run the test suite',
  input: s.object({ packages: s.array(s.string()).optional() }),
  output: s.object({
    passed: s.number(),
    failed: s.number(),
    output: s.string(),
  }),
  sandbox: cfSandbox,            // tool executes inside the sandbox
  async handler(input, ctx) {
    const result = await ctx.sandbox.exec('bun', ['test', ...(input.packages ?? [])]);
    return {
      passed: result.exitCode === 0 ? 1 : 0,
      failed: result.exitCode === 0 ? 0 : 1,
      output: result.stdout,
    };
  },
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
  state: TState;                           // typed durable state (read/write)
  entities: InjectToOperations<TInject>;   // typed entity CRUD access

  // Sandbox (when configured)
  sandbox: SandboxHandle;

  // Communication
  emit(event: string, data: unknown): void;  // WebSocket broadcast
  log(level: 'info' | 'warn' | 'error', message: string): void;
}
```

### Agent-to-Agent Communication

Agents invoke each other through typed references:

```typescript
import { invoke } from '@vertz/agents';

// Inside a tool handler or workflow step
const reviewResult = await invoke(codeReviewAgent, {
  // Instance ID — determines which Durable Object handles the request
  instance: `review-${prNumber}`,
  // Input message
  message: 'Review the changes in PR #123',
  // Wait for completion
  waitFor: 'complete',
});
```

### Registration — Wire agents into the Vertz app

```typescript
import { createServer } from '@vertz/server';
import { agents } from '@vertz/agents';

const server = createServer({
  entities: [tasksEntity, usersEntity],
  services: [notificationService],
  agents: agents([
    codeReviewAgent,
    designWriterAgent,
    dxReviewAgent,
  ]),
});
```

---

## Manifesto Alignment

### Principle 1: If it builds, it works

- `state` schemas are validated at definition time — invalid initial state is a type error
- Tool `input`/`output` schemas enforce type safety end-to-end
- Workflow step `input` functions are typed against previous step outputs — referencing a non-existent step or wrong field is a compile error
- `access` rules use the existing `rules.*` type system

### Principle 2: One way to do things

- One way to define an agent: `agent(name, config)`
- One way to define tools: `tool(config)`
- One way to define workflows: `workflow(name, config)` with `step()`
- No class inheritance, no decorators, no chaining
- Config-object pattern matches `entity()` and `service()` exactly

### Principle 3: AI agents are first-class users

This package is literally building AI agents. But more importantly, the API itself must be LLM-usable:
- `agent()` follows the same pattern as `entity()` — an LLM that knows Vertz can use it immediately
- Tool definitions mirror `action()` — `input`, `output`, `handler`
- No hidden configuration, no magic strings, no decorator ordering

### Principle 5: Type safety wins

- Workflow step outputs flow into subsequent step inputs via generics
- Agent state type is inferred from the `state` schema
- Tool handler receives typed `input` and must return typed `output`
- `inject` config maps to typed `ctx.entities` (same as entity/service)

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

---

## Non-Goals

1. **General-purpose orchestration framework** — This is not Temporal, Inngest, or a generic workflow engine. It's specifically for AI agent workflows on Cloudflare.

2. **LLM provider abstraction** — We don't wrap every LLM API. We support specific providers (Cloudflare models, MiniMax, Anthropic) with explicit config, not a universal adapter.

3. **Agent marketplace/registry** — No dynamic agent discovery or plugin system. Agents are defined in code, imported explicitly.

4. **Self-hosted agent runtime** — v1 targets Cloudflare only. Self-hosted support (Vertz Runtime) is a future consideration gated on the runtime reaching production readiness.

5. **Replacing Claude Code** — The dev orchestrator uses agents for structured workflow automation, not as a general-purpose coding assistant. Human developers + Claude Code remain the primary development interface.

6. **Chat UI** — `AIChatAgent` and `useAgentChat` from Cloudflare's SDK can be used directly. We don't re-abstract chat interfaces.

---

## Unknowns

### U1: Cloudflare Containers maturity (needs POC)

Cloudflare Containers are relatively new. Can they reliably run `bun test`, `bun run typecheck`, and git operations? What are the cold start times? Memory limits?

**Resolution:** POC before Phase 2. If containers are insufficient, fallback to Daytona.

### U2: ReAct loop context window management

Long-running agents (50+ iterations) will exceed context windows. How do we summarize/truncate prior observations without losing critical information?

**Resolution:** Research phase. Options:
- Rolling window with summarization (summarize oldest N messages)
- Hierarchical memory (short-term in context, long-term in durable SQLite)
- Checkpoint-based restart with summary injection

### U3: Cost model for open-source LLMs on Workers AI

Kimi K2 and Gwenn on Workers AI — what's the token throughput? Latency? Cost per million tokens? Is it viable for agents that make 50+ LLM calls per task?

**Resolution:** POC with benchmarks before committing to specific models.

### U4: MiniMax API integration

MiniMax's direct API — authentication, rate limits, streaming support, tool calling format. Is it compatible with the Vercel AI SDK adapter pattern?

**Resolution:** Spike during Phase 1.

### U5: Workflow step retry semantics

When a step fails mid-execution (sandbox timeout, LLM error), what's the retry strategy? Cloudflare Workflows have built-in retries, but do they compose well with our step definitions?

**Resolution:** Design during Phase 2 implementation.

---

## POC Results

None yet. POCs planned:
- **U1:** Cloudflare Containers for code execution (before Phase 2)
- **U3:** Workers AI model benchmarks (during Phase 1)
- **U4:** MiniMax API integration spike (during Phase 1)

---

## Type Flow Map

### `agent()` type flow

```
s.object({ ... })                    → TState (inferred from state schema)
  ↓
agent('name', { state, tools, inject })
  ↓                          ↓           ↓
  TState flows to →    tool handler    AgentContext<TState, TInject>
                       ctx.state: TState
                       ctx.entities: InjectToOperations<TInject>
```

### `workflow()` type flow

```
step('step-a', { output: s.object({ x: s.string() }) })
  ↓
  TOutputA = { x: string }
  ↓
step('step-b', { input: (prev) => prev['step-a'].x })
                                          ↑
                    prev is typed: { 'step-a': TOutputA }
                    prev['step-a'].x is string ✓
                    prev['step-a'].y is @ts-expect-error ✗
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

### Developer walkthrough: Define and deploy an agent

```typescript
// acceptance-test.ts — tests the full developer experience

import { agent, tool, workflow, step, sandbox, invoke } from '@vertz/agents';
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

// 2. Define an agent with state and tools
const greeterAgent = agent('greeter', {
  state: s.object({
    greetingsGiven: s.number(),
  }),
  initialState: { greetingsGiven: 0 },
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
  loop: {
    maxIterations: 10,
    onStuck: 'stop',
  },
});

// 3. Type safety: wrong state shape is a compile error
const badAgent = agent('bad', {
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

// 5. Define a workflow with typed step transitions
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
      // prev is typed — 'greet' step output is available
      input: (prev) => ({ message: `Log: ${prev['greet'].greeting}` }),
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
      input: (prev) => ({ message: prev['nonexistent'].greeting }),
      output: s.object({ done: s.boolean() }),
    }),
  ],
});
```

---

## Implementation Plan

### Phase 1: Core Definitions + Tool Execution

**Goal:** `agent()`, `tool()`, and the ReAct loop running on a single Cloudflare Worker with Workers AI.

**Acceptance criteria:**
```typescript
describe('Feature: Agent definition and tool execution', () => {
  describe('Given an agent with tools and Workers AI model', () => {
    describe('When the agent receives a message', () => {
      it('Then executes the ReAct loop: think → tool call → observe → respond', () => {});
      it('Then validates tool inputs against the schema', () => {});
      it('Then persists state to durable storage after each iteration', () => {});
      it('Then stops after maxIterations', () => {});
    });
  });

  describe('Given an agent with access rules', () => {
    describe('When an unauthenticated user invokes the agent', () => {
      it('Then returns an access denied error', () => {});
    });
  });

  describe('Given a tool with approval required', () => {
    describe('When the agent calls the tool', () => {
      it('Then pauses execution and waits for human approval', () => {});
      it('Then resumes after approval', () => {});
    });
  });
});
```

**Deliverables:**
- `agent()` factory that produces a Cloudflare `Agent` subclass
- `tool()` factory with schema validation
- ReAct loop with configurable iteration limits and checkpointing
- Workers AI integration (Kimi K2, Llama)
- MiniMax direct API spike
- Access rule evaluation on agent invocation

### Phase 2: Workflows + Sandbox

**Goal:** `workflow()`, `step()`, `sandbox()`, and agent-to-agent communication.

**Acceptance criteria:**
```typescript
describe('Feature: Multi-step workflows', () => {
  describe('Given a workflow with sequential steps', () => {
    describe('When the workflow starts', () => {
      it('Then executes steps in order, passing outputs forward', () => {});
      it('Then validates step outputs against their schemas', () => {});
    });
  });

  describe('Given a workflow with parallel steps', () => {
    describe('When parallel steps are reached', () => {
      it('Then executes them concurrently', () => {});
      it('Then waits for all parallel steps before proceeding', () => {});
    });
  });

  describe('Given a workflow with a conditional goto', () => {
    describe('When the condition is met', () => {
      it('Then loops back to the specified step', () => {});
    });
  });

  describe('Given a workflow with a human approval step', () => {
    describe('When the approval step is reached', () => {
      it('Then suspends the workflow until approved', () => {});
    });
  });

  describe('Given a tool with a sandbox', () => {
    describe('When the tool executes', () => {
      it('Then runs the handler inside the sandboxed environment', () => {});
      it('Then returns stdout/stderr from the sandbox', () => {});
    });
  });
});
```

**Deliverables:**
- `workflow()` and `step()` factories
- Step dependency resolution and parallel execution
- Conditional steps and goto/loop
- `sandbox()` with Cloudflare Containers (or Daytona fallback)
- `invoke()` for agent-to-agent communication
- Cloudflare Containers POC results

### Phase 3: Entity Injection + Server Integration

**Goal:** `inject` config, `agents()` registration in `createServer()`, and dashboard WebSocket API.

**Acceptance criteria:**
```typescript
describe('Feature: Entity injection in agents', () => {
  describe('Given an agent with injected entities', () => {
    describe('When a tool handler accesses ctx.entities', () => {
      it('Then provides typed CRUD operations', () => {});
      it('Then enforces entity access rules', () => {});
    });
  });

  describe('Given agents registered with createServer()', () => {
    describe('When the server starts', () => {
      it('Then routes /agents/:name/:instance to the correct Agent Durable Object', () => {});
      it('Then exposes agent state via WebSocket for dashboard', () => {});
    });
  });
});
```

**Deliverables:**
- `inject` config for agents (reusing entity injection machinery)
- `agents()` helper for server registration
- HTTP routing for agent invocation
- WebSocket state broadcasting for monitoring
- Agent dashboard data API

### Phase 4: Dev Orchestrator (Dogfood)

**Goal:** Build the Vertz development workflow orchestrator using `@vertz/agents`.

This phase is a separate design doc — it defines the specific agents (design writer, DX reviewer, technical reviewer, implementation agent, PR agent) and the orchestration workflow. Phase 4 is the validation that Phases 1-3 deliver the right abstractions.

---

## Package Structure

```
packages/agents/
├── package.json
├── src/
│   ├── index.ts            # Public API: agent, tool, workflow, step, sandbox, invoke
│   ├── agent.ts            # agent() factory
│   ├── tool.ts             # tool() factory
│   ├── workflow.ts         # workflow() and step() factories
│   ├── sandbox.ts          # sandbox() factory
│   ├── invoke.ts           # Agent-to-agent communication
│   ├── loop/
│   │   ├── react-loop.ts   # ReAct loop implementation
│   │   ├── checkpoint.ts   # Durable state checkpointing
│   │   └── context-mgmt.ts # Token budget and window management
│   ├── providers/
│   │   ├── workers-ai.ts   # Cloudflare Workers AI adapter
│   │   ├── minimax.ts      # MiniMax direct API adapter
│   │   └── types.ts        # Provider interface
│   ├── runtime/
│   │   ├── cloudflare.ts   # Cloudflare Agent/Workflow class generation
│   │   └── routing.ts      # HTTP/WS routing integration
│   └── types.ts            # All public types
├── test/
│   ├── agent.test.ts
│   ├── tool.test.ts
│   ├── workflow.test.ts
│   ├── loop.test.ts
│   └── types.test-d.ts     # Type-level tests
└── bunup.config.ts
```

---

## Dependencies

| Package | Relationship |
|---|---|
| `@vertz/schema` | `dependency` — schema validation for state, tool I/O |
| `@vertz/server` | `peerDependency` — `rules.*`, `createServer()` integration |
| `agents` (Cloudflare) | `dependency` — underlying Agent/Workflow runtime |
| `@vertz/db` | `peerDependency` — for entity injection (optional) |
