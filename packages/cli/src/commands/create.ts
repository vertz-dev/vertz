import type { Runtime } from '@vertz/create-vertz-app';
import { resolveOptions, scaffold } from '@vertz/create-vertz-app';
import { err, ok, type Result } from '@vertz/errors';

export interface CreateOptions {
  projectName?: string;
  runtime?: string;
  example?: boolean;
}

export async function createAction(options: CreateOptions): Promise<Result<void, Error>> {
  const { projectName, runtime, example } = options;

  // Validate project name
  if (!projectName) {
    return err(new Error('Project name is required. Usage: vertz create <project-name>'));
  }

  // Validate project name format
  const validName = /^[a-z0-9-]+$/.test(projectName);
  if (!validName) {
    return err(new Error('Project name must be lowercase alphanumeric with hyphens only'));
  }

  // Validate runtime
  const validRuntimes = ['bun', 'node', 'deno'];
  const runtimeValue = (runtime || 'bun').toLowerCase();
  if (!validRuntimes.includes(runtimeValue)) {
    return err(new Error(`Invalid runtime. Must be one of: ${validRuntimes.join(', ')}`));
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
    return ok(undefined);
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      return err(
        new Error(
          `Directory "${projectName}" already exists. Please choose a different project name or remove the existing directory.`,
        ),
      );
    }
    return err(new Error(error instanceof Error ? error.message : String(error)));
  }
}
