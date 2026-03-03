import { resolveOptions, scaffold } from '@vertz/create-vertz-app';
import { err, ok, type Result } from '@vertz/errors';

export interface CreateOptions {
  projectName?: string;
}

export async function createAction(options: CreateOptions): Promise<Result<void, Error>> {
  const { projectName } = options;

  // Validate project name
  if (!projectName) {
    return err(new Error('Project name is required. Usage: vertz create <project-name>'));
  }

  // Validate project name format
  const validName = /^[a-z0-9-]+$/.test(projectName);
  if (!validName) {
    return err(new Error('Project name must be lowercase alphanumeric with hyphens only'));
  }

  try {
    const resolved = await resolveOptions({ projectName });

    console.log(`Creating Vertz app: ${resolved.projectName}`);

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
