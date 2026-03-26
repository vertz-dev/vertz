import { createInterface } from 'node:readline';
import type { CliOptions, ScaffoldOptions, TemplateType } from './types.js';

const VALID_TEMPLATES: TemplateType[] = ['hello-world', 'todo-app'];
const DEFAULT_TEMPLATE: TemplateType = 'todo-app';

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
 * Error thrown when an invalid template type is provided
 */
export class InvalidTemplateError extends Error {
  constructor(template: string) {
    super(
      `Invalid template "${template}". Available templates: ${VALID_TEMPLATES.join(', ')}`,
    );
    this.name = 'InvalidTemplateError';
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
 * Validates and returns a template type
 */
function resolveTemplate(template?: string): TemplateType {
  if (!template) return DEFAULT_TEMPLATE;
  if (VALID_TEMPLATES.includes(template as TemplateType)) {
    return template as TemplateType;
  }
  throw new InvalidTemplateError(template);
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

  const template = resolveTemplate(cliOptions.template);

  return { projectName, template };
}
