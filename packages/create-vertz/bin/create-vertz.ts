#!/usr/bin/env bun

import { resolveOptions, scaffold } from '@vertz/create-vertz-app';

const name = process.argv[2];

try {
  const resolved = await resolveOptions({ projectName: name });

  console.log(`Creating Vertz app: ${resolved.projectName}`);

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
