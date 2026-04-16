import { describe, expect, it } from '@vertz/test';
import { s } from '@vertz/schema';
import type { ToolDefinition } from '../types';
import { type LoopResult, type LLMAdapter, type Message, reactLoop } from './react-loop';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_TOOL_CONTEXT = {
  agentId: 'test-agent-id',
  agentName: 'test-agent',
  agents: { invoke: async () => ({ response: '' }) },
};

function makeTool(name: string, handler: (input: unknown) => unknown): ToolDefinition {
  return {
    kind: 'tool',
    description: `Test tool: ${name}`,
    input: s.object({}),
    output: s.unknown(),
    handler: handler as ToolDefinition['handler'],
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
        // max-iterations now preserves the last assistant message text
        expect(result.response).toBe('[Calling noop]');
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

  describe('Given a tool whose handler returns output that does not match the output schema', () => {
    describe('When the LLM calls it', () => {
      it('Then feeds the validation error back to the LLM as a tool result', async () => {
        const badOutput: ToolDefinition = {
          kind: 'tool',
          description: 'Returns wrong type',
          input: s.object({}),
          output: s.object({ count: s.number() }),
          handler: async () => ({ count: 'not-a-number' }),
        };

        const llm = mockLLM([
          { toolCalls: [{ name: 'badOutput', arguments: {} }] },
          { text: 'The tool output was invalid' },
        ]);

        const result = await reactLoop({
          llm,
          tools: { badOutput },
          systemPrompt: 'You are helpful.',
          userMessage: 'Call badOutput',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
        });

        expect(result.status).toBe('complete');
        const toolMsg = result.messages.find((m) => m.role === 'tool');
        expect(toolMsg!.content).toContain('invalid output');
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

  // ---------------------------------------------------------------------------
  // Token budget tracking
  // ---------------------------------------------------------------------------

  describe('Given a tokenBudget with max = 1000 and stopThreshold = 0.9', () => {
    describe('When the LLM reports cumulative usage exceeding 900 tokens (90%)', () => {
      it('Then exits with status "token-budget-exhausted"', async () => {
        const noop = makeTool('noop', () => ({ ok: true }));

        // Each call reports 500 tokens — second call puts us at 1000 total (100%)
        const llm = mockLLMWithUsage([
          {
            toolCalls: [{ name: 'noop', arguments: {} }],
            usage: { inputTokens: 300, outputTokens: 200 },
          },
          {
            toolCalls: [{ name: 'noop', arguments: {} }],
            usage: { inputTokens: 300, outputTokens: 200 },
          },
          { text: 'Should not reach here', usage: { inputTokens: 100, outputTokens: 50 } },
        ]);

        const result = await reactLoop({
          llm,
          tools: { noop },
          systemPrompt: 'You are helpful.',
          userMessage: 'Do stuff',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
          tokenBudget: { max: 1000, stopThreshold: 0.9 },
        });

        expect(result.status).toBe('token-budget-exhausted');
        expect(result.tokenUsage).toBeDefined();
        expect(result.tokenUsage!.totalTokens).toBe(1000);
        expect(result.tokenUsage!.budgetUsedPercent).toBeGreaterThanOrEqual(90);
      });
    });
  });

  describe('Given a tokenBudget with warningThreshold = 0.8', () => {
    describe('When usage reaches 80%', () => {
      it('Then injects a warning system message once', async () => {
        const noop = makeTool('noop', () => ({ ok: true }));
        const capturedMessages: Message[][] = [];

        // Track messages sent to LLM at each call
        let callIndex = 0;
        const responses = [
          {
            toolCalls: [{ name: 'noop', arguments: {} }],
            usage: { inputTokens: 350, outputTokens: 50 },
          }, // 400 = 40%
          {
            toolCalls: [{ name: 'noop', arguments: {} }],
            usage: { inputTokens: 350, outputTokens: 50 },
          }, // 800 = 80% → warning
          {
            toolCalls: [{ name: 'noop', arguments: {} }],
            usage: { inputTokens: 50, outputTokens: 50 },
          }, // 900 = 90% → check no duplicate warning
          { text: 'Done' },
        ];

        const llm: LLMAdapter = {
          async chat(messages) {
            capturedMessages.push([...messages]);
            const resp = responses[callIndex++]!;
            return {
              text: resp.text ?? '',
              toolCalls: resp.toolCalls ?? [],
              usage: resp.usage,
            };
          },
        };

        const result = await reactLoop({
          llm,
          tools: { noop },
          systemPrompt: 'You are helpful.',
          userMessage: 'Do stuff',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
          tokenBudget: { max: 1000, warningThreshold: 0.8, stopThreshold: 0.95 },
        });

        expect(result.status).toBe('complete');

        // After iteration 2 (80%), a warning message should be in the messages
        const warningMessages = result.messages.filter(
          (m) => m.role === 'system' && m.content.includes('token budget'),
        );
        // Should be injected exactly once
        expect(warningMessages).toHaveLength(1);
      });
    });
  });

  describe('Given a tokenBudget with custom warningMessage', () => {
    describe('When warning threshold is reached', () => {
      it('Then uses the custom message', async () => {
        const noop = makeTool('noop', () => ({ ok: true }));

        const llm = mockLLMWithUsage([
          {
            toolCalls: [{ name: 'noop', arguments: {} }],
            usage: { inputTokens: 400, outputTokens: 100 },
          }, // 500 = 50%
          {
            toolCalls: [{ name: 'noop', arguments: {} }],
            usage: { inputTokens: 200, outputTokens: 200 },
          }, // 900 = 90%
          { text: 'Done' },
        ]);

        const result = await reactLoop({
          llm,
          tools: { noop },
          systemPrompt: 'You are helpful.',
          userMessage: 'Do stuff',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
          tokenBudget: {
            max: 1000,
            warningThreshold: 0.8,
            stopThreshold: 0.95,
            warningMessage: (pct, _used, _max) => `Custom: ${pct}% used`,
          },
        });

        const warningMsg = result.messages.find(
          (m) => m.role === 'system' && m.content.includes('Custom:'),
        );
        expect(warningMsg).toBeDefined();
        expect(warningMsg!.content).toContain('Custom:');
      });
    });
  });

  describe('Given a tokenBudget with static string warningMessage', () => {
    describe('When warning threshold is reached', () => {
      it('Then uses the static string', async () => {
        const noop = makeTool('noop', () => ({ ok: true }));

        const llm = mockLLMWithUsage([
          {
            toolCalls: [{ name: 'noop', arguments: {} }],
            usage: { inputTokens: 400, outputTokens: 100 },
          },
          {
            toolCalls: [{ name: 'noop', arguments: {} }],
            usage: { inputTokens: 200, outputTokens: 200 },
          },
          { text: 'Done' },
        ]);

        const result = await reactLoop({
          llm,
          tools: { noop },
          systemPrompt: 'You are helpful.',
          userMessage: 'Do stuff',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
          tokenBudget: {
            max: 1000,
            warningThreshold: 0.8,
            stopThreshold: 0.95,
            warningMessage: 'Heads up: running low on tokens!',
          },
        });

        const warningMsg = result.messages.find(
          (m) => m.role === 'system' && m.content === 'Heads up: running low on tokens!',
        );
        expect(warningMsg).toBeDefined();
      });
    });
  });

  describe('Given an LLM adapter that does not report usage', () => {
    describe('When tokenBudget is configured', () => {
      it('Then token budget tracking is silently skipped', async () => {
        const llm = mockLLM([{ text: 'Done.' }]);

        const result = await reactLoop({
          llm,
          tools: {},
          systemPrompt: 'You are helpful.',
          userMessage: 'Hello',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
          tokenBudget: { max: 1000 },
        });

        expect(result.status).toBe('complete');
        expect(result.tokenUsage).toBeUndefined();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Diminishing returns
  // ---------------------------------------------------------------------------

  describe('Given diminishingReturns with consecutiveThreshold = 3 and minDeltaTokens = 500', () => {
    describe('When 3 consecutive iterations each have token delta < 500', () => {
      it('Then exits with status "diminishing-returns"', async () => {
        const noop = makeTool('noop', () => ({ ok: true }));

        // Each call adds < 500 tokens (delta = 100 each)
        const llm = mockLLMWithUsage([
          {
            toolCalls: [{ name: 'noop', arguments: {} }],
            usage: { inputTokens: 80, outputTokens: 20 },
          },
          {
            toolCalls: [{ name: 'noop', arguments: {} }],
            usage: { inputTokens: 80, outputTokens: 20 },
          },
          {
            toolCalls: [{ name: 'noop', arguments: {} }],
            usage: { inputTokens: 80, outputTokens: 20 },
          },
          { text: 'Should not reach here' },
        ]);

        const result = await reactLoop({
          llm,
          tools: { noop },
          systemPrompt: 'You are helpful.',
          userMessage: 'Do stuff',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
          diminishingReturns: { consecutiveThreshold: 3, minDeltaTokens: 500 },
        });

        expect(result.status).toBe('diminishing-returns');
      });
    });
  });

  describe('Given diminishingReturns configured but adapter reports no usage', () => {
    describe('When the loop runs', () => {
      it('Then diminishing returns detection is skipped', async () => {
        // Use mockLLM (no usage) with diminishingReturns config
        const noop = makeTool('noop', () => ({ ok: true }));
        const llm = mockLLM([
          { toolCalls: [{ name: 'noop', arguments: {} }] },
          { toolCalls: [{ name: 'noop', arguments: {} }] },
          { toolCalls: [{ name: 'noop', arguments: {} }] },
          { text: 'Done' },
        ]);

        const result = await reactLoop({
          llm,
          tools: { noop },
          systemPrompt: 'You are helpful.',
          userMessage: 'Do stuff',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
          diminishingReturns: { consecutiveThreshold: 3, minDeltaTokens: 500 },
        });

        // Should NOT exit with diminishing-returns since no usage is reported
        expect(result.status).toBe('complete');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Backward compatibility
  // ---------------------------------------------------------------------------

  describe('Given an agent with NO new config (tokenBudget, diminishingReturns)', () => {
    describe('When the agent runs', () => {
      it('Then result.tokenUsage is undefined and behavior is unchanged', async () => {
        const llm = mockLLM([{ text: 'Done.' }]);

        const result = await reactLoop({
          llm,
          tools: {},
          systemPrompt: 'You are helpful.',
          userMessage: 'Hello',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
        });

        expect(result.status).toBe('complete');
        expect(result.tokenUsage).toBeUndefined();
        expect(result.compressionCount).toBeUndefined();
        expect(result.toolCallSummary).toBeUndefined();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Parallel tool execution
  // ---------------------------------------------------------------------------

  describe('Given tools with parallel: true', () => {
    describe('When LLM returns multiple parallel tool calls', () => {
      it('Then they execute concurrently', async () => {
        const executionLog: string[] = [];

        const parallelA = makeParallelTool('parallel-a', async () => {
          executionLog.push('a-start');
          await sleep(50);
          executionLog.push('a-end');
          return { result: 'A' };
        });

        const parallelB = makeParallelTool('parallel-b', async () => {
          executionLog.push('b-start');
          await sleep(50);
          executionLog.push('b-end');
          return { result: 'B' };
        });

        const llm = mockLLM([
          {
            toolCalls: [
              { name: 'parallelA', arguments: {} },
              { name: 'parallelB', arguments: {} },
            ],
          },
          { text: 'Done' },
        ]);

        const result = await reactLoop({
          llm,
          tools: { parallelA, parallelB },
          systemPrompt: 'You are helpful.',
          userMessage: 'Do both',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
        });

        expect(result.status).toBe('complete');
        // Both started before either ended → concurrent
        expect(executionLog[0]).toBe('a-start');
        expect(executionLog[1]).toBe('b-start');
      });
    });
  });

  describe('Given interleaved parallel/serial tool calls', () => {
    describe('When LLM returns [parallel-A, serial-B, parallel-C, parallel-D]', () => {
      it('Then partitioned into maximal consecutive batches', async () => {
        const executionOrder: string[] = [];

        const parallelA = makeParallelTool('parallel-a', async () => {
          executionOrder.push('A');
          return { result: 'A' };
        });
        const serialB = makeTool('serial-b', () => {
          executionOrder.push('B');
          return { result: 'B' };
        });
        const parallelC = makeParallelTool('parallel-c', async () => {
          executionOrder.push('C');
          return { result: 'C' };
        });
        const parallelD = makeParallelTool('parallel-d', async () => {
          executionOrder.push('D');
          return { result: 'D' };
        });

        const llm = mockLLM([
          {
            toolCalls: [
              { name: 'parallelA', arguments: {} },
              { name: 'serialB', arguments: {} },
              { name: 'parallelC', arguments: {} },
              { name: 'parallelD', arguments: {} },
            ],
          },
          { text: 'Done' },
        ]);

        const result = await reactLoop({
          llm,
          tools: { parallelA, serialB, parallelC, parallelD },
          systemPrompt: 'You are helpful.',
          userMessage: 'Do all',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
        });

        expect(result.status).toBe('complete');
        // A runs first (batch 1), then B (batch 2), then C and D (batch 3)
        expect(executionOrder.indexOf('A')).toBeLessThan(executionOrder.indexOf('B'));
        expect(executionOrder.indexOf('B')).toBeLessThan(executionOrder.indexOf('C'));
        expect(executionOrder.indexOf('B')).toBeLessThan(executionOrder.indexOf('D'));
      });
    });
  });

  describe('Given concurrent tools where one throws an error', () => {
    describe('When both parallel tools are called', () => {
      it('Then sibling tools still complete and both results are returned', async () => {
        const parallelOk = makeParallelTool('parallel-ok', async () => {
          return { result: 'success' };
        });
        const parallelFail = makeParallelTool('parallel-fail', async () => {
          throw new Error('Tool crashed');
        });

        const llm = mockLLM([
          {
            toolCalls: [
              { name: 'parallelOk', arguments: {} },
              { name: 'parallelFail', arguments: {} },
            ],
          },
          { text: 'One succeeded, one failed' },
        ]);

        const result = await reactLoop({
          llm,
          tools: { parallelOk, parallelFail },
          systemPrompt: 'You are helpful.',
          userMessage: 'Try both',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
        });

        expect(result.status).toBe('complete');
        const toolMessages = result.messages.filter((m) => m.role === 'tool');
        expect(toolMessages).toHaveLength(2);
        // One succeeded
        const okMsg = toolMessages.find((m) => m.toolName === 'parallelOk');
        expect(okMsg!.content).toContain('success');
        // One errored
        const failMsg = toolMessages.find((m) => m.toolName === 'parallelFail');
        expect(failMsg!.content).toContain('Tool crashed');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Context compression
  // ---------------------------------------------------------------------------

  describe('Given contextCompression.maxMessages = 5', () => {
    describe('When messages exceed threshold during the loop', () => {
      it('Then compress callback is invoked with non-system messages', async () => {
        let compressedInput: Message[] = [];
        const noop = makeTool('noop', () => ({ ok: true }));

        // System + user + (assistant + tool) × 3 iterations = 8 messages before compression check
        const llm = mockLLM([
          { toolCalls: [{ name: 'noop', arguments: {} }] }, // iter 1: +2 messages (assistant + tool) = 4 total
          { toolCalls: [{ name: 'noop', arguments: {} }] }, // iter 2: +2 = 6 total → exceeds 5 → compress fires before iter 3
          { text: 'Done' }, // iter 3
        ]);

        const result = await reactLoop({
          llm,
          tools: { noop },
          systemPrompt: 'You are helpful.',
          userMessage: 'Do stuff',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
          contextCompression: {
            maxMessages: 5,
            compress: (msgs) => {
              compressedInput = [...msgs];
              // Return a summary
              return [{ role: 'assistant', content: 'Summary of previous work.' }];
            },
          },
        });

        expect(result.status).toBe('complete');
        // compress() should NOT receive the system prompt
        expect(
          compressedInput.every(
            (m) => m.role !== 'system' || !m.content.includes('You are helpful'),
          ),
        ).toBe(true);
        expect(result.compressionCount).toBe(1);
      });

      it('Then system prompt is auto-re-prepended after compression', async () => {
        let capturedMessages: Message[] = [];
        const noop = makeTool('noop', () => ({ ok: true }));

        let callCount = 0;
        const llm: LLMAdapter = {
          async chat(messages) {
            callCount++;
            // Capture messages on call 3 (after compression)
            if (callCount === 3) {
              capturedMessages = [...messages];
            }
            if (callCount <= 2) {
              return { text: '', toolCalls: [{ name: 'noop', arguments: {} }] };
            }
            return { text: 'Done', toolCalls: [] };
          },
        };

        await reactLoop({
          llm,
          tools: { noop },
          systemPrompt: 'You are helpful.',
          userMessage: 'Do stuff',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
          contextCompression: {
            maxMessages: 5,
            compress: () => [{ role: 'assistant', content: 'Summary.' }],
          },
        });

        // First message should still be the system prompt
        expect(capturedMessages[0]?.role).toBe('system');
        expect(capturedMessages[0]?.content).toBe('You are helpful.');
      });
    });

    describe('When compress returns empty array', () => {
      it('Then throws an error', async () => {
        const noop = makeTool('noop', () => ({ ok: true }));

        const llm = mockLLM([
          { toolCalls: [{ name: 'noop', arguments: {} }] },
          { toolCalls: [{ name: 'noop', arguments: {} }] },
          { text: 'Done' },
        ]);

        await expect(
          reactLoop({
            llm,
            tools: { noop },
            systemPrompt: 'You are helpful.',
            userMessage: 'Do stuff',
            maxIterations: 10,
            toolContext: TEST_TOOL_CONTEXT,
            contextCompression: {
              maxMessages: 5,
              compress: () => [],
            },
          }),
        ).rejects.toThrow('Context compression returned empty message array');
      });
    });
  });

  describe('Given contextCompression.maxTokenEstimate = 100', () => {
    describe('When estimated tokens exceed threshold', () => {
      it('Then compress callback is invoked', async () => {
        let compressCalled = false;
        const noop = makeTool('noop', () => ({ ok: true }));

        // Each message adds ~content.length/4 estimated tokens
        const llm = mockLLM([{ toolCalls: [{ name: 'noop', arguments: {} }] }, { text: 'Done' }]);

        const result = await reactLoop({
          llm,
          tools: { noop },
          systemPrompt: 'A'.repeat(200), // 200 chars = ~50 tokens
          userMessage: 'B'.repeat(200), // another ~50 = ~100 total
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
          contextCompression: {
            maxTokenEstimate: 100,
            compress: (msgs) => {
              compressCalled = true;
              return [msgs[msgs.length - 1]!]; // keep last message
            },
          },
        });

        expect(result.status).toBe('complete');
        expect(compressCalled).toBe(true);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Tool call summary
  // ---------------------------------------------------------------------------

  describe('Given an agent that calls tools during execution', () => {
    describe('When the loop completes', () => {
      it('Then result.toolCallSummary contains { toolName, callCount } entries', async () => {
        const readFile = makeTool('read-file', () => ({ content: 'data' }));
        const writeFile = makeTool('write-file', () => ({ ok: true }));

        const llm = mockLLM([
          { toolCalls: [{ name: 'readFile', arguments: {} }] },
          {
            toolCalls: [
              { name: 'readFile', arguments: {} },
              { name: 'writeFile', arguments: {} },
            ],
          },
          { text: 'Done' },
        ]);

        const result = await reactLoop({
          llm,
          tools: { readFile, writeFile },
          systemPrompt: 'You are helpful.',
          userMessage: 'Do stuff',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
        });

        expect(result.status).toBe('complete');
        expect(result.toolCallSummary).toBeDefined();
        expect(result.toolCallSummary).toHaveLength(2);

        const readEntry = result.toolCallSummary!.find((e) => e.toolName === 'readFile');
        expect(readEntry!.callCount).toBe(2);

        const writeEntry = result.toolCallSummary!.find((e) => e.toolName === 'writeFile');
        expect(writeEntry!.callCount).toBe(1);
      });
    });
  });

  describe('Given an agent that calls no tools', () => {
    describe('When the loop completes', () => {
      it('Then result.toolCallSummary is undefined', async () => {
        const llm = mockLLM([{ text: 'Done.' }]);
        const result = await reactLoop({
          llm,
          tools: {},
          systemPrompt: 'You are helpful.',
          userMessage: 'Hello',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
        });
        expect(result.toolCallSummary).toBeUndefined();
      });
    });
  });

  describe('Given contextCompression configured but threshold not reached', () => {
    describe('When loop runs with few messages', () => {
      it('Then compressionCount is 0', async () => {
        const llm = mockLLM([{ text: 'Done.' }]);
        const result = await reactLoop({
          llm,
          tools: {},
          systemPrompt: 'You are helpful.',
          userMessage: 'Hello',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
          contextCompression: {
            maxMessages: 100,
            compress: () => [{ role: 'assistant', content: 'Summary' }],
          },
        });
        expect(result.compressionCount).toBe(0);
      });
    });
  });

  describe('Given no contextCompression config', () => {
    describe('When loop runs', () => {
      it('Then compressionCount is undefined', async () => {
        const llm = mockLLM([{ text: 'Done.' }]);
        const result = await reactLoop({
          llm,
          tools: {},
          systemPrompt: 'You are helpful.',
          userMessage: 'Hello',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
        });
        expect(result.compressionCount).toBeUndefined();
      });
    });
  });

  describe('Given maxToolConcurrency = 2 and 4 parallel tool calls', () => {
    describe('When the tools execute', () => {
      it('Then at most 2 tools run at the same time', async () => {
        let currentRunning = 0;
        let maxRunning = 0;

        const makeThrottledTool = (name: string): ToolDefinition => ({
          kind: 'tool',
          description: `Throttled: ${name}`,
          input: s.object({}),
          output: s.object({}),
          parallel: true,
          async handler() {
            currentRunning++;
            maxRunning = Math.max(maxRunning, currentRunning);
            await sleep(30);
            currentRunning--;
            return { ok: true };
          },
        });

        const llm = mockLLM([
          {
            toolCalls: [
              { name: 't1', arguments: {} },
              { name: 't2', arguments: {} },
              { name: 't3', arguments: {} },
              { name: 't4', arguments: {} },
            ],
          },
          { text: 'Done' },
        ]);

        const result = await reactLoop({
          llm,
          tools: {
            t1: makeThrottledTool('t1'),
            t2: makeThrottledTool('t2'),
            t3: makeThrottledTool('t3'),
            t4: makeThrottledTool('t4'),
          },
          systemPrompt: 'You are helpful.',
          userMessage: 'Run 4 tools',
          maxIterations: 10,
          toolContext: TEST_TOOL_CONTEXT,
          maxToolConcurrency: 2,
        });

        expect(result.status).toBe('complete');
        expect(maxRunning).toBeLessThanOrEqual(2);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeParallelTool(name: string, handler: (input: unknown) => unknown): ToolDefinition {
  return {
    kind: 'tool',
    description: `Parallel test tool: ${name}`,
    input: s.object({}),
    output: s.unknown(),
    handler: handler as ToolDefinition['handler'],
    parallel: true,
  };
}

// ---------------------------------------------------------------------------
// Test helper: mock LLM with usage reporting
// ---------------------------------------------------------------------------

function mockLLMWithUsage(
  responses: Array<{
    text?: string;
    toolCalls?: Array<{ id?: string; name: string; arguments: Record<string, unknown> }>;
    usage?: { inputTokens: number; outputTokens: number };
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
        usage: response.usage,
      };
    },
  };
}
