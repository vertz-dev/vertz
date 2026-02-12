import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * UI-029: Subpath exports verification.
 *
 * These tests verify that focused subpath barrel files exist and export
 * the correct public API symbols. Each subpath should expose only the
 * user-facing API, not internals.
 */

describe('Subpath Exports — @vertz/ui/router', () => {
  test('exports defineRoutes', async () => {
    const mod = await import('../router/index');
    expect(mod.defineRoutes).toBeTypeOf('function');
  });

  test('exports createRouter', async () => {
    const mod = await import('../router/index');
    expect(mod.createRouter).toBeTypeOf('function');
  });

  test('exports createLink', async () => {
    const mod = await import('../router/index');
    expect(mod.createLink).toBeTypeOf('function');
  });

  test('exports createOutlet', async () => {
    const mod = await import('../router/index');
    expect(mod.createOutlet).toBeTypeOf('function');
  });

  test('exports parseSearchParams', async () => {
    const mod = await import('../router/index');
    expect(mod.parseSearchParams).toBeTypeOf('function');
  });

  test('exports useSearchParams', async () => {
    const mod = await import('../router/index');
    expect(mod.useSearchParams).toBeTypeOf('function');
  });
});

describe('Subpath Exports — @vertz/ui/form', () => {
  test('exports form', async () => {
    const mod = await import('../form/index');
    expect(mod.form).toBeTypeOf('function');
  });

  test('exports formDataToObject', async () => {
    const mod = await import('../form/index');
    expect(mod.formDataToObject).toBeTypeOf('function');
  });
});

describe('Subpath Exports — @vertz/ui/query', () => {
  test('exports query', async () => {
    const mod = await import('../query/index');
    expect(mod.query).toBeTypeOf('function');
  });
});

describe('Subpath Exports — @vertz/ui/css', () => {
  test('exports css', async () => {
    const mod = await import('../css/index');
    expect(mod.css).toBeTypeOf('function');
  });

  test('exports variants', async () => {
    const mod = await import('../css/index');
    expect(mod.variants).toBeTypeOf('function');
  });

  test('exports defineTheme', async () => {
    const mod = await import('../css/index');
    expect(mod.defineTheme).toBeTypeOf('function');
  });

  test('exports ThemeProvider', async () => {
    const mod = await import('../css/index');
    expect(mod.ThemeProvider).toBeTypeOf('function');
  });

  test('exports globalCss', async () => {
    const mod = await import('../css/index');
    expect(mod.globalCss).toBeTypeOf('function');
  });

  test('exports s', async () => {
    const mod = await import('../css/index');
    expect(mod.s).toBeTypeOf('function');
  });
});

describe('Subpath Exports — package.json exports map', () => {
  const pkgPath = resolve(__dirname, '../../package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const subpaths = ['./router', './form', './query', './css'] as const;

  for (const subpath of subpaths) {
    test(`exports map includes ${subpath} with import and types`, () => {
      const entry = pkg.exports[subpath];
      expect(entry).toBeDefined();
      expect(entry.import).toBeTypeOf('string');
      expect(entry.types).toBeTypeOf('string');
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
  });

  test('main barrel re-exports all query symbols', async () => {
    const main = await import('../index');
    expect(main.query).toBeTypeOf('function');
  });

  test('main barrel re-exports all css symbols', async () => {
    const main = await import('../index');
    expect(main.css).toBeTypeOf('function');
    expect(main.variants).toBeTypeOf('function');
    expect(main.defineTheme).toBeTypeOf('function');
    expect(main.ThemeProvider).toBeTypeOf('function');
    expect(main.globalCss).toBeTypeOf('function');
    expect(main.s).toBeTypeOf('function');
  });
});
