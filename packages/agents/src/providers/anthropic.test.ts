import { afterEach, describe, expect, it, mock } from '@vertz/test';
import { s } from '@vertz/schema';
import { tool } from '../tool';
import { createAnthropicAdapter } from './anthropic';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

function mockFetch(response: unknown, status = 200) {
  globalThis.fetch = mock(async () => new Response(JSON.stringify(response), { status }));
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.ANTHROPIC_API_KEY = originalEnv.ANTHROPIC_API_KEY;
});

const testTool = tool({
  description: 'Test tool',
  input: s.object({ x: s.string() }),
  output: s.object({ y: s.string() }),
  handler(input) {
    return { y: input.x };
  },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createAnthropicAdapter()', () => {
  describe('Given a valid ANTHROPIC_API_KEY and a text-only response', () => {
    describe('When chat() is called', () => {
      it('Then sends a request to the Anthropic messages endpoint', async () => {
        process.env.ANTHROPIC_API_KEY = 'test-key';

        mockFetch({
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello!' }],
          model: 'claude-sonnet-4-6',
          stop_reason: 'end_turn',
          usage: { input_tokens: 12, output_tokens: 3 },
        });

        const adapter = createAnthropicAdapter({
          config: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
          tools: { test: testTool },
        });

        const result = await adapter.chat([
          { role: 'system', content: 'Be helpful.' },
          { role: 'user', content: 'Hi' },
        ]);

        expect(result.text).toBe('Hello!');
        expect(result.toolCalls).toEqual([]);
        expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 3 });

        const fetchMock = globalThis.fetch as ReturnType<typeof mock>;
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.anthropic.com/v1/messages');
        expect(options.method).toBe('POST');
        expect(options.headers['x-api-key']).toBe('test-key');
        expect(options.headers['anthropic-version']).toBe('2023-06-01');
        expect(options.headers['content-type']).toBe('application/json');

        const body = JSON.parse(options.body);
        expect(body.model).toBe('claude-sonnet-4-6');
        expect(body.system).toBe('Be helpful.');
        expect(body.messages).toEqual([{ role: 'user', content: 'Hi' }]);
        expect(body.max_tokens).toBeGreaterThan(0);
        expect(body.tools).toHaveLength(1);
        expect(body.tools[0].name).toBe('test');
        expect(body.tools[0].description).toBe('Test tool');
        expect(body.tools[0].input_schema).toEqual({
          type: 'object',
          properties: { x: { type: 'string' } },
          required: ['x'],
        });
      });
    });
  });

  describe('Given a response with tool_use content blocks', () => {
    describe('When chat() is called', () => {
      it('Then parses tool calls from the response', async () => {
        process.env.ANTHROPIC_API_KEY = 'k';

        mockFetch({
          id: 'msg_2',
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me use a tool.' },
            {
              type: 'tool_use',
              id: 'toolu_abc',
              name: 'test',
              input: { x: 'hello' },
            },
          ],
          model: 'claude-sonnet-4-6',
          stop_reason: 'tool_use',
          usage: { input_tokens: 5, output_tokens: 8 },
        });

        const adapter = createAnthropicAdapter({
          config: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
          tools: { test: testTool },
        });

        const result = await adapter.chat([{ role: 'user', content: 'Use test tool' }]);

        expect(result.text).toBe('Let me use a tool.');
        expect(result.toolCalls).toEqual([
          { id: 'toolu_abc', name: 'test', arguments: { x: 'hello' } },
        ]);
      });
    });
  });

  describe('Given multiple system messages in the conversation', () => {
    describe('When chat() is called', () => {
      it('Then concatenates them into the top-level system field', async () => {
        process.env.ANTHROPIC_API_KEY = 'k';

        mockFetch({
          id: 'm',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'ok' }],
          model: 'claude-sonnet-4-6',
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
        });

        const adapter = createAnthropicAdapter({
          config: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
          tools: {},
        });

        await adapter.chat([
          { role: 'system', content: 'Rule one.' },
          { role: 'user', content: 'Hi' },
          { role: 'system', content: 'Rule two.' },
        ]);

        const fetchMock = globalThis.fetch as ReturnType<typeof mock>;
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.system).toBe('Rule one.\n\nRule two.');
        expect(body.messages).toEqual([{ role: 'user', content: 'Hi' }]);
      });
    });
  });

  describe('Given an assistant message with tool calls followed by tool result messages', () => {
    describe('When chat() is called', () => {
      it('Then converts tool calls to tool_use blocks and tool results to a user message with tool_result blocks', async () => {
        process.env.ANTHROPIC_API_KEY = 'k';

        mockFetch({
          id: 'm',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Done' }],
          model: 'claude-sonnet-4-6',
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
        });

        const adapter = createAnthropicAdapter({
          config: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
          tools: { test: testTool },
        });

        await adapter.chat([
          { role: 'user', content: 'Run two tools' },
          {
            role: 'assistant',
            content: '[Calling test, test]',
            toolCalls: [
              { id: 'toolu_1', name: 'test', arguments: { x: 'a' } },
              { id: 'toolu_2', name: 'test', arguments: { x: 'b' } },
            ],
          },
          { role: 'tool', toolCallId: 'toolu_1', toolName: 'test', content: '{"y":"a"}' },
          { role: 'tool', toolCallId: 'toolu_2', toolName: 'test', content: '{"y":"b"}' },
          { role: 'user', content: 'thanks' },
        ]);

        const fetchMock = globalThis.fetch as ReturnType<typeof mock>;
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);

        expect(body.messages).toEqual([
          { role: 'user', content: 'Run two tools' },
          {
            role: 'assistant',
            content: [
              { type: 'tool_use', id: 'toolu_1', name: 'test', input: { x: 'a' } },
              { type: 'tool_use', id: 'toolu_2', name: 'test', input: { x: 'b' } },
            ],
          },
          {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'toolu_1', content: '{"y":"a"}' },
              { type: 'tool_result', tool_use_id: 'toolu_2', content: '{"y":"b"}' },
            ],
          },
          { role: 'user', content: 'thanks' },
        ]);
      });
    });
  });

  describe('Given an assistant message with both text and tool calls', () => {
    describe('When chat() is called', () => {
      it('Then emits text and tool_use blocks together in the assistant content array', async () => {
        process.env.ANTHROPIC_API_KEY = 'k';

        mockFetch({
          id: 'm',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'done' }],
          model: 'claude-sonnet-4-6',
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
        });

        const adapter = createAnthropicAdapter({
          config: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
          tools: { test: testTool },
        });

        await adapter.chat([
          { role: 'user', content: 'q' },
          {
            role: 'assistant',
            content: 'Thinking out loud.',
            toolCalls: [{ id: 'toolu_1', name: 'test', arguments: { x: 'a' } }],
          },
          { role: 'tool', toolCallId: 'toolu_1', toolName: 'test', content: '{"y":"a"}' },
        ]);

        const fetchMock = globalThis.fetch as ReturnType<typeof mock>;
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.messages[1]).toEqual({
          role: 'assistant',
          content: [
            { type: 'text', text: 'Thinking out loud.' },
            { type: 'tool_use', id: 'toolu_1', name: 'test', input: { x: 'a' } },
          ],
        });
      });
    });
  });

  describe('Given missing ANTHROPIC_API_KEY', () => {
    describe('When createAnthropicAdapter is called', () => {
      it('Then throws a configuration error', () => {
        delete process.env.ANTHROPIC_API_KEY;

        expect(() =>
          createAnthropicAdapter({
            config: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
            tools: {},
          }),
        ).toThrow('ANTHROPIC_API_KEY');
      });
    });
  });

  describe('Given the API returns a non-OK status', () => {
    describe('When chat() is called', () => {
      it('Then throws an error with the status and body', async () => {
        process.env.ANTHROPIC_API_KEY = 'k';

        mockFetch({ error: { type: 'authentication_error', message: 'invalid key' } }, 401);

        const adapter = createAnthropicAdapter({
          config: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
          tools: {},
        });

        await expect(adapter.chat([{ role: 'user', content: 'Hi' }])).rejects.toThrow(
          'Anthropic API request failed (401)',
        );
      });
    });
  });

  describe('Given no tools are provided', () => {
    describe('When chat() is called', () => {
      it('Then omits the tools field from the request body', async () => {
        process.env.ANTHROPIC_API_KEY = 'k';

        mockFetch({
          id: 'm',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'ok' }],
          model: 'claude-sonnet-4-6',
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
        });

        const adapter = createAnthropicAdapter({
          config: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
          tools: {},
        });

        await adapter.chat([{ role: 'user', content: 'Hi' }]);

        const fetchMock = globalThis.fetch as ReturnType<typeof mock>;
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.tools).toBeUndefined();
      });
    });
  });

  describe('Given a response with missing usage fields', () => {
    describe('When chat() is called', () => {
      it('Then returns a response with no usage data', async () => {
        process.env.ANTHROPIC_API_KEY = 'k';

        mockFetch({
          id: 'm',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'ok' }],
          model: 'claude-sonnet-4-6',
          stop_reason: 'end_turn',
        });

        const adapter = createAnthropicAdapter({
          config: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
          tools: {},
        });

        const result = await adapter.chat([{ role: 'user', content: 'Hi' }]);
        expect(result.usage).toBeUndefined();
      });
    });
  });

  describe('Given a tool result message with no toolCallId', () => {
    describe('When chat() is called', () => {
      it('Then throws at conversion time rather than sending an empty tool_use_id', async () => {
        process.env.ANTHROPIC_API_KEY = 'k';

        const adapter = createAnthropicAdapter({
          config: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
          tools: { test: testTool },
        });

        await expect(
          adapter.chat([
            { role: 'user', content: 'hi' },
            { role: 'tool', content: '{"y":"a"}' },
          ]),
        ).rejects.toThrow('Anthropic tool_result requires a toolCallId');
      });
    });
  });

  describe('Given an assistant message with repeated tool names and no ids', () => {
    describe('When chat() is called', () => {
      it('Then synthesises unique tool_use ids by index to avoid collisions', async () => {
        process.env.ANTHROPIC_API_KEY = 'k';

        mockFetch({
          id: 'm',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'ok' }],
          model: 'claude-sonnet-4-6',
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
        });

        const adapter = createAnthropicAdapter({
          config: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
          tools: { test: testTool },
        });

        await adapter.chat([
          { role: 'user', content: 'q' },
          {
            role: 'assistant',
            content: '[Calling test, test]',
            toolCalls: [
              { name: 'test', arguments: { x: 'a' } },
              { name: 'test', arguments: { x: 'b' } },
            ],
          },
        ]);

        const fetchMock = globalThis.fetch as ReturnType<typeof mock>;
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        const ids = body.messages[1].content.map((b: { id: string }) => b.id);
        expect(new Set(ids).size).toBe(2);
      });
    });
  });

  describe('Given a user message interleaved between tool calls and tool results', () => {
    describe('When chat() is called', () => {
      it('Then the tool_result goes in a fresh user message, not fused into the interleaved text user message', async () => {
        process.env.ANTHROPIC_API_KEY = 'k';

        mockFetch({
          id: 'm',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'ok' }],
          model: 'claude-sonnet-4-6',
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
        });

        const adapter = createAnthropicAdapter({
          config: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
          tools: { test: testTool },
        });

        await adapter.chat([
          { role: 'user', content: 'start' },
          {
            role: 'assistant',
            content: '[Calling test]',
            toolCalls: [{ id: 'toolu_1', name: 'test', arguments: { x: 'a' } }],
          },
          { role: 'user', content: 'wait' },
          { role: 'tool', toolCallId: 'toolu_1', toolName: 'test', content: '{"y":"a"}' },
        ]);

        const fetchMock = globalThis.fetch as ReturnType<typeof mock>;
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.messages).toEqual([
          { role: 'user', content: 'start' },
          {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'toolu_1', name: 'test', input: { x: 'a' } }],
          },
          { role: 'user', content: 'wait' },
          {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{"y":"a"}' }],
          },
        ]);
      });
    });
  });

  describe('Given a response with multiple text blocks', () => {
    describe('When chat() is called', () => {
      it('Then concatenates the text blocks without a separator', async () => {
        process.env.ANTHROPIC_API_KEY = 'k';

        mockFetch({
          id: 'm',
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'text', text: 'world.' },
          ],
          model: 'claude-sonnet-4-6',
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
        });

        const adapter = createAnthropicAdapter({
          config: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
          tools: {},
        });

        const result = await adapter.chat([{ role: 'user', content: 'Hi' }]);
        expect(result.text).toBe('Hello world.');
      });
    });
  });

  describe('Given a tool_use block with a non-object input', () => {
    describe('When chat() is called', () => {
      it('Then coerces the arguments to an empty object', async () => {
        process.env.ANTHROPIC_API_KEY = 'k';

        mockFetch({
          id: 'm',
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'toolu_a', name: 'test', input: null },
            { type: 'tool_use', id: 'toolu_b', name: 'test', input: 'not-an-object' },
            { type: 'tool_use', id: 'toolu_c', name: 'test', input: [1, 2, 3] },
          ],
          model: 'claude-sonnet-4-6',
          stop_reason: 'tool_use',
          usage: { input_tokens: 1, output_tokens: 1 },
        });

        const adapter = createAnthropicAdapter({
          config: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
          tools: { test: testTool },
        });

        const result = await adapter.chat([{ role: 'user', content: 'Hi' }]);
        expect(result.toolCalls).toEqual([
          { id: 'toolu_a', name: 'test', arguments: {} },
          { id: 'toolu_b', name: 'test', arguments: {} },
          { id: 'toolu_c', name: 'test', arguments: {} },
        ]);
      });
    });
  });

  describe('Given the adapter sends a request', () => {
    describe('When inspecting the headers', () => {
      it('Then uses x-api-key and does not send an Authorization header', async () => {
        process.env.ANTHROPIC_API_KEY = 'k';

        mockFetch({
          id: 'm',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'ok' }],
          model: 'claude-sonnet-4-6',
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
        });

        const adapter = createAnthropicAdapter({
          config: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
          tools: {},
        });

        await adapter.chat([{ role: 'user', content: 'Hi' }]);

        const fetchMock = globalThis.fetch as ReturnType<typeof mock>;
        const headers = fetchMock.mock.calls[0][1].headers;
        expect(headers['x-api-key']).toBe('k');
        expect(headers['Authorization']).toBeUndefined();
      });
    });
  });

  describe('Given a response with an empty content array', () => {
    describe('When chat() is called', () => {
      it('Then returns empty text and empty tool calls', async () => {
        process.env.ANTHROPIC_API_KEY = 'k';

        mockFetch({
          id: 'm',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-sonnet-4-6',
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 0 },
        });

        const adapter = createAnthropicAdapter({
          config: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
          tools: {},
        });

        const result = await adapter.chat([{ role: 'user', content: 'Hi' }]);
        expect(result.text).toBe('');
        expect(result.toolCalls).toEqual([]);
      });
    });
  });
});
