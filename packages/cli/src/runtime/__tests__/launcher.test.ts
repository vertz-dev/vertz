import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildRuntimeArgs,
  findRuntimeBinary,
  NATIVE_RUNTIME_COMMANDS,
  type RuntimeLaunchOptions,
} from '../launcher';

describe('Feature: findRuntimeBinary() resolution order', () => {
  let tmpDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vertz-rt-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
    originalEnv = process.env.VERTZ_RUNTIME_BINARY;
    delete process.env.VERTZ_RUNTIME_BINARY;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    if (originalEnv === undefined) {
      delete process.env.VERTZ_RUNTIME_BINARY;
    } else {
      process.env.VERTZ_RUNTIME_BINARY = originalEnv;
    }
  });

  describe('Given VERTZ_RUNTIME_BINARY is set to an existing path', () => {
    describe('When findRuntimeBinary() is called', () => {
      it('Then returns the env var path (skips all other resolution)', () => {
        const customPath = join(tmpDir, 'custom-binary');
        writeFileSync(customPath, '#!/bin/sh', { mode: 0o755 });
        process.env.VERTZ_RUNTIME_BINARY = customPath;

        const result = findRuntimeBinary(tmpDir);

        expect(result).toBe(customPath);
      });
    });
  });

  describe('Given VERTZ_RUNTIME_BINARY is set to a nonexistent path', () => {
    describe('When findRuntimeBinary() is called', () => {
      it('Then throws with path and removal suggestion', () => {
        process.env.VERTZ_RUNTIME_BINARY = '/nonexistent/path/vertz-runtime';

        expect(() => findRuntimeBinary(tmpDir)).toThrow(
          /VERTZ_RUNTIME_BINARY is set to '\/nonexistent\/path\/vertz-runtime' but the file does not exist/,
        );
        expect(() => findRuntimeBinary(tmpDir)).toThrow(
          /Remove VERTZ_RUNTIME_BINARY to use automatic resolution/,
        );
      });
    });
  });

  describe('Given no binary available at all', () => {
    describe('When findRuntimeBinary() is called', () => {
      it('Then returns null', () => {
        const result = findRuntimeBinary(tmpDir);

        expect(result).toBeNull();
      });
    });
  });
});

describe('Feature: NATIVE_RUNTIME_COMMANDS', () => {
  it('supports dev and test commands', () => {
    expect(NATIVE_RUNTIME_COMMANDS.has('dev')).toBe(true);
    expect(NATIVE_RUNTIME_COMMANDS.has('test')).toBe(true);
  });

  it('does not support build or start commands', () => {
    expect(NATIVE_RUNTIME_COMMANDS.has('build')).toBe(false);
    expect(NATIVE_RUNTIME_COMMANDS.has('start')).toBe(false);
  });
});

describe('buildRuntimeArgs', () => {
  it('builds basic dev args with port and host', () => {
    const opts: RuntimeLaunchOptions = {
      port: 4000,
      host: '0.0.0.0',
    };

    const args = buildRuntimeArgs(opts);

    expect(args).toEqual(['dev', '--port', '4000', '--host', '0.0.0.0']);
  });

  it('includes --no-typecheck when typecheck is false', () => {
    const opts: RuntimeLaunchOptions = {
      port: 3000,
      host: 'localhost',
      typecheck: false,
    };

    const args = buildRuntimeArgs(opts);

    expect(args).toContain('--no-typecheck');
  });

  it('does not include --no-typecheck when typecheck is true', () => {
    const opts: RuntimeLaunchOptions = {
      port: 3000,
      host: 'localhost',
      typecheck: true,
    };

    const args = buildRuntimeArgs(opts);

    expect(args).not.toContain('--no-typecheck');
  });

  it('includes --open when open is true', () => {
    const opts: RuntimeLaunchOptions = {
      port: 3000,
      host: 'localhost',
      open: true,
    };

    const args = buildRuntimeArgs(opts);

    expect(args).toContain('--open');
  });

  it('does not include --open when open is false or undefined', () => {
    const args1 = buildRuntimeArgs({ open: false });
    const args2 = buildRuntimeArgs({});

    expect(args1).not.toContain('--open');
    expect(args2).not.toContain('--open');
  });

  it('uses default port 3000 and host localhost', () => {
    const opts: RuntimeLaunchOptions = {};

    const args = buildRuntimeArgs(opts);

    expect(args).toEqual(['dev', '--port', '3000', '--host', 'localhost']);
  });
});
