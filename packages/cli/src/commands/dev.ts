/**
 * Vertz Dev Command
 *
 * Unified `vertz dev` command that:
 * 1. Detects app type (api-only, full-stack, ui-only) from file conventions
 * 2. Runs the pipeline orchestrator (analyze, codegen)
 * 3. Starts the appropriate dev server:
 *    - api-only: subprocess with bun run --watch
 *    - full-stack / ui-only: Bun.serve() with unified SSR + HMR
 */

import { join } from 'node:path';
import { err, ok, type Result } from '@vertz/errors';
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
import {
  checkVersionCompatibility,
  findRuntimeBinary,
  launchRuntime,
  NATIVE_RUNTIME_COMMANDS,
  type RuntimeLaunchOptions,
} from '../runtime/launcher';
import { formatDuration } from '../utils/format';
import { findProjectRoot } from '../utils/paths';

export interface DevCommandOptions {
  port?: number;
  host?: string;
  open?: boolean;
  typecheck?: boolean;
  noTypecheck?: boolean;
  verbose?: boolean;
  experimentalRuntime?: boolean;
}

/**
 * Run the dev command
 */
export async function devAction(options: DevCommandOptions = {}): Promise<Result<void, Error>> {
  const {
    port = 3000,
    host = 'localhost',
    open = false,
    typecheck = true,
    verbose = false,
    experimentalRuntime = false,
  } = options;

  // Find project root
  const projectRoot = findProjectRoot(process.cwd());
  if (!projectRoot) {
    return err(new Error('Could not find project root. Are you in a Vertz project?'));
  }

  // Deprecation warning for --experimental-runtime
  if (experimentalRuntime) {
    console.warn(
      '[vertz] --experimental-runtime is deprecated, the native runtime is now the default. ' +
        'This flag will be removed in a future version.',
    );
  }

  // Try native runtime first (it's now the default)
  if (NATIVE_RUNTIME_COMMANDS.has('dev')) {
    const runtimeResult = tryNativeRuntime(projectRoot, { port, host, typecheck, open }, verbose);
    if (runtimeResult !== null) return runtimeResult;
  }

  // Fallback to Bun-based dev server
  return startBunDevServer(projectRoot, { port, host, open, typecheck, verbose });
}

/**
 * Attempt to start the native runtime. Returns:
 * - ok(undefined) if native runtime started successfully
 * - err() if native runtime found but failed to start
 * - null if no native runtime available (caller should fall back to Bun)
 */
function tryNativeRuntime(
  projectRoot: string,
  opts: RuntimeLaunchOptions,
  verbose: boolean,
): Result<void, Error> | null {
  let binaryPath: string | null;
  try {
    binaryPath = findRuntimeBinary(projectRoot);
  } catch (e) {
    // VERTZ_RUNTIME_BINARY was set but path doesn't exist — propagate the error
    return err(e instanceof Error ? e : new Error(String(e)));
  }

  if (!binaryPath) {
    console.log(
      '[vertz] Native runtime not found — falling back to Bun. ' +
        'Install @vertz/runtime for the native dev server (faster HMR, built-in test runner).',
    );
    return null;
  }

  if (verbose) {
    console.log(`[vertz] Using native runtime: ${binaryPath}`);
  }

  // Version compatibility check
  try {
    // Read CLI version from package.json
    const cliPkg = require('../../../package.json') as { version: string };
    const warning = checkVersionCompatibility(binaryPath, cliPkg.version);
    if (warning) console.warn(warning);
  } catch {
    // Skip version check if we can't read CLI version
  }

  const child = launchRuntime(binaryPath, opts);

  // Forward signals to the child process
  const shutdown = () => {
    child.kill('SIGTERM');
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGHUP', shutdown);

  // Handle spawn errors
  child.on('error', (error) => {
    console.error(`Failed to start native runtime: ${error.message}`);
    process.removeListener('SIGINT', shutdown);
    process.removeListener('SIGTERM', shutdown);
    process.removeListener('SIGHUP', shutdown);
    process.exit(1);
  });

  // Clean up signal handlers and exit when the child terminates
  child.on('exit', (code) => {
    process.removeListener('SIGINT', shutdown);
    process.removeListener('SIGTERM', shutdown);
    process.removeListener('SIGHUP', shutdown);
    process.exit(code ?? 0);
  });

  return ok(undefined);
}

/**
 * Start the Bun-based dev server (fallback path)
 */
async function startBunDevServer(
  projectRoot: string,
  options: {
    port: number;
    host: string;
    open: boolean;
    typecheck: boolean;
    verbose: boolean;
  },
): Promise<Result<void, Error>> {
  const { port, host, open, typecheck, verbose } = options;

  // Detect app type from file conventions
  let detected: ReturnType<typeof detectAppType>;
  try {
    detected = detectAppType(projectRoot);
  } catch (e) {
    return err(new Error(e instanceof Error ? e.message : String(e)));
  }

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
  process.on('SIGHUP', shutdown);

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
    return ok(undefined);
  } catch (error) {
    await orchestrator.dispose();
    return err(new Error(error instanceof Error ? error.message : String(error)));
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
    .option('--experimental-runtime', '(deprecated) Use the native runtime — now the default')
    .action(async (opts) => {
      const result = await devAction({
        port: parseInt(opts.port, 10),
        host: opts.host,
        open: opts.open,
        typecheck: opts.typecheck !== false && !opts.noTypecheck,
        verbose: opts.verbose,
        experimentalRuntime: opts.experimentalRuntime,
      });
      if (!result.ok) {
        console.error(result.error.message);
        process.exit(1);
      }
    });
}
