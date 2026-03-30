import { describe, expect, it } from 'bun:test';
import { s } from '@vertz/schema';
import type { ToolDefinition } from '../types';
import { type LoopResult, type LLMAdapter, reactLoop } from './react-loop';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_TOOL_CONTEXT = { agentId: 'test-agent-id', agentName: 'test-agent' };

function makeTool(name: string, handler: (input: unknown) => unknown): ToolDefinition {
  return {
    kind: 'tool',
    description: `Test tool: ${name}`,
    input: s.object({}),
    output: s.object({}),
    handler: handler as ToolDefinition['handler'],
    execution: 'server',
  };
}

/** Builds a mock LLM adapter from a sequence of responses. */
function mockLLM(
  responses: Array<{
    text?: string;
    toolCalls?: Array<{ id?: string; name: string; arguments: Record<string, unknown> }>;
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

describe('reactLoop()', () => {
  describe('Given an LLM that responds with text only (no tool calls)', () => {
    describe('When reactLoop is executed', () => {
      it('Then completes in one iteration with the text response', async () => {
        const llm = mockLLM([{ text: 'The answer is 42.' }]);

        const result = await reactLoop({
          llm,
          tools: {},
          systemPrompt: 'You are helpful.',
          userMessage: 'What is the answer?',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
        });

        expect(result.status).toBe('complete');
        expect(result.response).toBe('The answer is 42.');
        expect(result.iterations).toBe(1);
      });
    });
  });

  describe('Given an LLM that calls a tool then responds', () => {
    describe('When reactLoop is executed', () => {
      it('Then executes the tool and passes the result back to the LLM', async () => {
        const readFile = makeTool('read-file', () => ({ content: 'Hello world' }));

        const llm = mockLLM([
          { toolCalls: [{ name: 'readFile', arguments: { path: 'test.txt' } }] },
          { text: 'The file contains: Hello world' },
        ]);

        const result = await reactLoop({
          llm,
          tools: { readFile },
          systemPrompt: 'You are helpful.',
          userMessage: 'Read test.txt',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
        });

        expect(result.status).toBe('complete');
        expect(result.response).toBe('The file contains: Hello world');
        expect(result.iterations).toBe(2);
      });
    });
  });

  describe('Given an LLM that exceeds maxIterations', () => {
    describe('When reactLoop is executed', () => {
      it('Then stops with status "max-iterations"', async () => {
        // LLM always calls a tool — never stops
        const noop = makeTool('noop', () => ({}));
        const llm = mockLLM([
          { toolCalls: [{ name: 'noop', arguments: {} }] },
          { toolCalls: [{ name: 'noop', arguments: {} }] },
          { toolCalls: [{ name: 'noop', arguments: {} }] },
          { toolCalls: [{ name: 'noop', arguments: {} }] },
        ]);

        const result = await reactLoop({
          llm,
          tools: { noop },
          systemPrompt: 'You are helpful.',
          userMessage: 'Do something',
          maxIterations: 3,
          toolContext: TEST_TOOL_CONTEXT,
        });

        expect(result.status).toBe('max-iterations');
        expect(result.iterations).toBe(3);
      });
    });
  });

  describe('Given an LLM that calls a non-existent tool', () => {
    describe('When reactLoop is executed', () => {
      it('Then feeds an error message back to the LLM', async () => {
        const llm = mockLLM([
          { toolCalls: [{ name: 'nonExistent', arguments: {} }] },
          { text: 'Sorry, that tool does not exist.' },
        ]);

        const result = await reactLoop({
          llm,
          tools: {},
          systemPrompt: 'You are helpful.',
          userMessage: 'Use nonExistent tool',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
        });

        expect(result.status).toBe('complete');
        expect(result.iterations).toBe(2);
      });
    });
  });

  describe('Given a tool that throws an error', () => {
    describe('When the LLM calls it', () => {
      it('Then feeds the error back to the LLM as a tool result', async () => {
        const failing = makeTool('failing', () => {
          throw new Error('Connection refused');
        });

        const llm = mockLLM([
          { toolCalls: [{ name: 'failing', arguments: {} }] },
          { text: 'The tool failed with: Connection refused' },
        ]);

        const result = await reactLoop({
          llm,
          tools: { failing },
          systemPrompt: 'You are helpful.',
          userMessage: 'Try failing tool',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
        });

        expect(result.status).toBe('complete');
        expect(result.response).toBe('The tool failed with: Connection refused');
        expect(result.iterations).toBe(2);
      });
    });
  });

  describe('Given an LLM that calls multiple tools in one response', () => {
    describe('When reactLoop is executed', () => {
      it('Then executes all tools and passes all results back', async () => {
        const toolA = makeTool('tool-a', () => ({ result: 'A' }));
        const toolB = makeTool('tool-b', () => ({ result: 'B' }));

        const llm = mockLLM([
          {
            toolCalls: [
              { name: 'toolA', arguments: {} },
              { name: 'toolB', arguments: {} },
            ],
          },
          { text: 'Got results from both tools.' },
        ]);

        const result = await reactLoop({
          llm,
          tools: { toolA, toolB },
          systemPrompt: 'You are helpful.',
          userMessage: 'Use both tools',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
        });

        expect(result.status).toBe('complete');
        expect(result.iterations).toBe(2);
      });
    });
  });

  describe('Given a checkpoint callback', () => {
    describe('When checkpointInterval iterations pass', () => {
      it('Then calls the checkpoint callback at the right intervals', async () => {
        const noop = makeTool('noop', () => ({}));
        const checkpoints: number[] = [];

        const llm = mockLLM([
          { toolCalls: [{ name: 'noop', arguments: {} }] },
          { toolCalls: [{ name: 'noop', arguments: {} }] },
          { toolCalls: [{ name: 'noop', arguments: {} }] },
          { toolCalls: [{ name: 'noop', arguments: {} }] },
          { text: 'Done.' },
        ]);

        await reactLoop({
          llm,
          tools: { noop },
          systemPrompt: 'You are helpful.',
          userMessage: 'Do stuff',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
          checkpointInterval: 2,
          onCheckpoint(iteration, _messages) {
            checkpoints.push(iteration);
          },
        });

        expect(checkpoints).toEqual([2, 4]);
      });
    });
  });

  describe('Given a tool with a typed input schema', () => {
    describe('When the LLM passes invalid input', () => {
      it('Then feeds a validation error back to the LLM instead of calling the handler', async () => {
        const typedTool: ToolDefinition = {
          kind: 'tool',
          description: 'Requires a name string',
          input: s.object({ name: s.string() }),
          output: s.object({ greeting: s.string() }),
          handler(input: { name: string }) {
            return { greeting: `Hi ${input.name}` };
          },
          execution: 'server',
        };

        const llm = mockLLM([
          // LLM passes number instead of string
          { toolCalls: [{ name: 'greet', arguments: { name: 42 } }] },
          { text: 'Validation failed, got it.' },
        ]);

        const result = await reactLoop({
          llm,
          tools: { greet: typedTool },
          systemPrompt: 'You are helpful.',
          userMessage: 'Greet someone',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
        });

        expect(result.status).toBe('complete');
        expect(result.iterations).toBe(2);
        // The tool error message should contain validation info
        const toolMessage = result.messages.find(
          (m) => m.role === 'tool' && m.toolName === 'greet',
        );
        expect(toolMessage).toBeDefined();
        expect(toolMessage!.content).toContain('Invalid input');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Stuck detection (B2)
  // ---------------------------------------------------------------------------

  describe('Given a stuckThreshold of 2 and all tool calls fail', () => {
    describe('When the agent makes 2 consecutive no-progress iterations', () => {
      it('Then returns status "stuck"', async () => {
        const failing = makeTool('failing', () => {
          throw new Error('Always fails');
        });

        const llm = mockLLM([
          { toolCalls: [{ name: 'failing', arguments: {} }] },
          { toolCalls: [{ name: 'failing', arguments: {} }] },
          { toolCalls: [{ name: 'failing', arguments: {} }] },
        ]);

        const result = await reactLoop({
          llm,
          tools: { failing },
          systemPrompt: 'You are helpful.',
          userMessage: 'Do something',
          maxIterations: 10,
          stuckThreshold: 2,
          toolContext: TEST_TOOL_CONTEXT,
        });

        expect(result.status).toBe('stuck');
        expect(result.iterations).toBe(2);
      });
    });
  });

  describe('Given a stuckThreshold and a successful tool call resets the counter', () => {
    describe('When the agent recovers after a failed iteration', () => {
      it('Then does not report stuck', async () => {
        let callCount = 0;
        const sometimesFails = makeTool('flaky', () => {
          callCount++;
          // Fails on first call, succeeds on second
          if (callCount === 1) throw new Error('Transient failure');
          return { ok: true };
        });

        const llm = mockLLM([
          { toolCalls: [{ name: 'flaky', arguments: {} }] }, // fails → noProgress = 1
          { toolCalls: [{ name: 'flaky', arguments: {} }] }, // succeeds → noProgress = 0
          { text: 'Done.' },
        ]);

        const result = await reactLoop({
          llm,
          tools: { flaky: sometimesFails },
          systemPrompt: 'You are helpful.',
          userMessage: 'Try it',
          maxIterations: 10,
          stuckThreshold: 2,
          toolContext: TEST_TOOL_CONTEXT,
        });

        expect(result.status).toBe('complete');
        expect(result.iterations).toBe(3);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // LLM error handling (B3)
  // ---------------------------------------------------------------------------

  describe('Given an LLM adapter that throws an error', () => {
    describe('When the loop calls llm.chat()', () => {
      it('Then returns status "error" with the error message', async () => {
        const llm: LLMAdapter = {
          async chat() {
            throw new Error('Provider rate limit exceeded');
          },
        };

        const result = await reactLoop({
          llm,
          tools: {},
          systemPrompt: 'You are helpful.',
          userMessage: 'Hello',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
        });

        expect(result.status).toBe('error');
        expect(result.response).toBe('Provider rate limit exceeded');
        expect(result.iterations).toBe(1);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Tool call ID passthrough (S2)
  // ---------------------------------------------------------------------------

  describe('Given an LLM that returns tool calls with IDs', () => {
    describe('When the loop executes tools', () => {
      it('Then uses the LLM-provided ID in the tool result message', async () => {
        const noop = makeTool('noop', () => ({ ok: true }));

        const llm = mockLLM([
          { toolCalls: [{ id: 'call_abc123', name: 'noop', arguments: {} }] },
          { text: 'Done.' },
        ]);

        const result = await reactLoop({
          llm,
          tools: { noop },
          systemPrompt: 'You are helpful.',
          userMessage: 'Do it',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
        });

        const toolMsg = result.messages.find((m) => m.role === 'tool');
        expect(toolMsg).toBeDefined();
        expect(toolMsg!.toolCallId).toBe('call_abc123');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Messages array immutability (S7)
  // ---------------------------------------------------------------------------

  describe('Given a completed loop result', () => {
    describe('When inspecting the messages array', () => {
      it('Then the messages array is frozen', async () => {
        const llm = mockLLM([{ text: 'Done.' }]);

        const result = await reactLoop({
          llm,
          tools: {},
          systemPrompt: 'You are helpful.',
          userMessage: 'Hello',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
        });

        expect(Object.isFrozen(result.messages)).toBe(true);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // previousMessages — conversation history injection
  // ---------------------------------------------------------------------------

  describe('Given previousMessages from a stored session', () => {
    describe('When reactLoop is executed', () => {
      it('Then injects them between system prompt and new user message', async () => {
        let capturedMessages: { role: string; content: string }[] = [];
        const llm: LLMAdapter = {
          async chat(messages) {
            // Snapshot the messages at call time (array is mutated later)
            capturedMessages = messages.map((m) => ({ role: m.role, content: m.content }));
            return { text: 'I remember!', toolCalls: [] };
          },
        };

        await reactLoop({
          llm,
          tools: {},
          systemPrompt: 'You are helpful.',
          userMessage: 'What did I ask before?',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
          previousMessages: [
            { role: 'user', content: 'What is 2+2?' },
            { role: 'assistant', content: 'It is 4.' },
          ],
        });

        expect(capturedMessages).toHaveLength(4);
        expect(capturedMessages[0].role).toBe('system');
        expect(capturedMessages[1].role).toBe('user');
        expect(capturedMessages[1].content).toBe('What is 2+2?');
        expect(capturedMessages[2].role).toBe('assistant');
        expect(capturedMessages[2].content).toBe('It is 4.');
        expect(capturedMessages[3].role).toBe('user');
        expect(capturedMessages[3].content).toBe('What did I ask before?');
      });
    });
  });

  describe('Given no previousMessages (undefined)', () => {
    describe('When reactLoop is executed', () => {
      it('Then starts with just system prompt and user message (backward compat)', async () => {
        let capturedMessages: { role: string; content: string }[] = [];
        const llm: LLMAdapter = {
          async chat(messages) {
            // Snapshot at call time (array is mutated later)
            capturedMessages = messages.map((m) => ({ role: m.role, content: m.content }));
            return { text: 'Hello!', toolCalls: [] };
          },
        };

        await reactLoop({
          llm,
          tools: {},
          systemPrompt: 'You are helpful.',
          userMessage: 'Hi',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
        });

        expect(capturedMessages).toHaveLength(2);
        expect(capturedMessages[0].role).toBe('system');
        expect(capturedMessages[1].role).toBe('user');
      });
    });
  });
});
