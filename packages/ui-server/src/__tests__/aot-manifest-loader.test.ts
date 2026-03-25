/**
 * Tests for loadAotManifest() — loading AOT manifest + routes module at runtime.
 * Issue: #1843
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadAotManifest } from '../aot-manifest-loader';

describe('loadAotManifest', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(import.meta.dir, `.tmp-aot-loader-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Given a server directory with aot-manifest.json and aot-routes.js', () => {
    describe('When loadAotManifest is called', () => {
      it('Then returns an AotManifest with wired render functions', async () => {
        writeFileSync(
          join(tmpDir, 'aot-manifest.json'),
          JSON.stringify({
            routes: {
              '/': { renderFn: '__ssr_HomePage', holes: [], queryKeys: [] },
            },
          }),
        );
        writeFileSync(
          join(tmpDir, 'aot-routes.js'),
          `export function __ssr_HomePage(data, ctx) { return '<div>Home</div>'; }`,
        );

        const manifest = await loadAotManifest(tmpDir);

        expect(manifest).toBeDefined();
        expect(manifest?.routes['/']).toBeDefined();
        expect(typeof manifest?.routes['/']?.render).toBe('function');
        expect(manifest?.routes['/']?.render({}, {} as never)).toBe('<div>Home</div>');
        expect(manifest?.routes['/']?.holes).toEqual([]);
        expect(manifest?.routes['/']?.queryKeys).toEqual([]);
      });
    });
  });

  describe('Given a server directory without aot-manifest.json', () => {
    describe('When loadAotManifest is called', () => {
      it('Then returns null', async () => {
        const manifest = await loadAotManifest(tmpDir);
        expect(manifest).toBeNull();
      });
    });
  });

  describe('Given aot-manifest.json exists but aot-routes.js does not', () => {
    describe('When loadAotManifest is called', () => {
      it('Then returns null', async () => {
        writeFileSync(
          join(tmpDir, 'aot-manifest.json'),
          JSON.stringify({
            routes: {
              '/': { renderFn: '__ssr_HomePage', holes: [], queryKeys: [] },
            },
          }),
        );

        const manifest = await loadAotManifest(tmpDir);
        expect(manifest).toBeNull();
      });
    });
  });

  describe('Given a manifest with multiple routes', () => {
    describe('When loadAotManifest is called', () => {
      it('Then all routes are wired to their render functions', async () => {
        writeFileSync(
          join(tmpDir, 'aot-manifest.json'),
          JSON.stringify({
            routes: {
              '/': { renderFn: '__ssr_HomePage', holes: [], queryKeys: [] },
              '/about': { renderFn: '__ssr_AboutPage', holes: [], queryKeys: [] },
            },
          }),
        );
        writeFileSync(
          join(tmpDir, 'aot-routes.js'),
          `export function __ssr_HomePage() { return '<div>Home</div>'; }
export function __ssr_AboutPage() { return '<div>About</div>'; }`,
        );

        const manifest = await loadAotManifest(tmpDir);

        expect(manifest?.routes['/']?.render({}, {} as never)).toBe('<div>Home</div>');
        expect(manifest?.routes['/about']?.render({}, {} as never)).toBe('<div>About</div>');
      });
    });
  });

  describe('Given a manifest where a render function is missing from the routes module', () => {
    describe('When loadAotManifest is called', () => {
      it('Then skips routes with missing render functions', async () => {
        writeFileSync(
          join(tmpDir, 'aot-manifest.json'),
          JSON.stringify({
            routes: {
              '/': { renderFn: '__ssr_HomePage', holes: [], queryKeys: [] },
              '/missing': { renderFn: '__ssr_MissingPage', holes: [], queryKeys: [] },
            },
          }),
        );
        writeFileSync(
          join(tmpDir, 'aot-routes.js'),
          `export function __ssr_HomePage() { return '<div>Home</div>'; }`,
        );

        const manifest = await loadAotManifest(tmpDir);

        expect(manifest?.routes['/']).toBeDefined();
        expect(manifest?.routes['/missing']).toBeUndefined();
      });
    });
  });
});
