import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DocsConfig } from './types';

/**
 * Load the docs configuration from `vertz.config.ts` in the given directory.
 * Uses Bun's native TypeScript import to load the config.
 */
export async function loadDocsConfig(projectDir: string): Promise<DocsConfig> {
  const configPath = join(projectDir, 'vertz.config.ts');

  if (!existsSync(configPath)) {
    throw new Error(`No vertz.config.ts found in ${projectDir}`);
  }

  // Append timestamp query to bust Bun's module cache
  const mod = await import(`${configPath}?t=${Date.now()}`);
  const config: DocsConfig = mod.default ?? mod;

  return config;
}
