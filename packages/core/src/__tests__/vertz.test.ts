import { describe, expect, it, mock, spyOn } from 'bun:test';
import {
  createApp,
  createEnv,
  createMiddleware,
  createModule,
  createModuleDef,
  createServer,
  vertz as vertzFromIndex,
} from '../index';
import { vertz } from '../vertz';

describe('vertz namespace', () => {
  it('exports env, middleware, moduleDef, module, app factory functions', () => {
    expect(vertz.env).toBeTypeOf('function');
    expect(vertz.middleware).toBeTypeOf('function');
    expect(vertz.moduleDef).toBeTypeOf('function');
    expect(vertz.module).toBeTypeOf('function');
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
    expect(createModuleDef).toBe(vertz.moduleDef);
    expect(createModule).toBe(vertz.module);
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
      // createApp is the deprecated wrapper — calling it should warn
      // We need to import the actual deprecated version
      // The createApp from index is the deprecated wrapper
      createApp({ basePath: '/' });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('createApp'));
    } finally {
      warnSpy.mockRestore();
    }
  });
});
