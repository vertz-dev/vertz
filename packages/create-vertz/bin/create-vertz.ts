#!/usr/bin/env bun

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveOptions, scaffold } from '@vertz/create-vertz-app';

const pkg = JSON.parse(readFileSync(resolve(import.meta.dir, '../package.json'), 'utf-8'));

const name = process.argv[2];

try {
  const resolved = await resolveOptions({ projectName: name });

  console.log(`Creating Vertz app: ${resolved.projectName} (v${pkg.version})`);

  const targetDir = process.cwd();
  await scaffold(targetDir, resolved);

  console.log(`\n✓ Created ${resolved.projectName}`);
  console.log(`\nNext steps:`);
  console.log(`  cd ${resolved.projectName}`);
  console.log(`  bun install`);
  console.log(`  bun run dev`);
} catch (error) {
  console.error('Error:', error instanceof Error ? error.message : error);
  process.exit(1);
}
