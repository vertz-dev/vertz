import { describe, expect, it } from 'vitest';
import { detectAdapter } from '../detect-adapter';

describe('detectAdapter', () => {
  it('returns a ServerAdapter with a listen method when Bun is available', () => {
    const adapter = detectAdapter();
    expect(adapter.listen).toBeTypeOf('function');
  });

  it('throws when no supported runtime is detected', () => {
    expect(() => detectAdapter({ hasBun: false })).toThrow('No supported server runtime detected');
  });
});
