import { s } from '@vertz/schema';
import { agent } from './agent';
import type { LLMAdapter } from './loop/react-loop';
import { run } from './run';
import type { SessionLoopResult, StatelessLoopResult } from './run';
import { memoryStore } from './stores/memory-store';
import { tool } from './tool';

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
// checkpointInterval (renamed from checkpointEvery)
// ---------------------------------------------------------------------------

// Agent accepts checkpointInterval in loop config
agent('with-interval', {
  state: s.object({}),
  initialState: {},
  tools: {},
  model: { provider: 'cloudflare', model: 'test' },
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
