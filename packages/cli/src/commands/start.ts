/**
 * Vertz Start Command - Production Server
 *
 * Starts the production server after `vertz build`.
 * Dispatches to the correct server mode based on app type:
 * - API-only:   Import built module, use its handler
 * - UI-only:    SSR + static file serving
 * - Full-stack: API handler + SSR + static file serving
 */

import { err, ok, type Result } from '@vertz/errors';
import { detectAppType } from '../dev-server/app-detector';
import { findProjectRoot } from '../utils/paths';
import {
  serveApiOnly,
  serveFullStack,
  serveUIOnly,
  setupGracefulShutdown,
  validateBuildOutputs,
} from './serve-shared';

// Re-export shared utilities for backward compatibility with existing imports
export {
  discoverInlineCSS,
  discoverSSRModule,
  servePrerenderHTML,
  serveStaticFile,
  validateBuildOutputs,
} from './serve-shared';

export interface StartCommandOptions {
  port?: number;
  host?: string;
  verbose?: boolean;
}

/**
 * Start the production server.
 */
export async function startAction(options: StartCommandOptions = {}): Promise<Result<void, Error>> {
  const { port = Number(process.env.PORT) || 3000, host = '0.0.0.0', verbose = false } = options;

  // Find project root
  const projectRoot = findProjectRoot(process.cwd());
  if (!projectRoot) {
    return err(new Error('Could not find project root. Are you in a Vertz project?'));
  }

  // Detect app type
  let detected: ReturnType<typeof detectAppType>;
  try {
    detected = detectAppType(projectRoot);
  } catch (error) {
    return err(new Error(error instanceof Error ? error.message : String(error)));
  }

  if (verbose) {
    console.log(`Detected app type: ${detected.type}`);
  }

  // Validate build outputs
  const validation = validateBuildOutputs(projectRoot, detected.type);
  if (!validation.ok) {
    return validation;
  }

  const serveOptions = { projectRoot, port, host, verbose };

  // Start server based on app type
  let result;
  switch (detected.type) {
    case 'api-only':
      result = await serveApiOnly(serveOptions);
      break;
    case 'ui-only':
      result = await serveUIOnly(serveOptions);
      break;
    case 'full-stack':
      result = await serveFullStack(serveOptions);
      break;
  }

  if (!result.ok) {
    return result;
  }

  const { server, url, aotRouteCount } = result.data;

  // Log server info
  if (aotRouteCount > 0) {
    console.log(`  AOT: ${aotRouteCount} route(s) loaded`);
  }

  const label =
    detected.type === 'api-only'
      ? 'Vertz API server'
      : detected.type === 'full-stack'
        ? 'Vertz full-stack server'
        : 'Vertz server';

  console.log(`${label} running at ${url}`);

  setupGracefulShutdown(server);
  return ok(undefined);
}
