import { s } from '@vertz/schema';
import { agent } from './agent';
import type { LLMAdapter } from './loop/react-loop';
import { run } from './run';
import type { SessionLoopResult, StatelessLoopResult } from './run';
import { memoryStore } from './stores/memory-store';
import { tool } from './tool';
import { workflow } from './workflow';
import type { WorkflowDefinition } from './workflow';

// ---------------------------------------------------------------------------
// Tool type safety
// ---------------------------------------------------------------------------

// Handler input is inferred from schema
tool({
  description: 'test',
  input: s.object({ name: s.string() }),
  output: s.object({ greeting: s.string() }),
  handler(input) {
    // input.name is string
    const _name: string = input.name;
    return { greeting: `Hi ${_name}` };
  },
});

// Handler return type must match output schema
tool({
  description: 'test',
  input: s.object({ x: s.string() }),
  output: s.object({ y: s.number() }),
  // @ts-expect-error — return type { y: string } doesn't match output { y: number }
  handler(_input) {
    return { y: 'not a number' };
  },
});

// Tool-level `approval` is not a valid config field (removed — use workflow step approval instead)
tool({
  description: 'test',
  input: s.object({}),
  output: s.object({}),
  handler() {
    return {};
  },
  // @ts-expect-error — `approval` is not a valid tool config field
  approval: { required: true, message: 'Approve?' },
});

// Tool-level `execution` is not a valid config field (removed — all tools run on the server)
tool({
  description: 'test',
  input: s.object({}),
  output: s.object({}),
  handler() {
    return {};
  },
  // @ts-expect-error — `execution` is not a valid tool config field
  execution: 'client',
});

// ---------------------------------------------------------------------------
// Agent type safety
// ---------------------------------------------------------------------------

const greetTool = tool({
  description: 'Greet',
  input: s.object({ name: s.string() }),
  output: s.object({ greeting: s.string() }),
  handler(input) {
    return { greeting: `Hi ${input.name}` };
  },
});

// Agent state type is inferred — initialState must match
agent('ok', {
  state: s.object({ count: s.number(), label: s.string() }),
  initialState: { count: 0, label: 'hello' },
  tools: { greet: greetTool },
  model: { provider: 'cloudflare', model: 'test' },
});

// initialState doesn't match state schema (count should be number)
agent('bad-state', {
  state: s.object({ count: s.number() }),
  // @ts-expect-error — count is string but schema expects number
  initialState: { count: 'not a number' },
  tools: {},
  model: { provider: 'cloudflare', model: 'test' },
});

// Agent lifecycle hooks receive typed state
agent('hooks', {
  state: s.object({ status: s.string() }),
  initialState: { status: 'idle' },
  tools: {},
  model: { provider: 'cloudflare', model: 'test' },
  onStart(ctx) {
    // ctx.state.status is string
    const _status: string = ctx.state.status;
    void _status;
  },
});

// Invalid model provider
agent('bad-provider', {
  state: s.object({}),
  initialState: {},
  tools: {},
  // @ts-expect-error — 'invalid-provider' is not a valid ModelProvider
  model: { provider: 'invalid-provider', model: 'test' },
});

// Invalid onStuck value in loop config
agent('bad-loop', {
  state: s.object({}),
  initialState: {},
  tools: {},
  model: { provider: 'cloudflare', model: 'test' },
  // @ts-expect-error — 'invalid-behavior' is not a valid OnStuckBehavior
  loop: { maxIterations: 10, onStuck: 'invalid-behavior' },
});

// ---------------------------------------------------------------------------
// Description field on agent
// ---------------------------------------------------------------------------

// Agent accepts description
agent('described', {
  description: 'A test agent that does things',
  state: s.object({}),
  initialState: {},
  tools: {},
  model: { provider: 'cloudflare', model: 'test' },
});

// ---------------------------------------------------------------------------
// Output schema on agent
// ---------------------------------------------------------------------------

// Agent accepts output schema
const agentWithOutput = agent('with-output', {
  state: s.object({ count: s.number() }),
  initialState: { count: 0 },
  output: s.object({ summary: s.string(), total: s.number() }),
  tools: {},
  model: { provider: 'cloudflare', model: 'test' },
});

// InferAgentOutput resolves to the output schema type
import type { InferAgentOutput } from './types';
type OutputType = InferAgentOutput<typeof agentWithOutput>;
const _output: OutputType = { summary: 'done', total: 5 };
void _output;

// @ts-expect-error — wrong type for InferAgentOutput (summary should be string, not number)
const _badOutput: OutputType = { summary: 123, total: 5 };
void _badOutput;

// InferAgentOutput defaults to { response: string } when no output schema
const agentNoOutput = agent('no-output', {
  state: s.object({}),
  initialState: {},
  tools: {},
  model: { provider: 'cloudflare', model: 'test' },
});
type DefaultOutputType = InferAgentOutput<typeof agentNoOutput>;
const _defaultOutput: DefaultOutputType = { response: 'hello' };
void _defaultOutput;

// ---------------------------------------------------------------------------
// Prompt config (separate from model)
// ---------------------------------------------------------------------------

// Agent accepts prompt config
agent('with-prompt', {
  state: s.object({}),
  initialState: {},
  tools: {},
  model: { provider: 'cloudflare', model: 'test' },
  prompt: { system: 'You are helpful.', maxTokens: 4096 },
});

// ---------------------------------------------------------------------------
// AgentLoopConfig — deleted fields (pre-v1, no shim)
// ---------------------------------------------------------------------------

// checkpointInterval was removed in #2835 in favor of store + sessionId for
// durable resume. Regression guard: type system must reject it now.
agent('no-checkpoint', {
  state: s.object({}),
  initialState: {},
  tools: {},
  model: { provider: 'cloudflare', model: 'test' },
  // @ts-expect-error — checkpointInterval removed from AgentLoopConfig
  loop: { maxIterations: 10, checkpointInterval: 5 },
});

// ---------------------------------------------------------------------------
// Run options discriminated union — type safety
// ---------------------------------------------------------------------------

const testLlm: LLMAdapter = { chat: async () => ({ text: '', toolCalls: [] }) };
const testAgent = agent('test', {
  state: s.object({}),
  initialState: {},
  tools: {},
  model: { provider: 'cloudflare', model: 'test' },
});

// @ts-expect-error — sessionId without store
run(testAgent, { message: 'hi', llm: testLlm, sessionId: 'abc' });

// @ts-expect-error — maxStoredMessages without store
run(testAgent, { message: 'hi', llm: testLlm, maxStoredMessages: 100 });

// Stateless result has no sessionId
async function checkStateless() {
  const result: StatelessLoopResult = await run(testAgent, { message: 'hi', llm: testLlm });
  void result.status;
  void result.response;
  // @ts-expect-error — sessionId doesn't exist on StatelessLoopResult
  void result.sessionId;
}
void checkStateless;

// Session result has sessionId
async function checkSession() {
  const store = memoryStore();
  const result: SessionLoopResult = await run(testAgent, { message: 'hi', llm: testLlm, store });
  const _id: string = result.sessionId;
  void _id;
}
void checkSession;

// ---------------------------------------------------------------------------
// Workflow builder type safety
// ---------------------------------------------------------------------------

// Positive: typed prev accumulation across 3 steps
const typedPipeline = workflow('typed-pipeline', { input: s.object({ userName: s.string() }) })
  .step('greet', {
    agent: testAgent,
    output: s.object({ greeting: s.string() }),
  })
  .step('analyze', {
    agent: testAgent,
    input: (ctx) => {
      const greeting: string = ctx.prev.greet.greeting;
      return { message: greeting };
    },
    output: s.object({ sentiment: s.number() }),
  })
  .step('summarize', {
    agent: testAgent,
    input: (ctx) => {
      const g: string = ctx.prev.greet.greeting;
      const n: number = ctx.prev.analyze.sentiment;
      return { message: `${g} (${n})` };
    },
  })
  .build();

// Positive: build() returns WorkflowDefinition
const _wfDef: WorkflowDefinition = typedPipeline;
void _wfDef;

// Positive: single-step workflow
workflow('one-step', { input: s.object({}) })
  .step('only', { agent: testAgent, output: s.object({ x: s.string() }) })
  .build();

// Positive: workflow input is typed in step callbacks
workflow('input-typed', { input: s.object({ count: s.number() }) })
  .step('use-input', {
    agent: testAgent,
    input: (ctx) => {
      const n: number = ctx.workflow.input.count;
      return { message: `Count: ${n}` };
    },
  })
  .build();

// Positive: step without output schema gives { response: string }
workflow('no-output', { input: s.object({}) })
  .step('raw', { agent: testAgent })
  .step('consumer', {
    agent: testAgent,
    input: (ctx) => {
      const r: string = ctx.prev.raw.response;
      return { message: r };
    },
  })
  .build();

// Positive: explicit output: undefined gives { response: string }
workflow('explicit-undef', { input: s.object({}) })
  .step('raw', { agent: testAgent, output: undefined })
  .step('consumer', {
    agent: testAgent,
    input: (ctx) => {
      const r: string = ctx.prev.raw.response;
      return { message: r };
    },
  })
  .build();

// Negative: nonexistent step in prev
workflow('bad-access', { input: s.object({}) })
  .step('first', { agent: testAgent, output: s.object({ x: s.string() }) })
  .step('second', {
    agent: testAgent,
    input: (ctx) => {
      // @ts-expect-error — 'nonexistent' step doesn't exist in prev
      ctx.prev.nonexistent;
      return '';
    },
  })
  .build();

// Negative: wrong property on step output
workflow('bad-prop', { input: s.object({}) })
  .step('first', { agent: testAgent, output: s.object({ x: s.string() }) })
  .step('second', {
    agent: testAgent,
    input: (ctx) => {
      // @ts-expect-error — 'y' doesn't exist on first's output { x: string }
      ctx.prev.first.y;
      return '';
    },
  })
  .build();

// Negative: wrong type assignment
workflow('bad-type', { input: s.object({}) })
  .step('first', { agent: testAgent, output: s.object({ x: s.string() }) })
  .step('second', {
    agent: testAgent,
    input: (ctx) => {
      // @ts-expect-error — x is string, not number
      const _n: number = ctx.prev.first.x;
      return '';
    },
  })
  .build();

// Negative: approval-only step not in prev
workflow('approval-excluded', { input: s.object({}) })
  .step('review', { approval: { message: 'Approve?' } })
  .step('execute', {
    agent: testAgent,
    input: (ctx) => {
      // @ts-expect-error — approval-only step has no output in prev
      ctx.prev.review;
      return '';
    },
  })
  .build();

// ---------------------------------------------------------------------------
// Agent-to-agent invocation type safety
// ---------------------------------------------------------------------------

import type { AgentInvoker, InvokeOptions } from './types';

// ToolContext has agents.invoke()
const _toolCtx: import('./types').ToolContext = {
  agentId: 'test',
  agentName: 'test',
  agents: {
    async invoke(_agentDef, _opts) {
      return { response: 'hello' };
    },
  },
};
void _toolCtx;

// invoke() returns Promise<{ response: string }>
async function checkInvoke(invoker: AgentInvoker) {
  const result = await invoker.invoke(testAgent, { message: 'hi' });
  const _resp: string = result.response;
  void _resp;
}
void checkInvoke;

// InvokeOptions requires message
const _invokeOpts: InvokeOptions = { message: 'test' };
void _invokeOpts;

// InvokeOptions accepts `as` identity override
const _invokeWithAs: InvokeOptions = {
  message: 'test',
  as: { userId: 'u', tenantId: 't' },
};
void _invokeWithAs;

// `as` fields are nullable (explicit drop of identity)
const _invokeWithNullAs: InvokeOptions = {
  message: 'test',
  as: { userId: null, tenantId: null },
};
void _invokeWithNullAs;

// `as` fields are independently optional
const _invokeWithPartialAs: InvokeOptions = {
  message: 'test',
  as: { userId: 'u' },
};
void _invokeWithPartialAs;

// @ts-expect-error — userId must be string | null, not number
const _badAsType: InvokeOptions = { message: 'test', as: { userId: 42 } };
void _badAsType;

// Top-level run() accepts userId and tenantId on stateless calls
run(testAgent, { message: 'hi', llm: testLlm, userId: 'u1', tenantId: 't1' });
run(testAgent, { message: 'hi', llm: testLlm, userId: null, tenantId: null });

// @ts-expect-error — userId must be string | null, not number
run(testAgent, { message: 'hi', llm: testLlm, userId: 42 });

// ---------------------------------------------------------------------------
// Public entry: `d1Store` and its supporting types are reachable from
// `@vertz/agents`. These live in `./index.ts` so accidental removal shows up
// as a compile error here (proving the public type surface stays stable).
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-duplicate-imports -- namespace import keeps this block self-contained
import type { AgentStore, D1Binding, D1PreparedStatement, D1Result, D1StoreOptions } from './index';
// eslint-disable-next-line no-duplicate-imports
import { d1Store } from './index';

// D1StoreOptions must accept a D1Binding.
const _d1Options: D1StoreOptions = {
  binding: {} as D1Binding,
};
void _d1Options;

// D1Binding.prepare returns a namable D1PreparedStatement.
const _stmt: D1PreparedStatement = {} as D1Binding extends { prepare(q: string): infer S }
  ? S
  : never;
void _stmt;

// batch returns an array of D1Result<unknown>.
const _results: D1Result<unknown>[] = [];
void _results;

// d1Store returns an AgentStore — the public interface agents code operates on.
const _d1StoreInstance: AgentStore = d1Store({ binding: {} as D1Binding });
void _d1StoreInstance;

// @ts-expect-error — options.binding is required
d1Store({});
