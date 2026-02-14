import { createInterface } from 'node:readline';
import type { CliOptions, Runtime, ScaffoldOptions } from './types.js';

const VALID_RUNTIMES: Runtime[] = ['bun', 'node', 'deno'];

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
 * Error thrown when an invalid runtime is provided
 */
export class InvalidRuntimeError extends Error {
  constructor(runtime: string) {
    super(`Invalid runtime: ${runtime}. Valid options are: ${VALID_RUNTIMES.join(', ')}`);
    this.name = 'InvalidRuntimeError';
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
 * Prompts the user for runtime selection
 */
export async function promptForRuntime(): Promise<Runtime> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('Runtime (bun/node/deno) [bun]: ', (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (VALID_RUNTIMES.includes(trimmed as Runtime)) {
        resolve(trimmed as Runtime);
      } else {
        resolve('bun');
      }
    });
  });
}

/**
 * Prompts the user for example module inclusion
 */
export async function promptForExample(): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('Include example health module? (Y/n): ', (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      // Default to yes
      if (trimmed === 'n' || trimmed === 'no') {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

/**
 * Resolves CLI options into complete scaffold options
 * Handles both interactive and CI modes
 */
export async function resolveOptions(cliOptions: Partial<CliOptions>): Promise<ScaffoldOptions> {
  const isCI = process.env.CI === 'true';

  // Validate runtime if provided
  if (cliOptions.runtime !== undefined && !VALID_RUNTIMES.includes(cliOptions.runtime)) {
    throw new InvalidRuntimeError(cliOptions.runtime);
  }

  // Handle project name
  let projectName = cliOptions.projectName;
  if (!projectName) {
    if (isCI) {
      throw new ProjectNameRequiredError();
    }
    projectName = await promptForProjectName();
  }

  // Handle runtime
  let runtime = cliOptions.runtime;
  if (!runtime) {
    if (isCI) {
      runtime = 'bun'; // Default in CI mode
    } else {
      runtime = await promptForRuntime();
    }
  }

  // Handle example inclusion
  let includeExample = cliOptions.includeExample;
  if (includeExample === undefined) {
    if (isCI) {
      includeExample = true; // Default in CI mode
    } else {
      includeExample = await promptForExample();
    }
  }

  return {
    projectName,
    runtime,
    includeExample,
  };
}
