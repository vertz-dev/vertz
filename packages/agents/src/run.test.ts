import { describe, expect, it } from 'bun:test';
import { s } from '@vertz/schema';
import type { Message } from './loop/react-loop';
import { agent } from './agent';
import type { LLMAdapter } from './loop/react-loop';
import { run } from './run';
import { SessionAccessDeniedError, SessionNotFoundError } from './stores/errors';
import { memoryStore } from './stores/memory-store';
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

  describe('Given a custom instanceId', () => {
    describe('When run() is called with instanceId', () => {
      it('Then uses the provided instanceId as the agent context id', async () => {
        let capturedCtxId: string | undefined;
        const spyTool = tool({
          description: 'Capture context',
          input: s.object({}),
          output: s.object({}),
          handler(_input, ctx) {
            capturedCtxId = ctx.agentId;
            return {};
          },
        });

        const spyAgent = agent('spy', {
          state: s.object({}),
          initialState: {},
          tools: { spy: spyTool },
          model: { provider: 'cloudflare', model: 'test' },
          loop: { maxIterations: 5 },
        });

        const llm = mockLLM([{ toolCalls: [{ name: 'spy', arguments: {} }] }, { text: 'Done.' }]);

        await run(spyAgent, { message: 'Go', llm, instanceId: 'my-custom-id' });

        expect(capturedCtxId).toBe('my-custom-id');
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

  // ---------------------------------------------------------------------------
  // Session persistence
  // ---------------------------------------------------------------------------

  describe('Given a store is provided', () => {
    describe('When run() is called without a sessionId', () => {
      it('Then creates a new session and returns a SessionLoopResult with sessionId', async () => {
        const store = memoryStore();
        const llm = mockLLM([{ text: 'Hello!' }]);

        const result = await run(greeterAgent, { message: 'Hi', llm, store });

        expect(result.status).toBe('complete');
        expect(result.sessionId).toMatch(/^sess_/);
        expect(result.response).toBe('Hello!');
      });
    });
  });

  describe('Given a store with an existing session', () => {
    describe('When run() is called with the sessionId', () => {
      it('Then resumes the session and the LLM sees conversation history', async () => {
        const store = memoryStore();
        const messageSpy: Message[][] = [];
        let callIndex = 0;
        const responses = [
          {
            text: 'It validates JWTs.',
            toolCalls: [] as { name: string; arguments: Record<string, unknown> }[],
          },
          {
            text: 'It checks the exp claim.',
            toolCalls: [] as { name: string; arguments: Record<string, unknown> }[],
          },
        ];
        const llm: LLMAdapter = {
          async chat(messages) {
            messageSpy.push(messages.map((m) => ({ ...m })));
            const response = responses[callIndex] ?? { text: 'fallback', toolCalls: [] };
            callIndex++;
            return response;
          },
        };

        const r1 = await run(greeterAgent, { message: 'What does auth do?', llm, store });
        const r2 = await run(greeterAgent, {
          message: 'How does it validate tokens?',
          llm,
          store,
          sessionId: r1.sessionId,
        });

        expect(r2.sessionId).toBe(r1.sessionId);

        // Second call should include conversation history
        const secondCallMsgs = messageSpy[1];
        expect(
          secondCallMsgs.some((m) => m.role === 'user' && m.content === 'What does auth do?'),
        ).toBe(true);
        expect(
          secondCallMsgs.some((m) => m.role === 'assistant' && m.content === 'It validates JWTs.'),
        ).toBe(true);
        expect(
          secondCallMsgs.some(
            (m) => m.role === 'user' && m.content === 'How does it validate tokens?',
          ),
        ).toBe(true);
      });
    });
  });

  describe('Given run() without a store', () => {
    describe('When it completes', () => {
      it('Then returns a StatelessLoopResult without sessionId', async () => {
        const llm = mockLLM([{ text: 'Hello!' }]);

        const result = await run(greeterAgent, { message: 'Hi', llm });

        expect(result.status).toBe('complete');
        expect('sessionId' in result).toBe(false);
      });
    });
  });

  describe('Given a non-existent sessionId', () => {
    describe('When run() is called', () => {
      it('Then throws SessionNotFoundError', async () => {
        const store = memoryStore();
        const llm = mockLLM([{ text: 'unused' }]);

        await expect(
          run(greeterAgent, { message: 'Hi', llm, store, sessionId: 'sess_nonexistent' }),
        ).rejects.toThrow('Session not found or access denied');
      });
    });
  });

  describe('Given a session created by user A', () => {
    describe('When user B tries to resume it', () => {
      it('Then throws SessionAccessDeniedError', async () => {
        const store = memoryStore();
        const llm = mockLLM([{ text: 'Response 1' }, { text: 'Response 2' }]);

        // Create session as user A
        const r1 = await run(greeterAgent, {
          message: 'Hi',
          llm,
          store,
          userId: 'user-a',
          tenantId: 'tenant-1',
        });

        // Try to resume as user B
        await expect(
          run(greeterAgent, {
            message: 'Hi',
            llm,
            store,
            sessionId: r1.sessionId,
            userId: 'user-b',
            tenantId: 'tenant-1',
          }),
        ).rejects.toThrow('Session not found or access denied');
      });
    });
  });

  describe('Given a session created with a tenantId', () => {
    describe('When a user from a different tenant tries to resume it', () => {
      it('Then throws SessionAccessDeniedError', async () => {
        const store = memoryStore();
        const llm = mockLLM([{ text: 'Response 1' }, { text: 'Response 2' }]);

        const r1 = await run(greeterAgent, {
          message: 'Hi',
          llm,
          store,
          userId: 'user-a',
          tenantId: 'tenant-1',
        });

        await expect(
          run(greeterAgent, {
            message: 'Hi',
            llm,
            store,
            sessionId: r1.sessionId,
            userId: 'user-a',
            tenantId: 'tenant-2',
          }),
        ).rejects.toThrow('Session not found or access denied');
      });
    });
  });

  describe('Given run() results in an error status', () => {
    describe('When a store is provided', () => {
      it('Then does NOT persist messages from the failed turn', async () => {
        const store = memoryStore();
        const llm: LLMAdapter = {
          async chat() {
            throw new Error('LLM provider failed');
          },
        };

        const result = await run(greeterAgent, { message: 'Hi', llm, store });

        expect(result.status).toBe('error');
        // Session should still be created (so sessionId exists)
        expect(result.sessionId).toMatch(/^sess_/);

        // But no messages should be persisted
        const messages = await store.loadMessages(result.sessionId);
        expect(messages).toEqual([]);
      });
    });
  });

  describe('Given agent state is modified during execution', () => {
    describe('When the session is persisted', () => {
      it('Then the state is saved and available on the session', async () => {
        const store = memoryStore();
        const stateAgent = agent('stateful', {
          state: s.object({ topic: s.string() }),
          initialState: { topic: 'none' },
          tools: {},
          model: { provider: 'cloudflare', model: 'test' },
          loop: { maxIterations: 5 },
          onComplete(ctx) {
            ctx.state.topic = 'auth';
          },
        });

        const llm = mockLLM([{ text: 'Done.' }]);
        const result = await run(stateAgent, { message: 'Talk about auth', llm, store });

        const session = await store.loadSession(result.sessionId);
        expect(JSON.parse(session!.state)).toEqual({ topic: 'auth' });
      });
    });
  });

  describe('Given state was persisted and session is resumed', () => {
    describe('When the agent definition has a state schema', () => {
      it('Then restores and validates the persisted state', async () => {
        const store = memoryStore();
        let capturedState: { topic: string } | undefined;
        const stateAgent = agent('stateful', {
          state: s.object({ topic: s.string() }),
          initialState: { topic: 'none' },
          tools: {},
          model: { provider: 'cloudflare', model: 'test' },
          loop: { maxIterations: 5 },
          onStart(ctx) {
            capturedState = ctx.state as { topic: string };
          },
          onComplete(ctx) {
            ctx.state.topic = 'auth';
          },
        });

        const llm = mockLLM([{ text: 'Done 1.' }, { text: 'Done 2.' }]);
        const r1 = await run(stateAgent, { message: 'Set topic', llm, store });

        // Resume the session
        await run(stateAgent, {
          message: 'Check topic',
          llm,
          store,
          sessionId: r1.sessionId,
        });

        expect(capturedState!.topic).toBe('auth');
      });
    });
  });

  describe('Given maxStoredMessages is set to 4', () => {
    describe('When message count exceeds the cap after multiple turns', () => {
      it('Then prunes the oldest messages to stay within the limit', async () => {
        const store = memoryStore();
        const llm = mockLLM([
          { text: 'Response 1' },
          { text: 'Response 2' },
          { text: 'Response 3' },
        ]);

        // Turn 1: creates 2 messages (user + assistant)
        const r1 = await run(greeterAgent, {
          message: 'First',
          llm,
          store,
          maxStoredMessages: 4,
        });

        // Turn 2: adds 2 more messages (total 4 = at cap)
        await run(greeterAgent, {
          message: 'Second',
          llm,
          store,
          sessionId: r1.sessionId,
          maxStoredMessages: 4,
        });

        // Turn 3: adds 2 more (total would be 6, should prune to 4)
        await run(greeterAgent, {
          message: 'Third',
          llm,
          store,
          sessionId: r1.sessionId,
          maxStoredMessages: 4,
        });

        const messages = await store.loadMessages(r1.sessionId);
        expect(messages).toHaveLength(4);
        // Oldest messages (First / Response 1) should be pruned
        expect(messages[0].content).toBe('Second');
        expect(messages[1].content).toBe('Response 2');
        expect(messages[2].content).toBe('Third');
        expect(messages[3].content).toBe('Response 3');
      });
    });
  });

  describe('Given an existing session with messages and the LLM fails on resume', () => {
    describe('When run() returns an error status', () => {
      it('Then pre-existing messages are preserved and no new messages added', async () => {
        const store = memoryStore();
        let callCount = 0;
        const llm: LLMAdapter = {
          async chat() {
            callCount++;
            if (callCount === 1) {
              return { text: 'First response', toolCalls: [] };
            }
            throw new Error('LLM provider failed on resume');
          },
        };

        // Turn 1 succeeds
        const r1 = await run(greeterAgent, { message: 'Hello', llm, store });
        expect(r1.status).toBe('complete');

        const messagesBeforeResume = await store.loadMessages(r1.sessionId);
        expect(messagesBeforeResume).toHaveLength(2);

        // Turn 2 fails
        const r2 = await run(greeterAgent, {
          message: 'Resume and fail',
          llm,
          store,
          sessionId: r1.sessionId,
        });
        expect(r2.status).toBe('error');

        // Pre-existing messages must be intact, no new messages added
        const messagesAfterFailure = await store.loadMessages(r1.sessionId);
        expect(messagesAfterFailure).toHaveLength(2);
        expect(messagesAfterFailure[0].content).toBe('Hello');
        expect(messagesAfterFailure[1].content).toBe('First response');
      });
    });
  });

  describe('Given an existing session and the LLM fails on resume', () => {
    describe('When run() returns an error status', () => {
      it('Then the session state and updatedAt are NOT modified', async () => {
        const store = memoryStore();
        let callCount = 0;
        const llm: LLMAdapter = {
          async chat() {
            callCount++;
            if (callCount === 1) {
              return { text: 'Done', toolCalls: [] };
            }
            throw new Error('LLM failed');
          },
        };

        const stateAgent = agent('stateful', {
          state: s.object({ topic: s.string() }),
          initialState: { topic: 'none' },
          tools: {},
          model: { provider: 'cloudflare', model: 'test' },
          loop: { maxIterations: 5 },
          onComplete(ctx) {
            ctx.state.topic = 'set-by-turn-1';
          },
        });

        // Turn 1 succeeds and modifies state
        const r1 = await run(stateAgent, { message: 'Set state', llm, store });
        const sessionBefore = await store.loadSession(r1.sessionId);
        expect(JSON.parse(sessionBefore!.state)).toEqual({ topic: 'set-by-turn-1' });
        const updatedAtBefore = sessionBefore!.updatedAt;

        // Turn 2 fails
        const r2 = await run(stateAgent, {
          message: 'Fail now',
          llm,
          store,
          sessionId: r1.sessionId,
        });
        expect(r2.status).toBe('error');

        // Session row must be unchanged
        const sessionAfter = await store.loadSession(r1.sessionId);
        expect(JSON.parse(sessionAfter!.state)).toEqual({ topic: 'set-by-turn-1' });
        expect(sessionAfter!.updatedAt).toBe(updatedAtBefore);
      });
    });
  });

  describe('Given system prompts', () => {
    describe('When messages are persisted', () => {
      it('Then system prompt messages are NOT stored', async () => {
        const store = memoryStore();
        const llm = mockLLM([{ text: 'Hello!' }]);

        const result = await run(greeterAgent, { message: 'Hi', llm, store });

        const messages = await store.loadMessages(result.sessionId);
        expect(messages.every((m) => m.role !== 'system')).toBe(true);
      });
    });
  });

  describe('Given an agent with tools that invoke another agent', () => {
    describe('When the tool calls ctx.agents.invoke()', () => {
      it('Then the invoked agent runs and returns its response', async () => {
        // Agent B — simple responder
        const agentB = agent('responder', {
          state: s.object({}),
          initialState: {},
          tools: {},
          model: { provider: 'cloudflare', model: 'test' },
        });

        // Agent A — has a tool that invokes agent B
        let invokeResult: { response: string } | undefined;
        const invokeToolDef = tool({
          description: 'Invoke agent B',
          input: s.object({ msg: s.string() }),
          output: s.object({ response: s.string() }),
          async handler(_input, ctx) {
            invokeResult = await ctx.agents.invoke(agentB, { message: 'hello from A' });
            return { response: invokeResult.response };
          },
        });

        const agentA = agent('orchestrator', {
          state: s.object({}),
          initialState: {},
          tools: { invokeB: invokeToolDef },
          model: { provider: 'cloudflare', model: 'test' },
        });

        let callCount = 0;
        const llm: LLMAdapter = {
          async chat(messages) {
            callCount++;
            const systemMsg = messages.find((m) => m.role === 'system')?.content ?? '';
            // Agent B responds immediately
            if (systemMsg.includes('responder')) {
              return { text: 'I am agent B', toolCalls: [] };
            }
            // Agent A: first call → invoke tool, second call → complete
            if (callCount === 1) {
              return {
                text: '',
                toolCalls: [{ name: 'invokeB', arguments: { msg: 'test' } }],
              };
            }
            return { text: 'Agent A done', toolCalls: [] };
          },
        };

        const result = await run(agentA, { message: 'Orchestrate', llm });

        expect(result.status).toBe('complete');
        expect(invokeResult).toBeDefined();
        expect(invokeResult!.response).toBe('I am agent B');
      });
    });
  });

  describe('Given a ToolProvider with handler implementations', () => {
    it('Then provider handlers override the agent tool definitions', async () => {
      // Tool declaration without handler
      const myTool = tool({
        description: 'A handler-less tool',
        input: s.object({ x: s.number() }),
        output: s.object({ y: s.number() }),
      });

      const testAgent = agent('provider-test', {
        state: s.object({}),
        initialState: {},
        tools: { myTool },
        model: { provider: 'cloudflare', model: 'test' },
      });

      const handlerCalls: unknown[] = [];

      const llm = mockLLM([
        { toolCalls: [{ name: 'myTool', arguments: { x: 5 } }] },
        { text: 'done' },
      ]);

      const result = await run(testAgent, {
        message: 'Use the tool',
        llm,
        tools: {
          myTool: (input: { x: number }) => {
            handlerCalls.push(input);
            return { y: input.x * 3 };
          },
        },
      });

      expect(result.status).toBe('complete');
      expect(handlerCalls).toHaveLength(1);
      expect(handlerCalls[0]).toEqual({ x: 5 });
    });

    it('Then tools with definition handlers still work without a provider', async () => {
      const handlerCalls: unknown[] = [];
      const myTool = tool({
        description: 'Tool with handler',
        input: s.object({ x: s.number() }),
        output: s.object({ y: s.number() }),
        handler: (input) => {
          handlerCalls.push(input);
          return { y: input.x * 2 };
        },
      });

      const testAgent = agent('no-provider-test', {
        state: s.object({}),
        initialState: {},
        tools: { myTool },
        model: { provider: 'cloudflare', model: 'test' },
      });

      const llm = mockLLM([
        { toolCalls: [{ name: 'myTool', arguments: { x: 7 } }] },
        { text: 'done' },
      ]);

      const result = await run(testAgent, { message: 'Go', llm });

      expect(result.status).toBe('complete');
      expect(handlerCalls).toHaveLength(1);
      expect(handlerCalls[0]).toEqual({ x: 7 });
    });

    it('Then provider handlers take precedence over definition handlers', async () => {
      const definitionCalls: unknown[] = [];
      const providerCalls: unknown[] = [];

      const myTool = tool({
        description: 'Tool with both handlers',
        input: s.object({ x: s.number() }),
        output: s.object({ y: s.number() }),
        handler: (input) => {
          definitionCalls.push(input);
          return { y: input.x };
        },
      });

      const testAgent = agent('override-test', {
        state: s.object({}),
        initialState: {},
        tools: { myTool },
        model: { provider: 'cloudflare', model: 'test' },
      });

      const llm = mockLLM([
        { toolCalls: [{ name: 'myTool', arguments: { x: 3 } }] },
        { text: 'done' },
      ]);

      const result = await run(testAgent, {
        message: 'Go',
        llm,
        tools: {
          myTool: (input: { x: number }) => {
            providerCalls.push(input);
            return { y: input.x * 10 };
          },
        },
      });

      expect(result.status).toBe('complete');
      expect(definitionCalls).toHaveLength(0);
      expect(providerCalls).toHaveLength(1);
    });
  });

  describe('Given an agent with an output schema', () => {
    it('Then validates the response when the agent completes with valid JSON', async () => {
      const outputAgent = agent('output-valid', {
        state: s.object({}),
        initialState: {},
        tools: {
          noop: tool({
            description: 'noop',
            input: s.object({}),
            output: s.object({}),
            handler: () => ({}),
          }),
        },
        output: s.object({ summary: s.string() }),
        model: { provider: 'cloudflare', model: 'test' },
        loop: { maxIterations: 5 },
      });

      const llm = mockLLM([{ text: '{"summary": "All done"}' }]);

      const result = await run(outputAgent, { message: 'Go', llm });

      expect(result.status).toBe('complete');
      expect(result.response).toBe('{"summary": "All done"}');
    });

    it('Then returns error when the response is not valid JSON', async () => {
      const outputAgent = agent('output-bad-json', {
        state: s.object({}),
        initialState: {},
        tools: {
          noop: tool({
            description: 'noop',
            input: s.object({}),
            output: s.object({}),
            handler: () => ({}),
          }),
        },
        output: s.object({ summary: s.string() }),
        model: { provider: 'cloudflare', model: 'test' },
        loop: { maxIterations: 5 },
      });

      const llm = mockLLM([{ text: 'This is plain text, not JSON' }]);

      const result = await run(outputAgent, { message: 'Go', llm });

      expect(result.status).toBe('error');
    });

    it('Then returns error when the response JSON does not match the schema', async () => {
      const outputAgent = agent('output-schema-mismatch', {
        state: s.object({}),
        initialState: {},
        tools: {
          noop: tool({
            description: 'noop',
            input: s.object({}),
            output: s.object({}),
            handler: () => ({}),
          }),
        },
        output: s.object({ summary: s.string() }),
        model: { provider: 'cloudflare', model: 'test' },
        loop: { maxIterations: 5 },
      });

      const llm = mockLLM([{ text: '{"summary": 42}' }]);

      const result = await run(outputAgent, { message: 'Go', llm });

      expect(result.status).toBe('error');
    });

    it('Then skips output validation when the agent does not complete', async () => {
      const outputAgent = agent('output-stuck', {
        state: s.object({}),
        initialState: {},
        tools: {
          noop: tool({
            description: 'noop',
            input: s.object({}),
            output: s.object({}),
            handler: () => ({}),
          }),
        },
        output: s.object({ summary: s.string() }),
        model: { provider: 'cloudflare', model: 'test' },
        loop: { maxIterations: 1 },
      });

      const llm = mockLLM([
        { toolCalls: [{ name: 'noop', arguments: {} }] },
        { toolCalls: [{ name: 'noop', arguments: {} }] },
      ]);

      const result = await run(outputAgent, { message: 'Go', llm });

      // max-iterations, not error — output validation is skipped
      expect(result.status).toBe('max-iterations');
    });
  });
});
