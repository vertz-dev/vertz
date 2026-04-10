import { describe, expect, it } from '@vertz/test';

const hasNativeCompiler = !!(globalThis as Record<string, unknown>).__NATIVE_COMPILER_AVAILABLE__;

import { createAotManifestManager } from '../ssr-aot-manifest-dev';

// Minimal TSX source with a static component
const STATIC_COMPONENT = `
export function Header() {
  return <header><h1>Hello</h1></header>;
}
`.trim();

// Component that cannot be AOT-compiled (try/catch with multiple returns)
const FALLBACK_COMPONENT = `
export function Counter() {
  try { return <span>OK</span>; }
  catch { return <span>Error</span>; }
}
`.trim();

// Two components in one file
const MULTI_COMPONENT = `
export function Nav() {
  return <nav><a href="/">Home</a></nav>;
}

export function Footer() {
  return <footer>© 2026</footer>;
}
`.trim();

describe.skipIf(!hasNativeCompiler)('AotManifestManager', () => {
  describe('Given a manager with source files', () => {
    describe('When build() is called', () => {
      it('Then produces a manifest with AOT-compiled components', () => {
        const files: Record<string, string> = {
          '/app/src/header.tsx': STATIC_COMPONENT,
        };
        const manager = createAotManifestManager({
          readFile: (path) => files[path],
          listFiles: () => Object.keys(files),
        });

        manager.build();
        const snapshot = manager.getSnapshot();

        expect(snapshot.manifest).not.toBeNull();
        expect(snapshot.manifest?.components.Header).toBeDefined();
        expect(snapshot.manifest?.components.Header.tier).toBe('static');
        expect(snapshot.rebuildCount).toBe(1);
      });

      it('Then classifies reactive components as runtime-fallback', () => {
        const files: Record<string, string> = {
          '/app/src/counter.tsx': FALLBACK_COMPONENT,
        };
        const manager = createAotManifestManager({
          readFile: (path) => files[path],
          listFiles: () => Object.keys(files),
        });

        manager.build();
        const snapshot = manager.getSnapshot();

        expect(snapshot.manifest?.components.Counter).toBeDefined();
        expect(snapshot.manifest?.components.Counter.tier).toBe('runtime-fallback');
      });

      it('Then handles multiple components per file', () => {
        const files: Record<string, string> = {
          '/app/src/layout.tsx': MULTI_COMPONENT,
        };
        const manager = createAotManifestManager({
          readFile: (path) => files[path],
          listFiles: () => Object.keys(files),
        });

        manager.build();
        const snapshot = manager.getSnapshot();

        expect(snapshot.manifest?.components.Nav).toBeDefined();
        expect(snapshot.manifest?.components.Footer).toBeDefined();
        expect(snapshot.manifest?.components.Nav.tier).toBe('static');
        expect(snapshot.manifest?.components.Footer.tier).toBe('static');
      });

      it('Then skips non-TSX files', () => {
        const files: Record<string, string> = {
          '/app/src/utils.ts': 'export const foo = 42;',
          '/app/src/header.tsx': STATIC_COMPONENT,
        };
        const manager = createAotManifestManager({
          readFile: (path) => files[path],
          listFiles: () => Object.keys(files),
        });

        manager.build();
        const snapshot = manager.getSnapshot();

        expect(Object.keys(snapshot.manifest?.components)).toEqual(['Header']);
      });
    });

    describe('When onFileChange() is called for a TSX file', () => {
      it("Then incrementally updates that file's components", () => {
        const files: Record<string, string> = {
          '/app/src/header.tsx': STATIC_COMPONENT,
        };
        const manager = createAotManifestManager({
          readFile: (path) => files[path],
          listFiles: () => Object.keys(files),
        });
        manager.build();

        // Change the component
        const updatedSource = `
export function Header({ title }: { title: string }) {
  return <header><h1>{title}</h1></header>;
}
`.trim();

        manager.onFileChange('/app/src/header.tsx', updatedSource);
        const snapshot = manager.getSnapshot();

        expect(snapshot.manifest?.components.Header.tier).toBe('data-driven');
        expect(snapshot.rebuildCount).toBe(2);
      });

      it('Then removes components from deleted files', () => {
        const files: Record<string, string> = {
          '/app/src/header.tsx': STATIC_COMPONENT,
          '/app/src/layout.tsx': MULTI_COMPONENT,
        };
        const manager = createAotManifestManager({
          readFile: (path) => files[path],
          listFiles: () => Object.keys(files),
        });
        manager.build();

        // Simulate file deletion by passing empty source
        manager.onFileChange('/app/src/layout.tsx', '');
        const snapshot = manager.getSnapshot();

        expect(snapshot.manifest?.components.Header).toBeDefined();
        expect(snapshot.manifest?.components.Nav).toBeUndefined();
        expect(snapshot.manifest?.components.Footer).toBeUndefined();
      });
    });

    describe('When onFileChange() is called for a non-TSX file', () => {
      it('Then the manifest is unchanged', () => {
        const files: Record<string, string> = {
          '/app/src/header.tsx': STATIC_COMPONENT,
        };
        const manager = createAotManifestManager({
          readFile: (path) => files[path],
          listFiles: () => Object.keys(files),
        });
        manager.build();
        const before = manager.getSnapshot();

        manager.onFileChange('/app/src/utils.ts', 'export const x = 1;');
        const after = manager.getSnapshot();

        expect(after.rebuildCount).toBe(before.rebuildCount);
      });
    });

    describe('When getDiagnostics() is called', () => {
      it('Then returns AotDiagnostics instance with recorded components', () => {
        const files: Record<string, string> = {
          '/app/src/header.tsx': STATIC_COMPONENT,
          '/app/src/counter.tsx': FALLBACK_COMPONENT,
        };
        const manager = createAotManifestManager({
          readFile: (path) => files[path],
          listFiles: () => Object.keys(files),
        });
        manager.build();

        const diagnostics = manager.getDiagnostics();
        const snapshot = diagnostics.getSnapshot();

        expect(snapshot.coverage.total).toBe(2);
        expect(snapshot.coverage.aot).toBe(1);
        expect(snapshot.coverage.runtime).toBe(1);
        expect(snapshot.coverage.percentage).toBe(50);
      });
    });

    describe('When build fails on a file', () => {
      it('Then skips the file and continues with others', () => {
        const files: Record<string, string> = {
          '/app/src/broken.tsx': 'this is not valid tsx {{{',
          '/app/src/header.tsx': STATIC_COMPONENT,
        };
        const manager = createAotManifestManager({
          readFile: (path) => files[path],
          listFiles: () => Object.keys(files),
        });

        manager.build();
        const snapshot = manager.getSnapshot();

        // Should still have Header despite broken.tsx failing
        expect(snapshot.manifest?.components.Header).toBeDefined();
        expect(snapshot.manifest?.components.Header.tier).toBe('static');
      });
    });
  });
});
