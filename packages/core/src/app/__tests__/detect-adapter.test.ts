import { describe, expect, it } from 'vitest';
import { detectAdapter } from '../detect-adapter';

const hasBun = 'Bun' in globalThis;

describe('detectAdapter', () => {
  it.skipIf(!hasBun)('returns a ServerAdapter with a listen method when Bun is available', () => {
    const adapter = detectAdapter();
    expect(adapter.listen).toBeTypeOf('function');
  });

  it('returns a ServerAdapter when given hasBun hint', () => {
    if (!hasBun) return; // Bun adapter requires Bun runtime to construct
    const adapter = detectAdapter({ hasBun: true });
    expect(adapter.listen).toBeTypeOf('function');
  });

  it('throws when no supported runtime is detected', () => {
    expect(() => detectAdapter({ hasBun: false })).toThrow('No supported server runtime detected');
  });
});
