import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { GeneratedFile } from '../generators/types';

export interface WriteResult {
  written: number;
  skipped: number;
  removed: number;
  filesWritten: string[];
}

/**
 * Write generated files to disk, only updating files whose content changed.
 */
export async function writeIncremental(
  files: GeneratedFile[],
  outputDir: string,
  options?: { clean?: boolean; dryRun?: boolean },
): Promise<WriteResult> {
  const clean = options?.clean ?? false;
  const dryRun = options?.dryRun ?? false;
  const result: WriteResult = { written: 0, skipped: 0, removed: 0, filesWritten: [] };

  const generatedPaths = new Set(files.map((f) => f.path));

  for (const file of files) {
    const fullPath = join(outputDir, file.path);
    const newHash = sha256(file.content);

    if (existsSync(fullPath)) {
      const existingContent = readFileSync(fullPath, 'utf-8');
      const existingHash = sha256(existingContent);

      if (newHash === existingHash) {
        result.skipped++;
        continue;
      }
    }

    result.written++;
    result.filesWritten.push(file.path);

    if (!dryRun) {
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, file.content);
    }
  }

  if (clean && existsSync(outputDir)) {
    const existingFiles = collectFiles(outputDir, outputDir);
    for (const existing of existingFiles) {
      if (!generatedPaths.has(existing)) {
        result.removed++;
        if (!dryRun) {
          rmSync(join(outputDir, existing));
        }
      }
    }
    // Remove empty directories left behind
    if (!dryRun) {
      removeEmptyDirs(outputDir);
    }
  }

  return result;
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function removeEmptyDirs(dir: string): void {
  if (!existsSync(dir)) return;

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      removeEmptyDirs(fullPath);
      // After recursing, check if directory is now empty
      if (readdirSync(fullPath).length === 0) {
        rmSync(fullPath, { recursive: true });
      }
    }
  }
}

function collectFiles(dir: string, baseDir: string): string[] {
  const files: string[] = [];

  if (!existsSync(dir)) return files;

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectFiles(fullPath, baseDir));
    } else {
      files.push(relative(baseDir, fullPath));
    }
  }

  return files;
}
