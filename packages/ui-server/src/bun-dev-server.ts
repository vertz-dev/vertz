/**
 * Unified Bun development server: SSR + HMR in a single Bun.serve().
 *
 * SSR is always on. HMR always works. One mode, one behavior — dev matches
 * production. Bun's built-in HMR system handles client bundling; no manual
 * Bun.build() needed.
 *
 * Architecture:
 *   routes: { '/__vertz_hmr': hmrShell, '/api/*': apiHandler }
 *   fetch:  static files → nav pre-fetch → fetch interception → SSR render
 *   development: { hmr: true, console: true }
 *
 * A hidden `/__vertz_hmr` route initializes Bun's HMR system. After startup,
 * a self-fetch discovers the `/_bun/client/<hash>.js` URL and HMR bootstrap
 * snippet. SSR responses reference this URL for hydration + HMR.
 *
 * A file watcher on `src/` re-discovers the hash and re-imports the SSR module
 * on source changes, keeping SSR output fresh.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, watch, writeFileSync } from 'node:fs';
import { dirname, normalize, resolve } from 'node:path';
import type { SSRModule } from './ssr-render';
import { ssrRenderToString, ssrStreamNavQueries } from './ssr-render';
import { safeSerialize } from './ssr-streaming-runtime';

export interface BunDevServerOptions {
  /** SSR entry module (e.g., './src/app.tsx') */
  entry: string;
  /** Port to listen on. @default 3000 */
  port?: number;
  /** Host to bind to. @default 'localhost' */
  host?: string;
  /** API handler for full-stack mode */
  apiHandler?: (req: Request) => Promise<Response>;
  /** Paths to skip SSR (delegate to apiHandler). @default ['/api/'] */
  skipSSRPaths?: string[];
  /** OpenAPI spec options */
  openapi?: { specPath: string };
  /** When true, entry is SSRModule (exports App/theme/styles). @default false */
  ssrModule?: boolean;
  /** Client entry path (for hydration). */
  clientEntry?: string;
  /** HTML page title. @default 'Vertz App' */
  title?: string;
  /** Project root. @default process.cwd() */
  projectRoot?: string;
  /** Log requests. @default true */
  logRequests?: boolean;
}

export interface BunDevServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Kill any process listening on the given port. Used on startup to clean up
 * stale dev servers left behind by crashed sessions or orphaned processes.
 */
function killStaleProcess(targetPort: number): void {
  try {
    const output = execSync(`lsof -ti :${targetPort}`, { encoding: 'utf8' }).trim();
    if (!output) return;

    const pids = output.split('\n').filter(Boolean);
    const myPid = String(process.pid);

    for (const pid of pids) {
      if (pid === myPid) continue;
      try {
        process.kill(Number(pid), 'SIGTERM');
        console.log(`[Server] Killed stale process on port ${targetPort} (PID ${pid})`);
      } catch {
        // Process may have already exited
      }
    }
  } catch {
    // lsof exits non-zero when no process is found — expected
  }
}

export interface IndexHtmlStasher {
  stash(): void;
  restore(): void;
}

/**
 * Create a stasher that renames index.html during dev so Bun's built-in
 * HMR server doesn't auto-serve it, bypassing our SSR fetch handler.
 */
export function createIndexHtmlStasher(projectRoot: string): IndexHtmlStasher {
  const indexHtmlPath = resolve(projectRoot, 'index.html');
  const indexHtmlBackupPath = resolve(projectRoot, '.vertz', 'dev', 'index.html.bak');
  let stashed = false;

  return {
    stash() {
      // Recover from a previous crashed session that left index.html stashed
      if (!existsSync(indexHtmlPath) && existsSync(indexHtmlBackupPath)) {
        renameSync(indexHtmlBackupPath, indexHtmlPath);
      }

      if (existsSync(indexHtmlPath)) {
        mkdirSync(resolve(projectRoot, '.vertz', 'dev'), { recursive: true });
        renameSync(indexHtmlPath, indexHtmlBackupPath);
        stashed = true;
      }
    },
    restore() {
      if (stashed && existsSync(indexHtmlBackupPath)) {
        renameSync(indexHtmlBackupPath, indexHtmlPath);
        stashed = false;
      }
    },
  };
}

export interface HMRAssets {
  /** Discovered `/_bun/client/<hash>.js` URL, or null if not found */
  scriptUrl: string | null;
  /** HMR bootstrap `<script>` tag, or null if not found */
  bootstrapScript: string | null;
}

/**
 * Parse the HTML returned by the HMR shell route (`/__vertz_hmr`) to extract
 * the bundled client script URL and HMR bootstrap snippet.
 */
export function parseHMRAssets(html: string): HMRAssets {
  const srcMatch = html.match(/src="(\/_bun\/client\/[^"]+\.js)"/);
  const bootstrapMatch = html.match(/<script>(\(\(a\)=>\{document\.addEventListener.*?)<\/script>/);

  return {
    scriptUrl: srcMatch?.[1] ?? null,
    bootstrapScript: bootstrapMatch?.[1] ? `<script>${bootstrapMatch[1]}</script>` : null,
  };
}

export interface SSRPageHtmlOptions {
  title: string;
  css: string;
  bodyHtml: string;
  ssrData: unknown[];
  scriptTag: string;
}

/**
 * Inline script that detects rapid reload loops caused by Bun's dev server
 * serving a reload stub when client modules fail to compile.
 *
 * Tracks consecutive rapid reloads (< 100ms apart) via sessionStorage.
 * After 10 rapid reloads, calls window.stop() to halt all pending loads
 * (preventing the reload stub module from executing) and shows an error
 * overlay. A successful load clears the counter after 5s.
 *
 * The 100ms window catches only Bun's automatic reload loop (which cycles
 * in tight sub-100ms intervals) — no manual user action is this fast.
 */
const RELOAD_GUARD_SCRIPT = `<script>(function(){var K="__vertz_reload_count",T="__vertz_reload_ts",s=sessionStorage,n=parseInt(s.getItem(K)||"0",10),t=parseInt(s.getItem(T)||"0",10),now=Date.now();if(now-t<100){n++}else{n=1}s.setItem(K,String(n));s.setItem(T,String(now));if(n>10){window.stop();s.removeItem(K);s.removeItem(T);var d=document,o=d.createElement("div");o.style.cssText="position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6)";var c=d.createElement("div");c.style.cssText="background:#fff;color:#1a1a1a;border-radius:12px;padding:32px;max-width:480px;width:90%;font-family:system-ui,sans-serif;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3)";c.innerHTML='<div style="font-size:40px;margin-bottom:16px">&#9888;&#65039;</div><h2 style="margin:0 0 8px;font-size:20px">Dev server connection lost</h2><p style="margin:0 0 20px;color:#666;font-size:14px;line-height:1.5">The page reloaded 10+ times in rapid succession. This usually means the dev server stopped or a build failed.</p><button id="__vertz_retry" style="background:#2563eb;color:#fff;border:none;border-radius:8px;padding:10px 24px;font-size:14px;cursor:pointer">Retry</button>';o.appendChild(c);(d.body||d.documentElement).appendChild(o);d.getElementById("__vertz_retry").onclick=function(){location.href=location.href}}else{setTimeout(function(){s.removeItem(K);s.removeItem(T)},5e3)}})()</script>`;

/**
 * Generate a full SSR HTML page with the given content, CSS, SSR data, and script tag.
 */
export function generateSSRPageHtml({
  title,
  css,
  bodyHtml,
  ssrData,
  scriptTag,
}: SSRPageHtmlOptions): string {
  const ssrDataScript =
    ssrData.length > 0
      ? `<script>window.__VERTZ_SSR_DATA__=${safeSerialize(ssrData)};</script>`
      : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    ${css}
    ${RELOAD_GUARD_SCRIPT}
  </head>
  <body>
    <div id="app">${bodyHtml}</div>
    ${ssrDataScript}
    ${scriptTag}
  </body>
</html>`;
}

export interface FetchInterceptorOptions {
  apiHandler: (req: Request) => Promise<Response>;
  origin: string;
  skipSSRPaths: string[];
  originalFetch: typeof fetch;
}

/**
 * Create a fetch interceptor that routes local API requests through the
 * in-memory apiHandler instead of making HTTP self-fetch calls.
 * Matches production (Cloudflare) behavior where fetch('/api/...') during
 * SSR goes through the same handler.
 */
export function createFetchInterceptor({
  apiHandler,
  origin,
  skipSSRPaths,
  originalFetch,
}: FetchInterceptorOptions): typeof fetch {
  const intercepted: typeof fetch = (input, init) => {
    const rawUrl =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const isRelative = rawUrl.startsWith('/');
    const fetchPath = isRelative ? (rawUrl.split('?')[0] ?? '/') : new URL(rawUrl).pathname;
    const isLocal = isRelative || new URL(rawUrl).origin === origin;

    if (isLocal && skipSSRPaths.some((p) => fetchPath.startsWith(p))) {
      const absoluteUrl = isRelative ? `${origin}${rawUrl}` : rawUrl;
      const req = new Request(absoluteUrl, init);
      return apiHandler(req);
    }
    return originalFetch(input, init);
  };
  intercepted.preconnect = originalFetch.preconnect;
  return intercepted;
}

/**
 * Inline loader that fetch-validates the bundle before executing it.
 *
 * Instead of a direct `<script type="module" src="...">` (which auto-loads),
 * the placeholder uses `type="text/plain"` so the browser ignores it. This
 * loader then:
 *   1. Reads the `src` from the placeholder (`[data-bun-dev-server-script]`)
 *   2. Fetches the bundle URL (localhost, < 1ms)
 *   3. If the response is Bun's reload stub → shows a build error overlay
 *   4. If valid → creates a real `<script type="module">` and appends it
 *   5. On fetch error (server down) → shows "Dev server unreachable" overlay
 *
 * This prevents the infinite-reload loop caused by Bun serving a reload stub
 * when client modules fail to compile. Zero reloads — the error is shown
 * immediately.
 */
const BUILD_ERROR_LOADER = [
  '(function(){',
  "var el=document.querySelector('[data-bun-dev-server-script]');if(!el)return;var src=el.src;",
  "function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}",
  // formatErrors(): group errors by file:line, deduplicate lineText
  'function formatErrors(errs){',
  'if(!errs||!errs.length)return\'<p style="margin:0;color:var(--ve-muted);font-size:12px">Check your terminal for details.</p>\';',
  'var groups=[],seen={};',
  'errs.forEach(function(e){',
  "var k=(e.file||'')+'|'+(e.line||0);",
  'if(!seen[k]){seen[k]={file:e.file,absFile:e.absFile,line:e.line,lineText:e.lineText,msgs:[]};groups.push(seen[k])}',
  'seen[k].msgs.push({message:e.message,column:e.column})});',
  "return groups.map(function(g){var h='';",
  'if(g.file){',
  "var loc=esc(g.file)+(g.line?':'+g.line:'');",
  "var href=g.absFile?'vscode://file/'+encodeURI(g.absFile)+(g.line?':'+g.line:''):'';",
  "h+=href?'<a href=\"'+href+'\" style=\"color:var(--ve-link);font-size:12px;text-decoration:underline;text-underline-offset:2px\">'+loc+'</a>'" +
    ":'<span style=\"color:var(--ve-link);font-size:12px\">'+loc+'</span>';",
  "h+='<br>'}",
  "g.msgs.forEach(function(m){h+='<div style=\"color:var(--ve-error);font-size:12px;margin:2px 0\">'+esc(m.message)+'</div>'});",
  "if(g.lineText){h+='<pre style=\"margin:4px 0 0;color:var(--ve-code);font-size:11px;background:var(--ve-code-bg);border-radius:4px;padding:6px 8px;overflow-x:auto;border:1px solid var(--ve-border)\">'+esc(g.lineText)+'</pre>'}",
  "return'<div style=\"margin-bottom:10px\">'+h+'</div>'}).join('')}",
  // showOverlay(): floating card, no backdrop
  'function showOverlay(t,body){el.remove();',
  "var d=document,c=d.createElement('div');",
  "c.id='__vertz_error';",
  // CSS custom properties for theming + card styles
  "c.style.cssText='",
  '--ve-bg:hsl(0 0% 100%);--ve-fg:hsl(0 0% 9%);--ve-muted:hsl(0 0% 45%);',
  '--ve-error:hsl(0 72% 51%);--ve-link:hsl(221 83% 53%);--ve-border:hsl(0 0% 90%);',
  '--ve-code:hsl(24 70% 45%);--ve-code-bg:hsl(0 0% 97%);--ve-btn:hsl(0 0% 9%);--ve-btn-fg:hsl(0 0% 100%);',
  'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:2147483647;',
  'background:var(--ve-bg);color:var(--ve-fg);border-radius:8px;padding:14px 16px;',
  'max-width:480px;width:calc(100% - 32px);font-family:ui-sans-serif,system-ui,sans-serif;',
  "box-shadow:0 4px 24px rgba(0,0,0,0.12),0 1px 3px rgba(0,0,0,0.08);border:1px solid var(--ve-border)';",
  // Dark mode via media query: inject a <style> tag
  "var st=d.createElement('style');",
  "st.textContent='@media(prefers-color-scheme:dark){#__vertz_error{",
  '--ve-bg:hsl(0 0% 7%);--ve-fg:hsl(0 0% 93%);--ve-muted:hsl(0 0% 55%);',
  '--ve-error:hsl(0 72% 65%);--ve-link:hsl(217 91% 70%);--ve-border:hsl(0 0% 18%);',
  "--ve-code:hsl(36 80% 65%);--ve-code-bg:hsl(0 0% 11%);--ve-btn:hsl(0 0% 93%);--ve-btn-fg:hsl(0 0% 7%)}}';",
  'd.head.appendChild(st);',
  // Content
  'c.innerHTML=\'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">\'',
  "+'<span style=\"font-size:13px;font-weight:600;color:var(--ve-error)\">'+esc(t)+'</span>'",
  '+\'<button id="__vertz_retry" style="background:var(--ve-btn);color:var(--ve-btn-fg);border:none;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer;font-weight:500">Retry</button>\'',
  "+'</div>'+body;",
  '(d.body||d.documentElement).appendChild(c);',
  "d.getElementById('__vertz_retry').onclick=function(){location.reload()}}",
  // Main: fetch bundle, detect stub, fetch errors or load
  'fetch(src).then(function(r){return r.text()}).then(function(t){',
  "if(t.trimStart().startsWith('try{location.reload()}')){",
  "fetch('/__vertz_build_check').then(function(r){return r.json()}).then(function(j){",
  "showOverlay('Build failed',formatErrors(j.errors))}).catch(function(){",
  "showOverlay('Build failed','<p style=\"margin:0;color:var(--ve-muted);font-size:12px\">Check your terminal for details.</p>')})}",
  "else{var s=document.createElement('script');s.type='module';s.crossOrigin='';s.src=src;document.body.appendChild(s)}",
  "}).catch(function(){showOverlay('Dev server unreachable','<p style=\"margin:0;color:var(--ve-muted);font-size:12px\">Could not connect. Is it still running?</p>')})",
  '})()',
].join('');

/**
 * Build the `<script>` tag for SSR HTML output.
 *
 * When `bundledScriptUrl` is available (HMR discovered), generates a
 * non-executing placeholder (`type="text/plain"`) plus a loader script that
 * fetch-validates the bundle before loading it. This prevents the infinite
 * reload loop when Bun serves its reload stub for a failed compilation.
 *
 * The placeholder preserves `data-bun-dev-server-script` and `src` attributes
 * so Bun's HMR bootstrap (which reads `.src` via IDL) still works.
 *
 * Falls back to a plain `<script type="module">` when no bundled URL is
 * available (source-only mode, no Bun compilation).
 */
export function buildScriptTag(
  bundledScriptUrl: string | null,
  hmrBootstrapScript: string | null,
  clientSrc: string,
): string {
  if (bundledScriptUrl) {
    const placeholder = `<script type="text/plain" crossorigin src="${bundledScriptUrl}" data-bun-dev-server-script></script>`;
    const bootstrap = hmrBootstrapScript ? `\n    ${hmrBootstrapScript}` : '';
    const loader = `<script>${BUILD_ERROR_LOADER}</script>`;
    return `${placeholder}${bootstrap}\n    ${loader}`;
  }
  return `<script type="module" src="${clientSrc}"></script>`;
}

/**
 * Create a unified Bun dev server with SSR + HMR.
 *
 * SSR is always on. HMR always works. No mode toggle needed.
 */
export function createBunDevServer(options: BunDevServerOptions): BunDevServer {
  const {
    entry,
    port = 3000,
    host = 'localhost',
    apiHandler,
    skipSSRPaths = ['/api/'],
    openapi,
    clientEntry: clientEntryOption,
    title = 'Vertz App',
    projectRoot = process.cwd(),
    logRequests = true,
  } = options;

  let server: ReturnType<typeof Bun.serve> | null = null;
  let srcWatcherRef: ReturnType<typeof watch> | null = null;

  // Capture recent console.error output — Bun's internal bundler logs
  // build failures here (module resolution, syntax errors, etc.).
  // The /__vertz_build_check endpoint reads this when Bun.build() can't
  // reproduce the error (e.g. missing plugin-resolved modules).
  let lastBuildError = '';
  const origConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    const text = args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ');
    // Only capture bundler/resolve errors, not our own [Server] logs
    if (!text.startsWith('[Server]')) {
      lastBuildError = text;
    }
    origConsoleError.apply(console, args);
  };

  // Bun's dev server auto-serves index.html from the project root when
  // development.hmr is true, bypassing the fetch() handler entirely.
  // We stash it during dev so all requests go through our SSR fetch handler.
  const indexHtmlStasher = createIndexHtmlStasher(projectRoot);

  // OpenAPI spec caching
  let cachedSpec: object | null = null;
  let specWatcher: ReturnType<typeof watch> | null = null;

  const loadOpenAPISpec = (): object | null => {
    if (!openapi) return null;
    try {
      const specContent = readFileSync(openapi.specPath, 'utf-8');
      return JSON.parse(specContent);
    } catch (err) {
      console.error('[Server] Error reading OpenAPI spec:', err);
      return null;
    }
  };

  const setupOpenAPIWatcher = (): void => {
    if (!openapi || !existsSync(openapi.specPath)) return;

    cachedSpec = loadOpenAPISpec();
    if (cachedSpec === null) return;

    try {
      const specDir = dirname(openapi.specPath);
      const specFile = openapi.specPath.split('/').pop() || 'openapi.json';

      specWatcher = watch(specDir, { persistent: false }, (eventType, filename) => {
        if (filename === specFile && (eventType === 'change' || eventType === 'rename')) {
          if (logRequests) {
            console.log('[Server] OpenAPI spec file changed, reloading...');
          }
          cachedSpec = loadOpenAPISpec();
        }
      });
    } catch (err) {
      console.warn('[Server] Could not set up file watcher for OpenAPI spec:', err);
    }
  };

  const serveOpenAPISpec = (): Response => {
    if (cachedSpec) {
      return new Response(JSON.stringify(cachedSpec), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (openapi && existsSync(openapi.specPath)) {
      cachedSpec = loadOpenAPISpec();
      if (cachedSpec) {
        return new Response(JSON.stringify(cachedSpec), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response('OpenAPI spec not found', { status: 404 });
  };

  // ── Unified SSR + HMR ────────────────────────────────────────────

  async function start(): Promise<void> {
    // Stash index.html so Bun's dev server doesn't auto-serve it
    indexHtmlStasher.stash();

    const { plugin } = await import('bun');
    const { createVertzBunPlugin } = await import('./bun-plugin');

    const entryPath = resolve(projectRoot, entry);
    const rawClientSrc = clientEntryOption ?? entry;
    // Normalize to absolute URL path (e.g., '/src/app.tsx') so it resolves
    // from the project root regardless of where the HMR shell HTML lives.
    const clientSrc = rawClientSrc.replace(/^\.\//, '/');

    // Register JSX runtime swap for SSR (server-side imports)
    plugin({
      name: 'vertz-ssr-jsx-swap',
      setup(build) {
        build.onResolve({ filter: /^@vertz\/ui\/jsx-runtime$/ }, () => ({
          path: '@vertz/ui-server/jsx-runtime',
          external: false,
        }));
        build.onResolve({ filter: /^@vertz\/ui\/jsx-dev-runtime$/ }, () => ({
          path: '@vertz/ui-server/jsx-runtime',
          external: false,
        }));
      },
    });

    // Register the Vertz compiler plugin for SSR transforms (no HMR on server side)
    const { plugin: serverPlugin } = createVertzBunPlugin({
      hmr: false,
      fastRefresh: false,
    });
    plugin(serverPlugin);

    // Load SSR module
    let ssrMod: SSRModule;
    try {
      ssrMod = await import(entryPath);
      if (logRequests) {
        console.log('[Server] SSR module loaded');
      }
    } catch (e) {
      console.error('[Server] Failed to load SSR module:', e);
      process.exit(1);
    }

    // Generate HMR shell HTML at .vertz/dev/hmr-shell.html
    // This page initializes Bun's HMR system by importing the client entry
    const devDir = resolve(projectRoot, '.vertz', 'dev');
    mkdirSync(devDir, { recursive: true });

    // Fast Refresh runtime: resolve from generated HTML at .vertz/dev/
    // back to project root's node_modules
    const frRuntimePath =
      '../../node_modules/@vertz/ui-server/dist/bun-plugin/fast-refresh-runtime.js';

    const hmrShellHtml = `<!doctype html>
<html lang="en"><head>
  <meta charset="UTF-8" />
  <title>HMR Shell</title>
</head><body>
  <script type="module" src="${frRuntimePath}"></script>
  <script type="module" src="${clientSrc}"></script>
</body></html>`;

    const hmrShellPath = resolve(devDir, 'hmr-shell.html');
    writeFileSync(hmrShellPath, hmrShellHtml);

    const hmrShellModule = require(hmrShellPath);

    setupOpenAPIWatcher();

    // Discovered HMR assets (populated after self-fetch)
    let bundledScriptUrl: string | null = null;
    let hmrBootstrapScript: string | null = null;

    // Build routes object conditionally (Bun doesn't accept undefined route values).
    // biome-ignore lint/suspicious/noExplicitAny: Bun routes are dynamically composed from user config
    const routes: Record<string, any> = {
      '/__vertz_hmr': hmrShellModule,
    };

    if (openapi) {
      routes['/api/openapi.json'] = () => serveOpenAPISpec();
    }

    if (apiHandler) {
      routes['/api/*'] = (req: Request) => apiHandler(req);
    }

    // Kill any stale dev server left on this port (e.g., from a crashed
    // session or orphaned process). Without this, the user sees a confusing
    // "connection lost" dialog from the old server instead of a clean start.
    killStaleProcess(port);

    server = Bun.serve({
      port,
      hostname: host,
      routes,

      async fetch(request) {
        const url = new URL(request.url);
        const pathname = url.pathname;

        // Let Bun handle its internal /_bun/ routes (HMR client bundles, assets)
        if (pathname.startsWith('/_bun/')) {
          return undefined as unknown as Response;
        }

        // Build check endpoint — the client loader fetches this when it
        // detects Bun's reload stub to get the actual compilation error.
        if (pathname === '/__vertz_build_check') {
          try {
            // rawClientSrc may be a URL path ("/src/app.tsx") or relative ("./src/app.tsx").
            // Strip leading "/" so resolve() treats it relative to projectRoot.
            const clientRelative = rawClientSrc.replace(/^\//, '');
            const result = await Bun.build({
              entrypoints: [resolve(projectRoot, clientRelative)],
              root: projectRoot,
              target: 'browser',
              throw: false,
            });
            if (!result.success && result.logs.length > 0) {
              const errors = result.logs
                .filter((l) => l.level === 'error')
                .map((l) => {
                  const pos = l.position;
                  const file = pos?.file
                    ? pos.file.replace(projectRoot, '').replace(/^\//, '')
                    : undefined;
                  return {
                    message: l.message,
                    file,
                    absFile: pos?.file,
                    line: pos?.line,
                    column: pos?.column,
                    lineText: pos?.lineText,
                  };
                });
              return Response.json({ errors });
            }
            // Bun.build() succeeded but the dev bundler failed — fall back
            // to the last captured console.error from Bun's internal bundler.
            if (lastBuildError) {
              return Response.json({ errors: [{ message: lastBuildError }] });
            }
            return Response.json({ errors: [] });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return Response.json({ errors: [{ message: msg }] });
          }
        }

        // OpenAPI spec (fallback for non-route match)
        if (openapi && request.method === 'GET' && pathname === '/api/openapi.json') {
          return serveOpenAPISpec();
        }

        // API routes — delegate to apiHandler
        if (apiHandler && skipSSRPaths.some((p) => pathname.startsWith(p))) {
          return apiHandler(request);
        }

        // Nav pre-fetch (X-Vertz-Nav: 1) — stream SSE events as queries settle
        if (request.headers.get('x-vertz-nav') === '1') {
          try {
            const stream = await ssrStreamNavQueries(ssrMod, pathname, { navSsrTimeout: 5000 });
            return new Response(stream, {
              status: 200,
              headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
              },
            });
          } catch {
            return new Response('event: done\ndata: {}\n\n', {
              status: 200,
              headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
              },
            });
          }
        }

        // Serve static files from public/
        if (pathname !== '/' && !pathname.endsWith('.html')) {
          // Normalize path to prevent directory traversal attacks
          const safePath = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '');
          const publicDir = resolve(projectRoot, 'public');
          const resolvedPublic = resolve(publicDir, safePath.slice(1));
          if (resolvedPublic.startsWith(publicDir)) {
            const publicFile = Bun.file(resolvedPublic);
            if (await publicFile.exists()) {
              return new Response(publicFile);
            }
          }
          const resolvedRoot = resolve(projectRoot, safePath.slice(1));
          if (resolvedRoot.startsWith(projectRoot)) {
            const rootFile = Bun.file(resolvedRoot);
            if (await rootFile.exists()) {
              return new Response(rootFile);
            }
          }
        }

        // Skip non-HTML requests
        if (
          !request.headers.get('accept')?.includes('text/html') &&
          !pathname.endsWith('.html') &&
          pathname !== '/'
        ) {
          return new Response('Not Found', { status: 404 });
        }

        // SSR render with fetch interception
        if (logRequests) {
          console.log(`[Server] SSR: ${pathname}`);
        }

        try {
          // Patch globalThis.fetch during SSR so API requests (e.g. query()
          // calling fetch('/api/todos')) route through the in-memory apiHandler
          // instead of HTTP self-fetch. Matches production (Cloudflare) behavior.
          const originalFetch = globalThis.fetch;
          if (apiHandler) {
            globalThis.fetch = createFetchInterceptor({
              apiHandler,
              origin: `http://${host}:${server?.port}`,
              skipSSRPaths,
              originalFetch,
            });
          }

          try {
            const result = await ssrRenderToString(ssrMod, pathname, { ssrTimeout: 300 });
            const scriptTag = buildScriptTag(bundledScriptUrl, hmrBootstrapScript, clientSrc);
            const html = generateSSRPageHtml({
              title,
              css: result.css,
              bodyHtml: result.html,
              ssrData: result.ssrData,
              scriptTag,
            });

            return new Response(html, {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
          } finally {
            if (apiHandler) {
              globalThis.fetch = originalFetch;
            }
          }
        } catch (err) {
          console.error('[Server] SSR error:', err);
          const scriptTag = buildScriptTag(bundledScriptUrl, hmrBootstrapScript, clientSrc);
          const fallbackHtml = generateSSRPageHtml({
            title,
            css: '',
            bodyHtml: '',
            ssrData: [],
            scriptTag,
          });

          return new Response(fallbackHtml, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }
      },

      development: {
        hmr: true,
        console: true,
      },
    });

    if (logRequests) {
      console.log(`[Server] SSR+HMR dev server running at http://${host}:${server.port}`);
    }

    // Self-fetch /__vertz_hmr to discover the bundled script URL and HMR bootstrap
    await discoverHMRAssets();

    async function discoverHMRAssets(): Promise<void> {
      try {
        const res = await fetch(`http://${host}:${server?.port}/__vertz_hmr`);
        const html = await res.text();
        const assets = parseHMRAssets(html);

        if (assets.scriptUrl) {
          bundledScriptUrl = assets.scriptUrl;
          if (logRequests) {
            console.log('[Server] Discovered bundled script URL:', bundledScriptUrl);
          }
        }

        if (assets.bootstrapScript) {
          hmrBootstrapScript = assets.bootstrapScript;
          if (logRequests) {
            console.log('[Server] Extracted HMR bootstrap script');
          }
        }
      } catch (e) {
        console.warn('[Server] Could not discover HMR bundled URL:', e);
      }
    }

    // Watch for file changes — re-discover hash + re-import SSR module
    const srcDir = resolve(projectRoot, 'src');
    let refreshTimeout: ReturnType<typeof setTimeout> | null = null;

    if (existsSync(srcDir)) {
      srcWatcherRef = watch(srcDir, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        if (refreshTimeout) clearTimeout(refreshTimeout);
        refreshTimeout = setTimeout(async () => {
          if (logRequests) {
            console.log(`[Server] File changed: ${filename}`);
          }

          // Re-discover HMR assets (hash changes on every edit)
          await discoverHMRAssets();

          // Re-import SSR module — clear require cache for all project source
          // files so transitive dependencies (e.g., mock-data.ts) are re-evaluated.
          // Bun's `import()` with `?t=...` only busts the entry module cache;
          // require.cache clearing forces the full dependency tree to reload.
          for (const key of Object.keys(require.cache)) {
            if (key.startsWith(srcDir) || key.startsWith(entryPath)) {
              delete require.cache[key];
            }
          }
          try {
            const freshMod: SSRModule = await import(`${entryPath}?t=${Date.now()}`);
            ssrMod = freshMod;
            if (logRequests) {
              console.log('[Server] SSR module refreshed');
            }
          } catch (e) {
            console.error('[Server] Failed to refresh SSR module:', e);
            // Keep using the old module — last known good
          }
        }, 100);
      });
    }
  }

  // ── Public API ──────────────────────────────────────────────────

  return {
    start,

    async stop() {
      if (specWatcher) {
        specWatcher.close();
        specWatcher = null;
      }

      if (srcWatcherRef) {
        srcWatcherRef.close();
        srcWatcherRef = null;
      }

      if (server) {
        server.stop(true);
        server = null;
      }

      // Restore index.html if we stashed it
      indexHtmlStasher.restore();
    },
  };
}
