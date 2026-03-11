/**
 * UI Build Pipeline — Production build for UI apps
 *
 * Handles the full production build using Bun.build() + createVertzBunPlugin:
 * 1. Client build → browser target, minified, split, hashed assets
 * 2. CSS extraction → vertz.css from component css() calls
 * 3. HTML generation → programmatic HTML shell with built assets
 * 4. Public assets → copy to dist/client/
 * 5. Server build → bun target, SSR with JSX runtime swap
 *
 * Note: This module uses Bun.build() for bundling. It is only invoked at runtime
 * under Bun, never under Node.js. The Bun global is declared locally to satisfy
 * TypeScript without requiring bun-types in the CLI package.
 */

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// Minimal ambient declaration for Bun APIs used by this module.
// The CLI runs under Bun at runtime; these declarations let tsc validate
// without pulling in bun-types (which conflicts with @types/node).
declare const Bun: {
  build(options: Record<string, unknown>): Promise<{
    success: boolean;
    logs: Array<{ message: string }>;
    outputs: Array<{ path: string; kind: string }>;
  }>;
};

export interface UIBuildConfig {
  /** Absolute path to the project root */
  projectRoot: string;
  /** Absolute path to client entry, e.g. /abs/src/entry-client.ts */
  clientEntry: string;
  /** Absolute path to server entry, e.g. /abs/src/app.tsx */
  serverEntry: string;
  /** Output directory relative to projectRoot (default 'dist') */
  outputDir: string;
  /** Minify client bundle */
  minify: boolean;
  /** Generate sourcemaps */
  sourcemap: boolean;
  /** HTML page title (default 'Vertz App') */
  title?: string;
}

export interface UIBuildResult {
  success: boolean;
  error?: string;
  durationMs: number;
}

/**
 * Build a UI app for production.
 */
export async function buildUI(config: UIBuildConfig): Promise<UIBuildResult> {
  const startTime = performance.now();

  const {
    projectRoot,
    clientEntry,
    serverEntry,
    outputDir,
    minify,
    sourcemap,
    title = 'Vertz App',
  } = config;
  const distDir = resolve(projectRoot, outputDir);
  const distClient = resolve(distDir, 'client');
  const distServer = resolve(distDir, 'server');

  try {
    // ── Clean & create output dirs ────────────────────────────────
    rmSync(distDir, { recursive: true, force: true });
    mkdirSync(resolve(distClient, 'assets'), { recursive: true });
    mkdirSync(distServer, { recursive: true });

    // Import createVertzBunPlugin dynamically to avoid hard dep at module level
    const { createVertzBunPlugin } = await import('@vertz/ui-server/bun-plugin');

    // ── 1. Client build ───────────────────────────────────────────
    console.log('📦 Building client...');

    const { plugin: clientPlugin, fileExtractions } = createVertzBunPlugin({
      hmr: false,
      fastRefresh: false,
    });

    const clientResult = await Bun.build({
      entrypoints: [clientEntry],
      plugins: [clientPlugin],
      target: 'browser',
      minify,
      sourcemap: sourcemap ? 'external' : 'none',
      splitting: true,
      outdir: resolve(distClient, 'assets'),
      naming: '[name]-[hash].[ext]',
    });

    if (!clientResult.success) {
      const errors = clientResult.logs.map((l: { message: string }) => l.message).join('\n');
      return {
        success: false,
        error: `Client build failed:\n${errors}`,
        durationMs: performance.now() - startTime,
      };
    }

    // Collect output filenames for HTML injection
    let clientJsPath = '';
    const clientCssPaths: string[] = [];

    for (const output of clientResult.outputs) {
      const name = output.path.replace(distClient, '');
      if (output.kind === 'entry-point') {
        clientJsPath = name;
      } else if (output.path.endsWith('.css')) {
        clientCssPaths.push(name);
      }
    }

    console.log(`  JS entry: ${clientJsPath}`);
    for (const css of clientCssPaths) {
      console.log(`  CSS: ${css}`);
    }

    // ── 2. CSS extraction ─────────────────────────────────────────
    let extractedCss = '';
    for (const [, extraction] of fileExtractions) {
      if (extraction.css) {
        extractedCss += `${extraction.css}\n`;
      }
    }

    if (extractedCss) {
      const cssOutPath = resolve(distClient, 'assets', 'vertz.css');
      writeFileSync(cssOutPath, extractedCss);
      clientCssPaths.push('/assets/vertz.css');
      console.log('  CSS (extracted): /assets/vertz.css');
    }

    // ── 3. Generate HTML shell ────────────────────────────────────
    console.log('📄 Generating HTML...');

    const cssLinks = clientCssPaths
      .map((path) => `    <link rel="stylesheet" href="${path}">`)
      .join('\n');

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
${cssLinks}
  </head>
  <body>
    <div id="app"></div>
    <script type="module" crossorigin src="${clientJsPath}"></script>
  </body>
</html>`;

    writeFileSync(resolve(distClient, '_shell.html'), html);

    // ── 4. Copy public/ → dist/client/ ────────────────────────────
    const publicDir = resolve(projectRoot, 'public');
    if (existsSync(publicDir)) {
      cpSync(publicDir, distClient, { recursive: true });
      console.log('  Copied public/ assets');
    }

    // ── 5. Server build ───────────────────────────────────────────
    console.log('📦 Building server...');

    // JSX runtime swap plugin for SSR (passed via plugins array, not global plugin())
    const jsxSwapPlugin = {
      name: 'vertz-ssr-jsx-swap',
      setup(build: {
        onResolve: (
          opts: { filter: RegExp },
          cb: (args: { path: string }) => { path: string; external: boolean },
        ) => void;
      }) {
        build.onResolve({ filter: /^@vertz\/ui\/jsx-runtime$/ }, () => {
          return { path: '@vertz/ui-server/jsx-runtime', external: true };
        });
        build.onResolve({ filter: /^@vertz\/ui\/jsx-dev-runtime$/ }, () => {
          return { path: '@vertz/ui-server/jsx-runtime', external: true };
        });
      },
    };

    const { plugin: serverPlugin } = createVertzBunPlugin({
      hmr: false,
      fastRefresh: false,
    });

    const serverResult = await Bun.build({
      entrypoints: [serverEntry],
      plugins: [jsxSwapPlugin, serverPlugin],
      target: 'bun',
      minify: false,
      outdir: distServer,
      naming: '[name].[ext]',
      external: ['@vertz/ui', '@vertz/ui-server', '@vertz/ui-primitives'],
    });

    if (!serverResult.success) {
      const errors = serverResult.logs.map((l: { message: string }) => l.message).join('\n');
      return {
        success: false,
        error: `Server build failed:\n${errors}`,
        durationMs: performance.now() - startTime,
      };
    }

    console.log('  Server entry: dist/server/app.js');

    // ── 6. Static pre-rendering ──────────────────────────────────
    console.log('📄 Pre-rendering routes...');

    const { discoverRoutes, filterPrerenderableRoutes, prerenderRoutes } = await import(
      '@vertz/ui-server/ssr'
    );

    // Discover SSR module entry
    const ssrEntryPath = resolve(distServer, 'app.js');
    let ssrModule: import('@vertz/ui-server/ssr').SSRModule;
    try {
      ssrModule = await import(ssrEntryPath);
    } catch (error) {
      console.log('  ⚠ Could not import SSR module for pre-rendering, skipping.');
      console.log(`    ${error instanceof Error ? error.message : String(error)}`);
      const durationMs = performance.now() - startTime;
      console.log('\n✅ UI build complete (without pre-rendering)!');
      console.log(`  Client: ${distClient}/`);
      console.log(`  Server: ${distServer}/`);
      return { success: true, durationMs };
    }

    // Discover routes
    let allPatterns: string[];
    try {
      allPatterns = await discoverRoutes(ssrModule);
    } catch (error) {
      console.log('  ⚠ Route discovery failed, skipping pre-rendering.');
      console.log(`    ${error instanceof Error ? error.message : String(error)}`);
      const durationMs = performance.now() - startTime;
      console.log('\n✅ UI build complete (without pre-rendering)!');
      console.log(`  Client: ${distClient}/`);
      console.log(`  Server: ${distServer}/`);
      return { success: true, durationMs };
    }
    if (allPatterns.length === 0) {
      console.log('  No routes discovered (app may not use createRouter).');
    } else {
      console.log(`  Discovered ${allPatterns.length} route(s): ${allPatterns.join(', ')}`);

      // Filter to pre-renderable routes
      const prerenderableRoutes = filterPrerenderableRoutes(allPatterns);
      console.log(`  Pre-rendering ${prerenderableRoutes.length} static route(s)...`);

      if (prerenderableRoutes.length > 0) {
        // Pre-render each route
        const results = await prerenderRoutes(ssrModule, html, {
          routes: prerenderableRoutes,
        });

        // Write pre-rendered HTML files
        for (const result of results) {
          const outPath =
            result.path === '/'
              ? resolve(distClient, 'index.html')
              : resolve(distClient, `${result.path.replace(/^\//, '')}/index.html`);
          mkdirSync(dirname(outPath), { recursive: true });
          writeFileSync(outPath, result.html);
          console.log(`  ✓ ${result.path} → ${outPath.replace(distClient, 'dist/client')}`);
        }
      }
    }

    // ── Done ──────────────────────────────────────────────────────
    const durationMs = performance.now() - startTime;

    console.log('\n✅ UI build complete!');
    console.log(`  Client: ${distClient}/`);
    console.log(`  Server: ${distServer}/`);

    return { success: true, durationMs };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: performance.now() - startTime,
    };
  }
}
