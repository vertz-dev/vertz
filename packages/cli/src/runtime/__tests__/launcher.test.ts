import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  findRuntimeBinary,
  launchRuntime,
  type RuntimeLaunchOptions,
  buildRuntimeArgs,
} from '../launcher';

describe('findRuntimeBinary', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vertz-rt-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('finds binary in native/target/debug when it exists', () => {
    const binaryDir = join(tmpDir, 'native', 'target', 'debug');
    mkdirSync(binaryDir, { recursive: true });
    writeFileSync(join(binaryDir, 'vertz-runtime'), '#!/bin/sh\necho ok', { mode: 0o755 });

    const result = findRuntimeBinary(tmpDir);

    expect(result).toBe(join(binaryDir, 'vertz-runtime'));
  });

  it('prefers release over debug when both exist', () => {
    const debugDir = join(tmpDir, 'native', 'target', 'debug');
    const releaseDir = join(tmpDir, 'native', 'target', 'release');
    mkdirSync(debugDir, { recursive: true });
    mkdirSync(releaseDir, { recursive: true });
    writeFileSync(join(debugDir, 'vertz-runtime'), '#!/bin/sh', { mode: 0o755 });
    writeFileSync(join(releaseDir, 'vertz-runtime'), '#!/bin/sh', { mode: 0o755 });

    const result = findRuntimeBinary(tmpDir);

    expect(result).toBe(join(releaseDir, 'vertz-runtime'));
  });

  it('returns null when binary does not exist', () => {
    const result = findRuntimeBinary(tmpDir);

    expect(result).toBeNull();
  });

  it('respects VERTZ_RUNTIME_BINARY env override', () => {
    const customPath = join(tmpDir, 'custom-binary');
    writeFileSync(customPath, '#!/bin/sh', { mode: 0o755 });

    const original = process.env.VERTZ_RUNTIME_BINARY;
    process.env.VERTZ_RUNTIME_BINARY = customPath;
    try {
      const result = findRuntimeBinary(tmpDir);
      expect(result).toBe(customPath);
    } finally {
      if (original === undefined) {
        delete process.env.VERTZ_RUNTIME_BINARY;
      } else {
        process.env.VERTZ_RUNTIME_BINARY = original;
      }
    }
  });

  it('returns null when VERTZ_RUNTIME_BINARY points to nonexistent file', () => {
    const original = process.env.VERTZ_RUNTIME_BINARY;
    process.env.VERTZ_RUNTIME_BINARY = '/nonexistent/path/vertz-runtime';
    try {
      const result = findRuntimeBinary(tmpDir);
      expect(result).toBeNull();
    } finally {
      if (original === undefined) {
        delete process.env.VERTZ_RUNTIME_BINARY;
      } else {
        process.env.VERTZ_RUNTIME_BINARY = original;
      }
    }
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

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => ({ pid: 12345 })),
}));

describe('launchRuntime', () => {
  it('spawns the binary with correct args and stdio inherit', async () => {
    const { spawn } = await import('node:child_process');

    const child = launchRuntime('/usr/bin/vertz-runtime', { port: 8080, host: '0.0.0.0' });

    expect(spawn).toHaveBeenCalledWith(
      '/usr/bin/vertz-runtime',
      ['dev', '--port', '8080', '--host', '0.0.0.0'],
      { stdio: 'inherit', env: process.env },
    );
    expect(child).toBeDefined();
  });

  it('passes --open and --no-typecheck flags through to spawn', async () => {
    const { spawn } = await import('node:child_process');

    launchRuntime('/usr/bin/vertz-runtime', { open: true, typecheck: false });

    expect(spawn).toHaveBeenCalledWith(
      '/usr/bin/vertz-runtime',
      ['dev', '--port', '3000', '--host', 'localhost', '--no-typecheck', '--open'],
      { stdio: 'inherit', env: process.env },
    );
  });
});
