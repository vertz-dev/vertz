/**
 * Runtime options for the scaffolded project
 */
export type Runtime = 'bun' | 'node' | 'deno';

/**
 * Options for the scaffold function
 */
export interface ScaffoldOptions {
  /** Name of the project to create */
  projectName: string;
  /** Target runtime (bun, node, or deno) */
  runtime: Runtime;
  /** Whether to include example health module */
  includeExample: boolean;
}

/**
 * CLI options parsed from command line flags
 */
export interface CliOptions {
  /** Project name (positional argument or --name) */
  projectName?: string;
  /** Target runtime */
  runtime?: Runtime;
  /** Whether to include example module */
  includeExample?: boolean;
}
