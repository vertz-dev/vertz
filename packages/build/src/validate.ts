import { realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative } from 'node:path';
import type { OutputFileInfo } from './types.js';

/**
 * Realpath-resolve a path so symlinks and case-insensitive aliases (macOS
 * APFS, Windows) collapse to a single canonical form before comparison.
 *
 * If the path doesn’t exist on disk yet (rare — e.g. esbuild metafile
 * mentions a chunk that wasn’t written), fall back to realpathing the
 * deepest existing ancestor and re-appending the missing tail.
 */
function canonicalize(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    const parent = dirname(p);
    if (parent === p) return p;
    return canonicalize(parent) + p.slice(parent.length);
  }
}

/**
 * Guards against the class of bug where a build emits files outside its
 * own output directory — e.g. issue #2953, where `packages/ui/dist/index.js`
 * was overwritten with `packages/ui-primitives` build output.
 *
 * Throws a descriptive error if any output path is not strictly inside
 * `outDir`.
 */
export function assertOutputsUnderOutDir(outputs: OutputFileInfo[], outDir: string): void {
  const canonicalOutDir = canonicalize(outDir);

  for (const file of outputs) {
    const rel = relative(canonicalOutDir, canonicalize(file.path));
    // Outside outDir if rel is empty / "." (path equals outDir itself, not
    // a file — Node returns "", the vtz runtime returns "."), starts with
    // ".." (parent traversal), or is absolute (different drive root on
    // Windows).
    const outside = rel === '' || rel === '.' || rel.startsWith('..') || isAbsolute(rel);
    if (outside) {
      throw new Error(
        `Build output landed outside the configured output directory.\n` +
          `  outDir: ${outDir}\n` +
          `  path:   ${file.path}\n` +
          `This usually means the build process resolved its working directory ` +
          `incorrectly. See https://github.com/vertz-dev/vertz/issues/2953`,
      );
    }
  }
}
