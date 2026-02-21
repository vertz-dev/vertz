import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * UI-029: Subpath exports verification.
 *
 * These tests exhaustively verify that each public subpath barrel exports
 * EXACTLY the curated public API — no more, no less. This catches both
 * missing exports and accidental internal symbol leaks.
 */

describe('Subpath Exports — @vertz/ui/router', () => {
  const expectedExports = [
    'createLink',
    'createOutlet',
    'createRouter',
    'defineRoutes',
    'parseSearchParams',
    'useSearchParams',
  ];

  test('exports exactly the public API (no internal leaks)', async () => {
    const mod = await import('../router/public');
    const actualExports = Object.keys(mod).sort();
    expect(actualExports).toEqual(expectedExports);
  });

  test('all exports are functions', async () => {
    const mod = await import('../router/public');
    for (const name of expectedExports) {
      expect(mod[name as keyof typeof mod], `${name} should be a function`).toBeTypeOf('function');
    }
  });

  test('does NOT export internal symbols', async () => {
    const mod = (await import('../router/public')) as Record<string, unknown>;
    expect(mod.matchRoute).toBeUndefined();
    expect(mod.executeLoaders).toBeUndefined();
    expect(mod.matchPath).toBeUndefined();
  });

  test('same references as main barrel', async () => {
    const main = await import('../index');
    const subpath = await import('../router/public');
    expect(subpath.defineRoutes).toBe(main.defineRoutes);
    expect(subpath.createRouter).toBe(main.createRouter);
    expect(subpath.createLink).toBe(main.createLink);
    expect(subpath.createOutlet).toBe(main.createOutlet);
    expect(subpath.parseSearchParams).toBe(main.parseSearchParams);
    expect(subpath.useSearchParams).toBe(main.useSearchParams);
  });
});

describe('Subpath Exports — @vertz/ui/form', () => {
  const expectedExports = ['createFieldState', 'form', 'formDataToObject', 'validate'];

  test('exports exactly the public API (no internal leaks)', async () => {
    const mod = await import('../form/public');
    const actualExports = Object.keys(mod).sort();
    expect(actualExports).toEqual(expectedExports);
  });

  test('all exports are functions', async () => {
    const mod = await import('../form/public');
    for (const name of expectedExports) {
      expect(mod[name as keyof typeof mod], `${name} should be a function`).toBeTypeOf('function');
    }
  });

  test('same references as main barrel', async () => {
    const main = await import('../index');
    const subpath = await import('../form/public');
    expect(subpath.createFieldState).toBe(main.createFieldState);
    expect(subpath.form).toBe(main.form);
    expect(subpath.formDataToObject).toBe(main.formDataToObject);
    expect(subpath.validate).toBe(main.validate);
  });
});

describe('Subpath Exports — @vertz/ui/query', () => {
  const expectedExports = ['query'];

  test('exports exactly the public API (no internal leaks)', async () => {
    const mod = await import('../query/public');
    const actualExports = Object.keys(mod).sort();
    expect(actualExports).toEqual(expectedExports);
  });

  test('all exports are functions', async () => {
    const mod = await import('../query/public');
    for (const name of expectedExports) {
      expect(mod[name as keyof typeof mod], `${name} should be a function`).toBeTypeOf('function');
    }
  });

  test('does NOT export internal symbols', async () => {
    const mod = (await import('../query/public')) as Record<string, unknown>;
    expect(mod.MemoryCache).toBeUndefined();
    expect(mod.deriveKey).toBeUndefined();
  });

  test('same references as main barrel', async () => {
    const main = await import('../index');
    const subpath = await import('../query/public');
    expect(subpath.query).toBe(main.query);
  });
});

describe('Subpath Exports — @vertz/ui/css', () => {
  const expectedExports = [
    'ThemeProvider',
    'compileTheme',
    'css',
    'defineTheme',
    'globalCss',
    's',
    'variants',
  ];

  test('exports exactly the public API (no internal leaks)', async () => {
    const mod = await import('../css/public');
    const actualExports = Object.keys(mod).sort();
    expect(actualExports).toEqual(expectedExports);
  });

  test('all exports are functions', async () => {
    const mod = await import('../css/public');
    for (const name of expectedExports) {
      expect(mod[name as keyof typeof mod], `${name} should be a function`).toBeTypeOf('function');
    }
  });

  test('does NOT export internal symbols', async () => {
    const mod = (await import('../css/public')) as Record<string, unknown>;
    expect(mod.generateClassName).toBeUndefined();
    expect(mod.parseShorthand).toBeUndefined();
    expect(mod.ShorthandParseError).toBeUndefined();
    expect(mod.InlineStyleError).toBeUndefined();
    expect(mod.isKnownProperty).toBeUndefined();
    expect(mod.isValidColorToken).toBeUndefined();
    expect(mod.resolveToken).toBeUndefined();
    expect(mod.TokenResolveError).toBeUndefined();
  });

  test('same references as main barrel', async () => {
    const main = await import('../index');
    const subpath = await import('../css/public');
    expect(subpath.compileTheme).toBe(main.compileTheme);
    expect(subpath.css).toBe(main.css);
    expect(subpath.defineTheme).toBe(main.defineTheme);
    expect(subpath.globalCss).toBe(main.globalCss);
    expect(subpath.s).toBe(main.s);
    expect(subpath.ThemeProvider).toBe(main.ThemeProvider);
    expect(subpath.variants).toBe(main.variants);
  });
});

describe('Subpath Exports — package.json exports map', () => {
  const pkgPath = resolve(__dirname, '../../package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const subpaths = ['./router', './form', './query', './css'] as const;

  for (const subpath of subpaths) {
    test(`exports map includes ${subpath} with types before import`, () => {
      const entry = pkg.exports[subpath];
      expect(entry).toBeDefined();
      expect(entry.types).toBeTypeOf('string');
      expect(entry.import).toBeTypeOf('string');
      // types condition should come before import for correct TS resolution
      const keys = Object.keys(entry);
      expect(keys.indexOf('types')).toBeLessThan(keys.indexOf('import'));
    });
  }

  test('dist files exist for all subpath exports (post-build)', () => {
    const uiRoot = resolve(__dirname, '../..');
    for (const subpath of subpaths) {
      const entry = pkg.exports[subpath];
      const jsPath = resolve(uiRoot, entry.import);
      const dtsPath = resolve(uiRoot, entry.types);
      expect(existsSync(jsPath), `Missing JS: ${entry.import}`).toBe(true);
      expect(existsSync(dtsPath), `Missing DTS: ${entry.types}`).toBe(true);
    }
  });
});

describe('Subpath Exports — main barrel backward compat', () => {
  test('main barrel re-exports all router symbols', async () => {
    const main = await import('../index');
    expect(main.defineRoutes).toBeTypeOf('function');
    expect(main.createRouter).toBeTypeOf('function');
    expect(main.createLink).toBeTypeOf('function');
    expect(main.createOutlet).toBeTypeOf('function');
    expect(main.parseSearchParams).toBeTypeOf('function');
    expect(main.useSearchParams).toBeTypeOf('function');
  });

  test('main barrel re-exports all form symbols', async () => {
    const main = await import('../index');
    expect(main.form).toBeTypeOf('function');
    expect(main.formDataToObject).toBeTypeOf('function');
    expect(main.validate).toBeTypeOf('function');
  });

  test('main barrel re-exports all query symbols', async () => {
    const main = await import('../index');
    expect(main.query).toBeTypeOf('function');
  });

  test('main barrel re-exports all css symbols', async () => {
    const main = await import('../index');
    expect(main.compileTheme).toBeTypeOf('function');
    expect(main.css).toBeTypeOf('function');
    expect(main.variants).toBeTypeOf('function');
    expect(main.defineTheme).toBeTypeOf('function');
    expect(main.ThemeProvider).toBeTypeOf('function');
    expect(main.globalCss).toBeTypeOf('function');
    expect(main.s).toBeTypeOf('function');
  });
});
