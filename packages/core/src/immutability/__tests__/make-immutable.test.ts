import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeImmutable } from '../index';

describe('makeImmutable', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('in development mode, throws on mutation via proxy', () => {
    process.env.NODE_ENV = 'development';
    const obj = { name: 'John' };
    const result = makeImmutable(obj, 'ctx');
    expect(() => {
      (result as any).name = 'Jane';
    }).toThrow(/Cannot set property/);
  });

  it('in production mode, returns object as-is (no runtime enforcement)', () => {
    process.env.NODE_ENV = 'production';
    const obj = { name: 'John' };
    const result = makeImmutable(obj, 'ctx');
    expect(result).toBe(obj);
    // No proxy — mutation is allowed at runtime (TypeScript prevents at compile time)
    (result as any).name = 'Jane';
    expect((result as any).name).toBe('Jane');
  });

  it('in test mode, returns object as-is', () => {
    process.env.NODE_ENV = 'test';
    const obj = { name: 'John' };
    const result = makeImmutable(obj, 'ctx');
    expect(result).toBe(obj);
  });
});
