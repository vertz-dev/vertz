import { afterEach, describe, expect, it, mock } from 'bun:test';
import { s } from '@vertz/schema';
import { tool } from '../tool';
import { createMinimaxAdapter } from './minimax';

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
  process.env.MINIMAX_API_KEY = originalEnv.MINIMAX_API_KEY;
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

describe('createMinimaxAdapter()', () => {
  describe('Given a valid MINIMAX_API_KEY and a text-only response', () => {
    describe('When chat() is called', () => {
      it('Then sends a request to the MiniMax OpenAI-compatible endpoint', async () => {
        process.env.MINIMAX_API_KEY = 'test-key';

        mockFetch({
          choices: [{ message: { role: 'assistant', content: 'Hello!' } }],
        });

        const adapter = createMinimaxAdapter({
          config: { provider: 'minimax', model: 'MiniMax-M2.7' },
          tools: { test: testTool },
        });

        const result = await adapter.chat([
          { role: 'system', content: 'Be helpful.' },
          { role: 'user', content: 'Hi' },
        ]);

        expect(result.text).toBe('Hello!');
        expect(result.toolCalls).toEqual([]);

        const fetchMock = globalThis.fetch as ReturnType<typeof mock>;
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.minimaxi.com/v1/chat/completions');
        expect(options.method).toBe('POST');
        expect(options.headers['Authorization']).toBe('Bearer test-key');

        const body = JSON.parse(options.body);
        expect(body.model).toBe('MiniMax-M2.7');
        expect(body.messages).toHaveLength(2);
        expect(body.tools).toHaveLength(1);
      });
    });
  });

  describe('Given a response with tool calls', () => {
    describe('When chat() is called', () => {
      it('Then parses tool calls from the response', async () => {
        process.env.MINIMAX_API_KEY = 'key';

        mockFetch({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_mm1',
                    type: 'function',
                    function: { name: 'test', arguments: '{"x":"world"}' },
                  },
                ],
              },
            },
          ],
        });

        const adapter = createMinimaxAdapter({
          config: { provider: 'minimax', model: 'minimax-01' },
          tools: { test: testTool },
        });

        const result = await adapter.chat([{ role: 'user', content: 'Use test tool' }]);

        expect(result.toolCalls).toEqual([
          { id: 'call_mm1', name: 'test', arguments: { x: 'world' } },
        ]);
      });
    });
  });

  describe('Given missing MINIMAX_API_KEY', () => {
    describe('When createMinimaxAdapter is called', () => {
      it('Then throws a configuration error', () => {
        delete process.env.MINIMAX_API_KEY;

        expect(() =>
          createMinimaxAdapter({
            config: { provider: 'minimax', model: 'test' },
            tools: {},
          }),
        ).toThrow('MINIMAX_API_KEY');
      });
    });
  });

  describe('Given the API returns a non-OK status', () => {
    describe('When chat() is called', () => {
      it('Then throws an error with the status and body', async () => {
        process.env.MINIMAX_API_KEY = 'key';

        mockFetch({ error: { message: 'Unauthorized' } }, 401);

        const adapter = createMinimaxAdapter({
          config: { provider: 'minimax', model: 'test' },
          tools: {},
        });

        await expect(
          adapter.chat([{ role: 'user', content: 'Hi' }]),
        ).rejects.toThrow('MiniMax API request failed (401)');
      });
    });
  });

  describe('Given no tools are provided', () => {
    describe('When chat() is called', () => {
      it('Then omits the tools field from the request body', async () => {
        process.env.MINIMAX_API_KEY = 'key';

        mockFetch({
          choices: [{ message: { role: 'assistant', content: 'Done.' } }],
        });

        const adapter = createMinimaxAdapter({
          config: { provider: 'minimax', model: 'test' },
          tools: {},
        });

        await adapter.chat([{ role: 'user', content: 'Hi' }]);

        const fetchMock = globalThis.fetch as ReturnType<typeof mock>;
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.tools).toBeUndefined();
      });
    });
  });
});
