import { describe, expect, it } from 'vitest';
import { adapter } from './index';

describe('~runtime-adapter alias', () => {
  it('resolves to an adapter with a name', () => {
    expect(adapter.name).toBeTypeOf('string');
    expect(adapter.name.length).toBeGreaterThan(0);
  });

  it('resolves to an adapter with a createServer method', () => {
    expect(typeof adapter.createServer).toBe('function');
  });
});
