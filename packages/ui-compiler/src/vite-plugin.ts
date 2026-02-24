import remapping from '@ampproject/remapping';
import MagicString from 'magic-string';
import { Project, ts } from 'ts-morph';
import type { Plugin, ResolvedConfig } from 'vite';
import { compile } from './compiler';
import { CSSCodeSplitter } from './css-extraction/code-splitting';
import { DeadCSSEliminator } from './css-extraction/dead-css';
import type { CSSExtractionResult } from './css-extraction/extractor';
import { CSSExtractor } from './css-extraction/extractor';
import { CSSHMRHandler } from './css-extraction/hmr';
import { RouteCSSManifest } from './css-extraction/route-css-manifest';
import { HydrationTransformer } from './transformers/hydration-transformer';

/** Virtual module prefix for extracted CSS. */
const VIRTUAL_CSS_PREFIX = '\0vertz-css:';

/** Default file extensions for component files. */
const DEFAULT_INCLUDE = ['**/*.tsx', '**/*.jsx'];

/** SSR configuration options. */
export interface SSROptions {
  /**
   * Path to the root component. Auto-detected from index.html if omitted.
   * @default auto-detect from <script type="module" src="..."> in index.html
   */
  entry?: string;

  /**
   * Streaming SSR vs buffered.
   * @default 'buffered'
   */
  mode?: 'buffered' | 'streaming';

  /**
   * Port override for the dev server (uses Vite's default if unset).
   */
  port?: number;

  /**
   * Per-query timeout for SSR data pre-loading (ms).
   * Queries that resolve within this threshold are included in the SSR HTML.
   * Queries that exceed it render their loading state.
   * @default 300
   */
  ssrTimeout?: number;
}

/** Options for the Vertz Vite plugin. */
export interface VertzPluginOptions {
  /** Glob patterns for component files. Defaults to tsx and jsx. */
  include?: string[];
  /** Glob patterns to exclude. */
  exclude?: string[];
  /** Enable CSS extraction in production. Defaults to true. */
  cssExtraction?: boolean;
  /** Route-to-file mapping for CSS code splitting (production only). */
  routeMap?: Map<string, string[]>;
  /**
   * Enable SSR in development mode.
   * When true, `vite dev` serves SSR'd HTML automatically.
   * When an object, provides SSR configuration options.
   */
  ssr?: boolean | SSROptions;
  /** Compilation target. 'dom' uses @vertz/ui/internals, 'tui' uses @vertz/tui/internals. */
  target?: 'dom' | 'tui';
}

/**
 * Vite plugin that transforms tsx/jsx files using the vertz/ui compiler.
 *
 * Chains all compiler passes: reactive transforms, component transforms,
 * hydration markers, and CSS extraction. In dev mode, provides HMR for
 * both component code and CSS changes. In production, extracts CSS to
 * virtual modules and performs dead CSS elimination and route-level
 * code splitting.
 */
export default function vertzPlugin(options?: VertzPluginOptions): Plugin {
  const include = options?.include ?? DEFAULT_INCLUDE;
  const exclude = options?.exclude ?? [];
  const enableCssExtraction = options?.cssExtraction ?? true;

  let resolvedConfig: ResolvedConfig;
  let isProduction = false;

  // CSS tracking for HMR and extraction
  const cssHmrHandler = new CSSHMRHandler();
  const cssExtractor = new CSSExtractor();
  const fileExtractions = new Map<string, CSSExtractionResult>();

  /** Check if a file ID matches our include/exclude patterns. */
  function shouldTransform(id: string): boolean {
    // Strip query strings (e.g., ?v=123)
    const cleanId = id.split('?')[0] ?? id;

    // Check exclude patterns first
    for (const pattern of exclude) {
      if (matchGlob(cleanId, pattern)) return false;
    }

    // Check include patterns
    for (const pattern of include) {
      if (matchGlob(cleanId, pattern)) return true;
    }

    return false;
  }

  return {
    name: 'vertz',
    enforce: 'pre',

    config(_userConfig, env) {
      // When SSR is enabled, alias the JSX runtime for SSR modules
      if (options?.ssr && env.isSsrBuild) {
        return {
          resolve: {
            alias: {
              '@vertz/ui/jsx-runtime': '@vertz/ui-server/jsx-runtime',
              '@vertz/ui/jsx-dev-runtime': '@vertz/ui-server/jsx-runtime',
            },
          },
        };
      }
      return undefined;
    },

    configResolved(cfg) {
      resolvedConfig = cfg;
      isProduction = resolvedConfig.command === 'build' || resolvedConfig.mode === 'production';
    },

    configureServer(server) {
      // Only enable SSR middleware in dev mode
      if (!options?.ssr) return;

      const ssrOptions = typeof options.ssr === 'object' ? options.ssr : {};

      // Register middleware BEFORE Vite's internal middleware to avoid
      // Vite's SPA fallback rewriting URLs (e.g., '/' → '/index.html').
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '/';

        // Skip non-HTML requests
        if (
          !req.headers.accept?.includes('text/html') &&
          !req.url?.endsWith('.html') &&
          req.url !== '/'
        ) {
          return next();
        }

        // Skip Vite internals and assets
        if (
          url.startsWith('/@') ||
          url.startsWith('/node_modules') ||
          url.includes('?') ||
          /\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$/.test(url)
        ) {
          return next();
        }

        try {
          // 1. Read the HTML template
          const { readFileSync } = await import('node:fs');
          const { resolve } = await import('node:path');
          let template = readFileSync(resolve(server.config.root, 'index.html'), 'utf-8');

          // 2. Transform the HTML template (adds Vite client, HMR)
          template = await server.transformIndexHtml(url, template);

          // 3. Auto-detect entry from HTML if not provided
          let entry = ssrOptions.entry;
          if (!entry) {
            const scriptMatch = template.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/);
            if (scriptMatch?.[1]) {
              entry = scriptMatch[1];
            } else {
              // biome-ignore lint: Build-time configuration error, not an HTTP error
              throw new Error(
                'Could not auto-detect entry from index.html. Please specify ssr.entry in vertz plugin options.',
              );
            }
          }

          // 4. Invalidate the SSR entry and its entire SSR module graph.
          // Module-level state (e.g. router singletons) is cached by Vite's SSR
          // module system. We must invalidate the full dependency tree so each
          // request re-executes module-scope code with the correct __SSR_URL__.
          const ssrEntryMod = server.moduleGraph.getModuleById('\0vertz:ssr-entry');
          if (ssrEntryMod) {
            const visited = new Set<string>();
            const invalidateTree = (mod: {
              id?: string | null;
              ssrImportedModules?: Set<unknown>;
            }) => {
              const modId = mod.id;
              if (!modId || visited.has(modId)) return;
              visited.add(modId);
              server.moduleGraph.invalidateModule(
                mod as Parameters<typeof server.moduleGraph.invalidateModule>[0],
              );
              if (mod.ssrImportedModules?.size) {
                for (const child of mod.ssrImportedModules) {
                  invalidateTree(
                    child as { id?: string | null; ssrImportedModules?: Set<unknown> },
                  );
                }
              }
            };
            invalidateTree(ssrEntryMod);
          }

          // 5. Load the virtual SSR entry via Vite's SSR module system
          const ssrEntry = await server.ssrLoadModule('\0vertz:ssr-entry');

          // 6. Render the app to HTML
          const result = await ssrEntry.renderToString(url);

          // Handle both string (legacy) and { html, css, ssrData } return formats
          const appHtml = typeof result === 'string' ? result : result.html;
          const appCss = typeof result === 'string' ? '' : result.css || '';
          const ssrData = typeof result === 'string' ? [] : result.ssrData || [];

          // 7. Inject into template
          // Try to find <!--ssr-outlet--> first, then fall back to <div id="app">
          let html: string;
          if (template.includes('<!--ssr-outlet-->')) {
            html = template.replace('<!--ssr-outlet-->', appHtml);
          } else {
            // Replace content inside <div id="app">
            html = template.replace(
              /(<div[^>]*id="app"[^>]*>)([\s\S]*?)(<\/div>)/,
              `$1${appHtml}$3`,
            );
          }

          // 8. Inject CSS before </head>
          if (appCss) {
            html = html.replace('</head>', `${appCss}\n</head>`);
          }

          // 9. Inject SSR data for client-side hydration before </body>
          if (ssrData.length > 0) {
            const ssrDataScript = `<script>window.__VERTZ_SSR_DATA__=${JSON.stringify(ssrData)};</script>`;
            html = html.replace('</body>', `${ssrDataScript}\n</body>`);
          }

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
        } catch (err) {
          // Fix stack trace for SSR errors
          server.ssrFixStacktrace(err as Error);
          next(err);
        }
      });
    },

    resolveId(id) {
      if (id.startsWith(VIRTUAL_CSS_PREFIX)) {
        return id;
      }
      if (id === '\0vertz:ssr-entry') {
        return id;
      }
      return undefined;
    },

    load(id) {
      if (id.startsWith(VIRTUAL_CSS_PREFIX)) {
        if (isProduction) {
          // In production, generateBundle() collects and emits CSS as assets.
          // Return an empty JS module so Rollup doesn't try to parse raw CSS.
          return '';
        }
        const sourceFile = id.slice(VIRTUAL_CSS_PREFIX.length);
        const extraction = fileExtractions.get(sourceFile);
        if (extraction) {
          return extraction.css;
        }
        return '';
      }
      if (id === '\0vertz:ssr-entry') {
        const ssrOptions = typeof options?.ssr === 'object' ? options.ssr : {};
        // The entry will be set during configureServer, but we need a default
        const entry = ssrOptions.entry || '/src/index.ts';
        return generateSSREntry(entry, ssrOptions.ssrTimeout ?? 300);
      }
      return undefined;
    },

    transform(code: string, id: string) {
      if (!shouldTransform(id)) {
        return undefined;
      }

      const cleanId = id.split('?')[0] ?? id;

      // 1. Run hydration transformer on the original source (BEFORE compile,
      //    because compile transforms JSX to DOM helpers and JSX nodes are gone)
      const hydrationS = new MagicString(code);
      const hydrationProject = new Project({
        useInMemoryFileSystem: true,
        compilerOptions: {
          jsx: ts.JsxEmit.Preserve,
          strict: true,
        },
      });
      const hydrationSourceFile = hydrationProject.createSourceFile(cleanId, code);
      const hydrationTransformer = new HydrationTransformer();
      hydrationTransformer.transform(hydrationS, hydrationSourceFile);
      const hydratedCode = hydrationS.toString();

      // Generate hydration source map (maps hydratedCode -> original code)
      const hydrationMap = hydrationS.generateMap({
        source: cleanId,
        includeContent: true,
      });

      // 2. Run the main compile pipeline (reactive + component + JSX transforms)
      const compileResult = compile(hydratedCode, { filename: cleanId, target: options?.target });

      // 3. Chain source maps: compile map (final -> hydrated) + hydration map
      //    (hydrated -> original) = chained map (final -> original).
      //    This ensures developers can trace from the transformed output all
      //    the way back to the original source, even through hydration edits.
      const remapped = remapping(
        [
          compileResult.map as import('@ampproject/remapping').EncodedSourceMap,
          hydrationMap as import('@ampproject/remapping').EncodedSourceMap,
        ],
        () => null,
      );

      // Convert to a plain object compatible with Vite's ExistingRawSourceMap.
      // remapping's SourceMap may have `file: null` and `mappings` as decoded
      // arrays; Vite expects `file?: string` and `mappings: string`.
      const rawChainedMap = JSON.parse(remapped.toString()) as {
        version: number;
        file?: string;
        sources: string[];
        sourcesContent?: (string | null)[];
        names: string[];
        mappings: string;
      };

      const chainedMap = {
        ...rawChainedMap,
        sourcesContent: rawChainedMap.sourcesContent?.map((c) => c ?? '') as string[] | undefined,
      };

      let transformedCode = compileResult.code;

      // 4. CSS extraction (run on original code to find css() calls)
      const extraction = cssExtractor.extract(code, cleanId);
      if (extraction.css.length > 0) {
        fileExtractions.set(cleanId, extraction);

        if (isProduction && enableCssExtraction) {
          // In production: inject import of the virtual CSS module
          transformedCode = `import '${VIRTUAL_CSS_PREFIX}${cleanId}';\n${transformedCode}`;
        }

        // Register/update CSS for HMR tracking
        cssHmrHandler.register(cleanId, extraction.css);
      }

      return {
        code: transformedCode,
        map: chainedMap,
      };
    },

    handleHotUpdate(ctx) {
      const { file, modules } = ctx;

      // 1. Handle .vertz/generated/ file changes -- invalidate importing modules
      if (file.includes('.vertz/generated/') || file.includes('.vertz\\generated\\')) {
        const affectedModules = [];
        for (const mod of modules) {
          affectedModules.push(mod);
          // Also invalidate modules that import the changed module
          for (const importer of mod.importers) {
            affectedModules.push(importer);
          }
        }
        return affectedModules.length > 0 ? affectedModules : undefined;
      }

      // 2. Handle tsx/jsx file changes -- check for CSS-only updates
      if (!shouldTransform(file)) return undefined;

      const content = ctx.read();

      // read() may return string or Promise<string>
      const processContent = (newCode: string) => {
        const extraction = cssExtractor.extract(newCode, file);
        const hmrResult = cssHmrHandler.update(file, extraction.css);

        if (hmrResult.hasChanged) {
          fileExtractions.set(file, extraction);

          // Find the virtual CSS module and invalidate it
          const virtualId = VIRTUAL_CSS_PREFIX + file;
          const cssModule = ctx.server.moduleGraph.getModuleById(virtualId);

          if (cssModule) {
            // CSS-only change: invalidate only the virtual CSS module
            ctx.server.moduleGraph.invalidateModule(cssModule);
            return [cssModule, ...modules];
          }
        }

        // For non-CSS changes, let Vite handle the standard HMR
        return undefined;
      };

      if (typeof content === 'string') {
        return processContent(content);
      }

      return content.then(processContent);
    },

    generateBundle() {
      if (!isProduction || !enableCssExtraction) return;

      // 1. Collect used files from the module graph (all files we have seen)
      const usedFiles = new Set(fileExtractions.keys());

      // 2. Dead CSS elimination
      const deadCssEliminator = new DeadCSSEliminator();
      const liveCSS = deadCssEliminator.eliminate(fileExtractions, usedFiles);

      // 3. Route-level code splitting (if route map is provided)
      if (options?.routeMap && options.routeMap.size > 0) {
        const routeManifest = new RouteCSSManifest();
        const manifest = routeManifest.build(options.routeMap, fileExtractions);

        const codeSplitter = new CSSCodeSplitter();
        const chunks = codeSplitter.split(manifest, fileExtractions);

        // Emit per-route CSS assets
        for (const [route, css] of Object.entries(chunks)) {
          if (css.length === 0) continue;

          const fileName =
            route === '__common' ? 'assets/common.css' : `assets/route-${sanitizeRoute(route)}.css`;

          this.emitFile({
            type: 'asset',
            fileName,
            source: css,
          });
        }
      } else if (liveCSS.length > 0) {
        // No route map: emit a single combined CSS file
        this.emitFile({
          type: 'asset',
          fileName: 'assets/vertz.css',
          source: liveCSS,
        });
      }
    },
  };
}

// ─── SSR Entry Generator ───────────────────────────────────────

/**
 * Generate the virtual SSR entry module that renders the app.
 * This module installs the DOM shim, imports the user's app, and exports renderToString.
 *
 * Features:
 * - Two-pass rendering: discovery pass (query registration) + render pass (with data)
 * - Theme CSS injection: compiles user-exported theme into CSS custom properties
 * - SSR context: uses ssrStorage for per-request query management
 */
function generateSSREntry(userEntry: string, ssrTimeout: number): string {
  return `
import { installDomShim, removeDomShim, toVNode } from '@vertz/ui-server/dom-shim';
import { ssrStorage, getSSRQueries, setGlobalSSRTimeout, clearGlobalSSRTimeout, renderToStream, streamToString } from '@vertz/ui-server';
import { getInjectedCSS, compileTheme } from '@vertz/ui';

function collectCSS(themeCss) {
  const componentStyles = getInjectedCSS()
    .map(s => '<style data-vertz-css>' + s + '</style>')
    .join('\\n');
  // Prepend theme CSS (custom properties) before component styles
  const themeTag = themeCss ? '<style data-vertz-css>' + themeCss + '</style>' : '';
  return [themeTag, componentStyles].filter(Boolean).join('\\n');
}

/**
 * Render the app to an HTML string for the given URL.
 * Returns { html, css } where css is the collected <style> tags.
 *
 * Includes theme CSS custom properties (--color-*, --spacing-*) when the
 * user module exports a \`theme\` object created with defineTheme().
 */
export async function renderToString(url) {
  // Normalize URL: strip /index.html suffix that Vite's SPA fallback may add
  const normalizedUrl = url.endsWith('/index.html')
    ? url.slice(0, -'/index.html'.length) || '/'
    : url;

  globalThis.__SSR_URL__ = normalizedUrl;
  installDomShim();

  return ssrStorage.run({ url: normalizedUrl, errors: [], queries: [] }, async () => {
    try {
      setGlobalSSRTimeout(${ssrTimeout});

      const userModule = await import('${userEntry}');

      const createApp = userModule.default || userModule.App;
      if (typeof createApp !== 'function') {
        throw new Error('App entry must export a default function or named App function');
      }

      // Compile theme CSS if the user module exports a theme
      let themeCss = '';
      if (userModule.theme) {
        themeCss = compileTheme(userModule.theme).css;
      }

      // Pass 1: Discovery — triggers query() registrations
      createApp();

      // Await registered SSR queries with per-query timeouts
      const queries = getSSRQueries();
      const resolvedQueries = [];
      if (queries.length > 0) {
        await Promise.allSettled(
          queries.map(({ promise, timeout, resolve, key }) =>
            Promise.race([
              promise.then((data) => {
                resolve(data);
                resolvedQueries.push({ key, data });
                return 'resolved';
              }),
              new Promise((r) => setTimeout(r, timeout || ${ssrTimeout})).then(() => 'timeout'),
            ]),
          ),
        );
        // Clear queries before Pass 2 to avoid double-registration
        const store = ssrStorage.getStore();
        if (store) store.queries = [];
      }

      // Pass 2: Render with pre-fetched data
      const app = createApp();
      const vnode = toVNode(app);
      const stream = renderToStream(vnode);
      const html = await streamToString(stream);
      const css = collectCSS(themeCss);

      // Serialize resolved query data for client-side hydration
      const ssrData = resolvedQueries.length > 0
        ? resolvedQueries.map(({ key, data }) => ({ key, data: JSON.parse(JSON.stringify(data)) }))
        : [];

      return { html, css, ssrData };
    } finally {
      clearGlobalSSRTimeout();
      removeDomShim();
      delete globalThis.__SSR_URL__;
    }
  });
}
`;
}

// ─── Helpers ───────────────────────────────────────────────────

/** Simple glob matching that handles common patterns. */
function matchGlob(filePath: string, pattern: string): boolean {
  // Handle **/<segment>/** patterns (e.g., "**/vendor/**")
  if (pattern.startsWith('**/') && pattern.endsWith('/**')) {
    const segment = pattern.slice(3, -3);
    return filePath.includes(`/${segment}/`) || filePath.includes(`\\${segment}\\`);
  }

  // Handle recursive glob patterns like "**/*.tsx" or "**/*.ui.tsx"
  if (pattern.startsWith('**/')) {
    const suffix = pattern.slice(3);
    if (suffix.startsWith('*.')) {
      const ext = suffix.slice(1);
      return filePath.endsWith(ext);
    }
    return filePath.includes(suffix);
  }

  // Handle extension patterns like "*.tsx"
  if (pattern.startsWith('*.')) {
    const ext = pattern.slice(1);
    return filePath.endsWith(ext);
  }

  // Handle exact path patterns
  return filePath.includes(pattern);
}

/** Sanitize a route path for use as a filename. */
function sanitizeRoute(route: string): string {
  return route
    .replace(/^\//, '')
    .replace(/\//g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '_')
    .replace(/^$/, 'index');
}
