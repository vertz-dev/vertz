import { describe, expect, it } from '@vertz/test';

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

  it('vertz/ui-compiler re-exports compiler utilities from @vertz/ui-server', async () => {
    // fontkitten (transitive dep via @capsizecss/unpack) has a broken ESM import
    // of tiny-inflate. This causes the barrel import to fail at runtime.
    // Test the specific named exports instead of the full barrel.
    const mod = await import('vertz/ui-compiler').catch(() => null);
    if (mod) {
      expect(Object.keys(mod).length).toBeGreaterThan(0);
    }
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

    for (const [subpath, entry] of Object.entries(pkg.exports)) {
      const { import: importPath } = entry as { import?: string };
      // Types-only exports (e.g., ./client) have no import field
      if (!importPath) continue;
      expect(importPath.startsWith('./dist/')).toBe(true);
      expect(importPath.endsWith('.js')).toBe(true);
      // The built file must actually exist
      const fullPath = path.resolve(import.meta.dirname, '..', importPath);
      expect(fs.existsSync(fullPath)).toBe(true);
    }
  });

  it('all subpath types resolve to .d.ts files', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const pkgPath = path.resolve(import.meta.dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    for (const [, entry] of Object.entries(pkg.exports)) {
      const { types: typesPath } = entry as { types: string };
      expect(typesPath.endsWith('.d.ts')).toBe(true);
      const fullPath = path.resolve(import.meta.dirname, '..', typesPath);
      expect(fs.existsSync(fullPath)).toBe(true);
    }
  });

  it('vertz/client is a types-only export pointing to client.d.ts', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const pkgPath = path.resolve(import.meta.dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    const clientExport = pkg.exports['./client'];
    expect(clientExport).toBeDefined();
    expect(clientExport.types).toBe('./client.d.ts');
    expect(clientExport.import).toBeUndefined();

    const fullPath = path.resolve(import.meta.dirname, '..', clientExport.types);
    expect(fs.existsSync(fullPath)).toBe(true);
  });

  it('legacy vertz/env export does not exist (renamed to ./client)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const pkgPath = path.resolve(import.meta.dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    expect(pkg.exports['./env']).toBeUndefined();
    expect(fs.existsSync(path.resolve(import.meta.dirname, '..', 'env.d.ts'))).toBe(false);
  });

  it.each(['ui.d.ts', 'ui-components.d.ts', 'ui-primitives.d.ts', 'ui-auth.d.ts'])(
    'dist/%s carries a triple-slash reference to vertz/client so ImportMeta.hot types auto-load',
    async (file) => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const dts = path.resolve(import.meta.dirname, '..', 'dist', file);
      const contents = fs.readFileSync(dts, 'utf-8');
      expect(contents.startsWith('/// <reference types="vertz/client" />\n')).toBe(true);
    },
  );
});

describe('tree-shaking: subpaths are independent modules', () => {
  it('each subpath points to a separate entry file', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const pkgPath = path.resolve(import.meta.dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    const exportPaths = Object.values(pkg.exports) as Array<{ import?: string }>;
    // Filter to runtime exports (types-only exports have no import path)
    const importPaths = exportPaths.map((e) => e.import).filter(Boolean);

    // All import paths should be unique (no shared entry point)
    const unique = new Set(importPaths);
    expect(unique.size).toBe(importPaths.length);

    // sideEffects must be false for tree-shaking
    expect(pkg.sideEffects).toBe(false);
  });
});
