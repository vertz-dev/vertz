import { describe, expectTypeOf, it } from '@vertz/test';
import type { Result } from '@vertz/errors';
import { app } from '../index.js';
import type { DesktopError } from '../types.js';

// ── app.dataDir ──

describe('Feature: app.dataDir type safety', () => {
  it('Returns Promise<Result<string, DesktopError>>', () => {
    expectTypeOf(app.dataDir()).toEqualTypeOf<Promise<Result<string, DesktopError>>>();
  });

  it('Accepts IpcCallOptions', () => {
    expectTypeOf(app.dataDir({ timeout: 5000 })).toEqualTypeOf<
      Promise<Result<string, DesktopError>>
    >();
  });
});

// ── app.cacheDir ──

describe('Feature: app.cacheDir type safety', () => {
  it('Returns Promise<Result<string, DesktopError>>', () => {
    expectTypeOf(app.cacheDir()).toEqualTypeOf<Promise<Result<string, DesktopError>>>();
  });
});

// ── app.version ──

describe('Feature: app.version type safety', () => {
  it('Returns Promise<Result<string, DesktopError>>', () => {
    expectTypeOf(app.version()).toEqualTypeOf<Promise<Result<string, DesktopError>>>();
  });
});
