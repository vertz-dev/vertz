/// <reference types="../../client.d.ts" />
import { describe, expectTypeOf, it } from '@vertz/test';

/**
 * Type-flow tests for the `vertz/client` ambient augmentation.
 *
 * These tests exercise the public `ImportMeta.hot` shape. They drive the
 * design of `client.d.ts` — see `plans/2777-import-meta-hot-types.md`.
 */

describe('Feature: ImportMeta.hot is optional (dev-only)', () => {
  it('Typed as ImportMetaHot | undefined', () => {
    expectTypeOf(import.meta.hot).toEqualTypeOf<ImportMetaHot | undefined>();
  });

  it('Supports optional chaining for self-accept', () => {
    expectTypeOf(import.meta.hot?.accept()).toEqualTypeOf<void | undefined>();
  });
});

describe('Feature: accept() overloads', () => {
  it('Zero-arg self-accept returns void', () => {
    const hot = import.meta.hot as ImportMetaHot;
    expectTypeOf(hot.accept()).toEqualTypeOf<void>();
  });

  it('Single-callback overload accepts (newModule) => void', () => {
    const hot = import.meta.hot as ImportMetaHot;
    expectTypeOf(hot.accept((_mod) => {})).toEqualTypeOf<void>();
  });

  it('Dependency-array overload accepts deps + callback', () => {
    const hot = import.meta.hot as ImportMetaHot;
    expectTypeOf(hot.accept(['./other.ts'], (_mods) => {})).toEqualTypeOf<void>();
    expectTypeOf(hot.accept('./single.ts')).toEqualTypeOf<void>();
  });
});

describe('Feature: dispose and data', () => {
  it('dispose() accepts a callback receiving data record', () => {
    const hot = import.meta.hot as ImportMetaHot;
    expectTypeOf(hot.dispose((_data) => {})).toEqualTypeOf<void>();
  });

  it('data is typed Record<string, unknown>', () => {
    const hot = import.meta.hot as ImportMetaHot;
    expectTypeOf(hot.data).toEqualTypeOf<Record<string, unknown>>();
  });
});

describe('Feature: removed augmentations', () => {
  it('ImportMeta.main is not declared by vertz/client', () => {
    // @ts-expect-error — main is a Bun-ism, not provided by the vtz runtime.
    const _main: boolean = import.meta.main;
  });
});
