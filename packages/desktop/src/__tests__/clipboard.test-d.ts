import { describe, expectTypeOf, it } from '@vertz/test';
import type { Result } from '@vertz/errors';
import { clipboard } from '../index.js';
import type { DesktopError } from '../types.js';

// ── clipboard.readText ──

describe('Feature: clipboard.readText type safety', () => {
  describe('Given clipboard.readText called', () => {
    it('Then returns Promise<Result<string, DesktopError>>', () => {
      expectTypeOf(clipboard.readText()).toEqualTypeOf<Promise<Result<string, DesktopError>>>();
    });
  });

  describe('Given clipboard.readText called with timeout', () => {
    it('Then accepts IpcCallOptions', () => {
      expectTypeOf(clipboard.readText({ timeout: 5000 })).toEqualTypeOf<
        Promise<Result<string, DesktopError>>
      >();
    });
  });
});

// ── clipboard.writeText ──

describe('Feature: clipboard.writeText type safety', () => {
  describe('Given clipboard.writeText called with text', () => {
    it('Then returns Promise<Result<void, DesktopError>>', () => {
      expectTypeOf(clipboard.writeText('hello')).toEqualTypeOf<
        Promise<Result<void, DesktopError>>
      >();
    });
  });

  describe('Given wrong text type', () => {
    it('Then produces a type error', () => {
      // @ts-expect-error text must be a string
      clipboard.writeText(42);
    });
  });
});
