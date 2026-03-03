#!/usr/bin/env node

import { Command } from 'commander';
import { resolveOptions, scaffold } from '../src/index.js';

const program = new Command();

program
  .name('create-vertz-app')
  .description('Scaffold a new Vertz project')
  .version('0.1.0')
  .argument('[name]', 'Project name')
  .action(async (name: string | undefined) => {
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
  });

program.parse();
