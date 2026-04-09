import { afterEach, describe, expect, it, mock } from '@vertz/test';
import { s } from '@vertz/schema';
import { tool } from '../tool';
import { createCloudflareAdapter } from './cloudflare';

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
  process.env.CLOUDFLARE_ACCOUNT_ID = originalEnv.CLOUDFLARE_ACCOUNT_ID;
  process.env.CLOUDFLARE_API_TOKEN = originalEnv.CLOUDFLARE_API_TOKEN;
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

describe('createCloudflareAdapter()', () => {
  describe('Given valid env vars and a text-only LLM response', () => {
    describe('When chat() is called', () => {
      it('Then sends a request to the Workers AI OpenAI-compatible endpoint', async () => {
        process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account';
        process.env.CLOUDFLARE_API_TOKEN = 'test-token';

        mockFetch({
          choices: [{ message: { role: 'assistant', content: 'Hello!' } }],
        });

        const adapter = createCloudflareAdapter({
          config: { provider: 'cloudflare', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' },
          tools: { test: testTool },
        });

        const result = await adapter.chat([
          { role: 'system', content: 'Be helpful.' },
          { role: 'user', content: 'Hi' },
        ]);

        expect(result.text).toBe('Hello!');
        expect(result.toolCalls).toEqual([]);

        // Verify the fetch call
        const fetchMock = globalThis.fetch as ReturnType<typeof mock>;
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe(
          'https://api.cloudflare.com/client/v4/accounts/test-account/ai/v1/chat/completions',
        );
        expect(options.method).toBe('POST');
        expect(options.headers['Authorization']).toBe('Bearer test-token');
        expect(options.headers['Content-Type']).toBe('application/json');

        const body = JSON.parse(options.body);
        expect(body.model).toBe('@cf/meta/llama-3.3-70b-instruct-fp8-fast');
        expect(body.messages).toHaveLength(2);
        expect(body.tools).toHaveLength(1);
        expect(body.tools[0].type).toBe('function');
      });
    });
  });

  describe('Given a response with tool calls', () => {
    describe('When chat() is called', () => {
      it('Then parses tool calls from the response', async () => {
        process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';
        process.env.CLOUDFLARE_API_TOKEN = 'tok';

        mockFetch({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'test', arguments: '{"x":"hello"}' },
                  },
                ],
              },
            },
          ],
        });

        const adapter = createCloudflareAdapter({
          config: { provider: 'cloudflare', model: 'test-model' },
          tools: { test: testTool },
        });

        const result = await adapter.chat([{ role: 'user', content: 'Use test tool' }]);

        expect(result.toolCalls).toEqual([
          { id: 'call_1', name: 'test', arguments: { x: 'hello' } },
        ]);
      });
    });
  });

  describe('Given missing CLOUDFLARE_ACCOUNT_ID', () => {
    describe('When createCloudflareAdapter is called', () => {
      it('Then throws a configuration error', () => {
        delete process.env.CLOUDFLARE_ACCOUNT_ID;
        process.env.CLOUDFLARE_API_TOKEN = 'tok';

        expect(() =>
          createCloudflareAdapter({
            config: { provider: 'cloudflare', model: 'test' },
            tools: {},
          }),
        ).toThrow('CLOUDFLARE_ACCOUNT_ID');
      });
    });
  });

  describe('Given missing CLOUDFLARE_API_TOKEN', () => {
    describe('When createCloudflareAdapter is called', () => {
      it('Then throws a configuration error', () => {
        process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';
        delete process.env.CLOUDFLARE_API_TOKEN;

        expect(() =>
          createCloudflareAdapter({
            config: { provider: 'cloudflare', model: 'test' },
            tools: {},
          }),
        ).toThrow('CLOUDFLARE_API_TOKEN');
      });
    });
  });

  describe('Given the API returns a non-OK status', () => {
    describe('When chat() is called', () => {
      it('Then throws an error with the status and body', async () => {
        process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';
        process.env.CLOUDFLARE_API_TOKEN = 'tok';

        mockFetch({ errors: [{ message: 'Rate limited' }] }, 429);

        const adapter = createCloudflareAdapter({
          config: { provider: 'cloudflare', model: 'test' },
          tools: {},
        });

        await expect(adapter.chat([{ role: 'user', content: 'Hi' }])).rejects.toThrow(
          'Cloudflare Workers AI request failed (429)',
        );
      });
    });
  });

  describe('Given no tools are provided', () => {
    describe('When chat() is called', () => {
      it('Then omits the tools field from the request body', async () => {
        process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';
        process.env.CLOUDFLARE_API_TOKEN = 'tok';

        mockFetch({
          choices: [{ message: { role: 'assistant', content: 'Done.' } }],
        });

        const adapter = createCloudflareAdapter({
          config: { provider: 'cloudflare', model: 'test' },
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
