import { describe, expectTypeOf, it } from '@vertz/test';
import type { Result } from '@vertz/errors';
import { dialog } from '../index.js';
import type { DesktopError } from '../types.js';

// ── dialog.open ──

describe('Feature: dialog.open type safety', () => {
  describe('Given dialog.open called without options', () => {
    it('Then returns Promise<Result<string | null, DesktopError>>', () => {
      expectTypeOf(dialog.open()).toEqualTypeOf<Promise<Result<string | null, DesktopError>>>();
    });
  });

  describe('Given dialog.open called with valid options', () => {
    it('Then accepts OpenDialogOptions', () => {
      expectTypeOf(
        dialog.open({
          filters: [{ name: 'Images', extensions: ['png', 'jpg'] }],
          defaultPath: '/tmp',
          title: 'Open file',
        }),
      ).toEqualTypeOf<Promise<Result<string | null, DesktopError>>>();
    });
  });

  describe('Given dialog.open called with invalid filter', () => {
    it('Then produces a type error for missing name in filter', () => {
      // @ts-expect-error filters require name + extensions
      dialog.open({ filters: [{ extensions: ['png'] }] });
    });
  });
});

// ── dialog.save ──

describe('Feature: dialog.save type safety', () => {
  it('Returns Promise<Result<string | null, DesktopError>>', () => {
    expectTypeOf(dialog.save()).toEqualTypeOf<Promise<Result<string | null, DesktopError>>>();
  });
});

// ── dialog.confirm ──

describe('Feature: dialog.confirm type safety', () => {
  describe('Given dialog.confirm called with message', () => {
    it('Then returns Promise<Result<boolean, DesktopError>>', () => {
      expectTypeOf(dialog.confirm('Are you sure?')).toEqualTypeOf<
        Promise<Result<boolean, DesktopError>>
      >();
    });
  });

  describe('Given dialog.confirm called with kind option', () => {
    it('Then accepts ConfirmDialogOptions', () => {
      expectTypeOf(dialog.confirm('Delete?', { kind: 'warning', title: 'Confirm' })).toEqualTypeOf<
        Promise<Result<boolean, DesktopError>>
      >();
    });
  });

  describe('Given dialog.confirm called with invalid kind', () => {
    it('Then produces a type error', () => {
      // @ts-expect-error kind must be 'info' | 'warning' | 'error'
      dialog.confirm('ok?', { kind: 'success' });
    });
  });
});

// ── dialog.message ──

describe('Feature: dialog.message type safety', () => {
  describe('Given dialog.message called with message', () => {
    it('Then returns Promise<Result<void, DesktopError>>', () => {
      expectTypeOf(dialog.message('Done!')).toEqualTypeOf<Promise<Result<void, DesktopError>>>();
    });
  });
});
