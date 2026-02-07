import { describe, expect, it } from 'vitest';
import { createImmutableProxy } from '../dev-proxy';

describe('createImmutableProxy', () => {
  it('throws on property set with contextual error message', () => {
    const obj = { name: 'John' };
    const proxy = createImmutableProxy(obj, 'ctx');
    expect(() => {
      (proxy as Record<string, unknown>).name = 'Jane';
    }).toThrow('Cannot set property "name" on ctx. ctx is immutable.');
  });

  it('throws on property delete with contextual error message', () => {
    const obj = { name: 'John' };
    const proxy = createImmutableProxy(obj, 'deps');
    expect(() => {
      delete (proxy as Record<string, unknown>).name;
    }).toThrow('Cannot delete property "name" on deps. deps is immutable.');
  });

  it('proxies nested objects recursively', () => {
    const obj = { user: { name: 'John' } };
    const proxy = createImmutableProxy(obj, 'ctx');
    expect(() => {
      (proxy as Record<string, unknown>).user.name = 'Jane';
    }).toThrow('Cannot set property "name" on ctx.user. ctx is immutable.');
  });

  it('allows reading properties', () => {
    const obj = { name: 'John', nested: { value: 42 } };
    const proxy = createImmutableProxy(obj, 'ctx');
    expect(proxy.name).toBe('John');
    expect(proxy.nested.value).toBe(42);
  });

  it('preserves identity for nested object access', () => {
    const obj = { user: { name: 'John' } };
    const proxy = createImmutableProxy(obj, 'ctx');
    const first = proxy.user;
    const second = proxy.user;
    expect(first === second).toBe(true);
  });
});
