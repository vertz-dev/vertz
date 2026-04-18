/**
 * One-shot fix: earlier migration batches produced invalid-CSS literal strings for
 * `transition:*`, `tracking:*`, `grid-cols:*`, and `aspect:*` shorthands. The
 * updated mapper expands these correctly, but files already in object form never
 * get re-visited by the AST rewriter. This script patches those literals in place.
 *
 * Usage: `vtz exec tsx scripts/migrate-classnames/fix-literal-aliases.ts <dir>...`
 */

import { lstatSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const TARGET_EXTENSIONS = new Set(['.ts', '.tsx']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', '.vertz', '__fixtures__']);

const TIMING = '150ms cubic-bezier(0.4, 0, 0.2, 1)';
const COLOR_PROPS = [
  'color',
  'background-color',
  'border-color',
  'outline-color',
  'text-decoration-color',
  'fill',
  'stroke',
];

const TRANSITION_MAP: Record<string, string> = {
  none: 'none',
  all: `all ${TIMING}`,
  colors: COLOR_PROPS.map((p) => `${p} ${TIMING}`).join(', '),
  shadow: `box-shadow ${TIMING}`,
  transform: `transform ${TIMING}`,
  opacity: `opacity ${TIMING}`,
};

const TRACKING_MAP: Record<string, string> = {
  tighter: '-0.05em',
  tight: '-0.025em',
  normal: '0em',
  wide: '0.025em',
  wider: '0.05em',
  widest: '0.1em',
};

const ASPECT_MAP: Record<string, string> = {
  square: '1 / 1',
  video: '16 / 9',
  photo: '4 / 3',
};

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const lst = lstatSync(full);
    if (lst.isSymbolicLink()) continue;
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!st.isFile()) continue;
    if (!TARGET_EXTENSIONS.has(extname(name))) continue;
    out.push(full);
  }
}

function fix(source: string): { code: string; changes: number } {
  let changes = 0;
  let next = source;

  next = next.replace(
    /(\btransition:\s*)'(none|all|colors|shadow|transform|opacity)'/g,
    (_m, prefix: string, key: string) => {
      changes++;
      return `${prefix}'${TRANSITION_MAP[key]!}'`;
    },
  );

  next = next.replace(
    /(\bletterSpacing:\s*)'(tighter|tight|normal|wide|wider|widest)'/g,
    (_m, prefix: string, key: string) => {
      changes++;
      return `${prefix}'${TRACKING_MAP[key]!}'`;
    },
  );

  next = next.replace(
    /(\bgridTemplateColumns:\s*)'(\d+)'/g,
    (_m, prefix: string, numStr: string) => {
      const num = Number(numStr);
      if (!Number.isInteger(num) || num <= 0) return _m as string;
      changes++;
      return `${prefix}'repeat(${num}, minmax(0, 1fr))'`;
    },
  );

  next = next.replace(
    /(\baspectRatio:\s*)'(square|video|photo)'/g,
    (_m, prefix: string, key: string) => {
      changes++;
      return `${prefix}'${ASPECT_MAP[key]!}'`;
    },
  );

  return { code: next, changes };
}

function main(): void {
  const targets = process.argv.slice(2);
  if (targets.length === 0) {
    console.error('Usage: fix-literal-aliases <dir>...');
    process.exit(1);
  }

  let totalChanges = 0;
  let changedFiles = 0;

  for (const target of targets) {
    const abs = resolve(target);
    const files: string[] = [];
    const st = statSync(abs);
    if (st.isDirectory()) {
      walk(abs, files);
    } else {
      files.push(abs);
    }

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const { code, changes } = fix(source);
      if (changes > 0) {
        writeFileSync(file, code, 'utf8');
        totalChanges += changes;
        changedFiles++;
        console.log(`${file}: ${changes} fixed`);
      }
    }
  }

  console.log(`\nchanged: ${changedFiles}`);
  console.log(`total fixes: ${totalChanges}`);
}

main();
