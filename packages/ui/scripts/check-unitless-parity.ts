#!/usr/bin/env node
/**
 * Parity gate: TS `UNITLESS_PROPERTIES` ↔ Rust `css_unitless.rs`.
 *
 * Runs under `vtz run lint` (wired via packages/ui's `lint` script → turbo).
 * Exits non-zero if the two lists drift. TS is the authority.
 *
 * This script mirrors the vitest parity test
 * (`src/css/__tests__/unitless-parity.test.ts`), but is invokable from the
 * lint gate so a file-scoped test filter can't silently skip it.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UNITLESS_PROPERTIES } from '../src/css/unitless-properties.ts';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(THIS_DIR, '..', '..', '..');
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
  const match = source.match(/pub const UNITLESS_PROPERTIES:\s*&\[&str\]\s*=\s*&\[([\s\S]*?)\];/);
  if (!match) throw new Error('Could not find UNITLESS_PROPERTIES array in css_unitless.rs');
  return extractQuotedNames(match[1] ?? '');
}

function diff(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((x) => !b.has(x)).sort();
}

const rustSource = readFileSync(RUST_SRC, 'utf8');
const ts = new Set(UNITLESS_PROPERTIES);
const rustMatcher = parseRustMatcher(rustSource);
const rustArray = parseRustArray(rustSource);

const errors: string[] = [];

const missingInMatcher = diff(ts, rustMatcher);
if (missingInMatcher.length > 0) {
  errors.push(`Rust is_unitless() matcher is missing: ${missingInMatcher.join(', ')}`);
}

const missingInArray = diff(ts, rustArray);
if (missingInArray.length > 0) {
  errors.push(`Rust UNITLESS_PROPERTIES array is missing: ${missingInArray.join(', ')}`);
}

const extraInMatcher = diff(rustMatcher, ts);
if (extraInMatcher.length > 0) {
  errors.push(`Rust is_unitless() matcher has extras not in TS: ${extraInMatcher.join(', ')}`);
}

const extraInArray = diff(rustArray, ts);
if (extraInArray.length > 0) {
  errors.push(`Rust UNITLESS_PROPERTIES array has extras not in TS: ${extraInArray.join(', ')}`);
}

const matcherVsArrayOnlyInMatcher = diff(rustMatcher, rustArray);
const matcherVsArrayOnlyInArray = diff(rustArray, rustMatcher);
if (matcherVsArrayOnlyInMatcher.length > 0 || matcherVsArrayOnlyInArray.length > 0) {
  errors.push(
    `Rust matcher and array disagree. Only in matcher: [${matcherVsArrayOnlyInMatcher.join(', ')}]. Only in array: [${matcherVsArrayOnlyInArray.join(', ')}].`,
  );
}

if (errors.length > 0) {
  console.error('unitless-parity: FAIL');
  for (const err of errors) console.error(`  - ${err}`);
  console.error(
    `\nFix by updating ${RUST_SRC} to match packages/ui/src/css/unitless-properties.ts`,
  );
  process.exit(1);
}

console.log(`unitless-parity: ok (${ts.size} properties mirrored in Rust)`);
