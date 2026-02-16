/**
 * Vertz Dev Command - Phase 1 Implementation
 *
 * Unified `vertz dev` command that orchestrates the full development workflow:
 * 1. Analyze - runs @vertz/compiler to produce AppIR
 * 2. Generate - runs @vertz/codegen to emit types, route map, DB client
 * 3. Build UI - UI compilation (Vite for now)
 * 4. Serve - dev server with HMR
 */
import type { Command } from 'commander';
export interface DevCommandOptions {
  port?: number;
  host?: string;
  open?: boolean;
  typecheck?: boolean;
  noTypecheck?: boolean;
  verbose?: boolean;
}
/**
 * Run the dev command
 */
export declare function devAction(options?: DevCommandOptions): Promise<void>;
/**
 * Register the dev command with a Commander program
 */
export declare function registerDevCommand(program: Command): void;
//# sourceMappingURL=dev.d.ts.map
