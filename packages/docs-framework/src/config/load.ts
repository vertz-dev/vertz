import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DocsConfig } from './types';

let importCounter = 0;

/**
 * Load the docs configuration from `vertz.config.ts` in the given directory.
 * Uses Bun's native TypeScript import to load the config.
 */
export async function loadDocsConfig(projectDir: string): Promise<DocsConfig> {
  const configPath = join(projectDir, 'vertz.config.ts');

  if (!existsSync(configPath)) {
    throw new Error(`No vertz.config.ts found in ${projectDir}`);
  }

  // Append unique query to bust Bun's module cache
  importCounter++;
  const mod = await import(`${configPath}?t=${Date.now()}_${importCounter}`);
  const raw = mod.default;

  if (!raw || typeof raw !== 'object') {
    throw new Error('vertz.config.ts must export a default config object');
  }

  if (typeof raw.name !== 'string') {
    throw new Error('vertz.config.ts config must have a "name" string field');
  }

  if (!Array.isArray(raw.sidebar)) {
    throw new Error('vertz.config.ts config must have a "sidebar" array field');
  }

  return raw as DocsConfig;
}
