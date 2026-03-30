import { describe, expect, it } from 'bun:test';
import { s } from '@vertz/schema';
import { agent } from './agent';
import type { LLMAdapter } from './loop/react-loop';
import { run } from './run';
import { tool } from './tool';

/** Builds a mock LLM adapter from a sequence of responses. */
function mockLLM(
  responses: Array<{
    text?: string;
    toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  }>,
): LLMAdapter {
  let callIndex = 0;
  return {
    async chat(_messages) {
      const response = responses[callIndex];
      if (!response) {
        return { text: 'No more responses', toolCalls: [] };
      }
      callIndex++;
      return {
        text: response.text ?? '',
        toolCalls: response.toolCalls ?? [],
      };
    },
  };
}

describe('run()', () => {
  const greetTool = tool({
    description: 'Greet someone',
    input: s.object({ name: s.string() }),
    output: s.object({ greeting: s.string() }),
    handler(input) {
      return { greeting: `Hello, ${input.name}!` };
    },
  });

  const greeterAgent = agent('greeter', {
    state: s.object({ greetingsGiven: s.number() }),
    initialState: { greetingsGiven: 0 },
    tools: { greet: greetTool },
    model: { provider: 'cloudflare', model: 'test' },
    loop: { maxIterations: 10 },
  });

  describe('Given an agent and a user message', () => {
    describe('When run() is called with a mock LLM', () => {
      it('Then executes the agent loop and returns the result', async () => {
        const llm = mockLLM([
          { toolCalls: [{ name: 'greet', arguments: { name: 'World' } }] },
          { text: 'I greeted World for you!' },
        ]);

        const result = await run(greeterAgent, {
          message: 'Greet World',
          llm,
        });

        expect(result.status).toBe('complete');
        expect(result.response).toBe('I greeted World for you!');
        expect(result.iterations).toBe(2);
      });
    });
  });

  describe('Given an agent with a system prompt in prompt config', () => {
    describe('When run() is called', () => {
      it('Then uses the system prompt from the agent prompt config', async () => {
        const promptAgent = agent('prompt-agent', {
          state: s.object({}),
          initialState: {},
          tools: {},
          model: { provider: 'cloudflare', model: 'test' },
          prompt: { system: 'You are a code reviewer.' },
          loop: { maxIterations: 5 },
        });

        let capturedMessages: readonly { role: string; content: string }[] = [];
        const llm: LLMAdapter = {
          async chat(messages) {
            capturedMessages = messages;
            return { text: 'Done', toolCalls: [] };
          },
        };

        await run(promptAgent, { message: 'Review this', llm });

        expect(capturedMessages[0]!.role).toBe('system');
        expect(capturedMessages[0]!.content).toBe('You are a code reviewer.');
      });
    });
  });

  describe('Given an agent with lifecycle hooks', () => {
    describe('When run() is called', () => {
      it('Then calls onStart before the loop and onComplete after', async () => {
        const events: string[] = [];

        const hookedAgent = agent('hooked', {
          state: s.object({ status: s.string() }),
          initialState: { status: 'idle' },
          tools: {},
          model: { provider: 'cloudflare', model: 'test' },
          loop: { maxIterations: 5 },
          onStart(ctx) {
            events.push('start');
            ctx.state.status = 'running';
          },
          onComplete(ctx) {
            events.push('complete');
            ctx.state.status = 'done';
          },
        });

        const llm = mockLLM([{ text: 'Done.' }]);

        await run(hookedAgent, { message: 'Do it', llm });

        expect(events).toEqual(['start', 'complete']);
      });
    });
  });

  describe('Given an agent that exceeds max iterations', () => {
    describe('When run() is called', () => {
      it('Then calls onStuck when the loop hits max iterations', async () => {
        const events: string[] = [];
        const noop = tool({
          description: 'No-op',
          input: s.object({}),
          output: s.object({}),
          handler() {
            return {};
          },
        });

        const stuckAgent = agent('stuck', {
          state: s.object({}),
          initialState: {},
          tools: { noop },
          model: { provider: 'cloudflare', model: 'test' },
          loop: { maxIterations: 2 },
          onStuck() {
            events.push('stuck');
          },
        });

        const llm = mockLLM([
          { toolCalls: [{ name: 'noop', arguments: {} }] },
          { toolCalls: [{ name: 'noop', arguments: {} }] },
          { toolCalls: [{ name: 'noop', arguments: {} }] },
        ]);

        const result = await run(stuckAgent, { message: 'Loop forever', llm });

        expect(result.status).toBe('max-iterations');
        expect(events).toEqual(['stuck']);
      });
    });
  });
});
