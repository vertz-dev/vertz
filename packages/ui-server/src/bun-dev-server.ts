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
import { existsSync, mkdirSync, readdirSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { dirname, normalize, resolve } from 'node:path';
import type { FontFallbackMetrics } from '@vertz/ui';
import type { SSRAuth } from '@vertz/ui/internals';
import { imageContentType, isValidImageName } from './bun-plugin/image-paths';
import { createDebugLogger } from './debug-logger';
import { handleDevImageProxy } from './dev-image-proxy';
import { DiagnosticsCollector } from './diagnostics-collector';
import { installFetchProxy, runWithScopedFetch } from './fetch-scope';
import { extractFontMetrics } from './font-metrics';
import { createReadyGate } from './ready-gate';
import { createSourceMapResolver, readLineText } from './source-map-resolver';
import { toPrefetchSession } from './ssr-access-evaluator';
import { createAccessSetScript } from './ssr-access-set';
import type { AotManifestManager } from './ssr-aot-manifest-dev';
import { createAotManifestManager } from './ssr-aot-manifest-dev';
import type { PrefetchManifestManager } from './ssr-prefetch-dev';
import { createPrefetchManifestManager } from './ssr-prefetch-dev';
import type { SSRModule } from './ssr-render';
import { ssrStreamNavQueries } from './ssr-render';
import { createSessionScript } from './ssr-session';
import { ssrRenderSinglePass } from './ssr-single-pass';
import { safeSerialize } from './ssr-streaming-runtime';
import type { UpstreamWatcher } from './upstream-watcher';
import { createUpstreamWatcher } from './upstream-watcher';

/**
 * Detect `public/favicon.svg` and return a `<link>` tag for it.
 * Returns empty string when the file does not exist.
 *
 * Detection runs once at server startup — adding or removing the file
 * requires a dev server restart (consistent with production build).
 */
export function detectFaviconTag(projectRoot: string): string {
  const faviconPath = resolve(projectRoot, 'public', 'favicon.svg');
  return existsSync(faviconPath)
    ? '<link rel="icon" type="image/svg+xml" href="/favicon.svg">'
    : '';
}

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
  /**
   * Editor for error overlay links. Auto-detected from VERTZ_EDITOR or EDITOR env vars.
   * Supported: 'vscode' | 'cursor' | 'webstorm' | 'zed'
   * @default 'vscode'
   */
  editor?: string;
  /** Extra HTML tags to inject into the <head> (e.g., font preloads, meta tags). */
  headTags?: string;
  /**
   * Resolves session data from request cookies for SSR injection.
   * When provided, SSR HTML includes `window.__VERTZ_SESSION__` and
   * optionally `window.__VERTZ_ACCESS_SET__` for instant auth hydration.
   */
  sessionResolver?: import('./ssr-session').SessionResolver;
  /**
   * Watch workspace-linked package dist directories for changes.
   * When a dist directory changes, automatically restart the server.
   *
   * Accepts an array of package names (e.g., ['@vertz/theme-shadcn', '@vertz/ui'])
   * or `true` to auto-detect all `@vertz/*` packages linked via workspace symlinks.
   *
   * @default false
   */
  watchDeps?: boolean | string[];
  /**
   * Resolve theme from request for SSR. Returns the value for `data-theme`
   * on the `<html>` tag and patches any `data-theme` attributes in the SSR body.
   * Use this to read a theme cookie and eliminate dark→light flash on reload.
   */
  themeFromRequest?: (request: Request) => string | null | undefined;
  /**
   * Called when the SSR module fails to recover from a broken state and a
   * process restart is needed. Bun's ESM module cache retains failed imports
   * process-wide — the only way to clear it is to restart the process.
   *
   * The dev server calls stop() before invoking this callback.
   * Typically, the callback calls `process.exit(75)` and a supervisor
   * script restarts the process.
   */
  onRestartNeeded?: () => void;
}

export interface ErrorDetail {
  message: string;
  file?: string;
  absFile?: string;
  line?: number;
  column?: number;
  lineText?: string;
  stack?: string;
}

export type ErrorCategory = 'build' | 'resolve' | 'runtime' | 'ssr';

/**
 * Classify whether an error message indicates a stale module graph
 * that requires a server restart to resolve.
 *
 * Matches:
 * - "Export named 'X' not found in module 'Y'"
 * - "No matching export in 'Y' for import 'X'"
 * - "'Y' does not provide an export named 'X'"
 * - "Failed to resolve module specifier 'X'" (browser bare-import failure
 *   after upstream package rebuild changes chunk hashes)
 */
const STALE_GRAPH_PATTERNS = [
  /Export named ['"].*['"] not found in module/i,
  /No matching export in ['"].*['"] for import/i,
  /does not provide an export named/i,
  /Failed to resolve module specifier/i,
];

export function isStaleGraphError(message: string): boolean {
  return STALE_GRAPH_PATTERNS.some((pattern) => pattern.test(message));
}

/** A resolved stack frame for terminal logging. */
interface TerminalStackFrame {
  functionName: string | null;
  file: string;
  line: number;
  column: number;
}

const MAX_TERMINAL_STACK_FRAMES = 5;

/**
 * Format a runtime error for terminal output.
 * Produces a [Browser]-prefixed message with optional file location,
 * line text snippet, and resolved stack frames.
 */
export function formatTerminalRuntimeError(
  errors: ErrorDetail[],
  parsedStack?: TerminalStackFrame[],
): string {
  const primary = errors[0];
  if (!primary) return '';

  const lines: string[] = [];
  lines.push(`[Browser] ${primary.message}`);

  if (primary.file) {
    const loc = primary.line
      ? `${primary.file}:${primary.line}${primary.column != null ? `:${primary.column}` : ''}`
      : primary.file;
    lines.push(`  at ${loc}`);
  }

  if (primary.lineText) {
    lines.push(`  \u2502 ${primary.lineText}`);
  }

  if (parsedStack?.length) {
    const frames = parsedStack.slice(0, MAX_TERMINAL_STACK_FRAMES);
    for (const frame of frames) {
      const fn = frame.functionName ? `${frame.functionName} ` : '';
      lines.push(`  at ${fn}${frame.file}:${frame.line}:${frame.column}`);
    }
  }

  return lines.join('\n');
}

/**
 * Create a deduplicator for terminal runtime error logs.
 * Returns `shouldLog` (true if this error hasn't been logged recently)
 * and `reset` (to clear on file change).
 */
export function createRuntimeErrorDeduplicator(): {
  shouldLog: (message: string, file?: string, line?: number) => boolean;
  reset: () => void;
} {
  let lastKey = '';
  return {
    shouldLog(message: string, file?: string, line?: number): boolean {
      const key = `${message}::${file ?? ''}::${line ?? ''}`;
      if (key === lastKey) return false;
      lastKey = key;
      return true;
    },
    reset(): void {
      lastKey = '';
    },
  };
}

export interface BunDevServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  /**
   * Soft-restart the dev server: stops Bun.serve(), clears all caches,
   * creates a fresh Bun.serve() with a clean HMR module graph.
   * Broadcasts { type: 'restarting' } to clients before stopping.
   * Skips one-time setup (plugin registration, console.error patching).
   */
  restart(): Promise<void>;
  /** Broadcast an error to all connected WebSocket clients. */
  broadcastError(category: ErrorCategory, errors: ErrorDetail[]): void;
  /** Clear current error and notify all connected WebSocket clients.
   *  Sets a 5s grace period that suppresses stale runtime errors. */
  clearError(): void;
  /** Clear error for a file change — no grace period, since HMR may trigger new errors. */
  clearErrorForFileChange(): void;
  /** Set the last changed file path (for testing). */
  setLastChangedFile(file: string): void;
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
  editor?: string;
  headTags?: string;
  /** Pre-built session + access set script tags for SSR injection. */
  sessionScript?: string;
  /** Theme value for `data-theme` attribute on `<html>`. */
  htmlDataTheme?: string;
}

/**
 * Error channel script that establishes a WebSocket connection to `/__vertz_errors`
 * for real-time build/runtime error reporting.
 *
 * Sets up `window.__vertz_overlay` namespace with shared overlay functions used
 * by both this script and the BUILD_ERROR_LOADER fallback. Connects WebSocket
 * with exponential-backoff reconnection. On `error` messages, renders a floating
 * card overlay and injects `<script type="application/json" id="__vertz_error_data">`
 * for LLM/MCP consumption. On `clear`, removes both.
 *
 * Also captures `window.onerror` and `unhandledrejection` to show runtime errors
 * in the same overlay.
 */
function detectEditor(explicit?: string): string {
  if (explicit) return explicit;
  const env = process.env.VERTZ_EDITOR || process.env.EDITOR || '';
  const lower = env.toLowerCase();
  if (lower.includes('cursor')) return 'cursor';
  if (lower.includes('zed')) return 'zed';
  if (lower.includes('webstorm') || lower.includes('idea')) return 'webstorm';
  return 'vscode';
}

function editorHrefJs(editor: string): string {
  // Returns a JS function body that builds an editor:// URL from absFile + line.
  // WebStorm/IDEA use a different URL scheme than vscode/cursor/zed.
  if (editor === 'webstorm' || editor === 'idea') {
    return `V._editorHref=function(f,l){if(!f)return'';return'${editor}://open?file='+encodeURI(f)+(l?'&line='+l:'')};`;
  }
  return `V._editorHref=function(f,l){if(!f)return'';return'${editor}://file/'+encodeURI(f)+(l?':'+l:'')};`;
}

function buildErrorChannelScript(editor: string): string {
  return [
    // Hide Bun's built-in <bun-hmr> error overlay — Vertz has its own.
    '<style>bun-hmr{display:none!important}</style>',
    '<script>(function(){',
    // Shared overlay namespace
    'var V=window.__vertz_overlay={};',
    // Editor URL builder — configurable via VERTZ_EDITOR env or editor option
    editorHrefJs(editor),
    // _ws: reference to the current WebSocket, used by error handlers to send
    // resolve-stack messages for source map resolution.
    'V._ws=null;',
    // _src tracks who created the current overlay: "ws" or "client"
    'V._src=null;',
    // _hadClientError: set when a client-side runtime error is detected. WS clear
    // should NOT remove client error overlays (the error persists until HMR fixes
    // it). But if #app is empty, we need a reload for recovery.
    'V._hadClientError=false;',
    // _needsReload: set when HMR succeeds for a client error but #app is still
    // empty (component was never mounted, HMR had nothing to re-mount), or when
    // Bun's reload stub fires location.reload() while we have an active error
    // overlay. We wait for the WS clear (server hash update) before triggering
    // a controlled reload via the saved original function.
    'V._needsReload=false;',
    // _restarting: set when the server sends { type: 'restarting' }. Used to
    // trigger a full page reload when the WS reconnects after restart.
    'V._restarting=false;',
    // isStaleGraph: detect errors that indicate a stale module graph
    'V.isStaleGraph=function(m){return/Export named [\'"].*[\'"] not found in module/i.test(m)||/No matching export in [\'"].*[\'"] for import/i.test(m)||/does not provide an export named/i.test(m)||/Failed to resolve module specifier/i.test(m)};',
    // _canAutoRestart: check if auto-restart is allowed (max 3 within 10s window)
    'V._canAutoRestart=function(){',
    "var raw=sessionStorage.getItem('__vertz_auto_restart');",
    'var ts;try{ts=raw?JSON.parse(raw):[]}catch(e){ts=[]}',
    'var now=Date.now();',
    'ts=ts.filter(function(t){return now-t<10000});',
    'return ts.length<3};',
    // _autoRestart: auto-send restart via WS if allowed by cap, track in sessionStorage
    // Parses sessionStorage once, pushes timestamp, saves, and sends restart.
    'V._autoRestart=function(){',
    'if(V._restarting)return;',
    "var raw=sessionStorage.getItem('__vertz_auto_restart');",
    'var ts;try{ts=raw?JSON.parse(raw):[]}catch(e){ts=[]}',
    'var now=Date.now();',
    'ts=ts.filter(function(t){return now-t<10000});',
    'if(ts.length>=3)return;',
    'ts.push(now);',
    "sessionStorage.setItem('__vertz_auto_restart',JSON.stringify(ts));",
    "if(V._ws&&V._ws.readyState===1){V._ws.send(JSON.stringify({type:'restart'}))}};",
    // _recovering: after a controlled reload for error recovery, Bun's HMR may
    // send stale module updates that re-trigger runtime errors. This flag
    // (set via sessionStorage before reload) suppresses runtime error overlays
    // for 3 seconds, then auto-dismisses if #app has content.
    'var rts=sessionStorage.getItem("__vertz_recovering");',
    'V._recovering=rts&&(Date.now()-Number(rts)<10000);',
    'if(V._recovering)sessionStorage.removeItem("__vertz_recovering");',
    // Override location.reload to prevent Bun's reload stub from causing
    // uncontrolled reloads when an error overlay is active. The reload stub is
    // `try{location.reload()}catch(_){}` — it fires immediately via HMR before
    // the server has updated its bundle hash, causing a blank page.
    'var _reload=location.reload.bind(location);',
    'try{location.reload=function(){if(V._src){V._needsReload=true;return}_reload()}}catch(e){}',
    // esc(): HTML-escape
    "V.esc=function(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')};",
    // formatErrors(): group errors by file:line
    'V.formatErrors=function(errs){',
    'if(!errs||!errs.length)return\'<p style="margin:0;color:var(--ve-muted);font-size:12px">Check your terminal for details.</p>\';',
    'var groups=[],seen={};',
    'errs.forEach(function(e){',
    "var k=(e.file||'')+'|'+(e.line||0);",
    'if(!seen[k]){seen[k]={file:e.file,absFile:e.absFile,line:e.line,lineText:e.lineText,msgs:[]};groups.push(seen[k])}',
    'seen[k].msgs.push({message:e.message,column:e.column})});',
    "return groups.map(function(g){var h='';",
    'if(g.file){',
    "var loc=V.esc(g.file)+(g.line?':'+g.line:'');",
    'var href=V._editorHref(g.absFile,g.line);',
    "h+=href?'<a href=\"'+href+'\" style=\"color:var(--ve-link);font-size:12px;text-decoration:underline;text-underline-offset:2px\">'+loc+'</a>'" +
      ":'<span style=\"color:var(--ve-link);font-size:12px\">'+loc+'</span>';",
    "h+='<br>'}",
    "g.msgs.forEach(function(m){h+='<div style=\"color:var(--ve-error);font-size:12px;margin:2px 0\">'+V.esc(m.message)+'</div>'});",
    "if(g.lineText){h+='<pre style=\"margin:4px 0 0;color:var(--ve-code);font-size:11px;background:var(--ve-code-bg);border-radius:4px;padding:6px 8px;overflow-x:auto;border:1px solid var(--ve-border)\">'+V.esc(g.lineText)+'</pre>'}",
    "return'<div style=\"margin-bottom:10px\">'+h+'</div>'}).join('')};",
    // formatStack(): render parsedStack frames as clickable links
    'V.formatStack=function(frames){',
    "if(!frames||!frames.length)return'';",
    'var h=\'<div style="margin-top:8px;border-top:1px solid var(--ve-border);padding-top:8px">\';',
    // Show first 3 frames, rest collapsible
    'var visible=frames.slice(0,3);var hidden=frames.slice(3);',
    'visible.forEach(function(f){h+=V._renderFrame(f)});',
    'if(hidden.length){h+=\'<details style="margin-top:2px"><summary style="color:var(--ve-muted);font-size:11px;cursor:pointer;list-style:none">\'',
    "+hidden.length+' more frame'+(hidden.length>1?'s':'')+'</summary>';",
    "hidden.forEach(function(f){h+=V._renderFrame(f)});h+='</details>'}",
    "return h+'</div>'};",
    // _renderFrame(): single stack frame
    'V._renderFrame=function(f){',
    "var name=f.functionName||'(anonymous)';",
    "var loc=V.esc(f.file)+(f.line?':'+f.line:'');",
    "var isSrc=f.file&&f.file.indexOf('src/')!==-1&&f.file.indexOf('node_modules')===-1;",
    "var color=isSrc?'var(--ve-fg)':'var(--ve-muted)';",
    'var href=V._editorHref(f.absFile,f.line);',
    "var link=href?'<a href=\"'+href+'\" style=\"color:var(--ve-link);text-decoration:underline;text-underline-offset:2px\">'+loc+'</a>':'<span>'+loc+'</span>';",
    "return'<div style=\"font-size:11px;color:'+color+';margin:1px 0;font-family:ui-monospace,monospace\">'+V.esc(name)+' '+link+'</div>'};",
    // removeOverlay(): remove card + data element
    "V.removeOverlay=function(){V._src=null;var e=document.getElementById('__vertz_error');if(e)e.remove();" +
      "var d=document.getElementById('__vertz_error_data');if(d)d.remove()};",
    // showOverlay(title, body, payload, source, restartable): floating card + data element
    'V.showOverlay=function(t,body,payload,src,restartable){',
    'V.removeOverlay();',
    "V._src=src||'ws';",
    "var d=document,c=d.createElement('div');",
    "c.id='__vertz_error';",
    "c.style.cssText='",
    '--ve-bg:hsl(0 0% 100%);--ve-fg:hsl(0 0% 9%);--ve-muted:hsl(0 0% 45%);',
    '--ve-error:hsl(0 72% 51%);--ve-link:hsl(221 83% 53%);--ve-border:hsl(0 0% 90%);',
    '--ve-code:hsl(24 70% 45%);--ve-code-bg:hsl(0 0% 97%);--ve-btn:hsl(0 0% 9%);--ve-btn-fg:hsl(0 0% 100%);',
    'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:2147483647;',
    'background:var(--ve-bg);color:var(--ve-fg);border-radius:8px;padding:14px 16px;',
    'max-width:480px;width:calc(100% - 32px);font-family:ui-sans-serif,system-ui,sans-serif;',
    "box-shadow:0 4px 24px rgba(0,0,0,0.12),0 1px 3px rgba(0,0,0,0.08);border:1px solid var(--ve-border)';",
    // Dark mode
    "var st=d.createElement('style');",
    "st.textContent='@media(prefers-color-scheme:dark){#__vertz_error{",
    '--ve-bg:hsl(0 0% 7%);--ve-fg:hsl(0 0% 93%);--ve-muted:hsl(0 0% 55%);',
    '--ve-error:hsl(0 72% 65%);--ve-link:hsl(217 91% 70%);--ve-border:hsl(0 0% 18%);',
    "--ve-code:hsl(36 80% 65%);--ve-code-bg:hsl(0 0% 11%);--ve-btn:hsl(0 0% 93%);--ve-btn-fg:hsl(0 0% 7%)}}';",
    'd.head.appendChild(st);',
    // Buttons: when restartable, "Restart Server" is primary, "Retry" is secondary
    'var btns=restartable?\'<div style="display:flex;gap:6px">\'',
    '+\'<button id="__vertz_restart" style="background:var(--ve-btn);color:var(--ve-btn-fg);border:none;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer;font-weight:500">Restart Server</button>\'',
    '+\'<button id="__vertz_retry" style="background:transparent;color:var(--ve-muted);border:1px solid var(--ve-border);border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer">Retry</button></div>\'',
    ':\'<button id="__vertz_retry" style="background:var(--ve-btn);color:var(--ve-btn-fg);border:none;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer;font-weight:500">Retry</button>\';',
    'c.innerHTML=\'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">\'',
    "+'<span style=\"font-size:13px;font-weight:600;color:var(--ve-error)\">'+V.esc(t)+'</span>'",
    "+btns+'</div>'+body;",
    '(d.body||d.documentElement).appendChild(c);',
    "d.getElementById('__vertz_retry').onclick=function(){location.reload()};",
    // Restart Server button: send restart request via WebSocket
    "var rb=d.getElementById('__vertz_restart');if(rb){rb.onclick=function(){if(V._ws&&V._ws.readyState===1){V._ws.send(JSON.stringify({type:'restart'}))}}};",
    // Inject JSON data element for LLM/MCP access
    "if(payload){var s=d.createElement('script');s.type='application/json';s.id='__vertz_error_data';s.textContent=JSON.stringify(payload);(d.body||d.documentElement).appendChild(s)}};",
    // WebSocket connection with reconnection
    'var delay=1000,maxDelay=30000;',
    'function connect(){',
    "var p=location.protocol==='https:'?'wss:':'ws:';",
    "var ws=new WebSocket(p+'//'+location.host+'/__vertz_errors');",
    'V._ws=ws;',
    'ws.onmessage=function(e){',
    'try{var m=JSON.parse(e.data);',
    // WS error → show overlay (source: "ws").
    // During recovery (after controlled reload), suppress ALL WS errors.
    // The error that triggered the reload was already fixed; any WS errors
    // arriving now are stale (Bun frontend forwarding, module cache lag).
    "if(m.type==='error'){",
    'if(V._recovering)return;',
    // Check if any error message indicates a stale module graph
    'var sg=m.errors&&m.errors.some(function(e){return V.isStaleGraph(e.message)});',
    "V.showOverlay(m.category==='build'?'Build failed':m.category==='ssr'?'SSR error':m.category==='resolve'?'Module not found':'Runtime error',V.formatErrors(m.errors)+V.formatStack(m.parsedStack),m,'ws',sg)}",
    // WS clear → error is resolved server-side.
    // Priority: (1) _needsReload → controlled reload immediately
    //           (2) #app empty → page never rendered, reload for recovery
    //           (3) #app has content + client error → let HMR handle it
    //           (4) #app has content + no client error → remove overlay
    "else if(m.type==='clear'){",
    "if(V._needsReload){V._needsReload=false;V.removeOverlay();sessionStorage.setItem('__vertz_recovering',String(Date.now()));_reload();return}",
    "var a=document.getElementById('app');",
    "if(!a||a.innerHTML.length<50){V.removeOverlay();sessionStorage.setItem('__vertz_recovering',String(Date.now()));_reload();return}",
    'if(V._hadClientError)return;',
    'V.removeOverlay()}',
    // WS restarting → server is about to restart. Show overlay, set flag, clear reload guard.
    "else if(m.type==='restarting'){",
    'V._restarting=true;',
    'V.removeOverlay();',
    "V._src='ws';",
    // Clear reload guard counter so post-restart reload isn't counted as a loop
    "sessionStorage.removeItem('__vertz_reload_count');sessionStorage.removeItem('__vertz_reload_ts');",
    // Show a "Restarting..." overlay with no buttons
    "var d2=document,c2=d2.createElement('div');c2.id='__vertz_error';",
    "c2.style.cssText='position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#1a1a1a;color:#fff;border-radius:8px;padding:14px 20px;font-family:ui-sans-serif,system-ui,sans-serif;font-size:13px;box-shadow:0 4px 24px rgba(0,0,0,0.2)';",
    "c2.textContent='Restarting dev server\\u2026';",
    '(d2.body||d2.documentElement).appendChild(c2);',
    // Timeout: if WS doesn't reconnect within 10s, show fallback message
    "V._restartTimer=setTimeout(function(){var el=d2.getElementById('__vertz_error');if(el){el.textContent='Restart timed out. Try restarting manually (Ctrl+C and re-run).'}V._restarting=false},10000)}",
    // WS connected → reset delay. If _restarting, trigger full page reload.
    // Also handle late reconnect after timeout: if the restart overlay is still
    // showing (timed out), clear it and reload to recover.
    "else if(m.type==='connected'){delay=1000;",
    "var restartEl=document.getElementById('__vertz_error');",
    "var timedOut=restartEl&&restartEl.textContent&&restartEl.textContent.indexOf('timed out')!==-1;",
    'if(V._restarting||timedOut){V._restarting=false;if(V._restartTimer){clearTimeout(V._restartTimer);V._restartTimer=null}_reload()}}',
    '}catch(ex){}};',
    // Fast reconnect after restart: 100ms intervals instead of exponential backoff
    'ws.onclose=function(){V._ws=null;var d3=V._restarting?100:delay;setTimeout(function(){if(!V._restarting){delay=Math.min(delay*2,maxDelay)}connect()},d3)};',
    'ws.onerror=function(){ws.close()}}',
    'connect();',
    // sendResolveStack: if WS is connected, ask server to resolve the stack
    // trace via source maps. The server will broadcast the enriched error back.
    'V._sendResolveStack=function(stack,msg){',
    'if(V._ws&&V._ws.readyState===1){try{V._ws.send(JSON.stringify({type:"resolve-stack",stack:stack,message:msg}))}catch(e){}}};',
    // Runtime error capture — source: "client".
    // During recovery (_recovering), suppress runtime errors if #app already has
    // content. Bun's HMR may send stale module updates after a controlled reload.
    'function showRuntimeError(title,errors,payload){',
    "var a=document.getElementById('app');",
    'if(V._recovering&&a&&a.innerHTML.length>50)return;',
    'if(V._recovering)V._recovering=false;',
    'V._hadClientError=true;',
    'var sg2=errors&&errors.some(function(e){return V.isStaleGraph(e.message)});',
    "V.showOverlay(title,V.formatErrors(errors),payload,'client',sg2);",
    // Auto-restart for stale-graph errors detected client-side
    'if(sg2){V._autoRestart()}}',
    // Auto-clear recovery mode after 5s in case no errors fire
    'if(V._recovering){setTimeout(function(){V._recovering=false},5000)}',
    // Reset auto-restart counter after 5s of successful page load (no stale-graph error)
    "setTimeout(function(){sessionStorage.removeItem('__vertz_auto_restart')},5000);",
    "window.addEventListener('error',function(e){",
    'var msg=e.message||String(e.error);',
    'var stk=e.error&&e.error.stack;',
    'if(stk){V._sendResolveStack(stk,msg)}',
    // Don't show bundled /_bun/ URLs in the overlay — they're not useful.
    // Show just the message; the server's resolve-stack response will provide source file info.
    "var f=e.filename,isBundled=f&&(f.indexOf('/_bun/')!==-1||f.indexOf('blob:')!==-1);",
    'var errInfo=isBundled?{message:msg}:{message:msg,file:f,line:e.lineno,column:e.colno};',
    "showRuntimeError('Runtime error',[errInfo],{type:'error',category:'runtime',errors:[errInfo]})});",
    "window.addEventListener('unhandledrejection',function(e){",
    'var m=e.reason instanceof Error?e.reason.message:String(e.reason);',
    'var stk=e.reason&&e.reason.stack;',
    'if(stk){V._sendResolveStack(stk,m)}',
    "showRuntimeError('Runtime error',[{message:m}],{type:'error',category:'runtime',errors:[{message:m}]})});",
    // HMR error/success tracking — Bun's fast-refresh catches errors in try/catch,
    // so they never reach window.onerror. Intercept console to detect them.
    // The fast-refresh runtime logs:
    //   error: "[vertz-hmr] Error re-mounting <Name>: <Error>"  (per failed instance)
    //   log:   "[vertz-hmr] Hot updated: <moduleId>"            (always, end of cycle)
    // If "Hot updated" fires without a preceding error, the fix worked.
    'var hmrErr=false,origCE=console.error,origCL=console.log;',
    'console.error=function(){',
    "var t=Array.prototype.join.call(arguments,' ');",
    'var hmr=t.match(/\\[vertz-hmr\\] Error re-mounting (\\w+): ([\\s\\S]*?)(?:\\n\\s+at |$)/);',
    'if(hmr){hmrErr=true;V._hadClientError=true;',
    // Don't send resolve-stack for HMR errors — the server-side console.error
    // intercept handles these with lastChangedFile context and lineText.
    // Client just shows a minimal placeholder overlay; the server broadcast replaces it.
    "var hmrMsg=hmr[2].split('\\n')[0];var hmrSg=V.isStaleGraph(hmrMsg);V.showOverlay('Runtime error',V.formatErrors([{message:hmrMsg}]),{type:'error',category:'runtime',errors:[{message:hmrMsg}]},'client',hmrSg);if(hmrSg){V._autoRestart()}}",
    'origCE.apply(console,arguments)};',
    'console.log=function(){',
    "var t=Array.prototype.join.call(arguments,' ');",
    "if(t.indexOf('[vertz-hmr] Hot updated:')!==-1){",
    "if(!hmrErr&&V._src==='client'){",
    // HMR succeeded for a file that had a client-side error.
    // Remove the overlay and clear hadClientError. Then check if the page actually
    // recovered (HMR re-mounted the component) or is still blank.
    "V._hadClientError=false;V.removeOverlay();setTimeout(function(){var a=document.getElementById('app');if(!a||a.innerHTML.length<50){V._needsReload=true}},500)}",
    'hmrErr=false}',
    'origCL.apply(console,arguments)};',
    '})()</script>',
  ].join('');
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
  editor = 'vscode',
  headTags = '',
  sessionScript = '',
  htmlDataTheme,
}: SSRPageHtmlOptions): string {
  const ssrDataScript =
    ssrData.length > 0
      ? `<script>window.__VERTZ_SSR_DATA__=${safeSerialize(ssrData)};</script>`
      : '';

  const htmlAttrs = htmlDataTheme ? ` data-theme="${htmlDataTheme}"` : '';

  return `<!doctype html>
<html lang="en"${htmlAttrs}>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    ${headTags}
    ${css}
    ${buildErrorChannelScript(editor)}
    ${RELOAD_GUARD_SCRIPT}
  </head>
  <body>
    <div id="app">${bodyHtml}</div>
    ${sessionScript}
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
  'var V=window.__vertz_overlay||{};',
  'var formatErrors=V.formatErrors||function(){return\'<p style="margin:0;color:#666;font-size:12px">Check your terminal for details.</p>\'};',
  'var showOverlay=V.showOverlay||function(t,body){',
  "var e=document.getElementById('__vertz_error');if(e)e.remove();",
  "var d=document,c=d.createElement('div');c.id='__vertz_error';",
  "c.style.cssText='position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#fff;color:#1a1a1a;border-radius:8px;padding:14px 16px;max-width:480px;width:calc(100% - 32px);font-family:system-ui,sans-serif;box-shadow:0 4px 24px rgba(0,0,0,0.12);border:1px solid #e5e5e5';",
  'c.innerHTML=\'<div style="margin-bottom:10px;font-size:13px;font-weight:600;color:#dc2626">\'+t+\'</div>\'+body+\'<button onclick="location.reload()" style="margin-top:8px;background:#1a1a1a;color:#fff;border:none;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer">Retry</button>\';',
  '(d.body||d.documentElement).appendChild(c)};',
  // Main: fetch bundle, detect stub, fetch errors or load
  'el.remove();',
  'fetch(src).then(function(r){return r.text()}).then(function(t){',
  "if(t.trimStart().startsWith('try{location.reload()}')){",
  "fetch('/__vertz_build_check').then(function(r){return r.json()}).then(function(j){",
  // If build check has actual errors → show overlay. If no errors but reload stub
  // was served, Bun is transitioning (hash not updated yet) → retry after delay.
  // Use sessionStorage counter to cap retries at 3 and avoid infinite loops.
  "if(j.errors&&j.errors.length>0){showOverlay('Build failed',formatErrors(j.errors),j)}",
  "else{var rk='__vertz_stub_retry',rc=+(sessionStorage.getItem(rk)||0);",
  'if(rc<3){sessionStorage.setItem(rk,String(rc+1));setTimeout(function(){location.reload()},2000)}',
  "else{sessionStorage.removeItem(rk);showOverlay('Build failed','<p style=\"margin:0;color:#666;font-size:12px\">Could not load client bundle. Try reloading manually.</p>')}}",
  '}).catch(function(){',
  "showOverlay('Build failed','<p style=\"margin:0;color:#666;font-size:12px\">Check your terminal for details.</p>')})}",
  "else{sessionStorage.removeItem('__vertz_stub_retry');var s=document.createElement('script');s.type='module';s.crossOrigin='';s.src=src;document.body.appendChild(s)}",
  "}).catch(function(){showOverlay('Dev server unreachable','<p style=\"margin:0;color:#666;font-size:12px\">Could not connect. Is it still running?</p>')})",
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
 * Clear the entire require.cache so SSR module re-import picks up all changes,
 * including files outside src/ (e.g., generated files, shared libs).
 *
 * Returns the number of cache entries cleared.
 */
export function clearSSRRequireCache(): number {
  const keys = Object.keys(require.cache);
  for (const key of keys) {
    delete require.cache[key];
  }
  return keys.length;
}

/** Recursively collect all file paths in a directory. */
function collectFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
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
    editor: editorOption,
    headTags: headTagsOption = '',
    sessionResolver,
    watchDeps,
    themeFromRequest,
    onRestartNeeded,
  } = options;

  const faviconTag = detectFaviconTag(projectRoot);
  const headTags = [faviconTag, headTagsOption].filter(Boolean).join('\n');

  const editor = detectEditor(editorOption);

  // Install per-request fetch proxy (one-time, idempotent)
  if (apiHandler) {
    installFetchProxy();
  }

  // ── Debug logger & diagnostics ──────────────────────────────
  const devDir = resolve(projectRoot, '.vertz', 'dev');
  mkdirSync(devDir, { recursive: true });
  const logger = createDebugLogger(devDir);
  const diagnostics = new DiagnosticsCollector();
  // AOT manifest manager — compiles components for AOT SSR classification and diagnostics.
  let aotManifestManager: AotManifestManager | null = null;

  let server: ReturnType<typeof Bun.serve> | null = null;
  let srcWatcherRef: ReturnType<typeof watch> | null = null;
  let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  // Set when SSR module failed to load and we're using a fallback ({}).
  // The file watcher checks this to trigger a full restart instead of
  // re-importing (Bun's ESM cache retains failed resolutions).
  let ssrFallback = false;

  // ── WebSocket error channel state ────────────────────────────
  const wsClients = new Set<import('bun').ServerWebSocket<unknown>>();
  let currentError: { category: ErrorCategory; errors: ErrorDetail[] } | null = null;
  const sourceMapResolver = createSourceMapResolver(projectRoot);
  // Grace period after clearError — suppresses stale runtime/frontend errors
  // that Bun forwards from the browser console after the error source is fixed.
  // Only affects 'runtime' category; build/resolve/ssr errors are always broadcast.
  let clearGraceUntil = 0;

  // Debounce timer for runtime errors — HMR cascades fire multiple errors
  // (TaskCard → TaskListPage → App) in rapid succession. We collect them
  // over a short window and only broadcast the most informative one.
  let runtimeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingRuntimeError: ErrorDetail[] | null = null;

  // Server-side auto-restart cap: max 3 within 10s window
  const autoRestartTimestamps: number[] = [];
  const AUTO_RESTART_CAP = 3;
  const AUTO_RESTART_WINDOW_MS = 10_000;

  function canAutoRestart(): boolean {
    const now = Date.now();
    // Prune timestamps outside window
    while (
      autoRestartTimestamps.length > 0 &&
      now - (autoRestartTimestamps[0] ?? 0) > AUTO_RESTART_WINDOW_MS
    ) {
      autoRestartTimestamps.shift();
    }
    return autoRestartTimestamps.length < AUTO_RESTART_CAP;
  }

  function broadcastError(category: ErrorCategory, errors: ErrorDetail[]): void {
    // Build errors are root cause — don't let SSR/runtime errors overwrite them
    if (currentError?.category === 'build' && category !== 'build') {
      return;
    }
    // Suppress stale runtime errors during grace period after clearError
    if (category === 'runtime' && Date.now() < clearGraceUntil) {
      return;
    }
    // Debounce runtime errors to avoid cascading overlays
    if (category === 'runtime') {
      // Stale-graph errors bypass debounce and immediately trigger auto-restart
      if (errors.some((e) => isStaleGraphError(e.message ?? ''))) {
        // Broadcast the error to clients first (so they show the overlay)
        currentError = { category: 'runtime', errors };
        const errMsg = JSON.stringify({ type: 'error', category: 'runtime', errors });
        for (const ws of wsClients) {
          ws.sendText(errMsg);
        }
        // Auto-restart with loop prevention
        if (!isRestarting && canAutoRestart()) {
          autoRestartTimestamps.push(Date.now());
          if (logRequests) {
            const truncated = errors[0]?.message?.slice(0, 80) ?? '';
            console.log(`[Server] Stale graph detected: ${truncated}`);
          }
          // Fire-and-forget auto-restart
          devServer.restart();
        } else if (!isRestarting && !canAutoRestart()) {
          if (logRequests) {
            console.log('[Server] Auto-restart cap reached (3 in 10s), waiting for manual restart');
          }
        }
        return;
      }
      // Keep the most informative error (one with file info)
      if (!pendingRuntimeError || errors.some((e) => e.file)) {
        pendingRuntimeError = errors;
      }
      if (!runtimeDebounceTimer) {
        runtimeDebounceTimer = setTimeout(() => {
          runtimeDebounceTimer = null;
          const errs = pendingRuntimeError;
          pendingRuntimeError = null;
          if (errs) {
            currentError = { category: 'runtime', errors: errs };
            const msg = JSON.stringify({ type: 'error', category: 'runtime', errors: errs });
            for (const ws of wsClients) {
              ws.sendText(msg);
            }
          }
        }, 100);
      }
      return;
    }
    currentError = { category, errors };
    diagnostics.recordError(category, errors[0]?.message ?? '');
    logger.log('ws', 'broadcast-error', { category, errorCount: errors.length });
    const msg = JSON.stringify({ type: 'error', category, errors });
    for (const ws of wsClients) {
      ws.sendText(msg);
    }
  }

  function clearError(): void {
    if (currentError === null && !pendingRuntimeError) return;
    currentError = null;
    diagnostics.recordErrorClear();
    // Cancel any pending debounced runtime error
    if (runtimeDebounceTimer) {
      clearTimeout(runtimeDebounceTimer);
      runtimeDebounceTimer = null;
      pendingRuntimeError = null;
    }
    clearGraceUntil = Date.now() + 5000;
    const msg = JSON.stringify({ type: 'clear' });
    for (const ws of wsClients) {
      ws.sendText(msg);
    }
  }

  /** Clear error for a file change — no grace period, since new errors are expected. */
  function clearErrorForFileChange(): void {
    if (currentError === null && !pendingRuntimeError) return;
    currentError = null;
    diagnostics.recordErrorClear();
    if (runtimeDebounceTimer) {
      clearTimeout(runtimeDebounceTimer);
      runtimeDebounceTimer = null;
      pendingRuntimeError = null;
    }
    // No grace period — HMR errors from this save cycle are legitimate
    clearGraceUntil = 0;
    const msg = JSON.stringify({ type: 'clear' });
    for (const ws of wsClients) {
      ws.sendText(msg);
    }
  }

  // Capture recent console.error output — Bun's internal bundler logs
  // build failures here (module resolution, syntax errors, etc.).
  // The /__vertz_build_check endpoint reads this when Bun.build() can't
  // reproduce the error (e.g. missing plugin-resolved modules).
  // Also broadcasts resolution and runtime errors via the WebSocket error channel.
  let lastBuildError = '';
  let lastBroadcastedError = '';
  let lastChangedFile = '';
  const terminalDedup = createRuntimeErrorDeduplicator();
  const resolvePatterns = ['Could not resolve', 'Module not found', 'Cannot find module'];
  // HMR re-mount error: "[browser] [vertz-hmr] Error re-mounting <Component>: <Error>"
  const hmrErrorPattern = /\[vertz-hmr\] Error re-mounting (\w+): ([\s\S]*?)(?:\n\s+at |$)/;
  // Bun's ANSI-colored frontend error: "\x1b[31mfrontend\x1b[0m <ErrorType>: <message>"
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes from Bun's dev console
  const frontendErrorPattern = /\x1b\[31mfrontend\x1b\[0m ([\s\S]*?)(?:\n\s+from browser|$)/;

  /** Parse source file location from a stack trace, preferring project src/ paths. */
  function parseSourceFromStack(text: string): ErrorDetail {
    const stackLines = text.split('\n');
    const srcLine = stackLines.find((l) => l.includes('/src/') && !l.includes('node_modules'));
    if (srcLine) {
      const locMatch = srcLine.match(/(?:at .+? \(|at )(.+?):(\d+):(\d+)/);
      if (locMatch) {
        const absFile = locMatch[1];
        const line = Number(locMatch[2]);
        const lineText = absFile ? readLineText(absFile, line) : undefined;
        return {
          message: '',
          file: absFile?.replace(projectRoot, '').replace(/^\//, ''),
          absFile,
          line,
          column: Number(locMatch[3]),
          lineText,
        };
      }
    }
    return { message: '' };
  }

  const origConsoleError = console.error;

  /** Log a runtime error to terminal (with dedup) and record in diagnostics. */
  function logRuntimeErrorToTerminal(
    errors: ErrorDetail[],
    parsedStack?: TerminalStackFrame[],
  ): void {
    const primary = errors[0];
    if (!primary) return;
    if (!terminalDedup.shouldLog(primary.message, primary.file, primary.line)) return;
    const formatted = formatTerminalRuntimeError(errors, parsedStack);
    if (formatted) {
      origConsoleError(formatted);
    }
    diagnostics.recordRuntimeError(primary.message, primary.file ?? null);
    diagnostics.recordError('runtime', primary.message);
  }

  console.error = (...args: unknown[]) => {
    const text = args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ');
    // Only capture bundler/resolve errors, not our own [Server] logs
    if (!text.startsWith('[Server]')) {
      lastBuildError = text;

      // Broadcast resolution errors via WebSocket, suppressing duplicates
      if (resolvePatterns.some((p) => text.includes(p)) && text !== lastBroadcastedError) {
        lastBroadcastedError = text;
        broadcastError('resolve', [{ message: text }]);
      }
      // Broadcast HMR runtime errors (with component context)
      // "[browser] [vertz-hmr] Error re-mounting TaskCard: ReferenceError: ..."
      else {
        const hmrMatch = text.match(hmrErrorPattern);
        if (hmrMatch && text !== lastBroadcastedError) {
          lastBroadcastedError = text;
          const component = hmrMatch[1];
          const errorMsg = hmrMatch[2]?.trim() ?? 'Unknown error';
          // Try to extract source location from stack trace
          const loc = parseSourceFromStack(text);
          // If no source from stack, use last changed file as context
          if (!loc.file && lastChangedFile) {
            loc.file = lastChangedFile;
            loc.absFile = resolve(projectRoot, lastChangedFile);
          }
          broadcastError('runtime', [
            {
              message: `${errorMsg} (in ${component})`,
              file: loc.file,
              absFile: loc.absFile,
              line: loc.line,
              column: loc.column,
              lineText: loc.lineText,
            },
          ]);
        }
        // Bun's frontend error forwarding: "\x1b[31mfrontend\x1b[0m ReferenceError: ..."
        else {
          const feMatch = text.match(frontendErrorPattern);
          if (feMatch && text !== lastBroadcastedError) {
            lastBroadcastedError = text;
            const errorMsg = feMatch[1]?.split('\n')[0]?.trim() ?? 'Unknown error';
            const loc = parseSourceFromStack(text);
            if (!loc.file && lastChangedFile) {
              loc.file = lastChangedFile;
              loc.absFile = resolve(projectRoot, lastChangedFile);
            }
            broadcastError('runtime', [
              {
                message: errorMsg,
                file: loc.file,
                absFile: loc.absFile,
                line: loc.line,
                column: loc.column,
                lineText: loc.lineText,
              },
            ]);
          }
        }
      }
    }
    origConsoleError.apply(console, args);
  };

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

  // ── Restart state ─────────────────────────────────────────────────
  let isRestarting = false;
  let pluginsRegistered = false;
  // Stable reference to the plugin's updateManifest — survives restart because
  // the plugin itself is only registered once (process-global). On restart we
  // skip createVertzBunPlugin() to avoid creating a new manifests Map that
  // diverges from the registered plugin's closure.
  let stableUpdateManifest:
    | ((filePath: string, sourceText: string) => { changed: boolean })
    | null = null;

  // ── Upstream package watcher ────────────────────────────────────
  // Created once, persists across soft restarts. The set of workspace-linked
  // packages doesn't change during a dev session.
  // Uses a late-bound reference to devServer since it's defined later.
  let upstreamWatcherRef: UpstreamWatcher | null = null;
  let pendingDistRestart = false;
  let restartFn: (() => Promise<void>) | null = null;

  if (watchDeps) {
    upstreamWatcherRef = createUpstreamWatcher({
      projectRoot,
      watchDeps,
      onDistChanged: (pkgName) => {
        if (!restartFn || stopped) return;
        if (logRequests) {
          console.log(`[Server] Upstream package rebuilt: ${pkgName} — restarting...`);
        }
        if (isRestarting) {
          pendingDistRestart = true;
          return;
        }
        restartFn()
          .then(() => {
            if (pendingDistRestart && restartFn && !stopped) {
              pendingDistRestart = false;
              restartFn().catch((err) => {
                const msg = err instanceof Error ? err.message : String(err);
                console.error(`[Server] Pending upstream restart failed: ${msg}`);
              });
            }
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[Server] Upstream restart failed: ${msg}`);
          });
      },
    });

    if (logRequests && upstreamWatcherRef.packages.length > 0) {
      const names = upstreamWatcherRef.packages.map((p) => p.name).join(', ');
      console.log(`[Server] Watching upstream packages: ${names}`);
    }
  }

  // ── Unified SSR + HMR ────────────────────────────────────────────

  async function start(): Promise<void> {
    const { plugin } = await import('bun');
    const { createVertzBunPlugin } = await import('./bun-plugin');

    const entryPath = resolve(projectRoot, entry);
    const rawClientSrc = clientEntryOption ?? entry;
    // Normalize to absolute URL path (e.g., '/src/app.tsx') so it resolves
    // from the project root regardless of where the HMR shell HTML lives.
    const clientSrc = rawClientSrc.replace(/^\.\//, '/');

    // Register JSX runtime swap for SSR (server-side imports) — once only,
    // Bun plugins are process-global and must not be double-registered.
    if (!pluginsRegistered) {
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
    }

    // Register the Vertz compiler plugin — processes BOTH SSR and client .tsx files.
    // Bun's global plugin() applies to all module loading (runtime import() + dev bundler).
    // HMR + Fast Refresh are enabled so the client-side dev bundler injects:
    //   - import.meta.hot.accept() — modules self-accept HMR updates
    //   - __$refreshReg/__$refreshTrack wrappers — component instance tracking
    // On the server side, these are safe: import.meta.hot is guarded, and the
    // Fast Refresh preamble uses no-op defaults when the runtime isn't loaded.
    // Only create the plugin once — the registered plugin's onLoad closure captures
    // a manifests Map. Creating a new plugin instance would create a new Map, causing
    // manifest updates from the file watcher to go to the wrong instance.
    if (!pluginsRegistered) {
      const { plugin: serverPlugin, updateManifest } = createVertzBunPlugin({
        hmr: true,
        fastRefresh: true,
        logger,
        diagnostics,
      });
      plugin(serverPlugin);
      stableUpdateManifest = updateManifest;
    }
    pluginsRegistered = true;
    const updateServerManifest = stableUpdateManifest!;

    // Load SSR module — during soft restart (same process), use a wrapper
    // with a timestamp to attempt cache busting. This works when the ESM cache
    // doesn't have a failed entry. For truly stale ESM caches (failed modules),
    // a full process restart is needed (handled by onRestartNeeded callback).
    let ssrMod: SSRModule;
    try {
      if (isRestarting) {
        mkdirSync(devDir, { recursive: true });
        const ssrBootPath = resolve(devDir, 'ssr-reload-entry.ts');
        const ts = Date.now();
        writeFileSync(ssrBootPath, `export * from '${entryPath}';\n`);
        ssrMod = await import(`${ssrBootPath}?t=${ts}`);
      } else {
        ssrMod = await import(entryPath);
      }
      ssrFallback = false;
      if (logRequests) {
        console.log('[Server] SSR module loaded');
      }
    } catch (e) {
      console.error('[Server] Failed to load SSR module:', e);
      if (isRestarting) {
        // Use a fallback module so the server still starts — the HTTP server
        // stays alive, file watchers detect fixes, and the error overlay works.
        // Without this, a restart with a broken SSR module kills the server
        // permanently (no listener, no watcher, no recovery path).
        ssrFallback = true;
        ssrMod = {} as SSRModule;
        const errMsg = e instanceof Error ? e.message : String(e);
        const errStack = e instanceof Error ? e.stack : undefined;
        const { message: _, ...loc } = errStack ? parseSourceFromStack(errStack) : { message: '' };
        // Defer broadcast until the server is listening (broadcastError
        // needs wsClients, which are populated after Bun.serve()).
        queueMicrotask(() => {
          broadcastError('ssr', [{ message: errMsg, ...loc, stack: errStack }]);
        });
      } else {
        process.exit(1);
      }
    }

    // Extract font fallback metrics once at startup (zero-CLS font loading)
    let fontFallbackMetrics: Record<string, FontFallbackMetrics> | undefined;
    if (ssrMod.theme?.fonts) {
      try {
        fontFallbackMetrics = await extractFontMetrics(ssrMod.theme.fonts, projectRoot);
      } catch (e) {
        console.warn('[Server] Failed to extract font metrics:', e);
      }
    }

    // ── Prefetch manifest manager ──────────────────────────────────
    // Detects router file, builds initial manifest, enables incremental
    // rebuilds on file changes for single-pass SSR prefetching.
    let prefetchManager: PrefetchManifestManager | null = null;
    const srcDir = resolve(projectRoot, 'src');
    const routerCandidates = [resolve(srcDir, 'router.tsx'), resolve(srcDir, 'router.ts')];
    const routerPath = routerCandidates.find((p) => existsSync(p));
    if (routerPath) {
      prefetchManager = createPrefetchManifestManager({
        routerPath,
        readFile: (path) => {
          try {
            return readFileSync(path, 'utf-8');
          } catch {
            return undefined;
          }
        },
        resolveImport: (specifier, fromFile) => {
          if (!specifier.startsWith('.')) return undefined;
          const dir = dirname(fromFile);
          const base = resolve(dir, specifier);
          // Try common extensions
          for (const ext of ['.tsx', '.ts', '.jsx', '.js']) {
            const candidate = `${base}${ext}`;
            if (existsSync(candidate)) return candidate;
          }
          // Try index files
          for (const ext of ['.tsx', '.ts']) {
            const candidate = resolve(base, `index${ext}`);
            if (existsSync(candidate)) return candidate;
          }
          return undefined;
        },
      });
      try {
        const buildStart = performance.now();
        prefetchManager.build();
        const buildMs = Math.round(performance.now() - buildStart);
        logger.log('prefetch', 'initial-build', { routerPath, durationMs: buildMs });
        if (logRequests) {
          const manifest = prefetchManager.getSSRManifest();
          const routeCount = manifest?.routePatterns.length ?? 0;
          console.log(`[Server] Prefetch manifest built (${routeCount} routes, ${buildMs}ms)`);
        }
      } catch (e) {
        console.warn(
          '[Server] Failed to build prefetch manifest:',
          e instanceof Error ? e.message : e,
        );
        prefetchManager = null;
      }
    }

    // ── AOT manifest manager ──────────────────────────────────────
    // Builds AOT classification for all components, provides diagnostics
    // for the /__vertz_ssr_aot endpoint, rebuilds incrementally on file change.
    aotManifestManager = createAotManifestManager({
      readFile: (path) => {
        try {
          return readFileSync(path, 'utf-8');
        } catch {
          return undefined;
        }
      },
      listFiles: () => {
        try {
          return collectFiles(srcDir);
        } catch {
          return [];
        }
      },
    });
    try {
      const aotStart = performance.now();
      aotManifestManager.build();
      const aotMs = Math.round(performance.now() - aotStart);
      logger.log('aot', 'initial-build', { durationMs: aotMs });
      if (logRequests) {
        const manifest = aotManifestManager.getManifest();
        const count = manifest ? Object.keys(manifest.components).length : 0;
        console.log(`[Server] AOT manifest built (${count} components, ${aotMs}ms)`);
      }
    } catch (e) {
      console.warn('[Server] Failed to build AOT manifest:', e instanceof Error ? e.message : e);
      aotManifestManager = null;
    }

    // Generate HMR shell HTML at .vertz/dev/hmr-shell.html
    // This page initializes Bun's HMR system by importing the client entry
    mkdirSync(devDir, { recursive: true });

    // Fast Refresh runtime: resolve from generated HTML at .vertz/dev/
    // back to project root's node_modules.
    // CRITICAL: The dist build of fast-refresh-runtime.js has its
    // import.meta.hot.accept() DCE'd by bunup (import.meta.hot is undefined
    // at library build time). We generate a thin wrapper that re-imports the
    // runtime and self-accepts, creating an HMR boundary. Without this,
    // updates to @vertz/ui dist chunks propagate through the runtime to the
    // HTML entry point, causing Bun to trigger a full page reload.
    // The fast-refresh runtime must be loaded before component modules.
    // We generate a .ts wrapper so Bun's dev bundler processes it (resolves
    // bare specifiers like @vertz/ui/internals). Plain .js files in .vertz/dev/
    // are served raw without bundling, and inline scripts aren't bundled either.
    const frInitPath = resolve(devDir, 'fast-refresh-init.ts');
    writeFileSync(
      frInitPath,
      `import '@vertz/ui-server/fast-refresh-runtime';\nif (import.meta.hot) import.meta.hot.accept();\n`,
    );

    const hmrShellHtml = `<!doctype html>
<html lang="en"><head>
  <meta charset="UTF-8" />
  <title>HMR Shell</title>
</head><body>
  <script type="module" src="./fast-refresh-init.ts"></script>
  <script type="module" src="${clientSrc}"></script>
</body></html>`;

    const hmrShellPath = resolve(devDir, 'hmr-shell.html');
    writeFileSync(hmrShellPath, hmrShellHtml);

    const hmrShellModule = require(hmrShellPath);

    setupOpenAPIWatcher();

    // Discovered HMR assets (populated after self-fetch)
    let bundledScriptUrl: string | null = null;
    let hmrBootstrapScript: string | null = null;

    // Ready gate: defers WebSocket 'connected' messages until discoverHMRAssets()
    // completes. Re-declared per start() call so each restart gets a fresh gate.
    // The gate is one-shot — subsequent discoverHMRAssets() calls (file-change-
    // triggered) do NOT re-gate because readyGate stays open.
    // Timeout: if discovery hangs (e.g., self-fetch deadlock), unblock clients
    // after 5s so they degrade gracefully instead of waiting forever.
    const readyGate = createReadyGate({
      timeoutMs: 5000,
      onTimeoutWarning: () => {
        console.warn('[Server] HMR asset discovery timed out — unblocking clients');
      },
    });

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

        // WebSocket error channel upgrade
        if (pathname === '/__vertz_errors') {
          if (server?.upgrade(request, { data: {} })) {
            return undefined as unknown as Response;
          }
          return new Response('WebSocket upgrade failed', { status: 400 });
        }

        // Let Bun handle its internal /_bun/ routes (HMR client bundles, assets)
        if (pathname.startsWith('/_bun/')) {
          return undefined as unknown as Response;
        }

        // Build check endpoint — the client loader fetches this when it
        // detects Bun's reload stub to get the actual compilation error.
        // Returns currentError from the error channel when available.
        if (pathname === '/__vertz_build_check') {
          if (currentError) {
            return Response.json({ errors: currentError.errors });
          }
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

        // Diagnostics endpoint — JSON snapshot of server state
        if (pathname === '/__vertz_diagnostics') {
          return Response.json(diagnostics.getSnapshot());
        }

        // AOT SSR diagnostics — component tiers, coverage, divergences
        if (pathname === '/__vertz_ssr_aot') {
          if (!aotManifestManager) {
            return Response.json({ error: 'AOT manifest manager not available' }, { status: 404 });
          }
          return Response.json(aotManifestManager.getDiagnostics().getSnapshot());
        }

        // Prefetch manifest endpoint — returns current manifest with rebuild metadata
        if (pathname === '/__vertz_prefetch_manifest') {
          if (!prefetchManager) {
            return Response.json(
              { error: 'No prefetch manifest available (router file not found)' },
              { status: 404 },
            );
          }
          return Response.json(prefetchManager.getSnapshot());
        }

        // Dev-mode image proxy — passthrough for runtime image optimization URLs
        if (pathname === '/_vertz/image') {
          return handleDevImageProxy(request);
        }

        // Optimized image serving — serve processed images from .vertz/images/
        if (pathname.startsWith('/__vertz_img/')) {
          const imgName = pathname.slice('/__vertz_img/'.length);
          if (!isValidImageName(imgName)) {
            return new Response('Forbidden', { status: 403 });
          }
          const imagesDir = resolve(projectRoot, '.vertz', 'images');
          const imgPath = resolve(imagesDir, imgName);
          if (!imgPath.startsWith(imagesDir)) {
            return new Response('Forbidden', { status: 403 });
          }
          const file = Bun.file(imgPath);
          if (await file.exists()) {
            const ext = imgName.split('.').pop();
            return new Response(file, {
              headers: {
                'Content-Type': imageContentType(ext),
                'Cache-Control': 'public, max-age=31536000, immutable',
              },
            });
          }
          return new Response('Not Found', { status: 404 });
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

        // Resolve theme from request for SSR (e.g., from cookies)
        const ssrTheme = themeFromRequest?.(request) ?? undefined;

        try {
          // Scope fetch interception per-request via AsyncLocalStorage.
          // API requests (e.g. query() calling fetch('/api/todos')) route
          // through the in-memory apiHandler. Concurrent SSR renders each
          // get their own scope — no globalThis.fetch mutation.
          const interceptor = apiHandler
            ? createFetchInterceptor({
                apiHandler,
                origin: `http://${host}:${server?.port}`,
                skipSSRPaths,
                originalFetch: globalThis.fetch,
              })
            : null;

          // Resolve session in isolated try/catch (graceful degradation)
          let sessionScript = '';
          let ssrAuth: SSRAuth | undefined;
          let ssrAccessSet: Parameters<typeof toPrefetchSession>[1];
          if (sessionResolver) {
            try {
              const sessionResult = await sessionResolver(request);
              if (sessionResult) {
                ssrAuth = {
                  status: 'authenticated',
                  user: sessionResult.session.user,
                  expiresAt: sessionResult.session.expiresAt,
                };
                ssrAccessSet = sessionResult.accessSet;
                const scripts: string[] = [];
                scripts.push(createSessionScript(sessionResult.session));
                if (sessionResult.accessSet != null) {
                  scripts.push(createAccessSetScript(sessionResult.accessSet));
                }
                sessionScript = scripts.join('\n');
              } else {
                ssrAuth = { status: 'unauthenticated' };
              }
            } catch (resolverErr) {
              // ssrAuth stays undefined → auth unknown during SSR → no redirect
              console.warn(
                '[Server] Session resolver failed:',
                resolverErr instanceof Error ? resolverErr.message : resolverErr,
              );
            }
          }

          // Fetch OAuth providers for SSR so login buttons render server-side.
          // Also inject into client HTML so hydration matches SSR output.
          if (ssrAuth && apiHandler) {
            try {
              const origin = `http://${host}:${server?.port}`;
              const provRes = await apiHandler(
                new Request(`${origin}${skipSSRPaths[0]}auth/providers`),
              );
              if (provRes.ok) {
                const providers = await provRes.json();
                ssrAuth.providers = providers;
                sessionScript += `\n<script>window.__VERTZ_PROVIDERS__=${safeSerialize(providers)};</script>`;
              }
            } catch {
              // Silent — providers will load client-side
            }
          }

          const doRender = async () => {
            logger.log('ssr', 'render-start', { url: pathname });
            const ssrStart = performance.now();
            const result = await ssrRenderSinglePass(ssrMod, pathname + url.search, {
              ssrTimeout: 300,
              fallbackMetrics: fontFallbackMetrics,
              ssrAuth,
              manifest: prefetchManager?.getSSRManifest(),
              prefetchSession: toPrefetchSession(ssrAuth, ssrAccessSet),
            });
            logger.log('ssr', 'render-done', {
              url: pathname,
              durationMs: Math.round(performance.now() - ssrStart),
              htmlBytes: result.html.length,
            });

            // SSR redirect — return 302 instead of rendered HTML
            if (result.redirect) {
              return new Response(null, {
                status: 302,
                headers: { Location: result.redirect.to },
              });
            }

            // Patch data-theme attributes in SSR body to match the resolved theme.
            // ThemeProvider renders data-theme="dark" by default — replace with cookie value.
            const bodyHtml = ssrTheme
              ? result.html.replace(/data-theme="[^"]*"/, `data-theme="${ssrTheme}"`)
              : result.html;

            const scriptTag = buildScriptTag(bundledScriptUrl, hmrBootstrapScript, clientSrc);
            const combinedHeadTags = [headTags, result.headTags].filter(Boolean).join('\n');
            const html = generateSSRPageHtml({
              title,
              css: result.css,
              bodyHtml,
              ssrData: result.ssrData,
              scriptTag,
              editor,
              headTags: combinedHeadTags,
              sessionScript,
              htmlDataTheme: ssrTheme,
            });

            // Clear any stale SSR error from a previous render so the error
            // overlay doesn't persist after a successful reload (e.g. "Retry").
            clearError();

            return new Response(html, {
              status: 200,
              headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store',
              },
            });
          };

          return interceptor ? await runWithScopedFetch(interceptor, doRender) : await doRender();
        } catch (err) {
          console.error('[Server] SSR error:', err);

          // Broadcast SSR error to connected WebSocket clients with source location
          const errMsg = err instanceof Error ? err.message : String(err);
          const errStack = err instanceof Error ? err.stack : undefined;
          const { message: _, ...loc } = errStack
            ? parseSourceFromStack(errStack)
            : { message: '' };
          broadcastError('ssr', [{ message: errMsg, ...loc, stack: errStack }]);

          const scriptTag = buildScriptTag(bundledScriptUrl, hmrBootstrapScript, clientSrc);
          const fallbackHtml = generateSSRPageHtml({
            title,
            css: '',
            bodyHtml: '',
            ssrData: [],
            scriptTag,
            editor,
            headTags,
            htmlDataTheme: ssrTheme,
          });

          return new Response(fallbackHtml, {
            status: 200,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-store',
            },
          });
        }
      },

      websocket: {
        open(ws) {
          wsClients.add(ws);
          diagnostics.recordWebSocketChange(wsClients.size);
          logger.log('ws', 'client-connected', { total: wsClients.size });
          // Gate defers 'connected' until discoverHMRAssets() completes
          // so bundledScriptUrl is set before clients reload the page.
          if (!readyGate.onOpen(ws)) {
            ws.sendText(JSON.stringify({ type: 'connected' }));
            if (currentError) {
              ws.sendText(
                JSON.stringify({
                  type: 'error',
                  category: currentError.category,
                  errors: currentError.errors,
                }),
              );
            }
          }
        },
        message(ws, msg) {
          try {
            const data = JSON.parse(typeof msg === 'string' ? msg : new TextDecoder().decode(msg));
            if (data.type === 'restart') {
              // Fire-and-forget — restart is async but WS handler is sync
              devServer.restart();
            } else if (data.type === 'ping') {
              ws.sendText(JSON.stringify({ type: 'pong' }));
            } else if (data.type === 'resolve-stack' && data.stack) {
              // Client sent an Error.stack for source map resolution
              const selfFetch = async (url: string) => {
                // Convert relative /_bun/ URL to absolute for self-fetch
                const absUrl = url.startsWith('http')
                  ? url
                  : `http://${host}:${server?.port}${url}`;
                return fetch(absUrl);
              };
              sourceMapResolver
                .resolveStack(data.stack, data.message ?? '', selfFetch)
                .then((result) => {
                  const hasFileInfo = result.errors.some((e) => e.file);
                  // If resolution couldn't find source files, enrich the
                  // response with the best available file context:
                  // 1. currentError (from server-side HMR handler)
                  // 2. lastChangedFile (always set by the file watcher)
                  if (!hasFileInfo) {
                    const msg = result.errors[0]?.message ?? '';
                    let enrichedErrors: ErrorDetail[] | null = null;

                    if (currentError?.errors.some((e) => e.file)) {
                      enrichedErrors = currentError.errors.map((e) => ({
                        ...e,
                        message: msg || e.message,
                      }));
                    } else if (lastChangedFile) {
                      const absFile = resolve(projectRoot, lastChangedFile);
                      enrichedErrors = [{ message: msg, file: lastChangedFile, absFile }];
                    }

                    if (enrichedErrors) {
                      const payload = {
                        type: 'error',
                        category: 'runtime' as ErrorCategory,
                        errors: enrichedErrors,
                        parsedStack: result.parsedStack,
                      };
                      currentError = { category: 'runtime', errors: enrichedErrors };
                      logRuntimeErrorToTerminal(enrichedErrors, result.parsedStack);
                      const text = JSON.stringify(payload);
                      for (const client of wsClients) {
                        client.sendText(text);
                      }
                      return;
                    }
                  }
                  const payload = {
                    type: 'error',
                    category: 'runtime' as ErrorCategory,
                    errors: result.errors,
                    parsedStack: result.parsedStack,
                  };
                  currentError = { category: 'runtime', errors: result.errors };
                  logRuntimeErrorToTerminal(result.errors, result.parsedStack);
                  const text = JSON.stringify(payload);
                  for (const client of wsClients) {
                    client.sendText(text);
                  }
                })
                .catch(() => {
                  // Resolution failed — use currentError or lastChangedFile
                  let errors: ErrorDetail[] | undefined;
                  if (currentError?.errors.some((e) => e.file)) {
                    errors = currentError.errors;
                  } else if (lastChangedFile) {
                    const absFile = resolve(projectRoot, lastChangedFile);
                    errors = [
                      { message: data.message ?? 'Unknown error', file: lastChangedFile, absFile },
                    ];
                  }
                  if (errors) {
                    const payload = {
                      type: 'error',
                      category: 'runtime' as ErrorCategory,
                      errors,
                    };
                    currentError = { category: 'runtime', errors };
                    logRuntimeErrorToTerminal(errors);
                    const text = JSON.stringify(payload);
                    for (const client of wsClients) {
                      client.sendText(text);
                    }
                  } else {
                    const fallbackErrors: ErrorDetail[] = [
                      { message: data.message ?? 'Unknown error' },
                    ];
                    logRuntimeErrorToTerminal(fallbackErrors);
                    broadcastError('runtime', fallbackErrors);
                  }
                });
            }
          } catch {
            // Ignore malformed messages
          }
        },
        close(ws) {
          wsClients.delete(ws);
          readyGate.onClose(ws);
          diagnostics.recordWebSocketChange(wsClients.size);
        },
      },

      development: {
        hmr: true,
        console: true,
      },
    });

    if (logRequests) {
      console.log(`[Server] SSR+HMR dev server running at http://${host}:${server.port}`);
    }

    // Self-fetch /__vertz_hmr to discover the bundled script URL and HMR bootstrap.
    // The ready gate has a built-in 5s timeout; the finally block ensures the gate
    // opens even if discoverHMRAssets() throws unexpectedly.
    try {
      await discoverHMRAssets();
    } finally {
      if (!readyGate.isReady) {
        readyGate.open(currentError);
      }
    }

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

        diagnostics.recordHMRAssets(bundledScriptUrl, hmrBootstrapScript !== null);
      } catch (e) {
        console.warn('[Server] Could not discover HMR bundled URL:', e);
      }
    }

    // Watch for file changes — re-discover hash + re-import SSR module
    stopped = false;

    if (existsSync(srcDir)) {
      srcWatcherRef = watch(srcDir, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        if (refreshTimeout) clearTimeout(refreshTimeout);
        refreshTimeout = setTimeout(async () => {
          // Track last changed file for runtime error context
          lastChangedFile = `src/${filename}`;
          diagnostics.recordFileChange(lastChangedFile);
          logger.log('watcher', 'file-changed', { file: lastChangedFile });
          // Reset broadcast dedup so a new file change can re-broadcast
          lastBroadcastedError = '';
          terminalDedup.reset();
          diagnostics.clearRuntimeErrors();
          // Invalidate source map cache — bundle hashes change on every edit
          sourceMapResolver.invalidate();
          if (logRequests) {
            console.log(`[Server] File changed: ${filename}`);
          }

          // Re-discover HMR assets (hash changes on every edit)
          if (stopped) return;
          await discoverHMRAssets();

          // Proactive build check — detect errors before the client fetches
          if (stopped) return;
          try {
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
              broadcastError('build', errors);
            } else {
              // Re-discover HMR assets with retry — the first discoverHMRAssets()
              // may have run before Bun's dev server updated its module graph hash.
              // Poll until the hash changes or timeout (Bun typically updates in ~500ms).
              const prevUrl = bundledScriptUrl;
              for (let attempt = 0; attempt < 5; attempt++) {
                if (stopped) return;
                await new Promise((r) => setTimeout(r, 200));
                if (stopped) return;
                await discoverHMRAssets();
                if (bundledScriptUrl !== prevUrl) break;
              }
              // Clear optimistically — if HMR fails, new errors will come in.
              // Don't set grace period: errors from this save cycle are
              // legitimate, not stale leftovers.
              clearErrorForFileChange();
            }
          } catch {
            // Bun.build() itself failed — ignore, the fetch-validate loader
            // will catch this on next page load
          }

          // Regenerate manifest for the changed file before SSR re-import.
          // This ensures the compiler's manifest view is current when Bun
          // re-evaluates modules through the plugin's onLoad hook.
          if (stopped) return;
          if (filename.endsWith('.ts') || filename.endsWith('.tsx')) {
            const changedFilePath = resolve(srcDir, filename);
            try {
              const manifestStartMs = performance.now();
              const source = await Bun.file(changedFilePath).text();
              const { changed } = updateServerManifest(changedFilePath, source);
              const manifestDurationMs = Math.round(performance.now() - manifestStartMs);
              diagnostics.recordManifestUpdate(lastChangedFile, changed, manifestDurationMs);

              // Rebuild prefetch manifest (incremental for components, full for router)
              if (prefetchManager) {
                const prefetchStart = performance.now();
                prefetchManager.onFileChange(changedFilePath, source);
                const prefetchMs = Math.round(performance.now() - prefetchStart);
                logger.log('prefetch', 'rebuild', {
                  file: lastChangedFile,
                  durationMs: prefetchMs,
                  isRouter: changedFilePath === routerPath,
                });
              }

              // Rebuild AOT manifest (incremental — only recompile the changed file)
              if (aotManifestManager) {
                const aotStart = performance.now();
                aotManifestManager.onFileChange(changedFilePath, source);
                const aotMs = Math.round(performance.now() - aotStart);
                logger.log('aot', 'rebuild', {
                  file: lastChangedFile,
                  durationMs: aotMs,
                });
              }
            } catch {
              // File may have been deleted between watcher event and read.
              // Notify managers so they can remove stale entries.
              if (aotManifestManager) {
                aotManifestManager.onFileChange(changedFilePath, '');
              }
            }
          }

          // Re-import SSR module — clear require cache for all project source
          // files so transitive dependencies (e.g., mock-data.ts) are re-evaluated.
          if (stopped) return;
          //
          // IMPORTANT: We import through a thin .ts wrapper instead of appending
          // `?t=...` directly to the entry path. Bun's plugin system matches the
          // `onLoad` filter against the full module specifier. Appending `?t=...`
          // to a `.tsx` entry causes the filter `/\.tsx$/` to NOT match, so Bun
          // loads the entry with native JSX support instead of the Vertz compiler.
          // Native JSX evaluates children eagerly (no thunks), breaking the
          // synchronous context stack used by Provider/useContext. The wrapper
          // is a `.ts` file (no plugin needed) that re-exports from the real
          // entry, keeping the `.tsx` import path clean for the plugin.
          // If SSR is using a fallback module (broken entry), a file change
          // likely means the user fixed the error. Bun's ESM loader caches
          // failed module evaluations by resolved file path — re-importing
          // the same path (even with ?t= timestamps or file copies) returns
          // the cached failure because transitive dependencies also reference
          // the original module. The only reliable fix is a process restart
          // to get a fresh ESM module cache.
          if (ssrFallback) {
            if (onRestartNeeded) {
              if (logRequests) {
                console.log('[Server] SSR in fallback mode — requesting process restart');
              }
              await devServer.stop();
              onRestartNeeded();
              return;
            }
            // No restart callback — try normal re-import as best effort
            if (logRequests) {
              console.log('[Server] SSR in fallback mode — attempting re-import (best effort)');
            }
          }

          const cacheCleared = clearSSRRequireCache();
          logger.log('watcher', 'cache-cleared', { entries: cacheCleared });
          const ssrWrapperPath = resolve(devDir, 'ssr-reload-entry.ts');
          mkdirSync(devDir, { recursive: true });
          writeFileSync(ssrWrapperPath, `export * from '${entryPath}';\n`);
          const ssrReloadStart = performance.now();
          try {
            const freshMod: SSRModule = await import(`${ssrWrapperPath}?t=${Date.now()}`);
            ssrMod = freshMod;
            ssrFallback = false;
            if (freshMod.theme?.fonts) {
              try {
                fontFallbackMetrics = await extractFontMetrics(freshMod.theme.fonts, projectRoot);
              } catch {
                /* keep previous metrics on failure */
              }
            }
            const durationMs = Math.round(performance.now() - ssrReloadStart);
            diagnostics.recordSSRReload(true, durationMs);
            logger.log('watcher', 'ssr-reload', { status: 'ok', durationMs });
            if (logRequests) {
              console.log('[Server] SSR module refreshed');
            }
          } catch {
            logger.log('watcher', 'ssr-reload', { status: 'retry' });
            // First import may fail due to stale Bun module cache (race between
            // file watcher and Bun's dev bundler recompilation). Retry once after
            // a delay to let Bun's module graph settle.
            if (stopped) return;
            await new Promise((r) => setTimeout(r, 500));
            if (stopped) return;
            clearSSRRequireCache();
            mkdirSync(devDir, { recursive: true });
            writeFileSync(ssrWrapperPath, `export * from '${entryPath}';\n`);
            try {
              const freshMod: SSRModule = await import(`${ssrWrapperPath}?t=${Date.now()}`);
              ssrMod = freshMod;
              ssrFallback = false;
              if (freshMod.theme?.fonts) {
                try {
                  fontFallbackMetrics = await extractFontMetrics(freshMod.theme.fonts, projectRoot);
                } catch {
                  /* keep previous metrics on failure */
                }
              }
              const durationMs = Math.round(performance.now() - ssrReloadStart);
              diagnostics.recordSSRReload(true, durationMs);
              logger.log('watcher', 'ssr-reload', { status: 'ok', durationMs, retry: true });
              if (logRequests) {
                console.log('[Server] SSR module refreshed (retry)');
              }
            } catch (e2) {
              console.error('[Server] Failed to refresh SSR module:', e2);
              const errMsg = e2 instanceof Error ? e2.message : String(e2);
              const errStack = e2 instanceof Error ? e2.stack : undefined;
              const durationMs = Math.round(performance.now() - ssrReloadStart);
              diagnostics.recordSSRReload(false, durationMs, errMsg);
              logger.log('watcher', 'ssr-reload', { status: 'failed', error: errMsg });
              const { message: _m, ...loc2 } = errStack
                ? parseSourceFromStack(errStack)
                : { message: '' };
              broadcastError('ssr', [{ message: errMsg, ...loc2, stack: errStack }]);
              // Flag for process restart on next file change — Bun's ESM cache
              // retains failed module evaluations and can't be cleared in-process.
              ssrFallback = true;
            }
          }
        }, 100);
      });
    }
  }

  // ── Public API ──────────────────────────────────────────────────

  const devServer: BunDevServer = {
    start,
    broadcastError,
    clearError,
    clearErrorForFileChange,
    setLastChangedFile(file: string) {
      lastChangedFile = file;
    },

    async stop() {
      stopped = true;

      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
        refreshTimeout = null;
      }

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

      // Close upstream watcher on full stop (not recreated on restart)
      if (upstreamWatcherRef) {
        upstreamWatcherRef.close();
        upstreamWatcherRef = null;
      }
    },

    async restart() {
      if (isRestarting) {
        if (logRequests) {
          console.log('[Server] Restart already in progress, skipping');
        }
        return;
      }

      isRestarting = true;
      if (logRequests) {
        console.log('[Server] Restarting dev server...');
      }

      // Broadcast { type: 'restarting' } to all connected clients before stopping
      const restartMsg = JSON.stringify({ type: 'restarting' });
      for (const ws of wsClients) {
        try {
          ws.sendText(restartMsg);
        } catch {
          // Client may already be disconnected
        }
      }

      // Reuse stop() to avoid duplicating shutdown logic
      await devServer.stop();

      // Clear dead WS references and all error state
      wsClients.clear();
      currentError = null;
      if (runtimeDebounceTimer) {
        clearTimeout(runtimeDebounceTimer);
        runtimeDebounceTimer = null;
      }
      pendingRuntimeError = null;
      lastBuildError = '';
      lastBroadcastedError = '';
      lastChangedFile = '';
      clearGraceUntil = 0;
      ssrFallback = false;
      terminalDedup.reset();
      clearSSRRequireCache();
      sourceMapResolver.invalidate();

      // Port binding retry: the port may not be released instantly after stop.
      // Retry up to 3 times with increasing delays (100ms, 200ms, 500ms).
      const retryDelays = [100, 200, 500];
      let lastErr: unknown;
      for (let attempt = 0; attempt < retryDelays.length; attempt++) {
        await new Promise((r) => setTimeout(r, retryDelays[attempt]));
        try {
          await start();
          if (logRequests) {
            console.log(`[Server] Dev server restarted on port ${port}`);
          }
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          if (logRequests) {
            const errMsg = e instanceof Error ? e.message : String(e);
            console.log(`[Server] Restart attempt ${attempt + 1} failed: ${errMsg}`);
          }
        }
      }
      if (lastErr) {
        const errMsg = lastErr instanceof Error ? lastErr.message : String(lastErr);
        console.error(`[Server] Restart failed after ${retryDelays.length} attempts: ${errMsg}`);
      }
      isRestarting = false;
    },
  };

  // Bind restart function for upstream watcher (late-bound reference)
  restartFn = () => devServer.restart();

  return devServer;
}
