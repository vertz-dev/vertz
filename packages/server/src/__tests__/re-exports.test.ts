import * as core from '@vertz/core';
import { describe, expect, it, vi } from 'vitest';
import * as server from '../index';

describe('@vertz/server re-exports', () => {
  it('exports createServer', () => {
    expect(server.createServer).toBeTypeOf('function');
  });

  it('createServer is a wrapper (not the same function as core createServer)', () => {
    // @vertz/server wraps core's createServer to inject entity route generation
    expect(server.createServer).not.toBe(core.createServer);
    expect(server.createServer).toBeTypeOf('function');
  });

  it('re-exports all public API from @vertz/core', () => {
    // Key exports that should be available
    expect(server.createEnv).toBe(core.createEnv);
    expect(server.createMiddleware).toBe(core.createMiddleware);
    expect(server.createModule).toBe(core.createModule);
    expect(server.createModuleDef).toBe(core.createModuleDef);
    expect(server.vertz).toBe(core.vertz);
  });

  it('does NOT re-export the deprecated createApp', () => {
    expect((server as Record<string, unknown>).createApp).toBeUndefined();
  });

  it('logs deprecation warning when imported via @vertz/core', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      core.createApp({ basePath: '/' });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('deprecated'));
    } finally {
      warnSpy.mockRestore();
    }
  });
});
