#!/usr/bin/env node
import { Command } from 'commander';
import { resolveOptions, scaffold } from '../src/index.js';

const program = new Command();
program
  .name('create-vertz-app')
  .description('Scaffold a new Vertz project')
  .version('0.1.0')
  .argument('[name]', 'Project name')
  .option('-r, --runtime <runtime>', 'Runtime to use (bun, node, deno)', 'bun')
  .option('-e, --example', 'Include example health module', undefined)
  .option('--no-example', 'Exclude example health module')
  .action(async (name, options) => {
    try {
      // Convert runtime string to Runtime type
      const runtime = options.runtime.toLowerCase();
      // Handle --example / --no-example
      let includeExample;
      if (options.example === true) {
        includeExample = true;
      } else if (options.example === false) {
        includeExample = false;
      }
      const cliOptions = {
        projectName: name,
        runtime,
        includeExample,
      };
      const resolved = await resolveOptions(cliOptions);
      console.log(`Creating Vertz app: ${resolved.projectName}`);
      console.log(`Runtime: ${resolved.runtime}`);
      console.log(`Include example: ${resolved.includeExample ? 'Yes' : 'No'}`);
      // Create project in current directory
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
//# sourceMappingURL=create-vertz-app.js.map
