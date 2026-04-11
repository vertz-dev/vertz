#!/usr/bin/env node
import { resolve } from 'node:path';
import { build } from './build';
import type { BuildConfig } from './types';

async function main() {
  const cwd = process.cwd();
  const configPath = resolve(cwd, 'build.config.ts');

  let config: BuildConfig | BuildConfig[];
  try {
    const { createJiti } = await import('jiti');
    const jiti = createJiti(cwd, { interopDefault: true });
    const loaded = await jiti.import(configPath);
    config = ((loaded as { default?: BuildConfig | BuildConfig[] }).default ??
      loaded) as BuildConfig | BuildConfig[];
  } catch (err) {
    console.error(`Failed to load build.config.ts: ${(err as Error).message}`);
    process.exit(1);
  }

  try {
    await build(config, cwd);
  } catch (err) {
    console.error(`Build failed: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
