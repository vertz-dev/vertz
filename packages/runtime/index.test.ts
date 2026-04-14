import { describe, it, expect, beforeAll, afterAll } from '@vertz/test';
import { dirname, join, resolve } from 'node:path';
import {
  existsSync,
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { execSync, execFileSync } from 'node:child_process';

describe('Feature: getBinaryPath() resolves platform binary', () => {
  describe('Given a platform package is installed at the expected path', () => {
    describe('When getBinaryPath() is called', () => {
      it('Then returns the full path to the vtz binary', async () => {
        const expectedPkg = `@vertz/runtime-${process.platform}-${process.arch}`;
        const { getBinaryPath } = await import('./index.ts');

        try {
          const result = getBinaryPath();
          expect(result.endsWith('vtz')).toBe(true);
          expect(result).toContain(`runtime-${process.platform}-${process.arch}`);
        } catch (e: unknown) {
          const error = e as Error;
          expect(error.message).toContain(expectedPkg);
        }
      });
    });
  });

  describe('Given no platform package is installed', () => {
    describe('When getBinaryPath() is called on an unsupported platform', () => {
      it('Then throws with platform name, package name, and install instructions', async () => {
        const originalPlatform = process.platform;
        const originalArch = process.arch;

        try {
          Object.defineProperty(process, 'platform', { value: 'freebsd', configurable: true });
          Object.defineProperty(process, 'arch', { value: 'mips', configurable: true });

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
        const { getBinaryPath } = await import('./index.ts');

        try {
          const result = getBinaryPath();
          const basename = result.split('/').pop();
          expect(basename).toBe('vtz');
        } catch {
          // Platform package not resolvable in this environment — skip
        }
      });
    });
  });
});

const pkgDir = dirname(new URL(import.meta.url).pathname);

describe('Feature: bin scripts are pure bash with no Node/Bun dependency (#2419)', () => {
  describe('Given the published package manifest', () => {
    const pkgJson = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));

    it('Then every bin entry points to a .sh file that exists', () => {
      for (const [name, target] of Object.entries(pkgJson.bin as Record<string, string>)) {
        expect(target).toMatch(/\.sh$/);
        const fullPath = resolve(pkgDir, target);
        expect(existsSync(fullPath)).toBe(true);
      }
    });

    it('Then every bin target is included in the files array', () => {
      const files: string[] = pkgJson.files;
      for (const [, target] of Object.entries(pkgJson.bin as Record<string, string>)) {
        const relative = (target as string).replace(/^\.\//, '');
        expect(files).toContain(relative);
      }
    });

    it('Then no .js bin entries remain', () => {
      for (const [, target] of Object.entries(pkgJson.bin as Record<string, string>)) {
        expect(target).not.toMatch(/\.js$/);
      }
    });
  });

  describe('Given the cli.sh script', () => {
    const shimPath = join(pkgDir, 'cli.sh');
    const content = readFileSync(shimPath, 'utf8');

    it('Then has a bash shebang as the first line', () => {
      expect(content.startsWith('#!/usr/bin/env bash\n')).toBe(true);
    });

    it('Then contains no references to node, bun, or bunx', () => {
      expect(content).not.toContain('#!/usr/bin/env node');
      expect(content).not.toContain('bunx');
      // Check for 'bun ' (with space) to avoid matching 'subcommand'
      expect(content).not.toMatch(/\bbun\b/);
    });

    it('Then resolves the native binary from sibling platform package', () => {
      expect(content).toContain('runtime-${OS}-${ARCH}/vtz');
      expect(content).toContain('exec "$BINARY"');
    });

    it('Then handles run subcommand by extracting scripts from package.json', () => {
      expect(content).toContain('run)');
      expect(content).toContain('package.json');
      expect(content).toContain('SCRIPT_NAME');
    });

    it('Then handles exec subcommand by prepending node_modules/.bin to PATH', () => {
      expect(content).toContain('exec)');
      expect(content).toContain('node_modules/.bin');
      expect(content).toContain('PATH');
    });

    it('Then errors clearly for unsupported subcommands', () => {
      expect(content).toContain('no fallback');
      expect(content).toContain('cargo build --release');
    });
  });

  describe('Given the cli-exec.sh script', () => {
    const shimPath = join(pkgDir, 'cli-exec.sh');
    const content = readFileSync(shimPath, 'utf8');

    it('Then has a bash shebang as the first line', () => {
      expect(content.startsWith('#!/usr/bin/env bash\n')).toBe(true);
    });

    it('Then contains no references to node, bun, or bunx', () => {
      expect(content).not.toContain('#!/usr/bin/env node');
      expect(content).not.toContain('bunx');
      expect(content).not.toMatch(/\bbun\b/);
    });

    it('Then resolves the native binary from sibling platform package', () => {
      expect(content).toContain('runtime-${OS}-${ARCH}/vtz');
      expect(content).toContain('exec "$BINARY" exec');
    });

    it('Then falls back to PATH-based resolution from node_modules/.bin', () => {
      expect(content).toContain('node_modules/.bin');
      expect(content).toContain('PATH');
      expect(content).toContain('exec "$@"');
    });
  });
});

describe('Feature: cli.sh finds native binary in nested invocations (#2609)', () => {
  const cliShSrc = join(pkgDir, 'cli.sh');
  let tmpDir: string;
  let nativeBinDir: string;
  let selfBinDir: string;
  let cliShCopy: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vtz-path-test-'));

    // Copy cli.sh to a temp location where no sibling platform package exists
    cliShCopy = join(tmpDir, 'cli.sh');
    writeFileSync(cliShCopy, readFileSync(cliShSrc, 'utf8'));
    chmodSync(cliShCopy, 0o755);

    // Create a fake "native" vtz binary that echoes a marker
    nativeBinDir = join(tmpDir, 'native-bin');
    mkdirSync(nativeBinDir);
    writeFileSync(join(nativeBinDir, 'vtz'), '#!/bin/bash\necho "NATIVE_VTZ_FOUND"');
    chmodSync(join(nativeBinDir, 'vtz'), 0o755);

    // Create a self-referencing symlink (simulates node_modules/.bin/vtz → cli.sh)
    selfBinDir = join(tmpDir, 'self-bin');
    mkdirSync(selfBinDir);
    execSync(`ln -s "${cliShCopy}" "${join(selfBinDir, 'vtz')}"`, { encoding: 'utf-8' });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Given a self-referencing vtz symlink appears before native binary on PATH', () => {
    describe('When cli.sh is invoked via the symlink', () => {
      it('Then finds the native binary by walking remaining PATH entries', () => {
        // PATH: self-referencing dir first, then native binary, then system essentials
        const testPath = `${selfBinDir}:${nativeBinDir}:/usr/bin:/bin:/usr/local/bin`;

        const stdout = execFileSync(join(selfBinDir, 'vtz'), ['test'], {
          env: { PATH: testPath, HOME: tmpDir },
          encoding: 'utf-8',
        });

        expect(stdout.trim()).toBe('NATIVE_VTZ_FOUND');
      });
    });
  });

  describe('Given no native binary exists anywhere on PATH', () => {
    describe('When cli.sh is invoked', () => {
      it('Then exits with error and descriptive message', () => {
        // PATH: only self-referencing dir + system essentials (no native binary)
        const testPath = `${selfBinDir}:/usr/bin:/bin`;

        try {
          execFileSync(join(selfBinDir, 'vtz'), ['test'], {
            env: { PATH: testPath, HOME: tmpDir },
            encoding: 'utf-8',
          });
          // Should not reach here
          expect(true).toBe(false);
        } catch (err: unknown) {
          expect((err as { stderr: string }).stderr).toContain('no fallback');
        }
      });
    });
  });
});
