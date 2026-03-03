/**
 * Options for the scaffold function
 */
export interface ScaffoldOptions {
  /** Name of the project to create */
  projectName: string;
}

/**
 * CLI options parsed from command line flags
 */
export interface CliOptions {
  /** Project name (positional argument or --name) */
  projectName?: string;
}
