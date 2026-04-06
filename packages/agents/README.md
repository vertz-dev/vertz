# @vertz/agents

Declarative AI agent framework for Vertz — define agents, tools, and workflows with full type safety on Cloudflare Workers.

## Features

- **Declarative agents** — Define agents with typed state, tools, and output schemas using `agent()`
- **ReAct loop** — Built-in Reason-Act-Observe cycle with stuck detection and token budgets
- **Typed tools** — Input/output schemas validated at runtime, with optional human approval gates
- **Workflow orchestration** — Multi-step workflows with typed step outputs and approval gates
- **Session persistence** — Resume conversations with pluggable storage (memory, SQLite, D1)
- **Agent-to-agent communication** — Tools can invoke other agents for hierarchical flows
- **Provider-agnostic LLMs** — Pluggable adapters for Cloudflare Workers AI, MiniMax, and OpenAI-compatible APIs

## Installation

```bash
vtz add @vertz/agents
```

## Quick Start

```typescript
import { agent, tool, run } from '@vertz/agents';
import { s } from '@vertz/schema';

const greetTool = tool({
  description: 'Greet someone by name',
  input: s.object({ name: s.string() }),
  output: s.object({ greeting: s.string() }),
  handler(input) {
    return { greeting: `Hello, ${input.name}!` };
  },
});

const greeter = agent('greeter', {
  state: s.object({ count: s.number() }),
  initialState: { count: 0 },
  tools: { greet: greetTool },
  model: { provider: 'cloudflare', model: 'llama-3.3-70b-instruct-fp8' },
  prompt: { system: 'You are a friendly greeter.' },
});

const result = await run(greeter, {
  message: 'Greet Alice',
  llm: adapter,
});
```

## Defining Tools

Tools are typed functions that agents can call during their reasoning loop.

```typescript
const searchTool = tool({
  description: 'Search documents by query',
  input: s.object({ query: s.string(), limit: s.number().optional() }),
  output: s.object({ results: s.array(s.string()) }),
  async handler(input, ctx) {
    const results = await searchDocuments(input.query, input.limit);
    return { results };
  },
});
```

### Tool options

- **`description`** — Shown to the LLM to decide when to use the tool
- **`input` / `output`** — `@vertz/schema` schemas for validation
- **`handler`** — Receives validated input and a `ToolContext` with agent metadata
- **`approval`** — Optional human approval gate before execution
- **`parallel`** — Allow concurrent execution with other tools

## Defining Agents

```typescript
const researcher = agent('researcher', {
  state: s.object({ sources: s.array(s.string()) }),
  initialState: { sources: [] },
  tools: { search: searchTool, summarize: summarizeTool },
  model: { provider: 'cloudflare', model: 'llama-3.3-70b-instruct-fp8' },
  prompt: { system: 'You are a research assistant. Search for information and summarize findings.' },
  loop: {
    maxIterations: 20,
    stuckThreshold: 3,
    onStuck: 'stop',
  },
  onComplete: (result) => {
    console.log(`Completed in ${result.iterations} iterations`);
  },
});
```

## Running Agents

### Stateless execution

```typescript
const result = await run(researcher, {
  message: 'Find recent papers on transformer architectures',
  llm: adapter,
});

console.log(result.status);   // 'complete' | 'max-iterations' | 'stuck' | 'error'
console.log(result.response); // Agent's final response
```

### Session-based execution

```typescript
import { memoryStore } from '@vertz/agents';

const result = await run(researcher, {
  message: 'Find recent papers on transformer architectures',
  llm: adapter,
  store: memoryStore(),
  userId: 'user-123',
  sessionId: 'sess_abc', // Resume an existing session
});
```

**Available stores:** `memoryStore()`, `sqliteStore()`, `d1Store()` (Cloudflare D1)

## Workflows

Chain multiple agents into typed, multi-step workflows with approval gates.

```typescript
import { workflow, runWorkflow } from '@vertz/agents';

const pipeline = workflow('review-pipeline', {
  input: s.object({ docPath: s.string() }),
})
  .step('draft', {
    agent: draftAgent,
    input: (ctx) => `Draft a document at ${ctx.workflow.input.docPath}`,
    output: s.object({ content: s.string() }),
  })
  .step('review', {
    approval: {
      message: (ctx) => `Please review the draft`,
      timeout: '7d',
    },
  })
  .step('publish', {
    agent: publishAgent,
    input: (ctx) => ctx.prev.draft.content, // Typed access to previous step output
  })
  .build();

const result = await runWorkflow(pipeline, {
  input: { docPath: '/docs/guide.md' },
  llm: adapter,
});
```

## LLM Adapters

```typescript
import { createAdapter } from '@vertz/agents';

const adapter = createAdapter({
  provider: 'cloudflare',
  model: 'llama-3.3-70b-instruct-fp8',
  accountId: env.CF_ACCOUNT_ID,
  apiToken: env.CF_API_TOKEN,
});
```

## Server Integration

```typescript
import { createAgentRunner } from '@vertz/agents';

const runner = createAgentRunner({
  agents: { researcher, greeter },
  llm: adapter,
  store: d1Store(env.DB),
});
```

## License

MIT
