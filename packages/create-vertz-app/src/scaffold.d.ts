import type { ScaffoldOptions } from './types.js';
/**
 * Error thrown when the project directory already exists
 */
export declare class DirectoryExistsError extends Error {
  constructor(projectName: string);
}
/**
 * Scaffolds a new Vertz project
 * @param parentDir - Parent directory where the project will be created
 * @param options - Scaffold options
 */
export declare function scaffold(parentDir: string, options: ScaffoldOptions): Promise<void>;
//# sourceMappingURL=scaffold.d.ts.map
