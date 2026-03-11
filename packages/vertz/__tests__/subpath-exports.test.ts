import { describe, expect, it } from 'bun:test';

/**
 * Tests that each subpath export from the `vertz` meta-package
 * correctly re-exports from the underlying @vertz/* package.
 *
 * Tree-shaking: each subpath is a separate entry point with `sideEffects: false`,
 * so bundlers will only include the code actually imported.
 */

describe('vertz meta-package subpath exports', () => {
  it('vertz/server re-exports @vertz/server', async () => {
    const mod = await import('vertz/server');
    // createServer is the primary export from @vertz/server
    expect(mod.createServer).toBeDefined();
    expect(typeof mod.createServer).toBe('function');
  });

  it('vertz/schema re-exports @vertz/schema', async () => {
    const mod = await import('vertz/schema');
    // s is the schema builder
    expect(mod.s).toBeDefined();
    expect(typeof mod.s).toBe('object');
  });

  it('vertz/db re-exports @vertz/db', async () => {
    const mod = await import('vertz/db');
    // Should have db-related exports
    expect(Object.keys(mod).length).toBeGreaterThan(0);
  });

  it('vertz/testing re-exports @vertz/testing', async () => {
    const mod = await import('vertz/testing');
    expect(Object.keys(mod).length).toBeGreaterThan(0);
  });

  it('vertz/ui re-exports @vertz/ui', async () => {
    const mod = await import('vertz/ui');
    expect(Object.keys(mod).length).toBeGreaterThan(0);
  });

  it('vertz/ui-compiler re-exports @vertz/ui-compiler', async () => {
    const mod = await import('vertz/ui-compiler');
    expect(Object.keys(mod).length).toBeGreaterThan(0);
  });

  it('vertz has no default/root export', async () => {
    // Verify package.json has no "." export
    const fs = await import('node:fs');
    const path = await import('node:path');
    const pkgPath = path.resolve(import.meta.dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(pkg.exports['.']).toBeUndefined();
    expect(pkg.main).toBeUndefined();
  });

  it('vertz/fetch re-exports @vertz/fetch', async () => {
    const mod = await import('vertz/fetch');
    expect(Object.keys(mod).length).toBeGreaterThan(0);
  });

  it('vertz/errors re-exports @vertz/errors', async () => {
    const mod = await import('vertz/errors');
    expect(Object.keys(mod).length).toBeGreaterThan(0);
  });

  it('vertz/cloudflare re-exports @vertz/cloudflare', async () => {
    const mod = await import('vertz/cloudflare');
    expect(Object.keys(mod).length).toBeGreaterThan(0);
  });

  it('vertz/tui re-exports @vertz/tui', async () => {
    const mod = await import('vertz/tui');
    expect(Object.keys(mod).length).toBeGreaterThan(0);
  });

  it('vertz/ui-primitives re-exports @vertz/ui-primitives', async () => {
    const mod = await import('vertz/ui-primitives');
    expect(Object.keys(mod).length).toBeGreaterThan(0);
  });
});

describe('exports point to built artifacts', () => {
  it('all subpath imports resolve to dist/*.js, not src/*.ts', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const pkgPath = path.resolve(import.meta.dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    for (const [, entry] of Object.entries(pkg.exports)) {
      const { import: importPath } = entry as { import: string };
      expect(importPath).toStartWith('./dist/');
      expect(importPath).toEndWith('.js');
      // The built file must actually exist
      const fullPath = path.resolve(import.meta.dirname, '..', importPath);
      expect(fs.existsSync(fullPath)).toBe(true);
    }
  });

  it('all subpath types resolve to dist/*.d.ts', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const pkgPath = path.resolve(import.meta.dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    for (const [, entry] of Object.entries(pkg.exports)) {
      const { types: typesPath } = entry as { types: string };
      expect(typesPath).toStartWith('./dist/');
      expect(typesPath).toEndWith('.d.ts');
      const fullPath = path.resolve(import.meta.dirname, '..', typesPath);
      expect(fs.existsSync(fullPath)).toBe(true);
    }
  });
});

describe('subpath type coverage', () => {
  it('vertz/server types match @vertz/server types', async () => {
    const vertzMod = await import('vertz/server');
    const directMod = await import('@vertz/server');

    // Both should expose the same set of exports
    const vertzKeys = Object.keys(vertzMod).sort();
    const directKeys = Object.keys(directMod).sort();
    expect(vertzKeys).toEqual(directKeys);
  });

  it('vertz/schema types match @vertz/schema types', async () => {
    const vertzMod = await import('vertz/schema');
    const directMod = await import('@vertz/schema');

    const vertzKeys = Object.keys(vertzMod).sort();
    const directKeys = Object.keys(directMod).sort();
    expect(vertzKeys).toEqual(directKeys);
  });

  it('vertz/cloudflare types match @vertz/cloudflare types', async () => {
    const vertzMod = await import('vertz/cloudflare');
    const directMod = await import('@vertz/cloudflare');

    const vertzKeys = Object.keys(vertzMod).sort();
    const directKeys = Object.keys(directMod).sort();
    expect(vertzKeys).toEqual(directKeys);
  });
});

describe('Node-compatible built artifacts', () => {
  it('dist/*.js files contain valid ESM re-exports', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const distDir = path.resolve(import.meta.dirname, '..', 'dist');

    const serverJs = fs.readFileSync(path.join(distDir, 'server.js'), 'utf-8');
    expect(serverJs).toContain('export');
    expect(serverJs).toContain('@vertz/server');
    // Must not contain TypeScript syntax
    expect(serverJs).not.toContain(': string');
    expect(serverJs).not.toContain('import type');
  });

  it('dist/*.d.ts files contain type declarations', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const distDir = path.resolve(import.meta.dirname, '..', 'dist');

    const serverDts = fs.readFileSync(path.join(distDir, 'server.d.ts'), 'utf-8');
    expect(serverDts).toContain('export');
    expect(serverDts).toContain('@vertz/server');
  });
});

describe('tree-shaking: subpaths are independent modules', () => {
  it('each subpath points to a separate entry file', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const pkgPath = path.resolve(import.meta.dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    const exportPaths = Object.values(pkg.exports) as Array<{ import: string }>;
    const importPaths = exportPaths.map((e) => e.import);

    // All import paths should be unique (no shared entry point)
    const unique = new Set(importPaths);
    expect(unique.size).toBe(importPaths.length);

    // sideEffects must be false for tree-shaking
    expect(pkg.sideEffects).toBe(false);
  });
});
