import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { SessionResolver } from '@vertz/ui-server';
import type { DetectedApp } from './app-detector';
import { createProcessManager } from './process-manager';

interface ServerModule {
  handler: (request: Request) => Promise<Response>;
  sessionResolver?: (request: Request) => Promise<unknown>;
}

export type DevMode =
  | { kind: 'api-only'; serverEntry: string }
  | {
      kind: 'full-stack';
      serverEntry: string;
      uiEntry: string;
      ssrModule: boolean;
      clientEntry?: string;
    }
  | {
      kind: 'ui-only';
      uiEntry: string;
      ssrModule: boolean;
      clientEntry?: string;
    };

/**
 * Resolve a DetectedApp into a concrete DevMode that the dev command
 * can dispatch against.
 */
export function resolveDevMode(detected: DetectedApp): DevMode {
  const serverEntry = detected.serverEntry ?? '';
  const uiEntry = detected.ssrEntry ?? detected.uiEntry ?? '';
  const useSSRModule = !detected.ssrEntry && !!detected.uiEntry;

  switch (detected.type) {
    case 'api-only':
      return { kind: 'api-only', serverEntry };
    case 'full-stack':
      return {
        kind: 'full-stack',
        serverEntry,
        uiEntry,
        ssrModule: useSSRModule,
        clientEntry: detected.clientEntry,
      };
    case 'ui-only':
      return {
        kind: 'ui-only',
        uiEntry,
        ssrModule: useSSRModule,
        clientEntry: detected.clientEntry,
      };
  }
}

/**
 * Import the user's server module via jiti and validate that it exports
 * a default object with a `.handler` function (duck-type check).
 *
 * The user's server.ts must follow the convention:
 * ```ts
 * export default createServer({ ... });
 * if (import.meta.main) app.listen(3000);
 * ```
 */
export async function importServerModule(serverEntry: string): Promise<ServerModule> {
  const { createJiti } = await import('jiti');
  const jiti = createJiti(import.meta.url, { interopDefault: true });

  let loaded: unknown;
  try {
    loaded = await jiti.import(serverEntry);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('EADDRINUSE')) {
      throw new Error(
        `src/server.ts calls .listen() directly.\n` +
          `Fix: export default createServer({ ... }) and guard with if (import.meta.main) app.listen()`,
      );
    }
    throw err;
  }

  // Handle both { default: X } and X shapes
  const mod =
    loaded && typeof loaded === 'object' && 'default' in loaded
      ? (loaded as Record<string, unknown>).default
      : loaded;

  if (!mod || typeof mod !== 'object') {
    throw new Error(
      `${serverEntry} must have a default export.\n` +
        `Expected: export default createServer({ ... })`,
    );
  }

  if (!('handler' in mod) || typeof (mod as Record<string, unknown>).handler !== 'function') {
    throw new Error(
      `${serverEntry} default export must have a .handler function.\n` +
        `Expected: export default createServer({ ... })`,
    );
  }

  // Auto-wire session resolver if auth is configured (duck-type check)
  let sessionResolver: ((req: Request) => Promise<unknown>) | undefined;
  if (
    'auth' in mod &&
    mod.auth &&
    typeof (mod.auth as Record<string, unknown>).resolveSessionForSSR === 'function'
  ) {
    sessionResolver = (mod.auth as { resolveSessionForSSR: (req: Request) => Promise<unknown> })
      .resolveSessionForSSR;
  }

  return { ...(mod as ServerModule), sessionResolver };
}

/**
 * Format a dev server banner for console output.
 */
export function formatBanner(
  appType: 'api-only' | 'full-stack' | 'ui-only',
  port: number,
  host: string,
): string {
  const url = `http://${host}:${port}`;
  const lines = ['', `  Vertz Dev Server (${appType}, SSR+HMR)`, '', `  Local:  ${url}`];

  if (appType !== 'ui-only') {
    lines.push(`  API:    ${url}/api`);
  }

  lines.push('');
  return lines.join('\n');
}

export interface StartDevServerOptions {
  detected: DetectedApp;
  port: number;
  host: string;
}

/**
 * Start the appropriate dev server based on the detected app type.
 *
 * - api-only: subprocess with bun run --watch
 * - full-stack / ui-only: Bun.serve() with HMR or SSR mode
 */
export async function startDevServer(options: StartDevServerOptions): Promise<void> {
  const { detected, port, host } = options;
  const mode = resolveDevMode(detected);

  console.log(formatBanner(mode.kind, port, host));

  if (mode.kind === 'api-only') {
    return startApiOnlyServer(mode.serverEntry, port);
  }

  // full-stack or ui-only: use Bun dev server
  const { createBunDevServer } = await import('@vertz/ui-server/bun-dev-server');

  let apiHandler: ((req: Request) => Promise<Response>) | undefined;
  let sessionResolver: ((req: Request) => Promise<unknown>) | undefined;
  if (mode.kind === 'full-stack') {
    const serverMod = await importServerModule(mode.serverEntry);
    apiHandler = serverMod.handler;
    sessionResolver = serverMod.sessionResolver;
  }

  const uiEntry = `./${relative(detected.projectRoot, mode.uiEntry)}`;
  const clientEntry = mode.clientEntry
    ? `/${relative(detected.projectRoot, mode.clientEntry)}`
    : undefined;
  const openapiPath = join(detected.projectRoot, '.vertz/generated/openapi.json');
  const openapi = existsSync(openapiPath) ? { specPath: openapiPath } : undefined;

  const devServer = createBunDevServer({
    entry: uiEntry,
    port,
    host,
    apiHandler,
    // Cast is safe: sessionResolver is created by createAuth().resolveSessionForSSR
    // which returns SSRSessionResult | null — structurally compatible with SessionResolver.
    // The duck-type check above only verifies it's a function; the runtime shape is
    // guaranteed by @vertz/server's createAuth() implementation.
    sessionResolver: sessionResolver as SessionResolver | undefined,
    openapi,
    ssrModule: mode.ssrModule,
    clientEntry,
    projectRoot: detected.projectRoot,
  });

  await devServer.start();

  // Graceful shutdown — SIGHUP fires when the parent terminal dies
  // (e.g. SSH disconnect, Claude session ending), preventing orphan servers.
  const shutdown = async () => {
    await devServer.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGHUP', shutdown);
}

function startApiOnlyServer(serverEntry: string, port: number): Promise<void> {
  const pm = createProcessManager((entryPoint, env) =>
    spawn('bun', ['run', '--watch', entryPoint], {
      env: { ...process.env, ...env },
      stdio: 'inherit',
    }),
  );

  pm.start(serverEntry, { PORT: String(port) });

  return new Promise<void>((resolve) => {
    const shutdown = async () => {
      await pm.stop();
      resolve();
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('SIGHUP', shutdown);
  });
}
