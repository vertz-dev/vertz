import { describe, expect, it } from '@vertz/test';
import { action } from '../action';

describe('action()', () => {
  it('returns its config unchanged (identity at runtime)', () => {
    const config = {
      body: { parse: (v: unknown) => ({ ok: true as const, data: v as { id: string } }) },
      response: { parse: (v: unknown) => ({ ok: true as const, data: v as { ok: boolean } }) },
      handler: async (input: { id: string }) => ({ ok: true }),
    };

    const result = action(config);

    expect(result).toBe(config);
  });

  it('preserves all properties including method and path', () => {
    const config = {
      method: 'GET',
      path: '/status',
      response: { parse: (v: unknown) => ({ ok: true as const, data: v as { ok: boolean } }) },
      handler: async () => ({ ok: true }),
    };

    const result = action(config);

    expect(result.method).toBe('GET');
    expect(result.path).toBe('/status');
    expect(result.handler).toBe(config.handler);
    expect(result.response).toBe(config.response);
  });
});
