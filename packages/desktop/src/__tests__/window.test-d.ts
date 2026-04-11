import { describe, expectTypeOf, it } from '@vertz/test';
import type { Result } from '@vertz/errors';
import { appWindow } from '../index.js';
import type { DesktopError, WindowSize } from '../types.js';

// ── appWindow.setTitle ──

describe('Feature: appWindow.setTitle type safety', () => {
  it('Returns Promise<Result<void, DesktopError>>', () => {
    expectTypeOf(appWindow.setTitle('My App')).toEqualTypeOf<Promise<Result<void, DesktopError>>>();
  });
});

// ── appWindow.setSize ──

describe('Feature: appWindow.setSize type safety', () => {
  describe('Given setSize called with WindowSize object', () => {
    it('Then returns Promise<Result<void, DesktopError>>', () => {
      expectTypeOf(appWindow.setSize({ width: 800, height: 600 })).toEqualTypeOf<
        Promise<Result<void, DesktopError>>
      >();
    });
  });

  describe('Given setSize called with positional args', () => {
    it('Then produces a type error', () => {
      // @ts-expect-error setSize takes WindowSize object, not two numbers
      appWindow.setSize(1280, 800);
    });
  });
});

// ── appWindow.setFullscreen ──

describe('Feature: appWindow.setFullscreen type safety', () => {
  it('Returns Promise<Result<void, DesktopError>>', () => {
    expectTypeOf(appWindow.setFullscreen(true)).toEqualTypeOf<
      Promise<Result<void, DesktopError>>
    >();
  });

  describe('Given setFullscreen called with non-boolean', () => {
    it('Then produces a type error', () => {
      // @ts-expect-error setFullscreen takes boolean, not string
      appWindow.setFullscreen('yes');
    });
  });
});

// ── appWindow.innerSize ──

describe('Feature: appWindow.innerSize type safety', () => {
  it('Returns Promise<Result<WindowSize, DesktopError>>', () => {
    expectTypeOf(appWindow.innerSize()).toEqualTypeOf<Promise<Result<WindowSize, DesktopError>>>();
  });
});

// ── appWindow.minimize ──

describe('Feature: appWindow.minimize type safety', () => {
  it('Returns Promise<Result<void, DesktopError>>', () => {
    expectTypeOf(appWindow.minimize()).toEqualTypeOf<Promise<Result<void, DesktopError>>>();
  });
});

// ── appWindow.close ──

describe('Feature: appWindow.close type safety', () => {
  it('Returns Promise<Result<void, DesktopError>>', () => {
    expectTypeOf(appWindow.close()).toEqualTypeOf<Promise<Result<void, DesktopError>>>();
  });
});
