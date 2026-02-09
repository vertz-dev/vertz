import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { hashContent } from './hasher';
import type { GeneratedFile } from './types';

// ── Types ─────────────────────────────────────────────────────────

export interface IncrementalResult {
  /** Files that were written (new or changed). */
  written: string[];
  /** Files that were skipped (content unchanged). */
  skipped: string[];
  /** Files that were removed (stale, only in clean mode). */
  removed: string[];
}

export interface IncrementalOptions {
  /** If true, remove files in outputDir that are not in the generated set. */
  clean?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Recursively collect all file paths under `dir`, relative to `baseDir`.
 */
async function collectFiles(dir: string, baseDir: string): Promise<string[]> {
  const results: string[] = [];

  let entries: Awaited<ReturnType<typeof readdir>>;
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
export async function writeIncremental(
  files: GeneratedFile[],
  outputDir: string,
  options?: IncrementalOptions,
): Promise<IncrementalResult> {
  const written: string[] = [];
  const skipped: string[] = [];
  const removed: string[] = [];

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
    let existingContent: string | undefined;
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
