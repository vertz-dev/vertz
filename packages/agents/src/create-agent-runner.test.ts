import { describe, expect, it, mock } from 'bun:test';
import { s } from '@vertz/schema';
import { agent } from './agent';
import { createAgentRunner } from './create-agent-runner';
import type { LLMAdapter } from './loop/react-loop';
import { tool } from './tool';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockLLM(text: string): LLMAdapter {
  return {
    async chat() {
      return { text, toolCalls: [] };
    },
  };
}

const testTool = tool({
  description: 'Test tool',
  input: s.object({}),
  output: s.object({}),
  handler() {
    return {};
  },
});

const testAgent = agent('test-agent', {
  state: s.object({ count: s.number() }),
  initialState: { count: 0 },
  tools: { test: testTool },
  model: { provider: 'cloudflare', model: 'test' },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createAgentRunner()', () => {
  describe('Given a list of agents and a shared LLM adapter', () => {
    describe('When the runner is called with a valid agent name', () => {
      it('Then runs the agent and returns status + response', async () => {
        const llm = mockLLM('Agent says hello.');
        const runner = createAgentRunner([testAgent], { llm });

        const result = await runner('test-agent', 'Hi', {
          userId: null,
          tenantId: null,
          authenticated() {
            return false;
          },
          tenant() {
            return false;
          },
          role() {
            return false;
          },
        });

        expect(result.status).toBe('complete');
        expect(result.response).toBe('Agent says hello.');
      });
    });
  });

  describe('Given a runner is called with an unknown agent name', () => {
    describe('When the runner executes', () => {
      it('Then throws an error with the agent name', async () => {
        const llm = mockLLM('unused');
        const runner = createAgentRunner([testAgent], { llm });

        await expect(
          runner('nonexistent', 'Hi', {
            userId: null,
            tenantId: null,
            authenticated() {
              return false;
            },
            tenant() {
              return false;
            },
            role() {
              return false;
            },
          }),
        ).rejects.toThrow('Agent "nonexistent" not found');
      });
    });
  });

  describe('Given a createAdapter factory instead of a shared LLM', () => {
    describe('When the runner is called', () => {
      it('Then creates an adapter for the specific agent model config', async () => {
        const factoryFn = mock(() => mockLLM('Adapter created.'));
        const runner = createAgentRunner([testAgent], { createAdapter: factoryFn });

        const result = await runner('test-agent', 'Hi', {
          userId: null,
          tenantId: null,
          authenticated() {
            return false;
          },
          tenant() {
            return false;
          },
          role() {
            return false;
          },
        });

        expect(result.status).toBe('complete');
        expect(result.response).toBe('Adapter created.');
        expect(factoryFn).toHaveBeenCalledTimes(1);
      });
    });
  });
});
