import { describe, expect, it } from 'bun:test';
import type { Feature, FeatureContext } from '../types.js';
import { compose, resolveDependencies } from '../compose.js';

// ── Test helpers ────────────────────────────────────────────

function feature(overrides: Partial<Feature> & { name: string }): Feature {
  return {
    dependencies: [],
    files: () => [],
    ...overrides,
  };
}

// ── Dependency resolution ───────────────────────────────────

describe('resolveDependencies', () => {
  it('returns features in dependency order', () => {
    const features = [
      feature({ name: 'api', dependencies: ['core'] }),
      feature({ name: 'core' }),
    ];

    const resolved = resolveDependencies(features);
    const names = resolved.map((f) => f.name);

    expect(names).toEqual(['core', 'api']);
  });

  it('resolves multi-level dependencies', () => {
    const features = [
      feature({ name: 'entity-example', dependencies: ['db'] }),
      feature({ name: 'db', dependencies: ['api'] }),
      feature({ name: 'api', dependencies: ['core'] }),
      feature({ name: 'core' }),
    ];

    const resolved = resolveDependencies(features);
    const names = resolved.map((f) => f.name);

    expect(names).toEqual(['core', 'api', 'db', 'entity-example']);
  });

  it('preserves order for features with no dependencies between them', () => {
    const features = [
      feature({ name: 'api', dependencies: ['core'] }),
      feature({ name: 'ui', dependencies: ['core'] }),
      feature({ name: 'core' }),
    ];

    const resolved = resolveDependencies(features);
    const names = resolved.map((f) => f.name);

    expect(names[0]).toBe('core');
    expect(names).toContain('api');
    expect(names).toContain('ui');
  });

  it('throws on circular dependency', () => {
    const features = [
      feature({ name: 'a', dependencies: ['b'] }),
      feature({ name: 'b', dependencies: ['a'] }),
    ];

    expect(() => resolveDependencies(features)).toThrow('Circular dependency');
  });

  it('throws on missing dependency', () => {
    const features = [feature({ name: 'api', dependencies: ['core'] })];

    expect(() => resolveDependencies(features)).toThrow('Missing dependency');
  });
});

// ── Composition ─────────────────────────────────────────────

describe('compose', () => {
  it('collects files from all features in dependency order', () => {
    const features = [
      feature({
        name: 'core',
        files: () => [{ path: 'package.json', content: '{}' }],
      }),
      feature({
        name: 'api',
        dependencies: ['core'],
        files: () => [{ path: 'src/api/server.ts', content: 'server' }],
      }),
    ];

    const result = compose('test-app', features);

    expect(result.files).toHaveLength(2);
    expect(result.files[0].path).toBe('package.json');
    expect(result.files[1].path).toBe('src/api/server.ts');
  });

  it('provides FeatureContext with hasFeature to each feature', () => {
    let capturedCtx: FeatureContext | null = null;

    const features = [
      feature({ name: 'core' }),
      feature({
        name: 'api',
        dependencies: ['core'],
        files: (ctx) => {
          capturedCtx = ctx;
          return [];
        },
      }),
    ];

    compose('test-app', features);

    expect(capturedCtx).not.toBeNull();
    expect(capturedCtx!.projectName).toBe('test-app');
    expect(capturedCtx!.hasFeature('core')).toBe(true);
    expect(capturedCtx!.hasFeature('router')).toBe(false);
    expect(capturedCtx!.features).toEqual(['core', 'api']);
  });

  it('merges package contributions from multiple features', () => {
    const features = [
      feature({
        name: 'core',
        packages: {
          dependencies: { vertz: '^0.2.0' },
          devDependencies: { 'bun-types': '^1.0.0' },
          scripts: {},
        },
      }),
      feature({
        name: 'ui',
        dependencies: ['core'],
        packages: {
          dependencies: { '@vertz/theme-shadcn': '^0.2.0' },
          devDependencies: { '@vertz/ui-compiler': '^0.2.0' },
          scripts: { dev: 'vertz dev', build: 'vertz build' },
        },
      }),
    ];

    const result = compose('test-app', features);

    expect(result.packageJson.dependencies).toEqual({
      vertz: '^0.2.0',
      '@vertz/theme-shadcn': '^0.2.0',
    });
    expect(result.packageJson.devDependencies).toEqual({
      'bun-types': '^1.0.0',
      '@vertz/ui-compiler': '^0.2.0',
    });
    expect(result.packageJson.scripts).toEqual({
      dev: 'vertz dev',
      build: 'vertz build',
    });
  });

  it('merges imports map from features with imports', () => {
    const features = [
      feature({ name: 'core' }),
      feature({
        name: 'client',
        dependencies: ['core'],
        packages: {
          imports: {
            '#generated': './.vertz/generated/client.ts',
            '#generated/types': './.vertz/generated/types/index.ts',
          },
        },
      }),
    ];

    const result = compose('test-app', features);

    expect(result.packageJson.imports).toEqual({
      '#generated': './.vertz/generated/client.ts',
      '#generated/types': './.vertz/generated/types/index.ts',
    });
  });

  it('omits empty imports map when no feature contributes imports', () => {
    const features = [feature({ name: 'core' })];

    const result = compose('test-app', features);

    expect(result.packageJson.imports).toBeUndefined();
  });

  it('detects file path conflicts across features', () => {
    const features = [
      feature({
        name: 'a',
        files: () => [{ path: 'src/app.tsx', content: 'a' }],
      }),
      feature({
        name: 'b',
        files: () => [{ path: 'src/app.tsx', content: 'b' }],
      }),
    ];

    expect(() => compose('test-app', features)).toThrow(
      'File path conflict',
    );
  });
});
