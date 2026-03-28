/**
 * AOT Manifest Loader — loads AOT manifest + routes module at runtime.
 *
 * Used by `createSSRHandler()` and `vertz start` to load pre-compiled
 * AOT render functions from `dist/server/aot-routes.js` and wire them
 * to route patterns from `dist/server/aot-manifest.json`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AotRouteMapEntry } from './aot-manifest-build';
import type { AotManifest, AotRenderFn, AotRouteEntry } from './ssr-aot-pipeline';

interface AotManifestJson {
  routes: Record<string, AotRouteMapEntry>;
  app?: AotRouteMapEntry;
}

/**
 * Load AOT manifest and routes module from a server build directory.
 *
 * Returns `null` if either `aot-manifest.json` or `aot-routes.js` is missing,
 * or if no routes can be wired to render functions.
 *
 * @param serverDir - Path to `dist/server/` directory
 */
export async function loadAotManifest(serverDir: string): Promise<AotManifest | null> {
  const manifestPath = join(serverDir, 'aot-manifest.json');
  const routesModulePath = join(serverDir, 'aot-routes.js');

  // Both files must exist
  if (!existsSync(manifestPath) || !existsSync(routesModulePath)) {
    return null;
  }

  // Read manifest JSON
  let manifestJson: AotManifestJson;
  try {
    const raw = readFileSync(manifestPath, 'utf-8');
    manifestJson = JSON.parse(raw) as AotManifestJson;
  } catch {
    return null;
  }

  if (!manifestJson.routes || Object.keys(manifestJson.routes).length === 0) {
    return null;
  }

  // Dynamic import the routes module
  let routesModule: Record<string, AotRenderFn>;
  try {
    routesModule = await import(routesModulePath);
  } catch {
    return null;
  }

  // Wire manifest entries to render functions from the module
  const routes: Record<string, AotRouteEntry> = {};

  for (const [pattern, entry] of Object.entries(manifestJson.routes)) {
    const renderFn = routesModule[entry.renderFn];
    if (typeof renderFn !== 'function') continue;

    routes[pattern] = {
      render: renderFn,
      holes: entry.holes,
      queryKeys: entry.queryKeys,
      css: entry.css,
    };
  }

  if (Object.keys(routes).length === 0) {
    return null;
  }

  // Wire app (root layout) entry if present
  let app: AotRouteEntry | undefined;
  if (manifestJson.app) {
    const appRenderFn = routesModule[manifestJson.app.renderFn];
    if (typeof appRenderFn === 'function') {
      app = {
        render: appRenderFn,
        holes: manifestJson.app.holes,
        queryKeys: manifestJson.app.queryKeys,
        css: manifestJson.app.css,
      };
    }
  }

  return { routes, app };
}
