/**
 * Available scaffold template types
 */
export type TemplateType = 'hello-world' | 'todo-app';

/**
 * Options for the scaffold function
 */
export interface ScaffoldOptions {
  /** Name of the project to create */
  projectName: string;
  /** Template to scaffold (default: 'todo-app') */
  template: TemplateType;
}

/**
 * CLI options parsed from command line flags
 */
export interface CliOptions {
  /** Project name (positional argument or --name) */
  projectName?: string;
  /** Template type */
  template?: string;
}
