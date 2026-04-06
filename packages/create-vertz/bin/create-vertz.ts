#!/usr/bin/env bun

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveOptions, scaffold } from '@vertz/create-vertz-app';

const pkg = JSON.parse(readFileSync(resolve(import.meta.dir, '../package.json'), 'utf-8'));

// Parse args: create-vertz [name] [--template <type>]
let name: string | undefined;
let template: string | undefined;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--template' && i + 1 < args.length) {
    template = args[++i];
  } else if (!args[i].startsWith('-') && !name) {
    name = args[i];
  }
}

try {
  const resolved = await resolveOptions({ projectName: name, template });

  console.log(`Creating Vertz app: ${resolved.projectName} (v${pkg.version})`);

  const targetDir = process.cwd();
  await scaffold(targetDir, resolved);

  console.log(`\n✓ Created ${resolved.projectName}`);
  console.log(`\nNext steps:`);
  console.log(`  cd ${resolved.projectName}`);
  console.log(`  vtz install`);
  console.log(`  vtz dev`);
} catch (error) {
  console.error('Error:', error instanceof Error ? error.message : error);
  process.exit(1);
}
