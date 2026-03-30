import { describe, expect, it, mock } from 'bun:test';
import { s } from '@vertz/schema';
import { agent } from './agent';
import { createAgentRunner } from './create-agent-runner';
import type { LLMAdapter } from './loop/react-loop';
import { memoryStore } from './stores/memory-store';
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

function makeCtx(overrides: Partial<{ userId: string | null; tenantId: string | null }> = {}) {
  return {
    userId: null as string | null,
    tenantId: null as string | null,
    ...overrides,
    authenticated() {
      return overrides.userId !== undefined && overrides.userId !== null;
    },
    tenant() {
      return overrides.tenantId !== undefined && overrides.tenantId !== null;
    },
    role() {
      return false;
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

        const result = await runner('test-agent', { message: 'Hi' }, makeCtx());

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

        await expect(runner('nonexistent', { message: 'Hi' }, makeCtx())).rejects.toThrow(
          'Agent "nonexistent" not found',
        );
      });
    });
  });

  describe('Given a createAdapter factory instead of a shared LLM', () => {
    describe('When the runner is called', () => {
      it('Then creates an adapter with model config and tools', async () => {
        const factoryFn = mock(() => mockLLM('Adapter created.'));
        const runner = createAgentRunner([testAgent], { createAdapter: factoryFn });

        const result = await runner('test-agent', { message: 'Hi' }, makeCtx());

        expect(result.status).toBe('complete');
        expect(result.response).toBe('Adapter created.');
        expect(factoryFn).toHaveBeenCalledTimes(1);
        expect(factoryFn).toHaveBeenCalledWith({
          config: { provider: 'cloudflare', model: 'test' },
          tools: testAgent.tools,
        });
      });
    });
  });

  describe('Given neither llm nor createAdapter is provided', () => {
    describe('When createAgentRunner is called', () => {
      it('Then throws a configuration error', () => {
        expect(() => createAgentRunner([testAgent], {})).toThrow(
          'createAgentRunner requires either "llm" or "createAdapter" option',
        );
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Session support
  // ---------------------------------------------------------------------------

  describe('Given a runner with a store', () => {
    describe('When called without sessionId', () => {
      it('Then creates a new session and returns sessionId', async () => {
        const store = memoryStore();
        const llm = mockLLM('Hello!');
        const runner = createAgentRunner([testAgent], { llm, store });

        const result = await runner('test-agent', { message: 'Hi' }, makeCtx());

        expect(result.status).toBe('complete');
        expect(result.sessionId).toMatch(/^sess_/);
      });
    });
  });

  describe('Given a runner with a store and existing session', () => {
    describe('When called with sessionId', () => {
      it('Then resumes the session', async () => {
        const store = memoryStore();
        const llm = mockLLM('Hello!');
        const runner = createAgentRunner([testAgent], { llm, store });

        const r1 = await runner('test-agent', { message: 'First' }, makeCtx());
        const r2 = await runner(
          'test-agent',
          { message: 'Second', sessionId: r1.sessionId },
          makeCtx(),
        );

        expect(r2.sessionId).toBe(r1.sessionId);
      });
    });
  });

  describe('Given a runner without a store', () => {
    describe('When called', () => {
      it('Then returns no sessionId (stateless)', async () => {
        const llm = mockLLM('Hello!');
        const runner = createAgentRunner([testAgent], { llm });

        const result = await runner('test-agent', { message: 'Hi' }, makeCtx());

        expect(result.status).toBe('complete');
        expect(result.sessionId).toBeUndefined();
      });
    });
  });

  describe('Given a runner with a store and session ownership', () => {
    describe('When user B tries to resume user A session', () => {
      it('Then throws access denied error', async () => {
        const store = memoryStore();
        const llm = mockLLM('Hello!');
        const runner = createAgentRunner([testAgent], { llm, store });

        const r1 = await runner('test-agent', { message: 'Hi' }, makeCtx({ userId: 'user-a' }));

        await expect(
          runner(
            'test-agent',
            { message: 'Hi', sessionId: r1.sessionId },
            makeCtx({ userId: 'user-b' }),
          ),
        ).rejects.toThrow('Session not found or access denied');
      });
    });
  });
});
