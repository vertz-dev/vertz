import { describe, it, expect } from 'vitest';

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
    const fs = await import('fs');
    const path = await import('path');
    const pkgPath = path.resolve(import.meta.dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(pkg.exports['.']).toBeUndefined();
    expect(pkg.main).toBeUndefined();
  });

  it('vertz/router re-exports @vertz/ui', async () => {
    const mod = await import('vertz/router');
    // Should have router-related exports
    expect(Object.keys(mod).length).toBeGreaterThan(0);
  });

  it('vertz/signal re-exports @vertz/ui', async () => {
    const mod = await import('vertz/signal');
    // Should have signal-related exports
    expect(Object.keys(mod).length).toBeGreaterThan(0);
  });
});

describe('tree-shaking: subpaths are independent modules', () => {
  it('each subpath points to a separate source file', async () => {
    // Verify the package.json exports field has separate entry points
    const fs = await import('fs');
    const path = await import('path');
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
