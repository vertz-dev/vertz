import { afterEach, describe, expect, it, mock } from 'bun:test';
import { createAdapter } from './create-adapter';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.CLOUDFLARE_ACCOUNT_ID = originalEnv.CLOUDFLARE_ACCOUNT_ID;
  process.env.CLOUDFLARE_API_TOKEN = originalEnv.CLOUDFLARE_API_TOKEN;
  process.env.MINIMAX_API_KEY = originalEnv.MINIMAX_API_KEY;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createAdapter()', () => {
  describe('Given provider is "cloudflare"', () => {
    describe('When createAdapter is called', () => {
      it('Then returns a Cloudflare Workers AI adapter', () => {
        process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';
        process.env.CLOUDFLARE_API_TOKEN = 'tok';

        const adapter = createAdapter({
          config: { provider: 'cloudflare', model: 'test' },
          tools: {},
        });

        expect(adapter).toBeDefined();
        expect(typeof adapter.chat).toBe('function');
      });
    });
  });

  describe('Given provider is "minimax"', () => {
    describe('When createAdapter is called', () => {
      it('Then returns a MiniMax adapter', () => {
        process.env.MINIMAX_API_KEY = 'key';

        const adapter = createAdapter({
          config: { provider: 'minimax', model: 'test' },
          tools: {},
        });

        expect(adapter).toBeDefined();
        expect(typeof adapter.chat).toBe('function');
      });
    });
  });

  describe('Given an unsupported provider', () => {
    describe('When createAdapter is called', () => {
      it('Then throws an error naming the unsupported provider', () => {
        expect(() =>
          createAdapter({
            // @ts-expect-error — testing unsupported provider
            config: { provider: 'unknown-provider', model: 'test' },
            tools: {},
          }),
        ).toThrow('Unsupported LLM provider: "unknown-provider"');
      });
    });
  });
});
