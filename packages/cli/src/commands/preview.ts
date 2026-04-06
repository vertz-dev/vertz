/**
 * Vertz Preview Command
 *
 * Serves the production build locally for testing.
 * Auto-builds when dist/ is missing or stale, unless overridden by flags.
 *
 * Dependencies are injected to avoid pulling in the entire build pipeline
 * at module load time and to enable testing without Bun runtime.
 */

import { err, ok, type Result } from '@vertz/errors';
import type { AppType } from '../dev-server/app-detector';
import type { FreshnessCheckResult } from './freshness';
import type { ServeOptions, ServeResult } from './serve-shared';

export interface PreviewCommandOptions {
  port?: number;
  host?: string;
  build?: boolean; // true = force, false = skip, undefined = auto
  open?: boolean;
  verbose?: boolean;
}

export interface PreviewDeps {
  cwd: string;
  findProjectRoot: (cwd: string) => string | undefined;
  detectAppType: (root: string) => { type: AppType };
  isBuildFresh: (root: string, appType: AppType) => FreshnessCheckResult;
  buildAction: () => Promise<Result<void, Error>>;
  validateBuildOutputs: (root: string, appType: AppType) => Result<void, Error>;
  serve: (appType: AppType, options: ServeOptions) => Promise<Result<ServeResult, Error>>;
  setupGracefulShutdown: (server: { stop(): void }) => void;
  openBrowser: (url: string) => void;
  log: (message: string) => void;
}

export async function previewAction(
  options: PreviewCommandOptions,
  deps: PreviewDeps,
): Promise<Result<void, Error>> {
  const { port = Number(process.env.PORT) || 4000, host = 'localhost', verbose = false } = options;

  // Find project root
  const projectRoot = deps.findProjectRoot(deps.cwd);
  if (!projectRoot) {
    return err(new Error('Could not find project root. Are you in a Vertz project?'));
  }

  // Detect app type
  let detected: { type: AppType };
  try {
    detected = deps.detectAppType(projectRoot);
  } catch (error) {
    return err(new Error(error instanceof Error ? error.message : String(error)));
  }

  if (verbose) {
    deps.log(`Detected app type: ${detected.type}`);
  }

  // Determine build strategy
  if (options.build !== false) {
    if (options.build === true) {
      // --build: force rebuild
      if (verbose) {
        deps.log('Forced rebuild requested');
      }
      const buildResult = await deps.buildAction();
      if (!buildResult.ok) {
        deps.log('Build failed. Fix the errors above and try again.');
        return buildResult;
      }
    } else {
      // Auto: check freshness
      const freshness = deps.isBuildFresh(projectRoot, detected.type);
      if (verbose) {
        deps.log(`Build freshness: ${freshness.fresh ? 'fresh' : 'stale'} (${freshness.reason})`);
      }
      if (!freshness.fresh) {
        deps.log(`Building... (${freshness.reason})`);
        const buildResult = await deps.buildAction();
        if (!buildResult.ok) {
          deps.log('Build failed. Fix the errors above and try again.');
          return buildResult;
        }
      }
    }
  }

  // Validate build outputs exist (catches --no-build with missing dist, or build that didn't produce outputs)
  const validation = deps.validateBuildOutputs(projectRoot, detected.type);
  if (!validation.ok) {
    return validation;
  }

  // Start server
  const serveOptions: ServeOptions = { projectRoot, port, host, verbose };
  const serveResult = await deps.serve(detected.type, serveOptions);
  if (!serveResult.ok) {
    return serveResult;
  }

  const { server, url, aotRouteCount } = serveResult.data;

  // Log preview banner
  deps.log(`\nPreview server running at ${url}`);
  if (aotRouteCount > 0) {
    deps.log(`AOT: ${aotRouteCount} route(s) loaded`);
  }
  deps.log('\nThis is a local preview. For production, use "vertz start".');
  deps.log('Press Ctrl+C to stop.');

  if (options.open) {
    deps.openBrowser(url);
  }

  deps.setupGracefulShutdown(server);
  return ok(undefined);
}
