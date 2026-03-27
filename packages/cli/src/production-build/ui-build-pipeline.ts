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

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { brotliCompressSync, constants as zlibConstants } from 'node:zlib';

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
  /** Meta description for SEO */
  description?: string;
}

export interface UIBuildResult {
  success: boolean;
  error?: string;
  durationMs: number;
}

/**
 * Bun plugin that stubs out React JSX runtime imports for AOT bundling.
 *
 * Compiled AOT files (.tsx) contain preserved JSX from the original source.
 * Bun's bundler auto-inserts `import { jsxDEV } from "react/jsx-dev-runtime"`
 * for .tsx files. Since the barrel only re-exports __ssr_* functions (pure
 * string concat), tree-shaking removes the JSX components, but the import
 * persists if marked external — causing runtime failures when React is not
 * installed. This plugin provides an empty stub so the import resolves inline
 * and gets eliminated by tree-shaking.
 *
 * See: https://github.com/vertz-dev/vertz/issues/1935
 */
export const aotJsxStubPlugin: {
  name: string;
  setup(build: {
    onResolve(
      opts: { filter: RegExp },
      cb: (args: { path: string }) => { namespace: string; path: string } | undefined,
    ): void;
    onLoad(
      opts: { filter: RegExp; namespace: string },
      cb: (args: { path: string }) => { contents: string; loader: string },
    ): void;
  }): void;
} = {
  name: 'aot-jsx-stub',
  setup(build) {
    build.onResolve({ filter: /^react\/(jsx-dev-runtime|jsx-runtime)$/ }, () => {
      return { namespace: 'aot-jsx-stub', path: 'stub' };
    });
    build.onLoad({ filter: /.*/, namespace: 'aot-jsx-stub' }, () => {
      return {
        contents:
          'export function jsxDEV() {} export function jsx() {} export function jsxs() {} export const Fragment = Symbol("Fragment");',
        loader: 'js',
      };
    });
  },
};

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
    description,
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
      routeSplitting: true,
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
    const chunkPaths: string[] = [];

    for (const output of clientResult.outputs) {
      const name = output.path.replace(distClient, '');
      if (output.kind === 'entry-point') {
        clientJsPath = name;
      } else if (output.path.endsWith('.css')) {
        clientCssPaths.push(name);
      } else if (output.kind === 'chunk' && output.path.endsWith('.js')) {
        chunkPaths.push(name);
      }
    }

    console.log(`  JS entry: ${clientJsPath}`);
    for (const chunk of chunkPaths) {
      console.log(`  JS chunk: ${chunk}`);
    }
    for (const css of clientCssPaths) {
      console.log(`  CSS: ${css}`);
    }

    // ── 1b. Route chunk manifest ────────────────────────────────────
    // Parse the built entry file to map route patterns → chunk filenames.
    // The SSR handler uses this to inject per-route modulepreload tags.
    if (clientJsPath && chunkPaths.length > 0) {
      const { generateRouteChunkManifest } = await import('./route-chunk-manifest');
      const entryFilePath = resolve(distClient, clientJsPath.replace(/^\//, ''));
      const entryContent = readFileSync(entryFilePath, 'utf-8');
      const manifest = generateRouteChunkManifest(entryContent, '/assets');
      if (Object.keys(manifest.routes).length > 0) {
        const manifestPath = resolve(distClient, 'route-chunk-manifest.json');
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        console.log(`  Route manifest: ${Object.keys(manifest.routes).length} route(s)`);
      }
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

    const modulepreloadLinks = chunkPaths
      .map((path) => `    <link rel="modulepreload" href="${path}">`)
      .join('\n');

    const descriptionTag = description
      ? `\n    <meta name="description" content="${description.replace(/"/g, '&quot;')}" />`
      : '';

    // Detect optional public assets for meta tags
    const publicDir = resolve(projectRoot, 'public');
    const hasFavicon = existsSync(resolve(publicDir, 'favicon.svg'));
    const hasManifest = existsSync(resolve(publicDir, 'site.webmanifest'));

    const faviconTag = hasFavicon
      ? '\n    <link rel="icon" type="image/svg+xml" href="/favicon.svg">'
      : '';
    const manifestTag = hasManifest ? '\n    <link rel="manifest" href="/site.webmanifest">' : '';
    const themeColorTag = '\n    <meta name="theme-color" content="#0a0a0b">';

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>${descriptionTag}${themeColorTag}${faviconTag}${manifestTag}
${cssLinks}
${modulepreloadLinks}
  </head>
  <body>
    <div id="app"></div>
    <script type="module" crossorigin src="${clientJsPath}"></script>
  </body>
</html>`;

    writeFileSync(resolve(distClient, '_shell.html'), html);

    // ── 4. Copy public/ → dist/client/ ────────────────────────────
    if (existsSync(publicDir)) {
      cpSync(publicDir, distClient, { recursive: true });
      console.log('  Copied public/ assets');
    }

    // ── 4b. Copy optimized images .vertz/images/ → dist/client/__vertz_img/
    const imagesDir = resolve(projectRoot, '.vertz', 'images');
    if (existsSync(imagesDir)) {
      const imgDest = resolve(distClient, '__vertz_img');
      cpSync(imagesDir, imgDest, { recursive: true });
      console.log('  Copied optimized images');
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
      external: ['@vertz/ui', '@vertz/ui-server', '@vertz/ui-primitives', 'vertz'],
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

    // ── 5b. AOT manifest + route module emission ──────────────────
    console.log('📋 Generating AOT manifest...');

    try {
      const { buildAotRouteMap, extractRoutes, generateAotBarrel, generateAotBuildManifest } =
        await import('@vertz/ui-server');
      const srcDir = resolve(projectRoot, 'src');
      const aotManifest = generateAotBuildManifest(srcDir);
      const componentCount = Object.keys(aotManifest.components).length;

      if (componentCount > 0) {
        for (const line of aotManifest.classificationLog) {
          console.log(`  ${line}`);
        }

        // Discover router file for route → component mapping
        const routerCandidates = [resolve(srcDir, 'router.tsx'), resolve(srcDir, 'router.ts')];
        const routerPath = routerCandidates.find((p) => existsSync(p));

        if (routerPath) {
          const routerSource = readFileSync(routerPath, 'utf-8');
          const routes = extractRoutes(routerSource, routerPath);

          if (routes.length > 0) {
            const routeEntries = routes.map((r) => ({
              pattern: r.pattern,
              componentName: r.componentName,
            }));
            const routeMap = buildAotRouteMap(aotManifest.components, routeEntries);
            const routeCount = Object.keys(routeMap).length;

            if (routeCount > 0) {
              // Generate barrel + temp files and bundle with Bun.build()
              const barrel = generateAotBarrel(aotManifest.compiledFiles, routeMap);
              const aotTmpDir = resolve(distServer, '.aot-tmp');
              mkdirSync(aotTmpDir, { recursive: true });

              // Write compiled files
              for (const [fileName, code] of Object.entries(barrel.files)) {
                writeFileSync(resolve(aotTmpDir, fileName), code);
              }

              // Write barrel entry
              const barrelPath = resolve(aotTmpDir, 'aot-barrel.ts');
              writeFileSync(barrelPath, barrel.barrelSource);

              // Relative imports (../lib/db, ./utils) must be externalized
              // because compiled files are copied to .aot-tmp/ where relative
              // paths no longer resolve. The barrel's own ./imports to temp files
              // are excluded so they still resolve within .aot-tmp/.
              const externalizeRelativePlugin = {
                name: 'externalize-relative',
                setup(build: {
                  onResolve(
                    opts: { filter: RegExp },
                    cb: (args: {
                      path: string;
                      importer: string;
                    }) => { path: string; external: true } | undefined,
                  ): void;
                }) {
                  build.onResolve({ filter: /^\.\.?\// }, (args) => {
                    if (args.importer === barrelPath) return undefined;
                    return { path: args.path, external: true };
                  });
                },
              };

              const bundleResult = await Bun.build({
                entrypoints: [barrelPath],
                plugins: [externalizeRelativePlugin, aotJsxStubPlugin],
                target: 'bun',
                format: 'esm',
                outdir: distServer,
                naming: 'aot-routes.[ext]',
                external: ['@vertz/ui-server', '@vertz/ui', '@vertz/ui/internals'],
              });

              // Clean up temp dir
              rmSync(aotTmpDir, { recursive: true, force: true });

              if (bundleResult.success) {
                console.log(
                  `  AOT routes: ${routeCount} route(s) bundled → dist/server/aot-routes.js`,
                );

                // Write aot-manifest.json with route mapping
                const manifestPath = resolve(distServer, 'aot-manifest.json');
                writeFileSync(manifestPath, JSON.stringify({ routes: routeMap }, null, 2));
              } else {
                const errors = bundleResult.logs
                  .map((l: { message: string }) => l.message)
                  .join('\n');
                console.log(`  ⚠ AOT routes bundle failed:`);
                if (errors) {
                  for (const line of errors.split('\n')) {
                    console.log(`    ${line}`);
                  }
                } else {
                  console.log('    No detailed error info from Bun.build()');
                  console.log(`    Entry: ${barrelPath}`);
                }
                // Still write classification-only manifest
                const manifestPath = resolve(distServer, 'aot-manifest.json');
                writeFileSync(
                  manifestPath,
                  JSON.stringify({ components: aotManifest.components }, null, 2),
                );
              }
            } else {
              console.log('  No AOT-eligible routes found (all runtime-fallback)');
              const manifestPath = resolve(distServer, 'aot-manifest.json');
              writeFileSync(
                manifestPath,
                JSON.stringify({ components: aotManifest.components }, null, 2),
              );
            }
          } else {
            console.log('  No routes found in router file');
          }
        } else {
          console.log('  No router file found (src/router.ts or src/router.tsx)');
          const manifestPath = resolve(distServer, 'aot-manifest.json');
          writeFileSync(
            manifestPath,
            JSON.stringify({ components: aotManifest.components }, null, 2),
          );
        }
      } else {
        console.log('  No components found for AOT compilation');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      console.log(`  ⚠ AOT manifest generation failed: ${message}`);
      if (stack) {
        console.log(`  ${stack}`);
      }
    }

    // ── 6. Static pre-rendering ──────────────────────────────────
    console.log('📄 Pre-rendering routes...');

    const {
      collectPrerenderPaths,
      discoverRoutes,
      filterPrerenderableRoutes,
      prerenderRoutes,
      stripScriptsFromStaticHTML,
    } = await import('@vertz/ui-server/ssr');

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

    // Extract font fallback metrics for zero-CLS font loading
    let fallbackMetrics: Record<string, import('@vertz/ui-server').FontFallbackMetrics> | undefined;
    if (ssrModule.theme?.fonts) {
      try {
        const { extractFontMetrics } = await import('@vertz/ui-server');
        fallbackMetrics = await extractFontMetrics(ssrModule.theme.fonts, projectRoot);
        const fontCount = Object.keys(fallbackMetrics).length;
        if (fontCount > 0) {
          console.log(`  Extracted font fallback metrics for ${fontCount} font(s)`);
        }
      } catch (error) {
        console.log(
          `  ⚠ Could not extract font metrics: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
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

      // Collect pre-renderable paths:
      // 1. Static routes (no :param) that aren't opted out
      const staticRoutes = filterPrerenderableRoutes(allPatterns);
      // 2. Dynamic routes expanded via generateParams (from exported routes)
      let dynamicRoutes: string[] = [];
      if (ssrModule.routes) {
        dynamicRoutes = await collectPrerenderPaths(ssrModule.routes);
        // Remove paths already covered by static discovery
        dynamicRoutes = dynamicRoutes.filter((p) => !staticRoutes.includes(p));
      }

      const prerenderableRoutes = [...staticRoutes, ...dynamicRoutes];
      const staticCount = staticRoutes.length;
      const dynamicCount = dynamicRoutes.length;
      if (dynamicCount > 0) {
        console.log(
          `  Pre-rendering ${prerenderableRoutes.length} route(s) (${staticCount} static, ${dynamicCount} from generateParams)...`,
        );
      } else {
        console.log(`  Pre-rendering ${prerenderableRoutes.length} static route(s)...`);
      }

      if (prerenderableRoutes.length > 0) {
        // Pre-render each route
        const results = await prerenderRoutes(ssrModule, html, {
          routes: prerenderableRoutes,
          fallbackMetrics,
        });

        // Only strip JS from static pages when the app uses islands mode.
        // Detect islands mode: at least one pre-rendered page has a data-v-island marker.
        // Without this check, mount()-based apps would incorrectly have JS stripped.
        const isIslandsMode = results.some((r) => r.html.includes('data-v-island'));

        // Write pre-rendered HTML files
        for (const result of results) {
          const outPath =
            result.path === '/'
              ? resolve(distClient, 'index.html')
              : resolve(distClient, `${result.path.replace(/^\//, '')}/index.html`);
          mkdirSync(dirname(outPath), { recursive: true });
          const finalHtml = isIslandsMode ? stripScriptsFromStaticHTML(result.html) : result.html;
          const stripped = finalHtml !== result.html;
          writeFileSync(outPath, finalHtml);
          const suffix = stripped ? ' (static — JS stripped)' : '';
          console.log(
            `  ✓ ${result.path} → ${outPath.replace(distClient, 'dist/client')}${suffix}`,
          );
        }
      }
    }

    // ── 7. Brotli pre-compression ─────────────────────────────────
    console.log('🗜️  Pre-compressing assets with Brotli...');
    const compressedCount = brotliCompressDir(distClient);
    if (compressedCount > 0) {
      console.log(`  Compressed ${compressedCount} file(s)`);
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

// ── Brotli pre-compression ───────────────────────────────────────

/** File extensions worth pre-compressing. */
const COMPRESSIBLE_EXTENSIONS = new Set(['.html', '.js', '.css', '.svg', '.xml', '.txt', '.json']);

/** Minimum file size to bother compressing (bytes). */
const MIN_COMPRESS_SIZE = 256;

/**
 * Recursively compress all compressible files in a directory with Brotli.
 * Creates `.br` sidecar files alongside the originals.
 * Uses maximum compression (quality 11) since this runs at build time.
 */
function brotliCompressDir(dir: string): number {
  let count = 0;

  function walk(currentDir: string) {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      // Skip files that are already compressed
      if (entry.name.endsWith('.br')) continue;

      const ext = entry.name.substring(entry.name.lastIndexOf('.'));
      if (!COMPRESSIBLE_EXTENSIONS.has(ext)) continue;

      const content = readFileSync(fullPath);
      if (content.length < MIN_COMPRESS_SIZE) continue;

      const compressed = brotliCompressSync(content, {
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: zlibConstants.BROTLI_MAX_QUALITY,
        },
      });

      // Only write if compression actually saves space
      if (compressed.length < content.length) {
        writeFileSync(`${fullPath}.br`, compressed);
        count++;
      }
    }
  }

  walk(dir);
  return count;
}
