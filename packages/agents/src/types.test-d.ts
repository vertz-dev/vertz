import { s } from '@vertz/schema';
import { agent } from './agent';
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
