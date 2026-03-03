import { createInterface } from 'node:readline';
import type { CliOptions, ScaffoldOptions } from './types.js';

/**
 * Error thrown in CI mode when project name is required but not provided
 */
export class ProjectNameRequiredError extends Error {
  constructor() {
    super('Project name is required in CI mode. Use --name or pass as argument.');
    this.name = 'ProjectNameRequiredError';
  }
}

/**
 * Prompts the user for project name
 */
export async function promptForProjectName(): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('Project name: ', (answer) => {
      rl.close();
      resolve(answer.trim() || 'my-vertz-app');
    });
  });
}

/**
 * Resolves CLI options into complete scaffold options
 * Handles both interactive and CI modes
 */
export async function resolveOptions(cliOptions: Partial<CliOptions>): Promise<ScaffoldOptions> {
  const isCI = process.env.CI === 'true';

  let projectName = cliOptions.projectName;
  if (!projectName) {
    if (isCI) {
      throw new ProjectNameRequiredError();
    }
    projectName = await promptForProjectName();
  }

  return { projectName };
}
