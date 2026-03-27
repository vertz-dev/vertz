/**
 * App-level cross-compiler parity tests.
 *
 * Compiles REAL application files from the examples/ directory through both
 * the ts-morph and native compilers, then verifies the output is semantically
 * equivalent by comparing runtime helper call counts.
 *
 * These tests ensure the native compiler produces functionally identical
 * output to the ts-morph compiler for real-world application code.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { compile as tsCompile } from '@vertz/ui-compiler';

const NATIVE_MODULE_PATH = join(
  import.meta.dir,
  '..',
  'vertz-compiler.darwin-arm64.node',
);

const nativeCompiler = require(NATIVE_MODULE_PATH) as {
  compile: (
    source: string,
    options?: { filename?: string },
  ) => { code: string };
};

const REPO_ROOT = join(import.meta.dir, '..', '..', '..');

function normalize(code: string): string {
  return code.replace('// compiled by vertz-native\n', '').trim();
}

/**
 * Count occurrences of runtime helper calls in compiled output.
 */
function countHelpers(code: string) {
  return {
    signal: (code.match(/\bsignal\(/g) || []).length,
    computed: (code.match(/\bcomputed\(/g) || []).length,
    __element: (code.match(/__element\(/g) || []).length,
    __child: (code.match(/__child\(/g) || []).length,
    __conditional: (code.match(/__conditional\(/g) || []).length,
    __list: (code.match(/__list\(/g) || []).length,
    __attr: (code.match(/__attr\(/g) || []).length,
    __prop: (code.match(/__prop\(/g) || []).length,
    __on: (code.match(/__on\(/g) || []).length,
    __append: (code.match(/__append\(/g) || []).length,
    __pushMountFrame: (code.match(/__pushMountFrame\(/g) || []).length,
    __flushMountFrame: (code.match(/__flushMountFrame\(/g) || []).length,
    dotValue: (code.match(/\.value\b/g) || []).length,
    __staticText: (code.match(/__staticText\(/g) || []).length,
    __insert: (code.match(/__insert\(/g) || []).length,
    __enterChildren: (code.match(/__enterChildren\(/g) || []).length,
    __exitChildren: (code.match(/__exitChildren\(/g) || []).length,
  };
}

function compileBoth(source: string, filename: string) {
  const ts = tsCompile(source, { filename });
  const native = nativeCompiler.compile(source, { filename });
  return {
    ts: normalize(ts.code),
    native: normalize(native.code),
  };
}

// ═══════════════════════════════════════════════════════════════════
// Task Manager — All TSX files
// ═══════════════════════════════════════════════════════════════════

function collectTsxFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (
      entry.isDirectory() &&
      !entry.name.startsWith('.') &&
      entry.name !== 'node_modules' &&
      entry.name !== 'dist' &&
      entry.name !== '__tests__' &&
      entry.name !== 'tests'
    ) {
      files.push(...collectTsxFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

// Known ts-morph false positives: ts-morph's containsReactiveSourceAccess()
// matches property names (e.g., "description" in dialogStyles.description) against
// destructured prop names, causing spurious __attr() wraps on static member
// expressions. The native compiler correctly identifies these as non-reactive.
const KNOWN_TS_MORPH_FALSE_POSITIVES: Record<string, Record<string, number>> = {
  // ─── Task Manager ───
  'examples/task-manager/src/components/confirm-dialog.tsx': {
    // dialogStyles.description wraps in __attr because prop "description" shares
    // the name with the property access — ts-morph bug, not a native compiler gap
    __attr: 1,
  },
  // ─── Linear ───
  'examples/linear/src/components/issue-row.tsx': {
    // styles.identifier + styles.labels: ts-morph wraps because "identifier" and "labels"
    // are also destructured prop names — but styles.X is a static CSS class, not reactive
    __attr: 2,
  },
  'examples/linear/src/components/issue-card.tsx': {
    // Same as issue-row: styles.identifier and styles.labels match prop names
    __attr: 2,
  },
  'examples/linear/src/components/comment-item.tsx': {
    // styles.comment matches prop name "comment"
    __attr: 1,
  },
  'examples/linear/src/components/comment-section.tsx': {
    // styles.loading matches prop name "loading"
    __attr: 1,
  },
  'examples/linear/src/components/status-select.tsx': {
    // opt.value in .map() callback — ts-morph treats .value as signal access,
    // but opt is a plain iterator object { value: IssueStatus; label: string }
    __attr: 1,
  },
  'examples/linear/src/components/priority-select.tsx': {
    // Same as status-select: opt.value is a plain object property, not a signal
    __attr: 1,
  },
};

// Known cases where native has MORE of a helper than ts-morph (native is correct).
// These are cases where native correctly inlines reactive callback locals,
// producing additional .value accesses or __conditional() calls.
const KNOWN_NATIVE_EXTRAS: Record<string, Record<string, number>> = {
  'examples/linear/src/components/label-picker.tsx': {
    // Native inlines `isAssigned = assignedLabelIds.value.has(label.id)` into
    // both the __attr and __conditional, adding an extra .value access
    dotValue: 1,
  },
};

function assertHelperParity(source: string, relPath: string) {
  describe(`Given ${relPath}`, () => {
    it('Then both compilers produce matching runtime helper call counts', () => {
      const { ts, native } = compileBoth(source, relPath);
      const tsHelpers = countHelpers(ts);
      const nativeHelpers = countHelpers(native);
      const falsePositives = KNOWN_TS_MORPH_FALSE_POSITIVES[relPath] ?? {};
      const nativeExtras = KNOWN_NATIVE_EXTRAS[relPath] ?? {};

      for (const [key, tsCount] of Object.entries(tsHelpers)) {
        const nativeCount = nativeHelpers[key as keyof typeof nativeHelpers];
        const allowedFalsePositive = falsePositives[key] ?? 0;
        const allowedExtra = nativeExtras[key] ?? 0;
        const expectedMin = tsCount - allowedFalsePositive;
        const expectedMax = tsCount + allowedExtra;
        if (nativeCount < expectedMin || nativeCount > expectedMax) {
          console.log(`\n=== MISMATCH in ${relPath}: ${key} ===`);
          console.log(`ts-morph: ${tsCount}, native: ${nativeCount}`);
          console.log(`allowed range: [${expectedMin}, ${expectedMax}]`);
        }
        expect(nativeCount).toBeGreaterThanOrEqual(expectedMin);
        expect(nativeCount).toBeLessThanOrEqual(expectedMax);
      }
    });

    it('Then native does not import helpers that ts-morph does not use', () => {
      const { ts, native } = compileBoth(source, relPath);

      const extractInternals = (code: string) => {
        const match = code.match(
          /import\s*\{([^}]+)\}\s*from\s*['"]@vertz\/ui\/internals['"]/,
        );
        if (!match) return new Set<string>();
        return new Set(
          match[1].split(',').map((s) => s.trim()).filter(Boolean),
        );
      };

      const tsInternals = extractInternals(ts);
      const nativeInternals = extractInternals(native);

      // Native should only import helpers that ts-morph also imports
      for (const sym of nativeInternals) {
        if (!tsInternals.has(sym)) {
          console.log(
            `\nNative imports ${sym} from @vertz/ui/internals but ts-morph does not (${relPath})`,
          );
        }
        expect(tsInternals.has(sym)).toBe(true);
      }
    });
  });
}

describe('Feature: App-level runtime helper parity — Task Manager', () => {
  const taskManagerDir = join(REPO_ROOT, 'examples', 'task-manager', 'src');
  const tsxFiles = collectTsxFiles(taskManagerDir);

  for (const filePath of tsxFiles) {
    const relPath = relative(REPO_ROOT, filePath);
    const source = readFileSync(filePath, 'utf-8');
    assertHelperParity(source, relPath);
  }
});

// ═══════════════════════════════════════════════════════════════════
// Linear — All TSX files
// ═══════════════════════════════════════════════════════════════════

describe('Feature: App-level runtime helper parity — Linear', () => {
  const linearDir = join(REPO_ROOT, 'examples', 'linear', 'src');
  const tsxFiles = collectTsxFiles(linearDir);

  for (const filePath of tsxFiles) {
    const relPath = relative(REPO_ROOT, filePath);
    const source = readFileSync(filePath, 'utf-8');
    assertHelperParity(source, relPath);
  }
});
