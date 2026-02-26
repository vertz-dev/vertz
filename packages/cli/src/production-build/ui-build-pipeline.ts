/**
 * UI Build Pipeline — Production build for UI apps
 *
 * Handles the full production build using Bun.build() + createVertzBunPlugin:
 * 1. Client build → browser target, minified, split, hashed assets
 * 2. CSS extraction → vertz.css from component css() calls
 * 3. HTML template → inject built assets, strip dev scripts
 * 4. Public assets → copy to dist/client/
 * 5. Server build → bun target, SSR with JSX runtime swap
 */

import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import type { BunPlugin } from 'bun';

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

  const { projectRoot, clientEntry, serverEntry, outputDir, minify, sourcemap } = config;
  const distDir = resolve(projectRoot, outputDir);
  const distClient = resolve(distDir, 'client');
  const distServer = resolve(distDir, 'server');

  try {
    // Validate index.html exists
    const indexHtmlPath = resolve(projectRoot, 'index.html');
    if (!existsSync(indexHtmlPath)) {
      return {
        success: false,
        error: `index.html not found at ${indexHtmlPath}. UI apps require an index.html in the project root.`,
        durationMs: performance.now() - startTime,
      };
    }

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
      const errors = clientResult.logs.map((l) => l.message).join('\n');
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
      await Bun.write(cssOutPath, extractedCss);
      clientCssPaths.push('/assets/vertz.css');
      console.log('  CSS (extracted): /assets/vertz.css');
    }

    // ── 3. HTML template processing ───────────────────────────────
    console.log('📄 Processing HTML template...');

    let html = await Bun.file(indexHtmlPath).text();

    // Replace dev script tag with built entry.
    // Use the basename of the client entry to match regardless of path prefix
    // (handles both ./src/entry-client.ts and /src/entry-client.ts).
    const entryBasename = basename(clientEntry);
    const scriptRegex = new RegExp(
      `<script[^>]*\\bsrc=["'][^"']*${escapeRegex(entryBasename)}["'][^>]*><\\/script>`,
    );
    html = html.replace(
      scriptRegex,
      `<script type="module" crossorigin src="${clientJsPath}"></script>`,
    );

    // Remove Fast Refresh runtime script + comment (no-op if absent)
    html = html.replace(
      /\s*<!-- Fast Refresh runtime.*?-->\s*<script[^>]*fast-refresh-runtime[^>]*><\/script>/s,
      '',
    );

    // Inject CSS <link> tags before </head>
    if (clientCssPaths.length > 0) {
      const cssLinks = clientCssPaths
        .map((path) => `  <link rel="stylesheet" href="${path}">`)
        .join('\n');
      html = html.replace('</head>', `${cssLinks}\n  </head>`);
    }

    // Fix ./public/ asset paths to / (e.g. ./public/favicon.svg → /favicon.svg)
    html = html.replace(/(['"])\.\/public\//g, '$1/');

    await Bun.write(resolve(distClient, 'index.html'), html);

    // ── 4. Copy public/ → dist/client/ ────────────────────────────
    const publicDir = resolve(projectRoot, 'public');
    if (existsSync(publicDir)) {
      cpSync(publicDir, distClient, { recursive: true });
      console.log('  Copied public/ assets');
    }

    // ── 5. Server build ───────────────────────────────────────────
    console.log('📦 Building server...');

    // JSX runtime swap plugin for SSR (passed via plugins array, not global plugin())
    const jsxSwapPlugin: BunPlugin = {
      name: 'vertz-ssr-jsx-swap',
      setup(build) {
        build.onResolve({ filter: /^@vertz\/ui\/jsx-runtime$/ }, () => {
          return { path: '@vertz/ui-server/jsx-runtime', external: false };
        });
        build.onResolve({ filter: /^@vertz\/ui\/jsx-dev-runtime$/ }, () => {
          return { path: '@vertz/ui-server/jsx-runtime', external: false };
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
      const errors = serverResult.logs.map((l) => l.message).join('\n');
      return {
        success: false,
        error: `Server build failed:\n${errors}`,
        durationMs: performance.now() - startTime,
      };
    }

    console.log('  Server entry: dist/server/app.js');

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

/** Escape a string for use in a regular expression */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
