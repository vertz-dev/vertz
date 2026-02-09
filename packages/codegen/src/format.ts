import { accessSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GeneratedFile } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Minimal Biome configuration for formatting generated code. */
const BIOME_CONFIG = JSON.stringify({
  $schema: 'https://biomejs.dev/schemas/2.0.0/schema.json',
  formatter: {
    enabled: true,
    indentStyle: 'space',
    indentWidth: 2,
    lineWidth: 100,
  },
  javascript: {
    formatter: {
      quoteStyle: 'single',
      semicolons: 'always',
      trailingCommas: 'all',
    },
  },
  linter: {
    enabled: false,
  },
  vcs: {
    enabled: false,
  },
});

function findBiomeBin(): string {
  const candidates = [
    // From source: packages/codegen/src/ -> monorepo root
    resolve(__dirname, '..', '..', '..', 'node_modules', '.bin', 'biome'),
    // From package node_modules
    resolve(__dirname, '..', 'node_modules', '.bin', 'biome'),
    // From cwd (test context)
    resolve(process.cwd(), 'node_modules', '.bin', 'biome'),
  ];

  for (const candidate of candidates) {
    try {
      accessSync(candidate);
      return candidate;
    } catch {}
  }

  // Last resort: assume it's on PATH
  return 'biome';
}

function spawnAsync(
  cmd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const proc = Bun.spawn([cmd, ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    proc.exited
      .then(async (exitCode) => {
        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        resolve({ stdout, stderr, exitCode });
      })
      .catch(reject);
  });
}

/**
 * Format generated files using Biome.
 *
 * Writes files to a temp directory with a standalone biome.json config,
 * runs `biome format --write --config-path <tempDir>`,
 * reads them back, and cleans up.
 */
export async function formatWithBiome(files: GeneratedFile[]): Promise<GeneratedFile[]> {
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

    // Write a standalone biome.json so formatting works outside the repo
    await writeFile(join(tempDir, 'biome.json'), BIOME_CONFIG, 'utf-8');

    // Write all files to the temp directory
    for (const file of files) {
      const filePath = join(tempDir, file.path);
      const dir = dirname(filePath);
      await mkdir(dir, { recursive: true });
      await writeFile(filePath, file.content, 'utf-8');
    }

    // Run Biome format with explicit config-path so it uses our config, not the repo root's
    const biomeBin = findBiomeBin();
    try {
      await spawnAsync(biomeBin, ['format', '--write', `--config-path=${tempDir}`, tempDir]);
    } catch {
      // If biome format fails (e.g. syntax error), return files as-is
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
