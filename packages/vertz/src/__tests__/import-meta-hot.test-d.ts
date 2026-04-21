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

describe('Feature: invalidate and decline', () => {
  it('invalidate() accepts an optional message and returns void', () => {
    const hot = import.meta.hot as ImportMetaHot;
    expectTypeOf(hot.invalidate()).toEqualTypeOf<void>();
    expectTypeOf(hot.invalidate('oops')).toEqualTypeOf<void>();
  });

  it('decline() takes no arguments and returns void', () => {
    const hot = import.meta.hot as ImportMetaHot;
    expectTypeOf(hot.decline()).toEqualTypeOf<void>();
  });

  it('decline() rejects any arguments at the type level', () => {
    const hot = import.meta.hot as ImportMetaHot;
    // @ts-expect-error — decline takes no arguments.
    hot.decline('nope');
  });
});

describe('Feature: on / off event subscription', () => {
  it('vertz:beforeUpdate payload exposes the updated module string', () => {
    const hot = import.meta.hot as ImportMetaHot;
    hot.on('vertz:beforeUpdate', (payload) => {
      expectTypeOf(payload).toEqualTypeOf<{ module: string }>();
    });
  });

  it('vertz:beforeFullReload payload exposes an optional reason', () => {
    const hot = import.meta.hot as ImportMetaHot;
    hot.on('vertz:beforeFullReload', (payload) => {
      expectTypeOf(payload).toEqualTypeOf<{ reason?: string }>();
    });
  });

  it('off() requires the same callback reference', () => {
    const hot = import.meta.hot as ImportMetaHot;
    const cb = (_p: { module: string }) => {};
    expectTypeOf(hot.off('vertz:afterUpdate', cb)).toEqualTypeOf<void>();
  });

  it('rejects unknown event names', () => {
    const hot = import.meta.hot as ImportMetaHot;
    // @ts-expect-error — 'vite:beforeUpdate' is not a vtz event.
    hot.on('vite:beforeUpdate', () => {});
  });

  it('rejects wrong payload shape on listener', () => {
    const hot = import.meta.hot as ImportMetaHot;
    // @ts-expect-error — vertz:beforeUpdate payload does not expose `reason`.
    hot.on('vertz:beforeUpdate', (p: { reason: string }) => p.reason);
  });
});

describe('Feature: removed augmentations', () => {
  it('ImportMeta.main is not declared by vertz/client', () => {
    // @ts-expect-error — main is a Bun-ism, not provided by the vtz runtime.
    const _main: boolean = import.meta.main;
  });
});
