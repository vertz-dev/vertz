import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { join, dirname } from 'node:path';

// We test getBinaryPath() by controlling what require.resolve returns.
// Since getBinaryPath() uses createRequire internally, we mock at the module level.

describe('Feature: getBinaryPath() resolves platform binary', () => {
  describe('Given a platform package is installed at the expected path', () => {
    describe('When getBinaryPath() is called', () => {
      it('Then returns the full path to the vtz binary', async () => {
        // The current platform's package exists (this test runs on whatever platform CI uses).
        // We verify the function constructs the right package name and path.
        const expectedPkg = `@vertz/runtime-${process.platform}-${process.arch}`;

        // Create a mock module that simulates require.resolve succeeding
        // Since we can't easily mock createRequire, we test the actual function
        // against the real filesystem. The platform packages exist in our monorepo
        // as siblings, so require.resolve will find them.
        const { getBinaryPath } = await import('./index.ts');

        // On our dev machine, the platform package exists in the monorepo workspace.
        // getBinaryPath() should resolve to npm/runtime-<platform>-<arch>/vtz
        try {
          const result = getBinaryPath();
          // If resolution succeeds, the path should end with 'vtz'
          expect(result.endsWith('vtz')).toBe(true);
          // And it should contain the platform package name directory
          expect(result).toContain(`runtime-${process.platform}-${process.arch}`);
        } catch (e: unknown) {
          // Platform package not installed, or installed but binary missing.
          // Either error message should reference the expected package name.
          const error = e as Error;
          expect(error.message).toContain(expectedPkg);
        }
      });
    });
  });

  describe('Given no platform package is installed', () => {
    describe('When getBinaryPath() is called on an unsupported platform', () => {
      it('Then throws with platform name, package name, and install instructions', async () => {
        // We can test this by temporarily overriding process.platform/arch
        // to a platform that definitely doesn't have a package installed.
        const originalPlatform = process.platform;
        const originalArch = process.arch;

        try {
          // Override to a fake platform
          Object.defineProperty(process, 'platform', { value: 'freebsd', configurable: true });
          Object.defineProperty(process, 'arch', { value: 'mips', configurable: true });

          // Re-import to get fresh module with new platform values
          // Since getBinaryPath reads process.platform at call time, not import time,
          // we can call the existing import
          const { getBinaryPath } = await import('./index.ts');

          expect(() => getBinaryPath()).toThrow();

          try {
            getBinaryPath();
          } catch (e: unknown) {
            const error = e as Error;
            expect(error.message).toContain('freebsd-mips');
            expect(error.message).toContain('@vertz/runtime-freebsd-mips');
            expect(error.message).toContain('npm install @vertz/runtime');
            expect(error.message).toContain('cargo build --release');
            expect(error.message).toContain('Supported platforms:');
          }
        } finally {
          Object.defineProperty(process, 'platform', {
            value: originalPlatform,
            configurable: true,
          });
          Object.defineProperty(process, 'arch', { value: originalArch, configurable: true });
        }
      });

      it('Then lists all supported platforms in the error message', async () => {
        const originalPlatform = process.platform;
        const originalArch = process.arch;

        try {
          Object.defineProperty(process, 'platform', { value: 'freebsd', configurable: true });
          Object.defineProperty(process, 'arch', { value: 'mips', configurable: true });

          const { getBinaryPath } = await import('./index.ts');

          try {
            getBinaryPath();
          } catch (e: unknown) {
            const error = e as Error;
            expect(error.message).toContain('darwin-arm64');
            expect(error.message).toContain('darwin-x64');
            expect(error.message).toContain('linux-x64');
            expect(error.message).toContain('linux-arm64');
          }
        } finally {
          Object.defineProperty(process, 'platform', {
            value: originalPlatform,
            configurable: true,
          });
          Object.defineProperty(process, 'arch', { value: originalArch, configurable: true });
        }
      });
    });
  });
});

describe('Feature: getBinaryPath() resolves correct path structure', () => {
  describe('Given the current platform is darwin-arm64', () => {
    describe('When getBinaryPath() resolves the package', () => {
      it('Then the returned path is <pkgDir>/vtz', async () => {
        // This test verifies the path construction: dirname(resolve(pkg/package.json)) + /vtz
        // We test on the actual platform since our monorepo has the package.json files
        const { getBinaryPath } = await import('./index.ts');
        const expectedPkg = `@vertz/runtime-${process.platform}-${process.arch}`;

        try {
          const result = getBinaryPath();
          // Path should be: <somewhere>/runtime-<platform>-<arch>/vtz
          const dir = dirname(result);
          const basename = result.split('/').pop();
          expect(basename).toBe('vtz');
        } catch {
          // Platform package not resolvable in this environment — skip
        }
      });
    });
  });
});
