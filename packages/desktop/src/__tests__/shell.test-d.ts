import { describe, expectTypeOf, it } from 'bun:test';
import type { Result } from '@vertz/errors';
import { shell } from '../index.js';
import type { DesktopError, ShellOutput } from '../types.js';

// ── shell.execute ──

describe('Feature: shell.execute type safety', () => {
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
});
