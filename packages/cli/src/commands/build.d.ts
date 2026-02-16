/**
 * Vertz Build Command - Production Build
 *
 * Production build command that orchestrates:
 * 1. Codegen - runs the full pipeline to generate types, routes, OpenAPI
 * 2. Typecheck - runs TypeScript compiler for type checking
 * 3. Bundle - bundles the server for production (esbuild)
 * 4. Manifest - generates build manifest for vertz publish
 */
export interface BuildCommandOptions {
  strict?: boolean;
  output?: string;
  target?: 'node' | 'edge' | 'worker';
  noTypecheck?: boolean;
  noMinify?: boolean;
  sourcemap?: boolean;
  verbose?: boolean;
}
/**
 * Run the build command
 * @returns Exit code (0 for success, 1 for failure)
 */
export declare function buildAction(options?: BuildCommandOptions): Promise<number>;
//# sourceMappingURL=build.d.ts.map
