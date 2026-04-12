import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { BuildConfig } from './types.js';

function findTsc(cwd: string): string {
  // Walk up from cwd looking for node_modules/.bin/tsc
  let dir = cwd;
  while (true) {
    const candidate = join(dir, 'node_modules', '.bin', 'tsc');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fall back to system PATH
  return 'tsc';
}

export async function generateDts(config: BuildConfig, cwd: string): Promise<void> {
  if (!config.dts) return;

  const outDir = config.outDir ?? 'dist';
  const tscPath = findTsc(cwd);

  return new Promise((resolve, reject) => {
    execFile(
      tscPath,
      ['--emitDeclarationOnly', '--noCheck', '--outDir', outDir],
      { cwd },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(`tsc failed:\n${stderr}`));
        } else {
          resolve();
        }
      },
    );
  });
}
