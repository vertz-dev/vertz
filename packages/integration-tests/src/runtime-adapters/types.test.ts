import { describe, expect, it } from 'vitest';
import type { RuntimeAdapter, ServerHandle } from './types';

describe('RuntimeAdapter interface', () => {
  it('has a name property and createServer method', () => {
    const adapter: RuntimeAdapter = {
      name: 'test',
      async createServer(_handler) {
        return {
          port: 3000,
          url: 'http://localhost:3000',
          close: async () => {},
        };
      },
    };

    expect(adapter.name).toBe('test');
    expect(typeof adapter.createServer).toBe('function');
  });
});

describe('ServerHandle interface', () => {
  it('has port, url, and close properties', () => {
    const handle: ServerHandle = {
      port: 3000,
      url: 'http://localhost:3000',
      close: async () => {},
    };

    expect(handle.port).toBe(3000);
    expect(handle.url).toBe('http://localhost:3000');
    expect(typeof handle.close).toBe('function');
  });
});
