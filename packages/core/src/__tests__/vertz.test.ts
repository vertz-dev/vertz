import { describe, it, expect } from 'vitest';
import { vertz } from '../vertz';
import {
  vertz as vertzFromIndex,
  createApp,
  createEnv,
  createMiddleware,
  createModuleDef,
  createModule,
} from '../index';

describe('vertz namespace', () => {
  it('exports env, middleware, moduleDef, module, app factory functions', () => {
    expect(vertz.env).toBeTypeOf('function');
    expect(vertz.middleware).toBeTypeOf('function');
    expect(vertz.moduleDef).toBeTypeOf('function');
    expect(vertz.module).toBeTypeOf('function');
    expect(vertz.app).toBeTypeOf('function');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(vertz)).toBe(true);
  });

  it('is re-exported from index.ts', () => {
    expect(vertzFromIndex).toBe(vertz);
  });

  it('exports factory functions directly from index.ts', () => {
    expect(createApp).toBe(vertz.app);
    expect(createEnv).toBe(vertz.env);
    expect(createMiddleware).toBe(vertz.middleware);
    expect(createModuleDef).toBe(vertz.moduleDef);
    expect(createModule).toBe(vertz.module);
  });
});
