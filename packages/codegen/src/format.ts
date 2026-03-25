import { execFile } from 'node:child_process';
import { accessSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GeneratedFile } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Minimal oxfmt configuration for formatting generated code. */
const OXFMT_CONFIG = JSON.stringify({
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
});

function findOxfmtBin(): string {
  const candidates = [
    // From source: packages/codegen/src/ -> monorepo root
    resolve(__dirname, '..', '..', '..', 'node_modules', '.bin', 'oxfmt'),
    // From package node_modules
    resolve(__dirname, '..', 'node_modules', '.bin', 'oxfmt'),
    // From cwd (test context)
    resolve(process.cwd(), 'node_modules', '.bin', 'oxfmt'),
  ];

  for (const candidate of candidates) {
    try {
      accessSync(candidate);
      return candidate;
    } catch {}
  }

  // Last resort: assume it's on PATH
  return 'oxfmt';
}

function spawnAsync(
  cmd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ stdout, stderr, exitCode: error ? 1 : 0 });
    });
  });
}

/**
 * Format generated files using oxfmt.
 *
 * Writes files to a temp directory with a standalone .oxfmtrc.json config,
 * runs `oxfmt <tempDir>`,
 * reads them back, and cleans up.
 */
export async function formatGeneratedFiles(files: GeneratedFile[]): Promise<GeneratedFile[]> {
  if (files.length === 0) {
    return [];
  }

  // Create a unique temp directory
  const tempDir = join(
    tmpdir(),
    `vertz-codegen-format-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  try {
    await mkdir(tempDir, { recursive: true });

    // Write a standalone .oxfmtrc.json so formatting works outside the repo
    await writeFile(join(tempDir, '.oxfmtrc.json'), OXFMT_CONFIG, 'utf-8');

    // Write all files to the temp directory
    for (const file of files) {
      const filePath = join(tempDir, file.path);
      const dir = dirname(filePath);
      await mkdir(dir, { recursive: true });
      await writeFile(filePath, file.content, 'utf-8');
    }

    // Run oxfmt to format files in-place
    const oxfmtBin = findOxfmtBin();
    try {
      await spawnAsync(oxfmtBin, [tempDir]);
    } catch {
      // If oxfmt format fails (e.g. syntax error), return files as-is
      // This is a best-effort formatter
    }

    // Read formatted files back
    const formatted: GeneratedFile[] = [];
    for (const file of files) {
      const filePath = join(tempDir, file.path);
      const content = await readFile(filePath, 'utf-8');
      formatted.push({ path: file.path, content });
    }

    return formatted;
  } finally {
    // Clean up temp directory
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
