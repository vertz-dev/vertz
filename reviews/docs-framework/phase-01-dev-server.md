# Phase 1: Dev Server — MDX Compilation, Page Rendering, Bun.serve()

- **Author:** Claude Opus 4.6 (implementation agent)
- **Reviewer:** Claude Opus 4.6 (adversarial review agent)
- **Commits:** 3825e36d55ae717ca46f25a4f34f4784d5faa77f
- **Date:** 2026-03-24

## Changes

- `packages/docs-framework/src/dev/compile-mdx-html.ts` (new) — MDX-to-HTML compiler with string-based JSX runtime
- `packages/docs-framework/src/dev/render-page-html.ts` (new) — Full HTML page template with sidebar, header, breadcrumbs, ToC, prev/next, live reload
- `packages/docs-framework/src/dev/docs-dev-server.ts` (new) — Bun.serve() dev server with SSE live reload
- `packages/docs-framework/src/cli/actions.ts` (modified) — Added `docsDevAction`
- `packages/cli/src/commands/docs.ts` (modified) — Added `docsDevCommand` with SIGINT/SIGTERM shutdown
- `packages/docs-framework/src/index.ts` (modified) — New exports for dev server, compile, render

## CI Status

- [x] Quality gates passed at 3825e36d

## Review Checklist

- [x] Delivers what the ticket asks for
- [ ] TDD compliance (tests before/alongside implementation)
- [x] No type gaps or missing edge cases — **see findings below**
- [ ] No security issues (injection, XSS, etc.) — **see findings below**
- [x] Public API changes match design doc

## Findings

### BLOCKER: SSE client cleanup is broken — memory leak (docs-dev-server.ts:49-53)

The `ReadableStream` cancel callback receives a `reason` parameter, NOT the controller. Per the WHATWG Streams spec, `UnderlyingSource.cancel(reason?: any)` is called with the cancellation reason. Only `start(controller)` and `pull(controller)` receive the controller.

Current code:
```ts
const stream = new ReadableStream<Uint8Array>({
  start(controller) {
    sseClients.add(controller);
  },
  cancel(controller) {       // <-- This is NOT the controller, it's `reason`
    sseClients.delete(controller);  // <-- Never finds the real controller
  },
});
```

When a client disconnects, `cancel(reason)` is called with `undefined` or an error object. `sseClients.delete(undefined)` never removes the actual controller reference. Disconnected clients accumulate in the Set forever.

**Fix:** Capture the controller in a closure:
```ts
const stream = new ReadableStream<Uint8Array>({
  start(ctrl) {
    sseClients.add(ctrl);
  },
  cancel() {
    // `ctrl` not available here — need closure
  },
});
```

Correct approach:
```ts
let ctrl: ReadableStreamDefaultController<Uint8Array>;
const stream = new ReadableStream<Uint8Array>({
  start(controller) {
    ctrl = controller;
    sseClients.add(controller);
  },
  cancel() {
    sseClients.delete(ctrl);
  },
});
```

### BLOCKER: XSS in 500 error response (docs-dev-server.ts:82)

The error message is injected into HTML without escaping:

```ts
return new Response(`<h1>Error</h1><pre>${message}</pre>`, {
  status: 500,
  headers: { 'content-type': 'text/html' },
});
```

If an MDX file references a path containing `<script>` (e.g., via an import statement like `import X from '<script>alert(1)</script>'`), the error message from the compiler will include the malicious string verbatim. Since this is a dev server (localhost), the practical risk is low, but it violates defense-in-depth and is trivial to fix.

**Fix:** Import or inline `escapeHtml` and escape the message:
```ts
return new Response(`<h1>Error</h1><pre>${escapeHtml(message)}</pre>`, { ... });
```

### SHOULD-FIX: `new Function()` executes arbitrary code from MDX (compile-mdx-html.ts:89-94)

The pattern is:
```ts
const factory = new Function(code);
const mod = factory({ jsx, jsxs: jsx, jsxDEV: jsx, Fragment });
```

Where `code` is the output of `@mdx-js/mdx compile()`. This is the documented pattern for `outputFormat: 'function-body'`, so it's structurally correct. However:

1. **No sandboxing.** MDX can contain arbitrary JS expressions (`{process.exit(1)}`). The `new Function()` executes them in the current process context. An MDX file with `{require('child_process').execSync('rm -rf /')}` would execute during compilation.

2. **The dev server compiles on every request** (no caching). A malicious or buggy MDX file causes repeated execution of arbitrary code.

This is acceptable for a local dev server where the user owns the MDX files. However, a comment in the code should document this trust boundary explicitly, and the function should NOT be used in any server-facing build pipeline without sandboxing.

**Fix (minimal):** Add a JSDoc comment documenting the trust boundary:
```ts
/**
 * Compile MDX source to an HTML string.
 *
 * WARNING: This executes the compiled MDX code via new Function().
 * Only use with trusted MDX content (local dev server). Do NOT use
 * for user-submitted content without sandboxing.
 */
```

### SHOULD-FIX: No path traversal guard (docs-dev-server.ts:71)

```ts
const mdxPath = resolve(pagesDir, route.filePath);
```

The `route.filePath` comes from `config.sidebar[].groups[].pages[]` which is a user-provided `string[]` in `vertz.config.ts`. If a user (or a config error) puts `../../etc/passwd` as a page path, `resolve(pagesDir, '../../etc/passwd')` resolves outside the pages directory.

Since routes are built from user config at startup (not from URL input), and this is a local dev server, the risk is low. But defense-in-depth says we should validate.

**Fix:** After resolving, check the path stays within `pagesDir`:
```ts
const mdxPath = resolve(pagesDir, route.filePath);
if (!mdxPath.startsWith(pagesDir)) {
  return new Response('Forbidden', { status: 403 });
}
```

### SHOULD-FIX: Duplicated `escapeHtml` function

`escapeHtml` is defined identically in both:
- `compile-mdx-html.ts:20-26`
- `render-page-html.ts:13-19`

This violates DRY. If one is updated (e.g., to also escape single quotes `'` → `&#x27;`), the other becomes inconsistent.

**Fix:** Extract to a shared utility, e.g., `packages/docs-framework/src/utils/escape-html.ts`.

### SHOULD-FIX: Signal handler leak in CLI (docs.ts:86-94)

The `process.on('SIGINT', ...)` and `process.on('SIGTERM', ...)` handlers are never removed. If `docsDevCommand` is called multiple times (e.g., in tests, or a future "restart" feature), each call adds new handlers.

Also, calling `server.stop()` twice (once from SIGINT, then from SIGTERM in rapid succession) could be problematic depending on `Bun.serve().stop()` idempotency.

**Fix:** Use `process.once()` instead of `process.on()`, or remove listeners in a finally block:
```ts
const cleanup = () => { server.stop(); resolve(); };
process.once('SIGINT', cleanup);
process.once('SIGTERM', cleanup);
```

### NIT: `escapeHtml` does not escape single quotes

Both `escapeHtml` implementations escape `& < > "` but not `'` (single quote). While double-quoted HTML attributes are safe, any future use in single-quoted attribute context would be vulnerable. The OWASP recommendation includes `'` → `&#x27;`.

### NIT: `readFileSync` in async request handler (docs-dev-server.ts:72)

```ts
const source = readFileSync(mdxPath, 'utf-8');
```

Using synchronous I/O in the `async fetch()` handler blocks the event loop during file reads. For a dev server this is acceptable, but it would be more idiomatic to use `await Bun.file(mdxPath).text()` which is already available in the Bun runtime.

### NIT: Routes are static — config changes require restart

The route map is built once at startup from `loadDocsConfig()`. Adding a new page to `vertz.config.ts` or adding a new MDX file requires restarting the dev server. This is expected for a first iteration but worth documenting / adding a file watcher for config in a future phase.

### NIT: No test for frontmatter-only MDX input

`compileMdxToHtml` has a guard for empty content after frontmatter stripping (line 78), but there's no test for an MDX file that is ONLY frontmatter with no content body:
```mdx
---
title: Empty
---
```
This should return `''`.

### NIT: No test for SSE endpoint in integration tests

The `.local.ts` integration test covers page serving and 404s but doesn't test the `/__docs_reload` SSE endpoint. Given the blocker above (broken cleanup), an SSE test would have caught it.

## Resolution

**Changes Requested.** Two blockers and four should-fix items must be addressed before merge.

Summary:
| # | Severity | Finding |
|---|----------|---------|
| 1 | BLOCKER | SSE cancel callback receives `reason`, not controller — memory leak |
| 2 | BLOCKER | XSS in 500 error response — unescaped error message |
| 3 | SHOULD-FIX | `new Function()` trust boundary not documented |
| 4 | SHOULD-FIX | No path traversal guard on resolved MDX path |
| 5 | SHOULD-FIX | Duplicated `escapeHtml` across two files |
| 6 | SHOULD-FIX | Signal handler leak — `process.on` should be `process.once` |
| 7 | NIT | `escapeHtml` missing single-quote escaping |
| 8 | NIT | `readFileSync` in async handler — prefer `Bun.file().text()` |
| 9 | NIT | Routes are static, no hot-reload of config |
| 10 | NIT | Missing test for frontmatter-only MDX input |
| 11 | NIT | Missing test for SSE endpoint |
