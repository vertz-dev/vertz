/**
 * Available scaffold template types (presets)
 */
export type TemplateType = 'hello-world' | 'todo-app' | 'api' | 'ui' | 'full-stack' | 'minimal';

/**
 * Options for the scaffold function
 */
export interface ScaffoldOptions {
  /** Name of the project to create */
  projectName: string;
  /** Template preset to scaffold (default: 'todo-app') */
  template: TemplateType;
  /** Custom feature list (overrides template if provided) */
  withFeatures?: string[];
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
