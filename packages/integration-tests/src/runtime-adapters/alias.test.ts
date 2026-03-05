import { describe, expect, it } from 'bun:test';
import { adapter } from './index';

describe('~runtime-adapter alias', () => {
  it('resolves to an adapter with a name', () => {
    expect(typeof adapter.name).toBe('string');
    expect(adapter.name.length).toBeGreaterThan(0);
  });

  it('resolves to an adapter with a createServer method', () => {
    expect(typeof adapter.createServer).toBe('function');
  });
});
