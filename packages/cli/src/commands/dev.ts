/**
 * Vertz Dev Command
 *
 * Starts the native `vtz` runtime for development:
 * 1. Runs the codegen pipeline (analyze, codegen)
 * 2. Launches the native dev server (SSR + HMR + API)
 */

import { err, ok, type Result } from '@vertz/errors';
import type { Command } from 'commander';
import { type PipelineConfig, PipelineOrchestrator } from '../pipeline';
import {
  checkVersionCompatibility,
  findRuntimeBinary,
  launchRuntime,
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
  } = options;

  // Find project root
  const projectRoot = findProjectRoot(process.cwd());
  if (!projectRoot) {
    return err(new Error('Could not find project root. Are you in a Vertz project?'));
  }

  // Run codegen pipeline before starting any server so that
  // .vertz/generated/ files (SDK client, types, etc.) exist.
  // Without this, imports like `#generated` resolve to missing files.
  await runCodegenPipeline(projectRoot, { typecheck, verbose });

  // Launch native runtime
  return launchNativeRuntime(projectRoot, { port, host, typecheck, open }, verbose);
}

/**
 * Run the codegen pipeline (analyze → codegen) to generate .vertz/generated/ files.
 * Non-fatal: if codegen fails, log a warning and continue.
 */
async function runCodegenPipeline(
  _projectRoot: string,
  options: { typecheck: boolean; verbose: boolean },
): Promise<void> {
  const pipelineConfig: PipelineConfig = {
    sourceDir: 'src',
    outputDir: '.vertz/generated',
    typecheck: options.typecheck,
    autoSyncDb: true,
    open: false,
    port: 0,
    host: 'localhost',
  };

  const orchestrator = new PipelineOrchestrator(pipelineConfig);

  try {
    const result = await orchestrator.runFull();

    if (!result.success) {
      console.warn('[vertz] Codegen pipeline had errors:');
      for (const stage of result.stages) {
        if (!stage.success && stage.error) {
          console.warn(`  - ${stage.stage}: ${stage.error.message}`);
        }
      }
      console.warn('[vertz] Continuing with dev server startup...');
    } else if (options.verbose) {
      console.log('[vertz] Codegen pipeline complete:');
      for (const stage of result.stages) {
        console.log(`  - ${stage.stage}: ${stage.output} (${formatDuration(stage.durationMs)})`);
      }
    }
  } catch (error) {
    console.warn(
      `[vertz] Codegen pipeline failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.warn('[vertz] Continuing with dev server startup...');
  } finally {
    await orchestrator.dispose();
  }
}

/**
 * Launch the native vtz runtime.
 * Errors if the runtime binary is not found — there is no Bun fallback.
 */
function launchNativeRuntime(
  projectRoot: string,
  opts: RuntimeLaunchOptions,
  verbose: boolean,
): Result<void, Error> {
  let binaryPath: string | null;
  try {
    binaryPath = findRuntimeBinary(projectRoot);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }

  if (!binaryPath) {
    return err(
      new Error(
        'vtz runtime not found. Install it with: curl -fsSL https://vertz.dev/install.sh | sh',
      ),
    );
  }

  if (verbose) {
    console.log(`[vertz] Using native runtime: ${binaryPath}`);
  }

  // Version compatibility check
  try {
    const cliPkg = require('../../../package.json') as { version: string };
    const warning = checkVersionCompatibility(binaryPath, cliPkg.version);
    if (warning) console.warn(warning);
  } catch {
    // Skip version check if we can't read CLI version
  }

  const child = launchRuntime(binaryPath, opts);

  const shutdown = () => {
    child.kill('SIGTERM');
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGHUP', shutdown);

  child.on('error', (error: Error) => {
    console.error(`Failed to start native runtime: ${error.message}`);
    process.removeListener('SIGINT', shutdown);
    process.removeListener('SIGTERM', shutdown);
    process.removeListener('SIGHUP', shutdown);
    process.exit(1);
  });

  child.on('exit', (code: number | null) => {
    process.removeListener('SIGINT', shutdown);
    process.removeListener('SIGTERM', shutdown);
    process.removeListener('SIGHUP', shutdown);
    process.exit(code ?? 0);
  });

  return ok(undefined);
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
      const result = await devAction({
        port: parseInt(opts.port, 10),
        host: opts.host,
        open: opts.open,
        typecheck: opts.typecheck !== false && !opts.noTypecheck,
        verbose: opts.verbose,
      });
      if (!result.ok) {
        console.error(result.error.message);
        process.exit(1);
      }
    });
}
