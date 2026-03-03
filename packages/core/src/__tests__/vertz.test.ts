import { describe, expect, it, spyOn } from 'bun:test';
import {
  createApp,
  createEnv,
  createMiddleware,
  createServer,
  vertz as vertzFromIndex,
} from '../index';
import { vertz } from '../vertz';

describe('vertz namespace', () => {
  it('exports env, middleware, app factory functions', () => {
    expect(vertz.env).toBeTypeOf('function');
    expect(vertz.middleware).toBeTypeOf('function');
    expect(vertz.app).toBeTypeOf('function');
  });

  it('exports server as alias for app', () => {
    expect(vertz.server).toBeTypeOf('function');
    expect(vertz.server).toBe(vertz.app);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(vertz)).toBe(true);
  });

  it('is re-exported from index.ts', () => {
    expect(vertzFromIndex).toBe(vertz);
  });

  it('exports factory functions directly from index.ts', () => {
    expect(createApp).toBeTypeOf('function'); // deprecated wrapper, not same ref
    expect(createEnv).toBe(vertz.env);
    expect(createMiddleware).toBe(vertz.middleware);
  });

  it('exports createServer as alias for createApp from index.ts', () => {
    expect(createServer).toBeTypeOf('function');
    expect(createServer).toBe(vertz.server);
  });
});

describe('deprecation warnings', () => {
  it('createApp logs a deprecation warning', () => {
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    try {
      createApp({ basePath: '/' });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('createApp'));
    } finally {
      warnSpy.mockRestore();
    }
  });
});
