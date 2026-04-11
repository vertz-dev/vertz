# Replace Bun.serve/Bun.file/Bun.write with vtz-native APIs

**Issue:** #2497
**Status:** Draft (Rev 2 — addressing DX, Product, and Technical review feedback)
**Author:** viniciusdacal

## Problem

Several framework packages use Bun-specific runtime APIs (`Bun.serve()`, `Bun.file()`, `Bun.write()`, `import.meta.hot`). These are the core coupling points preventing full decoupling from Bun. The vtz runtime already provides equivalent low-level capabilities — file I/O ops, synthetic `node:fs` / `node:fs/promises` modules, an internal Axum HTTP server — but framework packages still call Bun APIs directly.

## API Surface

### File I/O — Replace `Bun.file()` / `Bun.write()` with `node:fs`

The vtz runtime already provides `node:fs` and `node:fs/promises` synthetic modules with full async + sync APIs. These are the standard replacement:

```ts
// BEFORE — Bun.file()
const content = await Bun.file(path).text();
const size = Bun.file(path).size;
return new Response(Bun.file(path));

// AFTER — node:fs/promises (works on both Bun and vtz)
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

const content = await readFile(path, 'utf-8');
const { size } = await stat(path);
// Note: reads entire file into memory. Fine for small files (HTML, JSON, fonts).
// For large static files, use createReadStream wrapped in ReadableStream.
return new Response(readFileSync(path));
```

```ts
// BEFORE �� Bun.write()
await Bun.write(filePath, content);

// AFTER �� node:fs/promises
import { writeFile } from 'node:fs/promises';
await writeFile(filePath, content);
```

### HTTP Server — Add `createVtzAdapter()` with a native fetch-handler op

The `ServerAdapter` interface in `@vertz/core` already abstracts the HTTP server layer. We add a vtz-native adapter backed by a new Rust op.

**Why not `node:http`?** The vtz runtime's `node:http` synthetic module calls `Deno.serve()`, but the vtz runtime only includes `deno_core` (which provides `Deno.core`), not the full Deno runtime. `Deno.serve` does not exist. The `node:http` module is effectively dead code for HTTP serving.

**Approach:** Implement a new native op (`op_http_serve`) that binds a port and dispatches incoming requests to a JS fetch handler. This is architecturally clean — the vtz runtime already has an Axum HTTP server; we're extending it to support user-created servers.

```ts
// packages/core/src/app/vtz-adapter.ts
import type { ServerAdapter } from '../types/server-adapter';

export function createVtzAdapter(): ServerAdapter {
  return {
    async listen(port, handler, options) {
      // op_http_serve is a native vtz op that:
      // 1. Binds an Axum server on the given port
      // 2. Converts each incoming HTTP request to a Web Request
      // 3. Calls the handler function
      // 4. Converts the Web Response back to an HTTP response
      // 5. Returns { port, hostname } (actual bound port for port=0 support)
      const server = await Deno.core.ops.op_http_serve(
        port,
        options?.hostname ?? '0.0.0.0',
        handler,
      );

      return {
        port: server.port,
        hostname: server.hostname,
        async close() {
          await Deno.core.ops.op_http_serve_close(server.id);
        },
      };
    },
  };
}
```

The op accepts a standard `(request: Request) => Promise<Response>` fetch handler — no `node:http` compatibility layer needed, no string-only `ServerResponse`, no binary data corruption. This matches the `ServerAdapter` interface perfectly and supports:
- Arbitrary port binding (including port 0 for OS-assigned ports)
- Both text and binary response bodies (via Web Response)
- Proper port discovery (returns actual bound port)

### Runtime Detection — Update `detectAdapter()`

```ts
// packages/core/src/app/detect-adapter.ts
import type { ServerAdapter } from '../types/server-adapter';

export interface RuntimeHints {
  hasBun: boolean;
  hasVtz: boolean;
}

function detectRuntime(): RuntimeHints {
  return {
    hasBun: 'Bun' in globalThis,
    // Explicit runtime identity marker set in vtz bootstrap JS.
    // Not an implementation side-effect — intentional stable contract.
    hasVtz: '__vtz_runtime' in globalThis,
  };
}

export async function detectAdapter(hints?: RuntimeHints): Promise<ServerAdapter> {
  const runtime = hints ?? detectRuntime();

  if (runtime.hasVtz) {
    const { createVtzAdapter } = await import('./vtz-adapter');
    return createVtzAdapter();
  }

  if (runtime.hasBun) {
    const { createBunAdapter } = await import('./bun-adapter');
    return createBunAdapter();
  }

  throw new Error(
    'No supported server runtime detected. Vertz requires Bun or vtz to use app.listen().',
  );
}
```

**Changes from v1:**
- Uses `await import()` instead of `require()` (ESM-first, strict TypeScript compatible)
- Uses `__vtz_runtime` instead of `__vertz_fs` (explicit runtime identity marker, not implementation side-effect)

### Runtime Identity Marker (Rust)

Add a single line to the vtz runtime bootstrap JS:

```js
// In native/vtz/src/runtime/js_runtime.rs bootstrap
globalThis.__vtz_runtime = true;
```

This is a deliberate, stable contract for runtime detection. Not tied to any specific op module.

### HMR — No changes needed

The vtz compiler already strips `import.meta.hot` lines during post-processing (`strip_import_meta_hot` in `pipeline.rs`). The vtz dev server handles HMR via its own WebSocket protocol (`HmrMessage::Update`, `HmrMessage::FullReload`, `HmrMessage::CssUpdate`). Client entry files that call `import.meta.hot.accept()` are safe — the compiler removes these lines when building for vtz.

The Bun plugin (`packages/ui-server/src/bun-plugin/`) that injects `import.meta.hot.accept()` is Bun-specific by design. When running on vtz, the vtz dev server handles module HMR through its own pipeline, not through the Bun plugin. No migration needed.

**Audit:** Reviewed all `import.meta.hot` usage in framework packages. All occurrences are either:
1. Client entry files (`import.meta.hot.accept()`) — stripped by vtz compiler
2. Bun plugin code (`packages/ui-server/src/bun-plugin/`) �� Bun-specific by design
3. Template strings in `create-vertz-app` — generates client entry files with the same pattern

No conditional runtime checks on `import.meta.hot` that would affect non-HMR behavior.

### `bun-types` Removal

Remove `"types": ["bun-types"]` from tsconfig.json in all framework packages that no longer use any Bun-specific APIs after migration. Packages that still legitimately use Bun APIs (e.g., the Bun adapter, Bun plugins) retain `bun-types`.

For packages that need both Bun and vtz compatibility, Bun APIs are accessed via dynamic `import()` or conditional `typeof Bun !== 'undefined'` checks, keeping the static type surface clean.

## Manifesto Alignment

- **"If it builds, it works"** — Replacing runtime-specific APIs with cross-runtime Node.js APIs means the same code builds and runs on both Bun and vtz. No runtime surprises.
- **"One way to do things"** — `node:fs` is the single file I/O convention. No `Bun.file()` vs `readFile()` ambiguity.
- **"No ceilings"** — This is literally the "if a dependency limits us, we replace it" principle. Removing Bun coupling enables the vtz runtime to be the primary runtime.
- **"AI agents are first-class users"** — LLMs know `node:fs`. They don't know `Bun.file()` as reliably. Standard APIs reduce hallucination.

## Non-Goals

- **Removing Bun support entirely.** The `createBunAdapter()` stays. Vertz supports both runtimes.
- **Implementing `vtz start` (production server command).** That's a separate runtime feature. This issue is about removing Bun-specific calls from framework packages.
- **Migrating test-only files.** Test-only `Bun.file()` / `Bun.write()` / `Bun.spawn()` calls are lower priority and can remain as-is since tests run on Bun. If a test file is touched during migration, we'll migrate it too. Note: the GitHub issue acceptance criteria should be updated to "No `Bun.*` API calls remain in framework package **source files** (excluding test files and example/app packages)."
- **Migrating `Bun.spawn()`.** The vtz runtime's `node:child_process` `spawn()` throws "not yet supported." `Bun.spawn()` migration is blocked until the runtime implements it.
- **Migrating example/app packages** (`packages/landing`, `packages/component-docs`). Focus is framework packages.
- **Migrating intentionally Bun-specific code.** The following use Bun APIs by design and stay Bun-specific:
  - `@vertz/ui-server/src/bun-plugin/` — Bun's plugin system, `import.meta.hot`, `Bun.file().text()`, `Bun.hash()`. The vtz dev server has its own compilation pipeline.
  - `@vertz/mdx/src/plugin.ts` — Bun plugin using `Bun.file().text()` in `build.onLoad`. Vtz has its own MDX handling via the module loader.
  - `@vertz/ui-server/src/compiler/native-compiler.ts` — `Bun.Transpiler` fallback for when native compiler binary is unavailable. On vtz, the native compiler is always available (same binary).
  - `@vertz/ui-server/src/compiler/library-plugin.ts` — `Bun.Transpiler` for excluded files in Bun library builds.
  - `@vertz/core/src/app/bun-adapter.ts` — The Bun adapter itself.
  - `@vertz/integration-tests/src/runtime-adapters/bun.ts` — Bun-specific integration test adapter.
  - `@vertz/cli/src/production-build/ui-build-pipeline.ts` — Uses `Bun.build()` for production bundling. Vtz will have its own build pipeline.
- **WebSocket server abstraction.** The `ServerAdapter` interface doesn't include WebSocket support. `@vertz/server`'s access-event-broadcaster uses Bun-specific WebSocket types. This is a separate concern for a future issue.

## Unknowns

1. ~~**Does `Deno.serve` work in the vtz runtime?**~~ **Resolved: No.** The vtz runtime only includes `deno_core`, not `deno_http`/`deno_net`. `Deno.serve` does not exist. The `node:http` synthetic module's `createServer` is dead code for HTTP serving. Phase 1 implements `op_http_serve` as a native op.

2. **`Bun.file()` as a Response body.** Some code does `return new Response(Bun.file(path))` which streams the file efficiently. The `node:fs` equivalent (`readFileSync`) reads the entire file into memory. **Resolution: Acceptable for framework packages which serve small files (HTML, JSON, fonts). For `@vertz/cli` `serve-shared.ts` which serves arbitrary static files, consider `createReadStream` wrapped in `ReadableStream` to avoid loading large files into memory.**

## Type Flow Map

No new generics introduced. The `ServerAdapter` interface is unchanged. `createVtzAdapter()` returns `ServerAdapter` — same type contract as `createBunAdapter()`.

Note: `detectAdapter()` changes from sync to async (returns `Promise<ServerAdapter>`) due to `await import()`. The `app.listen()` caller is already async so this is a compatible change.

## E2E Acceptance Test

```ts
// After migration, this works on vtz runtime:
import { readFile, writeFile, stat } from 'node:fs/promises';

// File I/O — no Bun APIs
const content = await readFile('test.txt', 'utf-8');
await writeFile('out.txt', content);
const { size } = await stat('out.txt');
expect(size).toBeGreaterThan(0);

// HTTP server — adapter auto-detects runtime
import { createApp } from '@vertz/core';
const app = createApp({ entities: [] });
const handle = await app.listen(0); // port 0 = OS-assigned
expect(handle.port).toBeGreaterThan(0);
await handle.close();

// @ts-expect-error — Bun.file is not available when bun-types is removed
Bun.file('test.txt');
```

## Affected Packages & Migration Map

### In-scope: Replace with cross-runtime APIs

| Package | File | Bun API | Replacement | Phase |
|---------|------|---------|-------------|-------|
| `@vertz/core` | `src/app/bun-adapter.ts` | `Bun.serve()` | Keep; add `vtz-adapter.ts`; update `detect-adapter.ts` | 1 |
| `@vertz/core` | `src/app/detect-adapter.ts` | `Bun` in globalThis | Add vtz detection, dynamic imports | 1 |
| `@vertz/docs` | `src/generator/build-pipeline.ts` | `Bun.file().text()`, `Bun.write()` | `readFile()`, `writeFile()` from `node:fs/promises` | 2 |
| `@vertz/docs` | `src/dev/docs-dev-server.ts` | `Bun.serve()`, `Bun.file()` | `node:http` + `readFileSync()` (or vtz adapter) | 2 |
| `@vertz/docs` | `src/cli/init.ts` | `Bun.write()` x3 | `writeFile()` from `node:fs/promises` | 2 |
| `@vertz/ui-server` | `src/google-fonts-resolver.ts` | `Bun.file().size` | `stat().size` from `node:fs/promises` | 2 |
| `@vertz/cli` | `src/commands/serve-shared.ts` | `Bun.serve()` x3, `Bun.file()` x2 | vtz adapter for serve; `readFile`/`readFileSync` for files | 2 |
| Various | `tsconfig.json` | `bun-types` | Remove from migrated packages | 3 |

### Intentionally Bun-specific (no migration)

| Package | File | Bun API | Why it stays |
|---------|------|---------|-------------|
| `@vertz/core` | `src/app/bun-adapter.ts` | `Bun.serve()` | The Bun adapter itself |
| `@vertz/ui-server` | `src/bun-plugin/*.ts` | `import.meta.hot`, `Bun.file()`, `Bun.hash()` | Bun plugin system; vtz has own pipeline |
| `@vertz/ui-server` | `src/compiler/native-compiler.ts` | `Bun.Transpiler` | Fallback only; vtz has native compiler |
| `@vertz/ui-server` | `src/compiler/library-plugin.ts` | `Bun.Transpiler` | Bun library build path |
| `@vertz/mdx` | `src/plugin.ts` | `Bun.file().text()` | Bun plugin; vtz has own MDX handling |
| `@vertz/cli` | `src/production-build/ui-build-pipeline.ts` | `Bun.build()` x3 | Production bundler; vtz will have own |
| `@vertz/server` | `src/auth/access-event-broadcaster.ts` | Bun WebSocket types | WebSocket abstraction is a separate issue |
| `@vertz/integration-tests` | `src/runtime-adapters/bun.ts` | `Bun.serve()` | Bun-specific test adapter |
| Various test files | `*.test.ts`, `test-compiler-plugin.ts` | `Bun.file()`, `Bun.write()` | Tests run on Bun |

### Out of scope (blocked)

| Package | File | Bun API | Blocker |
|---------|------|---------|---------|
| `@vertz/docs` | `src/generator/build-pipeline.ts` | `Bun.spawn()` (pagefind) | Runtime `spawn()` not implemented |
| `@vertz/landing` | `scripts/dev-all.ts` | `Bun.spawn()` | Runtime `spawn()` not implemented |

## Implementation Phases

### Phase 1: vtz HTTP Serve Op + Server Adapter + Runtime Marker (Rust + TS)

**Rust work:**
1. Add `globalThis.__vtz_runtime = true` to bootstrap JS in `js_runtime.rs`
2. Implement `op_http_serve(port, hostname, handler)` in `native/vtz/src/runtime/ops/`:
   - Spawns an Axum HTTP server on the given port
   - Converts incoming HTTP requests to Web `Request` objects
   - Calls the JS fetch handler
   - Converts the Web `Response` back to HTTP
   - Returns `{ port, hostname }` (actual bound port for port=0)
3. Implement `op_http_serve_close(server_id)` to shut down the server
4. Tests: Rust integration tests for the ops

**TypeScript work:**
5. Create `packages/core/src/app/vtz-adapter.ts` using the new ops
6. Update `packages/core/src/app/detect-adapter.ts` with vtz detection + dynamic imports
7. Tests: adapter creates server, handles request/response, auto-detects runtime

### Phase 2: File I/O + Server Migration (TS only)

1. `packages/docs/src/generator/build-pipeline.ts` — replace `Bun.file()`, `Bun.write()`
2. `packages/docs/src/cli/init.ts` — replace `Bun.write()` x3
3. `packages/docs/src/dev/docs-dev-server.ts` — replace `Bun.serve()`, `Bun.file()`
4. `packages/ui-server/src/google-fonts-resolver.ts` — replace `Bun.file().size`
5. `packages/cli/src/commands/serve-shared.ts` — replace `Bun.serve()`, `Bun.file()` (use `readFileSync` for small assets; consider `createReadStream` for arbitrary static files)
6. Tests: verify build pipeline, fonts resolver, docs dev server, CLI serve still work

### Phase 3: bun-types Cleanup (TS only)

1. Remove `"types": ["bun-types"]` from tsconfigs of migrated packages
2. Verify typecheck passes without bun-types
3. Add vtz runtime type declarations if needed (for `__vtz_runtime`, ops types)
4. Run full quality gates across all packages

## Review Sign-offs

### DX Review — Approved
- Finding 1 (should-fix): Migration map incomplete — **addressed** in Rev 2 (expanded table)
- Finding 2 (nit): readFileSync in Response body — **addressed** (added note about streaming)
- Finding 3 (nit): require() vs import() — **addressed** (changed to `await import()`)
- Finding 4 (nit): __vertz_fs fragile marker — **addressed** (changed to `__vtz_runtime`)

### Product/Scope Review — Changes Requested
- Finding 1 (should-fix): @vertz/cli missing from map — **addressed** (added to Phase 2)
- Finding 2 (should-fix): Issue criteria vs non-goals — **addressed** (noted in Non-Goals)
- Recommendation: streaming for @vertz/cli — **addressed** (noted in Phase 2 and Unknown #2)
- Recommendation: import.meta.hot audit — **addressed** (added audit results in HMR section)

### Technical Review — Changes Requested
- Finding 1 (blocker): Deno.serve doesn't exist — **addressed** (Phase 1 redesigned around native op)
- Finding 2: Adapter code won't work — **addressed** (new adapter uses op_http_serve)
- Finding 3: Migration map incomplete — **addressed** (expanded both tables)
- Finding 4: node:fs is solid — confirmed, no changes needed
- Finding 5: Binary response corruption — **addressed** (fetch-handler op avoids node:http entirely)
- Finding 6: Runtime marker fragile — **addressed** (explicit `__vtz_runtime` marker)
- Finding 7: No WebSocket support — acknowledged in Non-Goals
- Finding 8: address() returns port 0 — **addressed** (op returns actual bound port)
- Finding 9: Bun.Transpiler undocumented — **addressed** (added to intentionally-Bun table)
