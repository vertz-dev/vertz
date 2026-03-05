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
import { existsSync, mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { dirname, normalize, resolve } from 'node:path';
import { createDebugLogger } from './debug-logger';
import { DiagnosticsCollector } from './diagnostics-collector';
import { createSourceMapResolver, readLineText } from './source-map-resolver';
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
  /**
   * Editor for error overlay links. Auto-detected from VERTZ_EDITOR or EDITOR env vars.
   * Supported: 'vscode' | 'cursor' | 'webstorm' | 'zed'
   * @default 'vscode'
   */
  editor?: string;
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

export interface BunDevServer {
  start(): Promise<void>;
  stop(): Promise<void>;
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
    // showOverlay(title, body, payload, source): floating card + data element
    'V.showOverlay=function(t,body,payload,src){',
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
    'c.innerHTML=\'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">\'',
    "+'<span style=\"font-size:13px;font-weight:600;color:var(--ve-error)\">'+V.esc(t)+'</span>'",
    '+\'<button id="__vertz_retry" style="background:var(--ve-btn);color:var(--ve-btn-fg);border:none;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer;font-weight:500">Retry</button>\'',
    "+'</div>'+body;",
    '(d.body||d.documentElement).appendChild(c);',
    "d.getElementById('__vertz_retry').onclick=function(){location.reload()};",
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
    "V.showOverlay(m.category==='build'?'Build failed':m.category==='ssr'?'SSR error':m.category==='resolve'?'Module not found':'Runtime error',V.formatErrors(m.errors)+V.formatStack(m.parsedStack),m,'ws')}",
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
    "else if(m.type==='connected'){delay=1000}",
    '}catch(ex){}};',
    'ws.onclose=function(){V._ws=null;setTimeout(function(){delay=Math.min(delay*2,maxDelay);connect()},delay)};',
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
    "V.showOverlay(title,V.formatErrors(errors),payload,'client')}",
    // Auto-clear recovery mode after 5s in case no errors fire
    'if(V._recovering){setTimeout(function(){V._recovering=false},5000)}',
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
    "V.showOverlay('Runtime error',V.formatErrors([{message:hmr[2].split('\\n')[0]}]),{type:'error',category:'runtime',errors:[{message:hmr[2].split('\\n')[0]}]},'client')}",
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
    ${buildErrorChannelScript(editor)}
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
  } = options;

  const editor = detectEditor(editorOption);

  // ── Debug logger & diagnostics ──────────────────────────────
  const devDir = resolve(projectRoot, '.vertz', 'dev');
  mkdirSync(devDir, { recursive: true });
  const logger = createDebugLogger(devDir);
  const diagnostics = new DiagnosticsCollector();

  let server: ReturnType<typeof Bun.serve> | null = null;
  let srcWatcherRef: ReturnType<typeof watch> | null = null;
  let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

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

  // ── Unified SSR + HMR ────────────────────────────────────────────

  async function start(): Promise<void> {
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
      logger,
      diagnostics,
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
            logger.log('ssr', 'render-start', { url: pathname });
            const ssrStart = performance.now();
            const result = await ssrRenderToString(ssrMod, pathname, { ssrTimeout: 300 });
            logger.log('ssr', 'render-done', {
              url: pathname,
              durationMs: Math.round(performance.now() - ssrStart),
              htmlBytes: result.html.length,
            });
            const scriptTag = buildScriptTag(bundledScriptUrl, hmrBootstrapScript, clientSrc);
            const html = generateSSRPageHtml({
              title,
              css: result.css,
              bodyHtml: result.html,
              ssrData: result.ssrData,
              scriptTag,
              editor,
            });

            return new Response(html, {
              status: 200,
              headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store',
              },
            });
          } finally {
            if (apiHandler) {
              globalThis.fetch = originalFetch;
            }
          }
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
        },
        message(ws, msg) {
          try {
            const data = JSON.parse(typeof msg === 'string' ? msg : new TextDecoder().decode(msg));
            if (data.type === 'ping') {
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
                    const text = JSON.stringify(payload);
                    for (const client of wsClients) {
                      client.sendText(text);
                    }
                  } else {
                    broadcastError('runtime', [{ message: data.message ?? 'Unknown error' }]);
                  }
                });
            }
          } catch {
            // Ignore malformed messages
          }
        },
        close(ws) {
          wsClients.delete(ws);
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

        diagnostics.recordHMRAssets(bundledScriptUrl, hmrBootstrapScript !== null);
      } catch (e) {
        console.warn('[Server] Could not discover HMR bundled URL:', e);
      }
    }

    // Watch for file changes — re-discover hash + re-import SSR module
    const srcDir = resolve(projectRoot, 'src');
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
          const cacheKeys = Object.keys(require.cache);
          let cacheCleared = 0;
          for (const key of cacheKeys) {
            if (key.startsWith(srcDir) || key.startsWith(entryPath)) {
              delete require.cache[key];
              cacheCleared++;
            }
          }
          logger.log('watcher', 'cache-cleared', { entries: cacheCleared });
          const ssrWrapperPath = resolve(devDir, 'ssr-reload-entry.ts');
          mkdirSync(devDir, { recursive: true });
          writeFileSync(ssrWrapperPath, `export * from '${entryPath}';\n`);
          const ssrReloadStart = performance.now();
          try {
            const freshMod: SSRModule = await import(`${ssrWrapperPath}?t=${Date.now()}`);
            ssrMod = freshMod;
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
            const retryKeys = Object.keys(require.cache);
            for (const key of retryKeys) {
              if (key.startsWith(srcDir) || key.startsWith(entryPath)) {
                delete require.cache[key];
              }
            }
            mkdirSync(devDir, { recursive: true });
            writeFileSync(ssrWrapperPath, `export * from '${entryPath}';\n`);
            try {
              const freshMod: SSRModule = await import(`${ssrWrapperPath}?t=${Date.now()}`);
              ssrMod = freshMod;
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
              // Keep using the old module — last known good
            }
          }
        }, 100);
      });
    }
  }

  // ── Public API ──────────────────────────────────────────────────

  return {
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

    },
  };
}
