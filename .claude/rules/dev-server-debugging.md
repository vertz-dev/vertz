# Debugging the Vertz Dev Server

Common issues encountered when working with the Vertz dev server (`createBunDevServer`) and how to diagnose them.

## Context Returns Undefined After HMR Reload

**Symptom:** `useContext(SomeContext)` returns `undefined` after saving a file, even though the Provider is in the tree. Components that depend on context (router, settings, theme) break after HMR.

**Root cause checklist:**

1. **Is the plugin processing the entry file?** Check terminal output for `[Server] SSR module refreshed`. When Bun's file watcher fires, the SSR module is re-imported through a `.ts` wrapper at `.vertz/dev/ssr-reload-entry.ts`. If the plugin filter (`/\.tsx$/`) doesn't match the import path (e.g., `?t=...` query string appended directly to a `.tsx` file), Bun uses native JSX instead of the Vertz compiler. Native JSX evaluates children eagerly (no thunks), which breaks the synchronous context stack used by `Provider`/`useContext`. The `.ts` wrapper exists specifically to avoid this — it re-exports from the real `.tsx` entry, keeping the `.tsx` import path clean for the plugin filter.

2. **Is the context registry intact?** The global context registry (`globalThis.__VERTZ_CTX_REG__`) is keyed by `__stableId` strings (format: `filePath::varName`). When `createContext()` is called with the same ID, it returns the existing object — preserving object identity for `ContextScope` Map keys. If `createContext()` creates a new object (different identity), `useContext()` looks up a key that doesn't match any Provider entry and returns `undefined`.

3. **Is `__stableId` being injected?** The `injectContextStableIds()` transform only runs when `fastRefresh: true` in the plugin options. SSR uses `fastRefresh: false` intentionally (SSR doesn't need component replacement). For client-side context stability across HMR, the client plugin must have `fastRefresh: true` (the default when `hmr: true`). Check that the entry file has `const X = createContext(...)` at the top level — the transform only matches `const` declarations with `createContext` call expressions.

**Diagnostic:** Check the compiled output of a file with `createContext`:
- With stable IDs: `createContext(undefined, 'src/contexts/settings.tsx::SettingsContext')`
- Without stable IDs: `createContext()` — context identity breaks on re-evaluation

## Infinite Page Reload Loop

**Symptom:** Browser reloads endlessly. DevTools network tab shows rapid sub-100ms reloads.

**Root cause:** Bun's dev server serves a reload stub when client compilation fails:

```js
try{location.reload()}catch(_){}
addEventListener("DOMContentLoaded",function(event){location.reload()})
```

The `BUILD_ERROR_LOADER` script intercepts this: it fetch-validates the bundle URL before loading it, and if it detects the reload stub, it fetches `/__vertz_build_check` for the actual error and shows an overlay instead of reloading.

However, this guard requires `bundledScriptUrl` to be discovered. If `bundledScriptUrl` is `null`, `buildScriptTag()` falls back to a plain `<script type="module" src="...">`, which Bun auto-loads without validation — bypassing the guard entirely.

**Check:** Terminal output for `[Server] Discovered bundled script URL:`. If missing, the self-fetch to `/__vertz_hmr` failed to extract the `/_bun/client/<hash>.js` URL from the HMR shell HTML. Common causes:
- Port conflict: another process on the port. Check `lsof -i :<port>`.
- The `/__vertz_hmr` route didn't return expected HTML. Check that `.vertz/dev/hmr-shell.html` exists and references the correct client entry.

**Backup guard:** The `RELOAD_GUARD_SCRIPT` tracks consecutive rapid reloads via `sessionStorage`. After 10 rapid reloads (< 100ms apart), it calls `window.stop()` to halt all pending loads and shows a fallback overlay. If you see the "Dev server connection lost" overlay with the warning icon, this guard fired — the `BUILD_ERROR_LOADER` didn't catch the loop.

**Fix:** Check terminal for build errors. The `BUILD_ERROR_LOADER` also retries up to 3 times (with `sessionStorage` counter `__vertz_stub_retry`) when `/__vertz_build_check` reports no errors but the reload stub was served — this handles timing races where Bun's hash hasn't updated yet.

## SSR Shows Stale Content After Save

**Symptom:** SSR output doesn't reflect code changes after saving a file. Client-side content updates via HMR, but refreshing the page shows old SSR HTML.

**Root cause:** SSR module re-import failed silently. The server keeps the last-known-good module (`ssrMod`) and continues rendering with it.

**Check:** Terminal for `[Server] Failed to refresh SSR module:`. The re-import process has two attempts:
1. First attempt: clears `require.cache` for all files under `src/` and the entry path, writes a fresh `.ts` wrapper at `.vertz/dev/ssr-reload-entry.ts`, and imports with `?t=<timestamp>`.
2. Retry (after 500ms): same process, in case the first attempt hit a stale Bun module cache race.

If both fail, the error is logged and broadcast via the WebSocket error channel as an `ssr` category error.

**Other causes:**
- `require.cache` wasn't fully cleared. The watcher clears keys starting with `srcDir` or `entryPath`. If your SSR module imports from a path outside `src/` (e.g., a shared `lib/` directory at the project root), those modules are NOT cache-busted and will serve stale content.
- The watcher debounce (100ms) collapsed two rapid saves into one refresh cycle. The second save's changes may not be picked up if the first import already started.

## CSS Disappears After HMR

**Symptom:** Component styles disappear after saving a file. The page looks unstyled or partially styled.

**Root cause:** CSS sidecar files may be stale. The plugin extracts CSS from each `.tsx` file and writes it to `.vertz/css/<hash>.css`. The component module imports this sidecar file, and Bun's CSS HMR hot-swaps the stylesheet. But:

1. **Timing race:** The file watcher fires and Bun re-evaluates the module before the plugin has finished writing the new CSS sidecar file. The old CSS sidecar is imported, and when the new one is written, Bun may not re-trigger CSS HMR for it.

2. **Module re-evaluation creates new `css()` instances:** If a component's `css()` call produces different hash keys after re-evaluation (e.g., class names changed), the old `<style>` tags from SSR no longer match. The `injectedCSS` Set deduplicates by content, so changed CSS gets new entries. But old entries are never removed from the DOM during HMR — they may conflict or accumulate.

3. **SSR CSS collection mismatch:** The `collectCSS()` function in `ssr-single-pass.ts` reads CSS from either `module.getInjectedCSS()` (the bundled `@vertz/ui` instance) or the DOM shim's `document.head`. If the SSR module is stale (see above), it returns old CSS. The `injectedCSS` Set is intentionally NOT cleared between renders (to preserve module-level CSS), so stale CSS persists.

**Fix:** Hard-refresh the browser (`Cmd+Shift+R` / `Ctrl+Shift+R`) to get fresh SSR output with current CSS. If the issue persists, delete `.vertz/css/` and restart the dev server.

## Build Check Says OK But Client Fails

**Symptom:** The `/__vertz_build_check` endpoint returns `{ "errors": [] }`, but the client bundle fails to load or shows runtime errors.

**Root cause:** The build check uses `Bun.build()` with only the default Bun plugins — it does NOT use the Vertz compiler plugin. This means it only catches native Bun build errors (syntax errors, missing modules, import resolution failures). It does NOT catch:

- **Plugin transform failures:** Errors in the Vertz compiler (reactive signal transforms, JSX transforms, hydration IDs, CSS extraction) are invisible to the build check.
- **Fast Refresh codegen errors:** The `generateRefreshCode()` step runs only in the plugin, not in `Bun.build()`.
- **Context stable ID injection errors:** The `injectContextStableIds()` transform is plugin-only.

The build check has a fallback: if `Bun.build()` succeeds but the dev bundler failed, it returns the last captured `console.error` output from Bun's internal bundler (`lastBuildError`). This catches some plugin-adjacent errors that Bun logs but doesn't surface through the build API.

**Check:** Terminal for `[vertz-bun-plugin] Failed to process <file>:` — the plugin logs transform failures with the relative file path and error message. These errors are thrown (crashing the module load), so Bun falls back to the reload stub, but the build check won't reproduce them.

## SSR Falls Back to Legacy Render (Framework App)

**Symptom:** SSR output is missing hydration data, query prefetching, head tags, or redirects. The `X-Vertz-SSR-Error` response header contains an error about `@vertz/ui-server`. Terminal shows one of:

- `[Server] @vertz/ui-server is installed but ssrRenderSinglePass could not be loaded (...)`
- `[Server] @vertz/ui is installed but @vertz/ui-server is missing.`

**Root cause:** The runtime tried to import `ssrRenderSinglePass` from `@vertz/ui-server/ssr` at startup and failed. Since the app uses `@vertz/ui` (a framework app), the runtime errors instead of silently falling back to the degraded legacy DOM-scraping render.

**Detection logic** (`persistent_isolate.rs` init path):

1. `node_modules/@vertz/ui-server` exists → package installed but broken (version mismatch, missing build, corrupted install)
2. `node_modules/@vertz/ui` exists but `@vertz/ui-server` doesn't → missing dependency
3. Neither exists → plain JS app, legacy render is appropriate and used silently

**Fix by case:**

| Terminal message | Cause | Fix |
|---|---|---|
| `ssrRenderSinglePass could not be loaded` | `@vertz/ui-server` installed but export fails | `vertz add @vertz/ui-server` (reinstall), or rebuild: `bun run build` in `packages/ui-server` |
| `@vertz/ui-server is missing` | Dependency not installed | `vertz add @vertz/ui-server` |

**Plain JS apps** (no `@vertz/ui` in `node_modules`) are unaffected — they use the legacy DOM-scraping render silently, which is the correct behavior for apps that don't use the framework.

## Diagnostic Tools

### `VERTZ_DEBUG` — Opt-in diagnostic logging

Set the `VERTZ_DEBUG` environment variable before starting the dev server to enable NDJSON diagnostic logging to `.vertz/dev/debug.log`:

```bash
VERTZ_DEBUG=1           # All categories
VERTZ_DEBUG=plugin      # Only plugin processing (onLoad events, timing)
VERTZ_DEBUG=ssr         # Only SSR render (timing, query counts)
VERTZ_DEBUG=watcher     # Only file watcher events (file changes, cache clearing, SSR reload)
VERTZ_DEBUG=ws          # Only WebSocket events (client connections, error broadcasts)
VERTZ_DEBUG=plugin,ssr  # Multiple categories
```

Log file is truncated on server start. Zero overhead when disabled.

### `/__vertz_diagnostics` — Server health check

`GET http://localhost:<port>/__vertz_diagnostics` returns a JSON snapshot of the server state: plugin configuration, processed files, SSR reload status, HMR asset discovery, current errors, WebSocket clients, and last file change.

Useful for automated debugging and verifying server state without reading terminal output.

## Stale Dev Bundler After Adding New Files

**Symptom:** After creating a new page/component file and importing it from an existing file (e.g., adding a route), HMR fires and SSR refreshes, but the browser shows "Build failed / Could not load client bundle." Manual reload doesn't fix it.

**Root cause:** Bun's persistent dev bundler doesn't reliably update its internal module graph when a new file is imported for the first time. The proactive `Bun.build()` check succeeds (one-shot, fresh context), but the dev bundler serves its reload stub because its module graph is stale.

**Auto-recovery (since #1818 fix):** The dev server now self-fetches the bundle URL after the proactive build check passes. If the response is Bun's reload stub (`try{location.reload()}`), the server auto-restarts to get a fresh module graph.

**Diagnostic:** Terminal log: `[Server] Dev bundler serving reload stub after successful build — restarting`

**If auto-restart cap reached:** After 3 auto-restarts within 10s, the server stops auto-restarting. Terminal shows: `[Server] Dev bundler stale but auto-restart cap reached`. At this point, manually restart the dev server (`Ctrl+C` and re-run `bun run dev`).

**Client-side fallback:** If the server-side detection misses the stale bundler (e.g., user navigates to the page after the watcher cycle completed), the BUILD_ERROR_LOADER requests a server restart via WebSocket. The browser shows "Restarting dev server... Dev bundler appears stale after adding new files."

## Quick Reference

### Key File Paths

| Component | Path |
|---|---|
| Dev server | `packages/ui-server/src/bun-dev-server.ts` |
| Bun plugin (compile pipeline) | `packages/ui-server/src/bun-plugin/plugin.ts` |
| Context stable IDs | `packages/ui-server/src/bun-plugin/context-stable-ids.ts` |
| Fast Refresh runtime | `packages/ui-server/src/bun-plugin/fast-refresh-runtime.ts` |
| Fast Refresh codegen | `packages/ui-server/src/bun-plugin/fast-refresh-codegen.ts` |
| DOM state preservation | `packages/ui-server/src/bun-plugin/fast-refresh-dom-state.ts` |
| SSR shared types & utils | `packages/ui-server/src/ssr-shared.ts` |
| SSR render (single-pass, dev) | `packages/ui-server/src/ssr-single-pass.ts` |
| Context + Provider | `packages/ui/src/component/context.ts` |
| Source map resolver | `packages/ui-server/src/source-map-resolver.ts` |

### Terminal Log Markers

| Log message | Meaning |
|---|---|
| `[Server] SSR module loaded` | Initial SSR module import succeeded |
| `[Server] SSR module refreshed` | SSR module re-import after file change succeeded |
| `[Server] SSR module refreshed (retry)` | SSR module re-import succeeded on second attempt |
| `[Server] Failed to refresh SSR module:` | SSR re-import failed both attempts — serving stale module |
| `[Server] Discovered bundled script URL:` | HMR asset discovery succeeded — reload guard is active |
| `[Server] File changed:` | File watcher detected a change — refresh cycle starting |
| `[vertz-bun-plugin] Failed to process <file>:` | Plugin transform error — module will fail to load |
| `[vertz-hmr] Hot updated: <moduleId>` | Fast Refresh re-mounted all instances of components in module |
| `[vertz-hmr] Error re-mounting <Name>:` | Fast Refresh factory re-execution failed — old instance kept |
| `[vertz-hmr] Signal count changed in <Name>` | Signal preservation skipped — component state was reset |
| `[Server] Dev bundler serving reload stub after successful build — restarting` | Stale dev bundler detected — auto-restart triggered |
| `[Server] Dev bundler stale but auto-restart cap reached` | Auto-restart skipped (3 restarts in 10s) — manual restart needed |
| `[Server] @vertz/ui-server is installed but ssrRenderSinglePass could not be loaded` | Framework SSR broken — package needs rebuild or upgrade |
| `[Server] @vertz/ui is installed but @vertz/ui-server is missing` | Framework app missing SSR dependency — `vertz add @vertz/ui-server` |

### Error Channel Categories

The WebSocket error channel (`/__vertz_errors`) uses four categories:

| Category | Priority | Source |
|---|---|---|
| `build` | Highest — blocks all others | `Bun.build()` proactive check or `BUILD_ERROR_LOADER` |
| `resolve` | High | `console.error` intercept matching "Could not resolve" patterns |
| `ssr` | Medium | SSR render `catch` or SSR module re-import failure |
| `runtime` | Low — debounced 100ms | HMR re-mount errors, `window.onerror`, `unhandledrejection` |
