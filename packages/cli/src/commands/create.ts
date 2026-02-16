import { resolveOptions, scaffold } from '@vertz/create-vertz-app';
import type { Runtime } from '@vertz/create-vertz-app';

export interface CreateOptions {
  projectName?: string;
  runtime?: string;
  example?: boolean;
}

export async function createAction(options: CreateOptions): Promise<void> {
  const { projectName, runtime, example } = options;

  // Validate project name
  if (!projectName) {
    console.error('Error: Project name is required');
    console.error('Usage: vertz create <project-name>');
    process.exit(1);
  }

  // Validate project name format
  const validName = /^[a-z0-9-]+$/.test(projectName);
  if (!validName) {
    console.error('Error: Project name must be lowercase alphanumeric with hyphens only');
    process.exit(1);
  }

  // Validate runtime
  const validRuntimes = ['bun', 'node', 'deno'];
  const runtimeValue = (runtime || 'bun').toLowerCase();
  if (!validRuntimes.includes(runtimeValue)) {
    console.error(`Error: Invalid runtime. Must be one of: ${validRuntimes.join(', ')}`);
    process.exit(1);
  }

  // Handle --example / --no-example
  let includeExample: boolean | undefined;
  if (example === true) {
    includeExample = true;
  } else if (example === false) {
    includeExample = false;
  }

  const cliOptions = {
    projectName,
    runtime: runtimeValue as Runtime,
    includeExample,
  };

  try {
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
    if (error instanceof Error && error.message.includes('already exists')) {
      console.error(`\nError: Directory "${projectName}" already exists.`);
      console.error('Please choose a different project name or remove the existing directory.');
    } else {
      console.error('Error:', error instanceof Error ? error.message : error);
    }
    process.exit(1);
  }
}
