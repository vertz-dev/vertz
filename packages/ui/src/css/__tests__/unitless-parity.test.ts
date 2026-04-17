/**
 * Parity test: the TS `UNITLESS_PROPERTIES` set and the Rust `UNITLESS_PROPERTIES`
 * array must stay in sync.
 *
 * The TS source in `packages/ui/src/css/unitless-properties.ts` is the authority.
 * The Rust mirror in `native/vertz-compiler-core/src/css_unitless.rs` must list
 * the exact same camelCase names — in both `is_unitless()`'s match arm and the
 * exported `UNITLESS_PROPERTIES` const array.
 *
 * A drift here would cause CSS-output divergence between the dev-time runtime
 * (TS `css()`) and the AOT Rust compiler: e.g. `opacity: 1` in object form would
 * become `opacity: 1px` when compiled but `opacity: 1` in dev.
 */

import { describe, expect, it } from '@vertz/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UNITLESS_PROPERTIES } from '../unitless-properties';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
// __tests__ → css → src → ui → packages → repo root (5 levels up)
const REPO_ROOT = join(THIS_DIR, '..', '..', '..', '..', '..');
const RUST_SRC = join(REPO_ROOT, 'native/vertz-compiler-core/src/css_unitless.rs');

function extractQuotedNames(block: string): Set<string> {
  const names = new Set<string>();
  const re = /"([A-Za-z][A-Za-z0-9]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    if (m[1]) names.add(m[1]);
  }
  return names;
}

function parseRustMatcher(source: string): Set<string> {
  const match = source.match(/matches!\(\s*camel_property,([\s\S]*?)\n\s*\)/);
  if (!match) throw new Error('Could not find is_unitless matcher in css_unitless.rs');
  return extractQuotedNames(match[1] ?? '');
}

function parseRustArray(source: string): Set<string> {
  const match = source.match(
    /pub const UNITLESS_PROPERTIES:\s*&\[&str\]\s*=\s*&\[([\s\S]*?)\];/,
  );
  if (!match) throw new Error('Could not find UNITLESS_PROPERTIES array in css_unitless.rs');
  return extractQuotedNames(match[1] ?? '');
}

describe('UNITLESS_PROPERTIES parity (TS ↔ Rust)', () => {
  const rustSource = readFileSync(RUST_SRC, 'utf8');
  const ts = new Set(UNITLESS_PROPERTIES);
  const rustMatcher = parseRustMatcher(rustSource);
  const rustArray = parseRustArray(rustSource);

  describe('Given the TS source as the authority', () => {
    it('Then the Rust is_unitless matcher contains every TS entry', () => {
      const missing = [...ts].filter((name) => !rustMatcher.has(name)).sort();
      expect(missing).toEqual([]);
    });

    it('Then the Rust UNITLESS_PROPERTIES array contains every TS entry', () => {
      const missing = [...ts].filter((name) => !rustArray.has(name)).sort();
      expect(missing).toEqual([]);
    });

    it('Then the Rust mirror has no extra entries beyond TS', () => {
      const extraMatcher = [...rustMatcher].filter((name) => !ts.has(name)).sort();
      const extraArray = [...rustArray].filter((name) => !ts.has(name)).sort();
      expect({ extraMatcher, extraArray }).toEqual({ extraMatcher: [], extraArray: [] });
    });
  });

  describe('Given two Rust representations of the same list', () => {
    it('Then the matcher and the array agree', () => {
      const onlyInMatcher = [...rustMatcher].filter((n) => !rustArray.has(n)).sort();
      const onlyInArray = [...rustArray].filter((n) => !rustMatcher.has(n)).sort();
      expect({ onlyInMatcher, onlyInArray }).toEqual({ onlyInMatcher: [], onlyInArray: [] });
    });
  });
});
