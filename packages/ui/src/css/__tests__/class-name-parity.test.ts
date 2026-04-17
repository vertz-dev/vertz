/**
 * Parity test: TS runtime `generateClassName(filePath, blockName, '')` must
 * produce the same class name as the Rust compiler's `generate_class_name`
 * for the same `filePath` + `blockName`.
 *
 * The expected hashes in this file are mirrored verbatim in
 * `native/vertz-compiler-core/src/css_transform.rs` tests
 * (`class_name_parity_matches_ts_runtime`). A mismatch in either direction
 * means the compiler and runtime produce different class names for the same
 * call site — SSR/HMR hybrid output will then contain ghost classes.
 *
 * Runtime also covers the `__runtime__` default-filePath path, where a
 * non-empty fingerprint is required so two `css()` calls made in the same
 * process with the same block name but different styles don't collide.
 */

import { describe, expect, it } from '@vertz/test';
import { generateClassName } from '../class-generator';
import { css } from '../css';

const PARITY_CASES: readonly { filePath: string; blockName: string; expected: string }[] = [
  {
    filePath: 'packages/landing/src/components/hero.tsx',
    blockName: 'badgeDotPing',
    expected: '_d1f23282',
  },
  {
    filePath: 'packages/ui/src/css/__tests__/fixtures/example.tsx',
    blockName: 'root',
    expected: '_dbd94807',
  },
  { filePath: 'a.tsx', blockName: 'b', expected: '_ec9614e9' },
];

describe('class-name parity (TS runtime ↔ Rust compiler)', () => {
  describe('Given a real source filePath', () => {
    it('Then generateClassName(filePath, blockName, "") matches hand-computed djb2', () => {
      for (const { filePath, blockName, expected } of PARITY_CASES) {
        expect(generateClassName(filePath, blockName, '')).toBe(expected);
      }
    });

    it('Then css() with a filePath produces the fingerprint-free class name', () => {
      const out = css(
        { badgeDotPing: { opacity: 0.4 } },
        'packages/landing/src/components/hero.tsx',
      );
      expect(out.badgeDotPing).toBe('_d1f23282');
    });

    it('Then two css() calls with the same filePath + blockName but different styles still share the class name', () => {
      const filePath = 'a.tsx';
      const a = css({ b: { color: 'red' } }, filePath);
      const b = css({ b: { color: 'blue' } }, filePath);
      expect(a.b).toBe('_ec9614e9');
      expect(b.b).toBe('_ec9614e9');
    });
  });

  describe('Given the default __runtime__ filePath', () => {
    it('Then two css() calls with the same block name but different styles get distinct classes (fingerprint disambiguation)', () => {
      const a = css({ root: { color: 'red' } });
      const b = css({ root: { color: 'blue' } });
      expect(a.root).not.toBe(b.root);
    });

    it('Then the same styles in the same block name produce the same class name', () => {
      const a = css({ root: { color: 'red' } });
      const b = css({ root: { color: 'red' } });
      expect(a.root).toBe(b.root);
    });
  });
});
