import type { CliOptions, Runtime, ScaffoldOptions } from './types.js';
/**
 * Error thrown in CI mode when project name is required but not provided
 */
export declare class ProjectNameRequiredError extends Error {
  constructor();
}
/**
 * Error thrown when an invalid runtime is provided
 */
export declare class InvalidRuntimeError extends Error {
  constructor(runtime: string);
}
/**
 * Prompts the user for project name
 */
export declare function promptForProjectName(): Promise<string>;
/**
 * Prompts the user for runtime selection
 */
export declare function promptForRuntime(): Promise<Runtime>;
/**
 * Prompts the user for example module inclusion
 */
export declare function promptForExample(): Promise<boolean>;
/**
 * Resolves CLI options into complete scaffold options
 * Handles both interactive and CI modes
 */
export declare function resolveOptions(cliOptions: Partial<CliOptions>): Promise<ScaffoldOptions>;
//# sourceMappingURL=prompts.d.ts.map
