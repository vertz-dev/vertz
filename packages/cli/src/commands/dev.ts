/**
 * Vertz Dev Command
 *
 * Unified `vertz dev` command that:
 * 1. Detects app type (api-only, full-stack, ui-only) from file conventions
 * 2. Runs the pipeline orchestrator (analyze, codegen)
 * 3. Starts the appropriate dev server:
 *    - api-only: subprocess with bun run --watch
 *    - full-stack: in-process Vite SSR + API middleware
 *    - ui-only: in-process Vite SSR only
 */

import { join } from 'node:path';
import type { Command } from 'commander';
import { detectAppType } from '../dev-server/app-detector';
import { startDevServer } from '../dev-server/fullstack-server';
import {
  createPipelineWatcher,
  type FileChange,
  getStagesForChanges,
  type PipelineConfig,
  PipelineOrchestrator,
} from '../pipeline';
import { formatDuration } from '../utils/format';
import { findProjectRoot } from '../utils/paths';

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
export async function devAction(options: DevCommandOptions = {}): Promise<void> {
  const {
    port = 3000,
    host = 'localhost',
    open = false,
    typecheck = true,
    verbose = false,
  } = options;

  // Find project root
  const projectRoot = findProjectRoot(process.cwd());
  if (!projectRoot) {
    console.error('Error: Could not find project root. Are you in a Vertz project?');
    process.exit(1);
  }

  // Detect app type from file conventions
  const detected = (() => {
    try {
      return detectAppType(projectRoot);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  })();

  if (verbose) {
    console.log(`Detected app type: ${detected.type}`);
    if (detected.serverEntry) console.log(`  Server: ${detected.serverEntry}`);
    if (detected.uiEntry) console.log(`  UI:     ${detected.uiEntry}`);
    if (detected.ssrEntry) console.log(`  SSR:    ${detected.ssrEntry}`);
    if (detected.clientEntry) console.log(`  Client: ${detected.clientEntry}`);
  }

  // Configure and run the pipeline
  const pipelineConfig: PipelineConfig = {
    sourceDir: 'src',
    outputDir: '.vertz/generated',
    typecheck,
    autoSyncDb: true,
    open,
    port,
    host,
  };

  const orchestrator = new PipelineOrchestrator(pipelineConfig);
  let isRunning = true;

  // Handle graceful shutdown
  const shutdown = async () => {
    isRunning = false;
    await orchestrator.dispose();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    // Step 1: Initial analysis and codegen
    const initialResult = await orchestrator.runFull();

    if (!initialResult.success) {
      console.error('Initial pipeline failed:');
      for (const stage of initialResult.stages) {
        if (!stage.success && stage.error) {
          console.error(`  - ${stage.stage}: ${stage.error.message}`);
        }
      }
      console.log('Fix the errors above and the watcher will retry.');
    } else if (verbose) {
      console.log('Initial pipeline complete:');
      for (const stage of initialResult.stages) {
        console.log(`  - ${stage.stage}: ${stage.output} (${formatDuration(stage.durationMs)})`);
      }
    }

    // Step 2: Start file watcher for incremental builds
    const _watcher = createPipelineWatcher({
      dir: join(projectRoot, 'src'),
      debounceMs: 100,
      onChange: async (changes: FileChange[]) => {
        if (!isRunning) return;

        const stages = getStagesForChanges(changes);

        if (verbose) {
          console.log(`File change detected: ${changes.map((c) => c.path).join(', ')}`);
          console.log(`  Running stages: ${stages.join(', ')}`);
        }

        const result = await orchestrator.runStages(stages);

        if (!result.success) {
          console.error('Pipeline update failed:');
          for (const stage of result.stages) {
            if (!stage.success && stage.error) {
              console.error(`  - ${stage.stage}: ${stage.error.message}`);
            }
          }
        } else if (verbose) {
          for (const stage of result.stages) {
            console.log(`  ${stage.stage}: ${stage.output}`);
          }
        }
      },
    });

    // Step 3: Start dev server based on detected app type
    await startDevServer({ detected, port, host });
  } catch (error) {
    console.error('Fatal error:', error instanceof Error ? error.message : String(error));
    await shutdown();
    process.exit(1);
  }
}

/**
 * Register the dev command with a Commander program
 */
export function registerDevCommand(program: Command): void {
  program
    .command('dev')
    .description('Start development server with hot reload')
    .option('-p, --port <port>', 'Server port', '3000')
    .option('--host <host>', 'Server host', 'localhost')
    .option('--open', 'Open browser on start')
    .option('--no-typecheck', 'Disable background type checking')
    .option('-v, --verbose', 'Verbose output')
    .action(async (opts) => {
      await devAction({
        port: parseInt(opts.port, 10),
        host: opts.host,
        open: opts.open,
        typecheck: opts.typecheck !== false && !opts.noTypecheck,
        verbose: opts.verbose,
      });
    });
}
