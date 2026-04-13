# Design: vtz Node.js Compatibility Ops (#2521)

> **Rev 2** — Addresses DX, Product/Scope, and Technical review feedback.

## Summary

The `vtz` runtime is missing several Node.js compatibility ops, causing ~100 test failures across 8 packages. This design doc covers implementing the missing ops in `native/vtz/src/runtime/` to reach feature parity for the affected test suites.

## Related Work

- **#2497** (Replace Bun APIs) — **CLOSED**. Removed `Bun.serve()`/`Bun.file()` from production code. However, 7 test files in `packages/server/src/auth/` still use `Bun.serve()` for mock servers. Those tests should be migrated separately — **not shimmed here** (see Non-Goals).
- **#2496** (Replace bun:sqlite) — Part of the same "decouple from Bun" initiative.
- **#2531** (Resolve optional platform-specific deps) — Recently merged. Relevant to esbuild binary resolution.

## API Surface

These are Node.js APIs that user code and framework internals expect to work. The contract is Node.js compatibility — developers write standard Node.js code and it runs on vtz.

### 1. `node:crypto` — generateKeyPairSync

```typescript
import { generateKeyPairSync, createPrivateKey, createPublicKey } from 'node:crypto';

// RSA key pair
const rsaKeys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
// rsaKeys.publicKey  → PEM string
// rsaKeys.privateKey → PEM string

// EC key pair
const ecKeys = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// KeyObject wrappers
const privKey = createPrivateKey(rsaKeys.privateKey);
const pubKey = createPublicKey(rsaKeys.publicKey);
```

**Supported key types:** `rsa` and `ec` (P-256 only). All other types (`ed25519`, `dsa`, etc.) throw `Error('Unsupported key type: <type>')`.

**Implementation:**

- **RSA:** New `op_crypto_generate_keypair` Rust op using the `rsa` crate (v0.9, already in Cargo.toml). `RsaPrivateKey::new(&mut OsRng, modulus_length)` generates the key. `EncodePrivateKey::to_pkcs8_pem()` and `EncodePublicKey::to_public_key_pem()` produce PEM strings (traits from `pkcs8` crate, available as transitive dep from `rsa`).
- **EC P-256:** Add `p256` crate as a direct dependency. `p256::SecretKey::random(&mut OsRng)` generates the key. `EncodePrivateKey::to_pkcs8_pem()` and `EncodablePublicKey::to_public_key_pem()` produce PEM. This avoids manual ASN.1/SPKI encoding that `ring` would require.
- **Op signature:** Accepts a serde struct `{ type: String, modulus_length: Option<u32>, named_curve: Option<String> }`. Returns `{ publicKey: String, privateKey: String }` (PEM strings).
- **JS shim fix:** The existing JS shim at module_loader.rs:2543-2555 must be updated to forward the full options object (currently only passes `type` and `modulusLength`, dropping `namedCurve`).
- **Event loop blocking:** RSA-2048 key generation takes 50-200ms. This is intentional and matches Node.js `generateKeyPairSync` semantics (synchronous = blocking).

### 2. `process.stdout` / `process.stderr` / `process.stdin` — Stream objects

```typescript
// Tests expect writable streams:
process.stdout.isTTY   // boolean
process.stdout.write(s) // returns boolean (NO newline appended)
process.stdout.columns  // number
process.stdout.rows     // number
process.stderr.isTTY    // boolean
process.stderr.write(s) // returns boolean

// Tests expect readable stream:
process.stdin.isTTY     // boolean
process.stdin.isRaw     // boolean
process.stdin.setRawMode(mode) // no-op, returns this
process.stdin.on(event, cb)    // no-op, returns this
process.stdin.resume()         // no-op
process.stdin.pause()          // no-op

// Spying must work (both patterns):
const spy = spyOn(process.stdout, 'write');
process.stdout.write = customFn; // direct reassignment
```

**Implementation:**

- Add `op_is_tty(fd: u32)` Rust op in `process.rs` — calls `libc::isatty(fd)`.
- Add `op_write_stdout(data: &str)` / `op_write_stderr(data: &str)` ops — writes raw bytes to fd 1/2 via `std::io::Write`, no newline appended. This replaces the current `console.log` wrapper which incorrectly appends newlines.
- Reuse the existing `node:tty` `WriteStream` class (module_loader.rs:1646-1652) for `process.stdout` and `process.stderr`. This ensures `process.stdout instanceof WriteStream` works.
- `WriteStream.write()` delegates to `op_write_stdout`/`op_write_stderr` instead of `console.log`.
- `process.stdin` is a `ReadStream`-like object with `isTTY`, `isRaw`, `setRawMode()` (no-op), `on()`, `once()`, `removeListener()`, `resume()`, `pause()` — all no-ops returning `this`.
- **Spyability contract:** `write` must be an own property on the instance (not a prototype method) so that both `spyOn(process.stdout, 'write')` and direct `process.stdout.write = fn` work.

### 3. `esbuild.transformSync` — JSX fallback transpiler

```typescript
import { transformSync } from 'esbuild';

const { code } = transformSync(source, {
  loader: 'tsx',
  jsx: 'automatic',
  jsxImportSource: '@vertz/ui',
});
```

**Implementation:** New Rust op `op_esbuild_transform_sync` that shells out to the esbuild CLI binary via `std::process::Command`.

**CLI invocation:** Pipe source via stdin:
```
echo $SOURCE | esbuild --loader=tsx --jsx=automatic --jsx-import-source=@vertz/ui --bundle=false
```

**Binary resolution order:**
1. `node_modules/.bin/esbuild` (handles symlinks to platform-specific binary)
2. `node_modules/@esbuild/{platform}-{arch}/bin/esbuild` (direct platform binary, post-#2531)
3. `which esbuild` (system-installed fallback)

**Error handling:** If esbuild binary not found at any path, throw `Error('esbuild binary not found. Ensure dependencies are installed (vtz install).')`.

### 4. `require()` / `createRequire()` in ESM context

```typescript
// createRequire from node:module
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const mod = require('./some-cjs-module');
```

**Implementation:** `createRequire` already exists in the `node:module` shim (module_loader.rs:1358-1370). The issue is likely that `require()` isn't available as a global in ESM modules. Fix: ensure the CJS bootstrap always exposes a `globalThis.require` function scoped to the project root.

### 5. ESM interop for CJS npm packages

```typescript
// These named imports fail from CJS packages:
import { Project, SyntaxKind, Node } from 'ts-morph';
import sharp from 'sharp';
import { parse } from 'yaml';
import inflate from 'tiny-inflate';
```

**Pre-investigation findings:**

| Package | CJS Pattern | Named Export Count | Entry |
|---------|-------------|-------------------|-------|
| ts-morph | `exports.X = Y;` (direct assignment) | 100+ | dist/ts-morph.js |
| yaml | `exports.X = Y;` (direct assignment) | 20 | dist/index.js |
| sharp | `module.exports = Class` (single default) | 0 (default only) | lib/index.js |
| tiny-inflate | `module.exports = function` (single default) | 0 (default only) | index.js |

**None** use dead-code annotations, `Object.defineProperty`, or TypeScript `void 0` patterns.

The `exports.X = Y` pattern IS handled by `extract_cjs_named_exports` (module_loader.rs:940-956). Possible failure causes:
- ts-morph's large bundled file may also contain `module.exports = ...` assignments (causing the parser to take the "single assignment" path instead of the "exports.X" path)
- Entry point resolution may be wrong (package.json `exports` field not being consulted)
- `sharp` and `tiny-inflate` use `module.exports = X` which produces `export default` but the import expects default export — the wrapper should handle this already

**Implementation:** Inspect and debug the actual failure at runtime during phase implementation. Likely fixes:
1. Ensure `exports.X = Y` parsing runs even when `module.exports = ...` also appears (ts-morph may have both)
2. Verify entry point resolution respects package.json `exports` field
3. Verify `export default __cjs_exports` works for single-function/class exports

### 6. `node:fs` gaps

```typescript
import { accessSync, constants } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';

// accessSync — check if file is readable/writable
accessSync('/path/to/file', constants.R_OK);

// mkdtemp — async version (mkdtempSync already exists in Rust)
const dir = await mkdtemp('/tmp/prefix-');

// watch — file system watcher (minimal for tests)
const watcher = watch('./src', { recursive: true }, (event, filename) => { ... });
watcher.close();
```

**Implementation:**

- `accessSync`: New `op_fs_access_sync(path, mode)` op using `std::fs::metadata` + Unix permission checks.
- `mkdtemp` (async): JS-level shim wrapping existing `op_fs_mkdtemp_sync` op.
- `fs.watch()`: JS-level polling shim using `op_fs_stat_sync` on a `setInterval` timer. Not native-performance, but sufficient for the 3 tests that need it. Emits `'change'` events only (`'rename'` not supported). Returns `FSWatcher` with `.close()`.
- `fs.constants`: Export `F_OK=0, R_OK=4, W_OK=2, X_OK=1`.

## Manifesto Alignment

### Principle 8: No ceilings
> "If the runtime is too slow, we build a faster one."

These gaps are ceilings preventing the vtz runtime from running the framework's own test suite. Fixing them removes the ceiling.

### Principle 1: If it builds, it works

Node.js compatibility means code that imports `node:crypto` or `node:fs` works the same way across runtimes. Developers shouldn't need runtime-specific conditionals.

### Principle 2: One way to do things

We don't want `if (typeof Bun !== 'undefined')` branches in framework code. The Bun shim is excluded from this design (Non-Goal) — the 6 Bun.serve() test failures should be resolved by migrating tests to runtime-agnostic patterns.

### Tradeoffs

- **Shelling out to esbuild** — Slower than a native binding but avoids the complexity of NAPI support. Acceptable because esbuild is only a fallback path (native compiler is primary).
- **`p256` crate for EC keys** — Adds a direct dependency but provides clean PKCS#8/SPKI PEM encoding. Preferred over manual ASN.1 construction with `ring`.
- **process.stdout shim** — Not a real fd-backed stream with backpressure, but sufficient for TUI testing (write + isTTY + spy-ability). Raw stdout write via Rust op ensures no newline appended.
- **Polling fs.watch()** — Not native-performance, but only 3 tests need it. Using `notify` crate would require resource lifecycle management (OpState storage, event channels) which is disproportionate to the value.

## Non-Goals

- **Full NAPI support** — Loading arbitrary `.node` native modules is out of scope.
- **Bun global shim** — The 6 `Bun.serve()` test failures should be resolved by migrating those tests to runtime-agnostic HTTP server patterns (follow-up issue). This avoids building throwaway compatibility code.
- **`node:http.createServer()`** — Not needed by any failing tests. Out of scope.
- **File descriptor operations** — `fs.open()`, `fs.read()` on fds, `fs.close()` are not needed.
- **`fs.watch` rename events** — Only `'change'` events supported. `'rename'` is not needed by the 3 failing tests.
- **Streaming process I/O** — `process.stdout` won't support piping, backpressure, or real file descriptor wrapping.
- **Full Bun API compatibility** — Strategic direction is to eliminate Bun coupling, not shim it.

## Unknowns

1. **ts-morph ESM interop root cause** — The `exports.X = Y` pattern is handled by `extract_cjs_named_exports`, but the large bundled file may trigger edge cases (e.g., multiple `module.exports =` assignments causing the parser to bail). Resolution: debug at runtime during Phase 4 with diagnostic logging.
2. **esbuild stdin mode flags** — Need to verify exact CLI flags for transform-only (no bundling) mode. Resolution: test during Phase 5 implementation.

## POC Results

Pre-investigation of CJS export patterns completed (see ESM interop section above). No further POC needed — the JS shims already exist and call the ops; this is filling in the Rust implementations.

## Type Flow Map

N/A — this is Rust runtime ops, not TypeScript generic type flow. The TypeScript types are provided by `@types/node` and are not affected by this change.

## E2E Acceptance Test

After all phases, the following must pass with zero failures attributed to the ops in this issue:

```bash
# esbuild — 42 failures resolved (Phase 1)
vtz test packages/ui-server/
vtz test packages/build/

# ESM interop — 36 failures resolved (Phase 2)
vtz test packages/compiler/
vtz test packages/codegen/
vtz test packages/docs/
vtz test packages/theme-shadcn/

# Process streams — 29 failures resolved (Phase 3)
vtz test packages/tui/

# Crypto — 27 failures resolved (Phase 4)
vtz test packages/server/src/auth/
vtz test packages/db/

# CJS require — 7 failures resolved (Phase 5)
vtz test packages/test/

# node:fs — 3 failures resolved (Phase 6)
vtz test packages/codegen/
vtz test packages/ui-canvas/
```

**Out of scope (6 failures):** `Bun.serve()` in `packages/server/src/auth/` test files — resolved by test migration, not this issue.

The full quality gate must pass:
```bash
vtz test && vtz run typecheck && vtz run lint
cd native && cargo test --all && cargo clippy --all-targets --release -- -D warnings && cargo fmt --all -- --check
```

## Phases (ordered by impact)

### Phase 1: esbuild shim (42 failures)
Highest failure count. Implementation is straightforward (shell out to CLI binary).

- Add `op_esbuild_transform_sync` op in a new `native/vtz/src/runtime/ops/esbuild.rs`
- Binary resolution: `node_modules/.bin/esbuild` → `node_modules/@esbuild/{platform}-{arch}/bin/esbuild` → `which esbuild`
- Stdin-based transform: pipe source, read stdout
- Wire into `esbuild` module shim in module_loader.rs
- User-friendly error when binary not found
- Rust unit tests + JS integration test

### Phase 2: ESM interop improvements (36 failures)
Second highest impact. Architecturally important for long-term CJS compat.

- Debug ts-morph, yaml, sharp, tiny-inflate import failures at runtime
- Fix `extract_cjs_named_exports` edge cases (e.g., mixed `module.exports =` and `exports.X =` patterns)
- Verify package.json `exports` field resolution for CJS entry points
- Ensure `export default __cjs_exports` works for single-function/class CJS modules
- Rust unit tests for new parser patterns

### Phase 3: Process streams (29 failures)
- Add `op_is_tty(fd)`, `op_write_stdout(data)`, `op_write_stderr(data)` ops in `process.rs`
- Upgrade `process.stdout`/`process.stderr` to `WriteStream` instances (reuse node:tty class)
- `write()` delegates to Rust ops (no newline append)
- `write` is an own instance property (spyable + reassignable)
- Add `process.stdin` with `isTTY`, `isRaw`, `setRawMode()`, `on()`, `pause()`, `resume()`
- Acceptance: `spyOn(process.stdout, 'write')` works, direct `.write` reassignment works

### Phase 4: Crypto key generation (27 failures)
- Add `p256` crate to Cargo.toml
- Implement `op_crypto_generate_keypair` in `crypto.rs` accepting serde struct `{ type, modulus_length, named_curve }`
- RSA via `rsa` crate: `RsaPrivateKey::new()` + `to_pkcs8_pem()` / `to_public_key_pem()`
- EC P-256 via `p256` crate: `SecretKey::random()` + PEM encoding via `pkcs8` traits
- Fix JS shim to forward full options (type, modulusLength, namedCurve)
- Validate key type — throw clear error for unsupported types
- Rust unit tests for both RSA and EC

### Phase 5: CJS require() in ESM (7 failures)
- Ensure `require()` is available in ESM module scope via `globalThis.require`
- Verify `createRequire(import.meta.url)` works end-to-end
- Handle `require('bun:test')` → map to vtz test primitives

### Phase 6: node:fs gaps (3 failures)
Smallest bucket. Straightforward additions.

- Add `op_fs_access_sync(path, mode)` op in `fs.rs`
- Add `fs.constants` (F_OK, R_OK, W_OK, X_OK) to node:fs shim
- Add `mkdtemp` async shim (wrapping existing `op_fs_mkdtemp_sync`)
- Add `fs.watch()` JS polling shim using `op_fs_stat_sync` + `setInterval`
- `FSWatcher` with `.close()` that clears the interval
