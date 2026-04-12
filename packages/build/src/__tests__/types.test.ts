import { describe, expect, it } from '@vertz/test';
import { defineConfig } from '../index';
import type { BuildConfig, PostBuildContext, PostBuildHook } from '../types';

describe('defineConfig', () => {
  it('returns a single config unchanged', () => {
    const config: BuildConfig = {
      entry: ['src/index.ts'],
      dts: true,
    };
    const result = defineConfig(config);
    expect(result).toBe(config);
  });

  it('returns an array config unchanged', () => {
    const configs: BuildConfig[] = [
      { entry: ['src/index.ts'], dts: true },
      { entry: ['src/cli.ts'], dts: false },
    ];
    const result = defineConfig(configs);
    expect(result).toBe(configs);
  });

  it('accepts all optional fields', () => {
    const hook: PostBuildHook = {
      name: 'test-hook',
      handler: async (_ctx: PostBuildContext) => {},
    };

    const config = defineConfig({
      entry: ['src/index.ts'],
      dts: true,
      outDir: 'dist',
      external: ['lodash'],
      plugins: [],
      onSuccess: [hook],
      clean: true,
      target: 'node',
      banner: '#!/usr/bin/env node',
    });

    expect(config).toEqual({
      entry: ['src/index.ts'],
      dts: true,
      outDir: 'dist',
      external: ['lodash'],
      plugins: [],
      onSuccess: [hook],
      clean: true,
      target: 'node',
      banner: '#!/usr/bin/env node',
    });
  });

  it('accepts banner as object', () => {
    const config = defineConfig({
      entry: ['src/index.ts'],
      banner: { js: '/* license */', css: '/* styles */' },
    });
    expect((config as BuildConfig).banner).toEqual({ js: '/* license */', css: '/* styles */' });
  });

  it('accepts onSuccess as plain function', () => {
    const fn = () => {};
    const config = defineConfig({
      entry: ['src/index.ts'],
      onSuccess: fn,
    });
    expect((config as BuildConfig).onSuccess).toBe(fn);
  });

  it('accepts onSuccess as single hook', () => {
    const hook: PostBuildHook = { name: 'test', handler: async () => {} };
    const config = defineConfig({
      entry: ['src/index.ts'],
      onSuccess: hook,
    });
    expect((config as BuildConfig).onSuccess).toBe(hook);
  });
});
