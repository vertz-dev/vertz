import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { hashContent } from './hasher';

// ── Helpers ───────────────────────────────────────────────────────
/**
 * Recursively collect all file paths under `dir`, relative to `baseDir`.
 */
async function collectFiles(dir, baseDir) {
  const results = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectFiles(fullPath, baseDir)));
    } else if (entry.isFile()) {
      results.push(relative(baseDir, fullPath));
    }
  }
  return results;
}
// ── Main ──────────────────────────────────────────────────────────
/**
 * Write generated files to disk incrementally:
 * - Only writes files whose content has changed (or are new).
 * - Optionally removes stale files that are no longer generated.
 */
export async function writeIncremental(files, outputDir, options) {
  const written = [];
  const skipped = [];
  const removed = [];
  // Ensure outputDir exists
  await mkdir(outputDir, { recursive: true });
  // Build set of generated paths for clean-mode lookup
  const generatedPaths = new Set(files.map((f) => f.path));
  // Write or skip each generated file
  for (const file of files) {
    const filePath = join(outputDir, file.path);
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });
    // Check if the file already exists with the same content
    let existingContent;
    try {
      existingContent = await readFile(filePath, 'utf-8');
    } catch {
      // File does not exist — will be written
    }
    if (
      existingContent !== undefined &&
      hashContent(existingContent) === hashContent(file.content)
    ) {
      skipped.push(file.path);
    } else {
      await writeFile(filePath, file.content, 'utf-8');
      written.push(file.path);
    }
  }
  // Clean mode: remove stale files
  if (options?.clean) {
    const existingFiles = await collectFiles(outputDir, outputDir);
    for (const existing of existingFiles) {
      if (!generatedPaths.has(existing)) {
        await rm(join(outputDir, existing), { force: true });
        removed.push(existing);
      }
    }
  }
  return { written, skipped, removed };
}
//# sourceMappingURL=incremental.js.map
