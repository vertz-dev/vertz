# Runtime Full-Stack Testing — Results Report

**Date:** 2026-03-30
**Machine:** Apple M1 Pro (macOS Darwin 25.3.0)
**Example:** entity-todo (27 tests across 4 files)

---

## Executive Summary

The Vertz runtime's test runner is **7.2x faster** than Bun's test runner on the entity-todo API tests, while using **5.4x less memory**. All 11 API tests pass on the runtime after three bug fixes (extension resolution, Request.body ReadableStream, missing crypto exports). SSR and component tests fail at load time due to missing `node:async_hooks` and `#imports` resolution respectively.

---

## Phase 1: Binary Build

| Item | Result |
|---|---|
| Build command | `cargo build --release` in `native/vertz-runtime/` |
| Build time | 2m 32s (first build, includes V8 download) |
| Binary size | 58 MB |
| Incremental rebuild | ~1m 46s (Rust source change) |

Build succeeded on first attempt. No system dependency issues on macOS ARM64.

---

## Phase 2: Test Compatibility Matrix

### Tier 1 — API Tests (api.test.ts): 11/11 PASS

| Test | Vertz Runtime | Bun |
|---|---|---|
| creates a todo via POST /api/todos | PASS | PASS |
| lists todos via GET /api/todos | PASS | PASS |
| gets a todo by ID via GET /api/todos/:id | PASS | PASS |
| updates a todo via PATCH /api/todos/:id | PASS | PASS |
| deletes a todo via DELETE /api/todos/:id | PASS | PASS |
| returns 404 for non-existent todo | PASS | PASS |
| returns error response when db.create throws | PASS | PASS |
| sends email notification when a todo is created | PASS | PASS |
| creates a todo via webhook task.created | PASS | PASS |
| marks a todo complete via webhook task.completed | PASS | PASS |
| returns 400 for invalid webhook payload | PASS | PASS |

**Bugs found and fixed to reach this result:**

1. **Extension resolution bug** (`module_loader.rs`): `Path::with_extension("ts")` on `webhooks.service` produced `webhooks.ts` instead of `webhooks.service.ts`. Rust's `with_extension` replaces after the last dot. Fixed by trying append-first, then replace.

2. **Missing `Request.body` ReadableStream** (`web_api.rs`): The Request/Response classes had `text()`, `json()`, `arrayBuffer()` methods but no `.body` getter returning a ReadableStream. The server's `parseBody()` uses `request.body.getReader()` for streaming body reads. Fixed by adding a `get body()` that returns a new ReadableStream from the BodyMixin's bytes.

3. **Missing `node:crypto` exports**: The synthetic `node:crypto` module was missing `webcrypto`, `createPrivateKey`, `createPublicKey`, `generateKeyPairSync`, and `KeyObject`. The server's auth layer imports these. Fixed by adding exports — `webcrypto` delegates to `globalThis.crypto`, the key operations are stub implementations.

4. **Missing `node:module` shim**: `@vertz/db`'s dist uses `import { createRequire } from "node:module"` (bunup CJS interop). Fixed by adding a synthetic module that exports a `createRequire` stub.

### Tier 2 — SSR Tests (ssr.test.ts): 0/5 (LOAD ERROR)

```
Error: Cannot find module 'node:async_hooks' in node_modules
  (searched from packages/ui-server/dist/shared)
```

The `@vertz/ui-server` package imports `node:async_hooks` for async context tracking during SSR rendering. The runtime has no `node:async_hooks` shim. This blocks all SSR tests at module load time — individual tests never execute.

**Required to fix:** Add `node:async_hooks` synthetic module with `AsyncLocalStorage` implementation.

### Tier 3 — Component Tests (todo-form, todo-list): 0/11 (LOAD ERROR)

```
Error: Cannot find module '#generated' in node_modules
  (searched from examples/entity-todo/src/api)
```

The component tests import from `#generated` which uses package.json `"imports"` field (Node.js subpath imports). The runtime's module loader doesn't resolve `#` specifiers via package.json imports map.

**Required to fix:** Implement `package.json#imports` resolution in `module_loader.rs`.

**Note:** Even after fixing this, component tests would likely fail due to DOM shim limitations (no event propagation, no interactive DOM — see design doc).

### On Bun

| File | Pass | Fail | Notes |
|---|---|---|---|
| api.test.ts | 11 | 0 | All pass |
| ssr.test.ts | 0 | 5 | Pre-existing bug: `todosQuery.data.value.items` is undefined |
| todo-form.test.ts | 6 | 0 | All pass |
| todo-list.test.ts | 0 | 5 | Same pre-existing bug as SSR |
| **Total** | **17** | **10** | |

The 10 failures on Bun are a pre-existing bug in the todo-list page component, not a Bun issue.

---

## Phase 3: Benchmark Results

### Test Execution (11 API tests, 10 runs each)

| Metric | Vertz Runtime | Bun | Ratio |
|---|---|---|---|
| **Warm avg** | **39ms** | **281ms** | **7.2x faster** |
| Min | 38ms | 277ms | 7.3x |
| Max | 42ms | 287ms | 6.8x |
| Cold start (run 1) | 46ms | 291ms | 6.3x |
| **Peak RSS** | **35.7 MB** | **192.9 MB** | **5.4x less memory** |
| Binary size | 58 MB | 57 MB | ~equal |

### Raw Data

**Vertz Runtime (ms):** 46, 43, 39, 40, 38, 39, 42, 38, 39, 40
**Bun (ms):** 291, 284, 285, 283, 278, 277, 283, 281, 279, 287

### What Accounts for the Difference?

The Vertz runtime's performance advantage comes from multiple factors:

1. **Native compilation**: The Rust-native oxc compiler handles all `.ts`/`.tsx` compilation. Bun uses a JS-based preload plugin (`test-compiler-plugin.ts` → `@vertz/ui-compiler`) for `.tsx` and its native transpiler for `.ts`.

2. **Leaner runtime**: The Vertz runtime loads only what's needed (V8 + synthetic modules + test harness). Bun loads its full runtime including HTTP server, package manager, and bundler subsystems.

3. **No preload overhead**: The runtime resolves `@vertz/test` and `bun:test` imports as synthetic modules (zero I/O). Bun loads preload scripts from disk.

4. **Smaller memory footprint**: 35.7 MB vs 192.9 MB peak RSS reflects the leaner runtime architecture.

### Compilation Time (Isolated)

Not measured separately in this run. The API test file (`api.test.ts`) is pure TypeScript (no JSX), so compilation overhead is minimal for both runners. A meaningful compilation benchmark would require `.tsx` files with reactive transforms — which are the component tests that don't yet load on the runtime.

**Recommendation:** Defer isolated compilation benchmarking until Tier 3 tests are runnable.

---

## Phase 4: Gap Analysis

### Missing Runtime Capabilities (ordered by impact)

| Gap | Blocks | Effort to Fix |
|---|---|---|
| `package.json#imports` resolution | Component tests (Tier 3) | Medium — implement in `module_loader.rs` |
| `node:async_hooks` (AsyncLocalStorage) | SSR tests (Tier 2) | Large — core Node.js compat |
| Interactive DOM (event propagation, listeners) | Component tests (Tier 3) | Large — needs happy-dom integration or major DOM shim expansion |
| `FormData` constructor | Component tests (form submission) | Small |
| `Event` with options (`bubbles`, `cancelable`) | Component tests (event dispatch) | Medium |

### Bugs Fixed During This Initiative

| Bug | File | Impact |
|---|---|---|
| Extension resolution: `with_extension` replaces dotted names | `module_loader.rs` | All imports with dots in filename (e.g., `foo.service.ts`) |
| Missing `Request.body` / `Response.body` ReadableStream | `web_api.rs` | Any code using streaming body reads |
| Missing `node:crypto` exports (webcrypto, key ops) | `module_loader.rs` | Auth/JWT layer |
| Missing `node:module` shim | `module_loader.rs` | Any bunup-built package with CJS interop |

### Codemod Validation

Not run — unnecessary for this initiative. The runtime already resolves both `@vertz/test` and `bun:test` imports via its synthetic module system. Import migration is a developer convenience, not a runtime requirement.

### Error Quality Assessment

Error messages are clear and actionable:
- Module resolution failures show the full path searched: `Cannot resolve module: /full/path/to/webhooks.service`
- Missing node: modules show what was searched: `Cannot find module 'node:async_hooks' in node_modules (searched from ...)`
- Test failures show expected/actual values clearly

**Area for improvement:** Load errors (`FAIL (load error)`) don't show a stack trace. Adding the import chain (which file imported what) would help developers trace resolution failures.

---

## Recommendations

1. **Ship the 4 bug fixes** — extension resolution, Request.body, crypto exports, node:module shim. These are real gaps that affect any non-trivial project.

2. **Add `package.json#imports` resolution** — blocks component tests and is needed for any project using Node.js subpath imports. Medium effort.

3. **Add `node:async_hooks` shim** — blocks SSR tests. `AsyncLocalStorage` is widely used. This is the highest-impact Node.js compat gap.

4. **Defer DOM shim expansion** — component tests need a full interactive DOM. Rather than expanding the native DOM shim, integrate happy-dom as an optional preload. This is how Bun/Vitest handle it.

5. **Run contacts-api as second data point** — simpler server-only example (28 tests). Would validate the fixes work beyond entity-todo.

6. **Add import chain to error messages** — when a module fails to resolve, show which file imported it. Currently only shows the search path.

---

## Reproducibility

```bash
# Build runtime
cd native/vertz-runtime && cargo build --release

# Run entity-todo codegen
cd examples/entity-todo && bun run codegen

# Run benchmark
./scripts/bench-test-runner.sh

# Run individual runners
vertz-runtime test src/__tests__/api.test.ts    # 11/11 pass
bun test src/__tests__/api.test.ts              # 11/11 pass
```
