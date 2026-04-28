import { isAbsolute, relative } from 'node:path';
import type { OutputFileInfo } from './types.js';

/**
 * Guards against the class of bug where a build emits files outside its
 * own output directory — e.g. issue #2953, where `packages/ui/dist/index.js`
 * was overwritten with `packages/ui-primitives` build output.
 *
 * Throws a descriptive error if any output path is not strictly inside
 * `outDir`.
 */
export function assertOutputsUnderOutDir(outputs: OutputFileInfo[], outDir: string): void {
  for (const file of outputs) {
    const rel = relative(outDir, file.path);
    // Outside outDir if rel is empty / "." (path equals outDir itself, not a
    // file), starts with ".." (parent traversal), or is absolute (different
    // root, e.g. on Windows).
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
