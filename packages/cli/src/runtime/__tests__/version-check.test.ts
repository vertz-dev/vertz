import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkVersionCompatibility } from '../launcher';

describe('Feature: version compatibility check', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vertz-ver-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Given CLI version 0.2.42 and runtime version 0.2.40', () => {
    describe('When version check runs', () => {
      it('Then warns to update @vertz/runtime', () => {
        const binaryPath = join(tmpDir, 'vertz-runtime');
        writeFileSync(binaryPath, '#!/bin/sh\necho "vertz-runtime 0.2.40"', { mode: 0o755 });

        const warning = checkVersionCompatibility(binaryPath, '0.2.42');

        expect(warning).not.toBeNull();
        expect(warning!).toContain('CLI version 0.2.42 but runtime version 0.2.40');
        expect(warning!).toContain('npm update @vertz/runtime');
      });
    });
  });

  describe('Given CLI version 0.2.40 and runtime version 0.2.42', () => {
    describe('When version check runs', () => {
      it('Then warns to update @vertz/cli', () => {
        const binaryPath = join(tmpDir, 'vertz-runtime');
        writeFileSync(binaryPath, '#!/bin/sh\necho "vertz-runtime 0.2.42"', { mode: 0o755 });

        const warning = checkVersionCompatibility(binaryPath, '0.2.40');

        expect(warning).not.toBeNull();
        expect(warning!).toContain('CLI version 0.2.40 but runtime version 0.2.42');
        expect(warning!).toContain('npm update @vertz/cli');
      });
    });
  });

  describe('Given matching versions', () => {
    describe('When version check runs', () => {
      it('Then prints no warning', () => {
        const binaryPath = join(tmpDir, 'vertz-runtime');
        writeFileSync(binaryPath, '#!/bin/sh\necho "vertz-runtime 0.2.42"', { mode: 0o755 });

        const warning = checkVersionCompatibility(binaryPath, '0.2.42');

        expect(warning).toBeNull();
      });
    });
  });

  describe('Given binary that fails to execute', () => {
    describe('When version check runs', () => {
      it('Then returns null (skip check silently)', () => {
        const warning = checkVersionCompatibility('/nonexistent/binary', '0.2.42');

        expect(warning).toBeNull();
      });
    });
  });
});
