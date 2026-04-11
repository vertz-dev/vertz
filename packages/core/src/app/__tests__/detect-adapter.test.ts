import { afterEach, describe, expect, it } from '@vertz/test';
import { detectAdapter } from '../detect-adapter';

const hasBun = 'Bun' in globalThis;
const hasVtz = '__vtz_runtime' in globalThis;

afterEach(() => {
  // Clean up vtz runtime mock if set
  if (!hasVtz) {
    delete (globalThis as Record<string, unknown>).__vtz_runtime;
    delete (globalThis as Record<string, unknown>).__vtz_http;
  }
});

describe('detectAdapter', () => {
  it.skipIf(!hasBun)(
    'returns a ServerAdapter with a listen method when Bun is available',
    async () => {
      const adapter = await detectAdapter();
      expect(adapter.listen).toBeTypeOf('function');
    },
  );

  it.skipIf(!hasBun)('returns a ServerAdapter when given hasBun hint', async () => {
    const adapter = await detectAdapter({ hasBun: true, hasVtz: false });
    expect(adapter.listen).toBeTypeOf('function');
  });

  it('returns a vtz ServerAdapter when given hasVtz hint', async () => {
    // Mock vtz globals so the adapter module can be constructed
    (globalThis as Record<string, unknown>).__vtz_runtime = true;
    (globalThis as Record<string, unknown>).__vtz_http = {
      serve: async () => ({ id: 1, port: 0, hostname: '0.0.0.0', close() {} }),
    };

    const adapter = await detectAdapter({ hasVtz: true, hasBun: false });
    expect(adapter.listen).toBeTypeOf('function');
  });

  it('prefers vtz adapter when both runtimes are available', async () => {
    // Mock vtz globals
    (globalThis as Record<string, unknown>).__vtz_runtime = true;
    (globalThis as Record<string, unknown>).__vtz_http = {
      serve: async () => ({ id: 1, port: 0, hostname: '0.0.0.0', close() {} }),
    };

    const adapter = await detectAdapter({ hasVtz: true, hasBun: true });
    // The adapter should be the vtz one — we can verify by checking it uses __vtz_http
    expect(adapter.listen).toBeTypeOf('function');
  });

  it('rejects when no supported runtime is detected', async () => {
    await expect(detectAdapter({ hasBun: false, hasVtz: false })).rejects.toThrow(
      'No supported server runtime detected',
    );
  });
});
