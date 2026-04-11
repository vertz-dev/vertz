import { describe, expectTypeOf, it } from '@vertz/test';
import type { Result } from '@vertz/errors';
import { shell } from '../index.js';
import type { DesktopError, ShellOutput } from '../types.js';
import type { ChildProcess } from '../shell.js';

// ── shell.execute ──

describe('Feature: shell.execute type safety', () => {
  describe('Given shell.execute called with command only', () => {
    it('Then accepts omitted args', () => {
      expectTypeOf(shell.execute('ls')).toEqualTypeOf<Promise<Result<ShellOutput, DesktopError>>>();
    });
  });

  describe('Given shell.execute called with command and args', () => {
    it('Then returns Promise<Result<ShellOutput, DesktopError>>', () => {
      expectTypeOf(shell.execute('git', ['status'])).toEqualTypeOf<
        Promise<Result<ShellOutput, DesktopError>>
      >();
    });
  });

  describe('Given shell.execute called with timeout option', () => {
    it('Then accepts IpcCallOptions', () => {
      expectTypeOf(shell.execute('make', ['build'], { timeout: 300000 })).toEqualTypeOf<
        Promise<Result<ShellOutput, DesktopError>>
      >();
    });
  });

  describe('Given shell.execute called with cwd option', () => {
    it('Then accepts cwd as a string', () => {
      expectTypeOf(shell.execute('git', ['status'], { cwd: '/tmp' })).toEqualTypeOf<
        Promise<Result<ShellOutput, DesktopError>>
      >();
    });
  });

  describe('Given shell.execute called with env option', () => {
    it('Then accepts env as Record<string, string>', () => {
      expectTypeOf(
        shell.execute('git', ['status'], { env: { GIT_DIR: '/tmp/.git' } }),
      ).toEqualTypeOf<Promise<Result<ShellOutput, DesktopError>>>();
    });
  });

  describe('Given shell.execute called with all options', () => {
    it('Then accepts cwd, env, and timeout together', () => {
      expectTypeOf(
        shell.execute('git', ['status'], { cwd: '/tmp', env: { FOO: 'bar' }, timeout: 5000 }),
      ).toEqualTypeOf<Promise<Result<ShellOutput, DesktopError>>>();
    });
  });

  describe('Given wrong args type', () => {
    it('Then produces a type error for non-array args', () => {
      // @ts-expect-error args must be string[], not string
      shell.execute('git', 'status');
    });
  });

  describe('Given wrong command type', () => {
    it('Then produces a type error for non-string command', () => {
      // @ts-expect-error command must be a string
      shell.execute(42, []);
    });
  });

  describe('Given wrong cwd type', () => {
    it('Then produces a type error for non-string cwd', () => {
      // @ts-expect-error cwd must be a string, not a number
      shell.execute('git', ['status'], { cwd: 42 });
    });
  });

  describe('Given wrong env value type', () => {
    it('Then produces a type error for non-string env values', () => {
      // @ts-expect-error env values must be strings, not numbers
      shell.execute('git', ['status'], { env: { FOO: 42 } });
    });
  });
});

// ── shell.spawn ──

describe('Feature: shell.spawn type safety', () => {
  describe('Given shell.spawn called with command only', () => {
    it('Then accepts omitted args', () => {
      expectTypeOf(shell.spawn('node')).toEqualTypeOf<
        Promise<Result<ChildProcess, DesktopError>>
      >();
    });
  });

  describe('Given shell.spawn called with command and args', () => {
    it('Then returns Promise<Result<ChildProcess, DesktopError>>', () => {
      expectTypeOf(shell.spawn('node', ['server.js'])).toEqualTypeOf<
        Promise<Result<ChildProcess, DesktopError>>
      >();
    });
  });

  describe('Given shell.spawn called with cwd option', () => {
    it('Then accepts cwd as a string', () => {
      expectTypeOf(shell.spawn('node', ['server.js'], { cwd: '/app' })).toEqualTypeOf<
        Promise<Result<ChildProcess, DesktopError>>
      >();
    });
  });

  describe('Given shell.spawn called with env option', () => {
    it('Then accepts env as Record<string, string>', () => {
      expectTypeOf(
        shell.spawn('node', ['server.js'], { env: { NODE_ENV: 'production' } }),
      ).toEqualTypeOf<Promise<Result<ChildProcess, DesktopError>>>();
    });
  });

  describe('Given shell.spawn called with all options', () => {
    it('Then accepts cwd and env together', () => {
      expectTypeOf(
        shell.spawn('node', ['server.js'], { cwd: '/app', env: { NODE_ENV: 'production' } }),
      ).toEqualTypeOf<Promise<Result<ChildProcess, DesktopError>>>();
    });
  });

  describe('Given wrong command type', () => {
    it('Then produces a type error for non-string command', () => {
      // @ts-expect-error command must be a string
      shell.spawn(42);
    });
  });

  describe('Given wrong cwd type', () => {
    it('Then produces a type error for non-string cwd', () => {
      // @ts-expect-error cwd must be a string, not a number
      shell.spawn('node', [], { cwd: 42 });
    });
  });

  describe('Given wrong env value type', () => {
    it('Then produces a type error for non-string env values', () => {
      // @ts-expect-error env values must be strings, not numbers
      shell.spawn('node', [], { env: { FOO: 42 } });
    });
  });
});
