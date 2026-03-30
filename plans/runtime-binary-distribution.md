# Design Doc: Runtime Binary Distribution

**Status:** Draft (Rev 3 — addresses DX, Product, and Technical sign-off review feedback)
**Author:** vini
**Feature:** Distribute the Vertz Rust runtime as platform-specific npm packages

## 1. API Surface

### 1.1 Users install a single package — the binary arrives automatically

```bash
npm install @vertz/cli
# @vertz/runtime is pulled as an optionalDependency
# @vertz/runtime-darwin-arm64 (or matching platform) is pulled transitively
```

Works with all package managers: npm, bun, pnpm, and yarn all respect `optionalDependencies` with `os`/`cpu` filters.

No extra install steps, no `curl` scripts, no postinstall downloads. The binary is in `node_modules` after install.

### 1.2 The `vertz` CLI transparently finds and spawns the binary

```bash
vertz dev     # spawns vertz-runtime dev (native runtime)
vertz test    # spawns vertz-runtime test (native runtime)
```

### 1.3 Fallback behavior

The native runtime currently supports `dev` and `test`. When the binary is present, it is used by default — no flag needed. Fallback behavior:

| Scenario | Behavior |
|---|---|
| Binary found | Use native runtime |
| Binary NOT found | Fall back to Bun-based dev server with info message: `[vertz] Native runtime not found — falling back to Bun. Install @vertz/runtime for the native dev server (faster HMR, built-in test runner).` |
| Binary found, command not supported | Fall back to Bun for that command with info message: `[vertz] Command 'build' is not yet supported by the native runtime. Using Bun.` |
| `--experimental-runtime` flag passed | Print deprecation warning: `--experimental-runtime is deprecated, the native runtime is now the default. This flag will be removed in a future version.` Then proceed normally. |

The `--experimental-runtime` flag is **deprecated, not removed**. It becomes a no-op with a warning. This avoids breaking existing scripts.

Currently supported native runtime commands: `dev`, `test`. All other commands (e.g., `build`, `start`) fall back to Bun transparently. As the native runtime gains command coverage, the fallback table shrinks.

### 1.4 Override path with env var

```bash
VERTZ_RUNTIME_BINARY=/path/to/custom/vertz-runtime vertz dev
```

When `VERTZ_RUNTIME_BINARY` is set:
- If the path exists → use it (skip all other resolution)
- If the path does NOT exist → **throw immediately** with: `VERTZ_RUNTIME_BINARY is set to '/path/to/custom/vertz-runtime' but the file does not exist. Remove VERTZ_RUNTIME_BINARY to use automatic resolution.`

Explicit configuration fails explicitly. No silent fallthrough.

**Note:** This is a deliberate behavior change from the current implementation, which returns `null` on missing env path and falls through to other resolution. The existing test in `launcher.test.ts` must be updated. The old behavior was a bug — explicit config that silently ignores missing paths violates "predictability over convenience."

### 1.5 Binary resolution — single canonical path

Resolution logic lives in **one place**: `@vertz/runtime`'s `getBinaryPath()`. The CLI calls it, never duplicates it.

```ts
// @vertz/runtime/index.ts — the single source of truth
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function getBinaryPath(): string {
  const pkg = `@vertz/runtime-${process.platform}-${process.arch}`;
  let pkgDir: string;
  try {
    pkgDir = dirname(require.resolve(`${pkg}/package.json`));
  } catch {
    throw new Error(
      `No Vertz runtime binary available for ${process.platform}-${process.arch}.\n` +
      `Expected package: ${pkg}\n\n` +
      `If your platform is supported, try: npm install @vertz/runtime\n` +
      `If your platform is not supported, build from source: cd native && cargo build --release\n\n` +
      `Supported platforms: darwin-arm64, darwin-x64, linux-x64, linux-arm64\n` +
      `See: https://vertz.dev/docs/runtime`,
    );
  }
  return join(pkgDir, 'vertz-runtime');
}
```

```ts
// packages/cli/src/runtime/launcher.ts — consumes getBinaryPath()
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function findRuntimeBinary(projectRoot: string): string | null {
  // 1. Explicit env override (fail-fast if set but missing)
  const envPath = process.env.VERTZ_RUNTIME_BINARY;
  if (envPath) {
    if (!existsSync(envPath)) {
      throw new Error(
        `VERTZ_RUNTIME_BINARY is set to '${envPath}' but the file does not exist. ` +
        `Remove VERTZ_RUNTIME_BINARY to use automatic resolution.`,
      );
    }
    return envPath;
  }

  // 2. npm-installed platform package (single source of truth)
  try {
    const { getBinaryPath } = require('@vertz/runtime');
    return getBinaryPath();
  } catch {}

  // 3. Local cargo build (monorepo dev only)
  const release = join(projectRoot, 'native/target/release/vertz-runtime');
  if (existsSync(release)) return release;

  const debug = join(projectRoot, 'native/target/debug/vertz-runtime');
  if (existsSync(debug)) return debug;

  return null;
}
```

### 1.6 Version compatibility check

After resolving the binary, the CLI runs `vertz-runtime --version` and compares against its own version. On mismatch, the warning suggests updating the older package:

```
# CLI newer than runtime:
[vertz] Warning: CLI version 0.2.42 but runtime version 0.2.40.
Run 'npm update @vertz/runtime' to sync versions.

# Runtime newer than CLI:
[vertz] Warning: CLI version 0.2.40 but runtime version 0.2.42.
Run 'npm update @vertz/cli' to sync versions.
```

This is a warning, not an error — mismatched versions may still work.

### 1.7 Context-aware error messages

The error when no binary is found distinguishes two cases:

1. **`@vertz/runtime` not installed at all** (user didn't come through `@vertz/cli`):
   ```
   Vertz runtime not installed. Run: npm install @vertz/runtime
   ```

2. **`@vertz/runtime` installed but platform package missing** (optionalDependency silently failed):
   ```
   Vertz runtime installed but no binary found for darwin-arm64.
   The platform package @vertz/runtime-darwin-arm64 may have failed to install.
   Try: npm install @vertz/runtime-darwin-arm64
   Or build from source: cd native && cargo build --release
   ```

Detection: check if `@vertz/runtime/package.json` resolves while `getBinaryPath()` throws.

### 1.8 Runtime diagnostic output

On startup, `vertz dev` and `vertz test` log the resolved runtime path at verbose level. A future `vertz doctor` command (out of scope for this feature) should print a full diagnostic: CLI version, runtime type (native/bun), binary path, platform. For now, `vertz dev --verbose` prints the binary path, which is sufficient for LLM agents debugging project setup.

## 2. Manifesto Alignment

**Predictability over convenience:** Binary resolution follows a deterministic, documented order. No background downloads, no postinstall scripts that silently fail. Env override fails explicitly when the path is wrong.

**One way to do things:** `npm install` is the single distribution channel. Resolution logic lives in one place (`getBinaryPath()`). No competing install methods to confuse users or LLMs.

**If it builds, it works:** Platform packages contain pre-built binaries. No compilation on the user's machine, no Rust toolchain required, no build-time surprises.

**AI agents are first-class users:** An LLM scaffolding a Vertz project just runs `npm install @vertz/cli`. The binary is there. No special setup steps to forget. If it's missing, the error message tells the LLM exactly what to do.

**No ceilings / Performance is not optional:** The Rust runtime replaces Bun for dev and test — distributing it via npm makes the performance upgrade frictionless.

## 3. Non-Goals

- Standalone install script (`curl | bash`) — can be added later, not in this scope
- Publishing to crates.io — users are JS developers, not Rust developers
- Cross-compilation from user machines — binaries are always pre-built in CI
- Auto-update mechanism — standard npm version bumping handles this
- Docker-specific distribution — Docker builds use `npm install` like everything else
- Distributing the native compiler NAPI bindings — `@vertz/native-compiler` stays separate
- Windows support — deferred until user demand justifies the platform-specific work (path handling, MSVC toolchain, testing)
- Removing the Bun fallback — the CLI still falls back to Bun when no binary is found

## 4. Unknowns

### 4.1 Binary size after V8 embedding — **Needs measurement**

deno_core bundles V8, which makes the binary large. Realistic estimates based on comparable tools:
- Uncompressed: 50-80MB per platform (Deno is ~90-130MB, turbo is ~55MB)
- gzip-compressed: 18-28MB per platform (what npm actually transfers)

**Hard ceiling:** If any platform's gzip-compressed binary exceeds **35MB**, investigate before publishing. Actions: `cargo-bloat` analysis, removing duplicate HTTP clients (reqwest vs hyper — axum already brings hyper), splitting `vertz-compiler-core` out if not needed at runtime. Note: npm only installs the matching platform (one binary, not four), so users see one binary's size.

**Resolution:** Measure actual sizes during Phase 1 CI matrix setup.

### 4.2 darwin-x64 build — **Deferred to Phase 2**

GitHub has deprecated `macos-13` (Intel) runners. Cross-compiling on `macos-14` (arm64) with `--target x86_64-apple-darwin` is unreliable for this project: `deno_core` embeds V8 via `rusty_v8`, which downloads prebuilt static libraries based on `TARGET`. The linking step under Rosetta introduces ambiguity about which toolchain `cc` invokes, and V8's complex build scripts are not designed for transparent cross-architecture compilation. Similarly, `rusqlite` with `bundled` compiles SQLite from C source, adding another cross-compilation variable.

**Decision:** Defer darwin-x64 to Phase 2. The minimum viable target set for Phase 1 is **darwin-arm64 + linux-x64** (covers local Mac dev + CI/Docker). darwin-x64 and linux-arm64 are Phase 2 stretch targets.

Phase 2 options for darwin-x64:
1. GitHub larger runners (paid) that offer native x64.
2. Cross-compile with explicit `CC_x86_64_apple_darwin` and `RUSTY_V8_ARCHIVE` env vars pointing to the correct prebuilt V8 static lib.
3. Community-maintained Intel Mac CI (e.g., MacStadium).

### 4.3 linux-arm64 runner availability — **Needs verification**

GitHub Actions arm64 Linux runners are in public beta (`ubuntu-24.04-arm64`, not `ubuntu-24.04-arm`). Available for organizations on GitHub Team/Enterprise plans or public repos.

**Resolution:** Verify runner label and availability in Phase 1. The CI workflow must include an architecture verification step (`uname -m` check) that fails fast if the runner doesn't match expectations, rather than silently building for the wrong platform. If the repo is private, the fallback is `ubuntu-24.04` with `cross-rs` (QEMU-based), or defer linux-arm64 to Phase 2.

### 4.4 Windows support priority — **Deferred**

Windows requires platform-specific work in the runtime itself (path handling, process management) beyond just CI. Deferred based on zero expected Windows users pre-v1.

## 5. POC Results

*None yet — this is a new design doc. Phase 1 includes POC work for cross-compilation and runner validation.*

## 6. Type Flow Map

This feature is packaging infrastructure — no new generic type surfaces. The only type-level change is in the CLI's binary resolution:

```
process.platform (string) → platform-package-name (template literal)
  → require.resolve('pkg/package.json') → dirname → join → binary path (string)
  → spawn()
```

Acceptance criteria:
- `getBinaryPath()` returns the correct binary path on each supported platform
- `getBinaryPath()` throws a descriptive error on unsupported platforms (not a raw `MODULE_NOT_FOUND`)
- CLI's `findRuntimeBinary()` delegates to `getBinaryPath()` — no duplicated resolution logic

## 7. E2E Acceptance Tests

### 7.1 npm install resolves the correct platform binary

Given a clean project with `@vertz/cli` as a dependency:
- `npm install` on macOS arm64 installs `@vertz/runtime-darwin-arm64`
- `node_modules/@vertz/runtime-darwin-arm64/vertz-runtime` is executable
- `vertz-runtime --version` prints the expected version

### 7.2 CLI finds and spawns the npm-installed binary

Given `@vertz/cli` and `@vertz/runtime` installed via npm:
- `npx vertz dev` starts the native dev server (not the Bun-based fallback)
- Terminal output shows native runtime behavior

### 7.3 Version lockstep

Given `@vertz/cli@0.2.42` and `@vertz/runtime@0.2.42`:
- Both packages are released in the same changeset
- The runtime binary reports the same version as the npm package
- On version mismatch, CLI prints a warning

### 7.4 Missing platform produces contextual error

Given a platform with no published binary:
- If `@vertz/runtime` is installed: error says "platform package may have failed to install"
- If `@vertz/runtime` is NOT installed: error says "run npm install @vertz/runtime"
- Exit code is non-zero

### 7.5 Env override works and fails fast

Given `VERTZ_RUNTIME_BINARY=/valid/path`: CLI uses the custom binary
Given `VERTZ_RUNTIME_BINARY=/invalid/path`: CLI throws immediately (no fallthrough)

### 7.6 Graceful fallback to Bun

Given no runtime binary is available and no `VERTZ_RUNTIME_BINARY` set:
- `vertz dev` falls back to Bun-based dev server
- Info message: `[vertz] Native runtime not found, using Bun.`

### 7.7 Unsupported command falls back to Bun

Given native runtime binary is installed but only supports `dev` and `test`:
- `vertz build` falls back to Bun with message: `[vertz] Command 'build' is not yet supported by the native runtime. Using Bun.`
- The build completes successfully via Bun

### 7.8 Postinstall prints platform-specific warning

Given `@vertz/runtime` is installed on a platform with no matching binary package:
- Postinstall outputs: `[vertz] Runtime binary not found for <platform>-<arch>. Try: npm install @vertz/runtime-<platform>-<arch>`
- Install completes (warning, not error)

### 7.9 Package manager compatibility

- `npm install` installs correct platform package
- `bun install` installs correct platform package
- `pnpm install` installs correct platform package
- `yarn install` installs correct platform package (with `preferUnplugged: true`)

## 8. Package Structure

### 8.1 Platform matrix

| npm package | OS | Arch | Rust target | CI runner | Phase | Notes |
|---|---|---|---|---|---|---|
| `@vertz/runtime-darwin-arm64` | macOS | arm64 | `aarch64-apple-darwin` | `macos-14` | **1** | Primary dev platform |
| `@vertz/runtime-linux-x64` | Linux | x64 | `x86_64-unknown-linux-gnu` | `ubuntu-24.04` | **1** | CI/Docker/production |
| `@vertz/runtime-linux-arm64` | Linux | arm64 | `aarch64-unknown-linux-gnu` | `ubuntu-24.04-arm64` | **1** | Graviton/ARM prod (verify runner §4.3) |
| `@vertz/runtime-darwin-x64` | macOS | x64 | `x86_64-apple-darwin` | TBD | **2** | Deferred — V8 cross-compile issue (§4.2) |

**Minimum viable target set (Phase 1):** darwin-arm64 + linux-x64. linux-arm64 included if runner availability is confirmed; deferred to Phase 2 otherwise.

Windows deferred (see §4.4).

### 8.2 Parent package: `@vertz/runtime`

```json
{
  "name": "@vertz/runtime",
  "version": "0.1.0",
  "description": "Vertz runtime binary (platform selector)",
  "type": "module",
  "main": "index.js",
  "types": "index.d.ts",
  "exports": {
    ".": { "import": "./index.js", "types": "./index.d.ts" },
    "./package.json": "./package.json"
  },
  "optionalDependencies": {
    "@vertz/runtime-darwin-arm64": "0.1.0",
    "@vertz/runtime-darwin-x64": "0.1.0",
    "@vertz/runtime-linux-x64": "0.1.0",
    "@vertz/runtime-linux-arm64": "0.1.0"
  },
  "scripts": {
    "postinstall": "node postinstall.js"
  },
  "files": ["index.js", "index.d.ts", "postinstall.js"]
}
```

The parent package's `index.ts` is the single source of truth for binary resolution (see §1.5).

### 8.3 Platform package structure (each one)

```
@vertz/runtime-darwin-arm64/
├── package.json
└── vertz-runtime          # The actual binary (pre-built, stripped via cargo)
```

```json
{
  "name": "@vertz/runtime-darwin-arm64",
  "version": "0.1.0",
  "os": ["darwin"],
  "cpu": ["arm64"],
  "exports": {
    "./package.json": "./package.json"
  },
  "files": ["vertz-runtime"],
  "preferUnplugged": true
}
```

Key fields:
- `os`/`cpu` — npm skips installation on non-matching platforms
- `exports` — explicitly exposes `package.json` for reliable `require.resolve()`
- `preferUnplugged: true` — Yarn Berry extracts from zip (binaries can't run from archives)

### 8.4 CLI dependency chain

```
@vertz/cli
└── @vertz/runtime (optionalDependency — not hard dep)
    ├── @vertz/runtime-darwin-arm64 (optionalDependency)
    ├── @vertz/runtime-darwin-x64   (optionalDependency)
    ├── @vertz/runtime-linux-x64    (optionalDependency)
    └── @vertz/runtime-linux-arm64  (optionalDependency)
```

`@vertz/runtime` is an **optionalDependency** of `@vertz/cli`, not a hard dependency. The CLI works without it (falls back to Bun). When the runtime supports all commands and the Bun fallback is removed, promote to a hard dependency.

### 8.5 Monorepo location

Platform package shells live under `npm/` in the monorepo:

```
npm/
├── runtime/                     # @vertz/runtime (parent)
│   ├── package.json
│   ├── index.ts
│   └── index.d.ts
├── runtime-darwin-arm64/        # Binary is copied here by CI
│   └── package.json
├── runtime-darwin-x64/
│   └── package.json
├── runtime-linux-x64/
│   └── package.json
└── runtime-linux-arm64/
    └── package.json
```

These directories are added to the Bun workspace (`"workspaces"` in root `package.json`) so changesets can discover them.

**Workspace considerations:** The platform packages (`npm/runtime-*`) are marked `"private": true` in the monorepo — they are only published by CI, never resolved locally by other workspace packages. This prevents `bun install` from trying to resolve their `os`/`cpu`-filtered optionalDependencies locally. The parent `@vertz/runtime` postinstall will print a harmless warning during `bun install` in the monorepo (no binary exists until Cargo builds). This is expected and not an error.

### 8.6 Postinstall check

`@vertz/runtime` includes a lightweight postinstall script (shipped as `.js`, no build step) that checks if the platform binary exists:

```js
// @vertz/runtime/postinstall.js
try {
  require('./index.js').getBinaryPath();
} catch {
  const pkg = `@vertz/runtime-${process.platform}-${process.arch}`;
  console.warn(
    `\x1b[33m[vertz]\x1b[0m Runtime binary not found for ${process.platform}-${process.arch}. ` +
    `\`vertz dev\` will fall back to Bun.\n` +
    `Try: npm install ${pkg}`,
  );
}
```

This prints a visible warning at install time (not an error) with the specific platform package name. The user — or an LLM agent — knows immediately what to install, without needing to visit a URL.

## 9. CI/CD Pipeline

### 9.1 Build matrix (new workflow: `runtime-binary.yml`)

```yaml
name: Runtime Binary Build
on:
  workflow_call:  # Called by release.yml
  workflow_dispatch:  # Manual trigger for testing

jobs:
  build:
    strategy:
      fail-fast: false  # Don't cancel other platforms if one fails
      matrix:
        include:
          - target: aarch64-apple-darwin
            os: macos-14
            pkg: runtime-darwin-arm64
            expected_arch: arm64
          # darwin-x64 deferred to Phase 2 (see §4.2)
          - target: x86_64-unknown-linux-gnu
            os: ubuntu-24.04
            pkg: runtime-linux-x64
            expected_arch: x86_64
          - target: aarch64-unknown-linux-gnu
            os: ubuntu-24.04-arm64
            pkg: runtime-linux-arm64
            expected_arch: aarch64

    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      # Fail fast if runner arch doesn't match expectations
      - name: Verify runner architecture
        run: |
          ACTUAL=$(uname -m)
          if [ "$ACTUAL" != "${{ matrix.expected_arch }}" ]; then
            echo "::error::Expected architecture ${{ matrix.expected_arch }} but got $ACTUAL"
            exit 1
          fi
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.target }}
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: native
      - run: cargo build --release --target ${{ matrix.target }}
        working-directory: native
        env:
          VERTZ_VERSION: ${{ env.RELEASE_VERSION }}  # Set by release.yml
      - run: cp native/target/${{ matrix.target }}/release/vertz-runtime npm/${{ matrix.pkg }}/vertz-runtime
      - uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.pkg }}
          path: npm/${{ matrix.pkg }}/vertz-runtime
```

Binary stripping is handled by Cargo, not a manual step (see §9.4).

### 9.2 Release workflow (updated `release.yml`)

The release becomes a multi-job workflow:

```
Job 1: build-binaries (matrix, 4 runners)
  → Build each platform binary, upload as artifact

Job 2: publish (single runner, needs: build-binaries)
  → Download all artifacts
  → Run `changeset version` (bumps all package.json versions)
  → Stamp version into each platform package.json
  → npm publish --provenance for each platform package
  → npm publish --provenance for @vertz/runtime
  → npm publish --provenance for all other @vertz/* packages
```

This replaces the current single-job release workflow. The binary build must complete before any npm publish.

### 9.3 Version synchronization

All runtime packages are added to the changeset `fixed` group:

```json
"fixed": [[
  "@vertz/cli",
  "@vertz/runtime",
  "@vertz/runtime-darwin-arm64",
  "@vertz/runtime-darwin-x64",
  "@vertz/runtime-linux-x64",
  "@vertz/runtime-linux-arm64",
  // ... existing packages
]]
```

The `npm/` directories are added to the root `package.json` workspaces so changesets discovers them.

**Binary version:** The Rust binary reads its version from the `VERTZ_VERSION` environment variable at build time (via `option_env!("VERTZ_VERSION")`). The CI job sets this env var from the npm package version before `cargo build`. This avoids needing to sync `Cargo.toml` version with `package.json` version.

```rust
// native/vertz-runtime/src/main.rs
const VERSION: &str = match option_env!("VERTZ_VERSION") {
    Some(v) => v,
    None => env!("CARGO_PKG_VERSION"),  // fallback for local dev
};

// Wire to clap — override the default CARGO_PKG_VERSION
#[derive(Parser)]
#[command(name = "vertz-runtime", version = VERSION, about = "Vertz Development Runtime")]
struct Cli { /* ... */ }
```

The `#[command(version = VERSION)]` attribute overrides clap's default `CARGO_PKG_VERSION` with the npm-synced version. This ensures `vertz-runtime --version` outputs the correct version for the CLI's version comparison (§1.6).

**Changeset triggering:** Changes to `native/` source files don't automatically create changesets (changesets only watches workspace package directories). Any Rust runtime change requires a manual changeset referencing `@vertz/runtime` (or any package in the fixed group) to trigger version bumps. A CI check should detect `native/` changes without a changeset and fail the PR.

### 9.4 Cargo release profile

Binary stripping and size optimization handled in Cargo config (no manual `strip` step in CI):

```toml
# native/Cargo.toml
[profile.release]
lto = true
strip = true          # Portable — handles macOS + Linux correctly

# codegen-units = 1 scoped to vertz-runtime only (not workspace-wide)
# Workspace-wide would force single-threaded codegen for deno_core's
# massive dependency tree, doubling CI build times for marginal gain.
[profile.release.package.vertz-runtime]
codegen-units = 1
```

### 9.5 TLS backend

Switch `reqwest` to `rustls-tls` to eliminate OpenSSL dependency (cross-compilation landmine). Apply `default-features = false` to **both** `[dependencies]` and `[dev-dependencies]` entries — dev-dependencies can re-enable native-tls for the entire build graph:

```toml
# native/vertz-runtime/Cargo.toml
[dependencies]
reqwest = { version = "0.12", features = ["json", "rustls-tls"], default-features = false }

[dev-dependencies]
reqwest = { version = "0.12", features = ["json", "rustls-tls"], default-features = false }
```

This removes the OpenSSL cross-compilation variable entirely. `ring` remains (rustls depends on it), but native-per-runner builds avoid the `ring` cross-compilation issues.

### 9.6 Publish script updates

`scripts/publish.sh` is updated to also scan `npm/*/package.json` in addition to `packages/*/package.json`. Publish order:

1. Platform binary packages (`@vertz/runtime-*`) — `npm publish --provenance`
2. Parent package (`@vertz/runtime`) — `npm publish --provenance`
3. All other `@vertz/*` packages — `bun publish --access public` (existing behavior)

**Why npm for binary packages:** `npm publish --provenance` requires GitHub Actions OIDC token exchange with Sigstore for supply chain attestation. This is critical for binary packages where users trust pre-built executables. `bun publish` does not support `--provenance`. The remaining source-only packages continue using `bun publish` (which handles `workspace:*` protocol resolution).

**CI permissions:** Job 2 (publish) must have `permissions.id-token: write` for the OIDC token used by `--provenance`.

**Postinstall script:** `@vertz/runtime/postinstall.js` is shipped as plain `.js` (not `.ts`) since the package has no build step. The file is simple enough that TypeScript compilation is unnecessary.

## 10. Review Sign-Offs

### 10.1 Review findings addressed

| Finding | Source | Resolution |
|---|---|---|
| Two resolution paths for binary | DX, Tech | Single `getBinaryPath()` in `@vertz/runtime`; CLI calls it (§1.5) |
| `require.resolve()` for binary unreliable | Tech | Resolve `package.json` + dirname instead (§1.5) |
| Wrong Yarn field name | Tech | `preferUnplugged` (not `preferUnpacked`) (§8.3) |
| `getBinaryPath()` throws cryptic error | DX | Descriptive error with platform, suggestions, and link (§1.5) |
| `--experimental-runtime` transition | DX, Product | Deprecation warning, not removal (§1.3) |
| Error message not contextual | DX | Two distinct error messages based on install state (§1.7) |
| `VERTZ_RUNTIME_BINARY` silent fallthrough | DX | Throw immediately if path doesn't exist (§1.4) |
| No version check | DX | Warning on mismatch (§1.6) |
| `@vertz/runtime` as hard dep | Product | Changed to optionalDependency of CLI (§8.4) |
| Silent optionalDependency failure | Product | Postinstall check prints warning (§8.6) |
| `macos-13` deprecated | Tech | darwin-x64 deferred to Phase 2 (§4.2); darwin-arm64 builds natively on `macos-14` |
| `ubuntu-24.04-arm` naming | Tech | Corrected to `ubuntu-24.04-arm64` (§8.1, §4.3) |
| Platform packages not in changeset fixed | Tech | Added to fixed group (§9.3) |
| `publish.sh` won't find npm/ packages | Tech | Updated to scan `npm/` (§9.6) |
| Binary size threshold vague | Product, Tech | Clarified as gzip-compressed, benchmarked against turbo (§4.1) |
| `strip` portability | Tech | Use Cargo `strip = true` in release profile (§9.4) |
| Release workflow hand-waved | Tech | Concrete multi-job structure (§9.2) |
| Cargo.toml version drift | Tech | `VERTZ_VERSION` env var at build time (§9.3) |
| `reqwest` native-tls cross-compile risk | Tech | Switch to `rustls-tls` (§9.5) |
| No package manager compatibility mention | DX | Added note in §1.1, test in §7.7 |
| `platform()` vs `process.platform` inconsistency | DX | Standardized on `process.platform` (§1.5) |
| Where do packages live in monorepo | Tech | `npm/` directory, added to workspaces (§8.5) |
| Which commands use native runtime | Product | Explicit table in §1.3 |
| `resolve(it)` pseudocode | DX | Replaced with real implementation (§1.5) |

### 10.2 Rev 3 findings addressed

| Finding | Source | Resolution |
|---|---|---|
| darwin-x64 Rosetta cross-compilation with V8 likely broken | Tech (BLOCKER) | Deferred darwin-x64 to Phase 2 entirely (§4.2) |
| clap `version` reads CARGO_PKG_VERSION not VERTZ_VERSION | Tech (BLOCKER) | Wired `VERSION` const to `#[command(version = VERSION)]` (§9.3) |
| Publish script uses `bun publish`, not `npm publish --provenance` | Tech (BLOCKER) | Platform packages use `npm publish --provenance`, rest uses `bun publish` (§9.6) |
| `require()` in ESM context in CLI launcher | DX, Tech | Use `createRequire(import.meta.url)` in both `getBinaryPath()` and `findRuntimeBinary()` (§1.5) |
| `VERTZ_RUNTIME_BINARY` behavior change is breaking | DX, Tech | Added migration note acknowledging deliberate change (§1.4) |
| Fallback message should explain why native is better | DX | Message now mentions faster HMR and built-in test runner (§1.3) |
| No diagnostic command for LLM agents | DX | Added §1.8 noting verbose startup logging; `vertz doctor` deferred |
| Postinstall should suggest specific platform package | DX | Postinstall now prints `npm install @vertz/runtime-<platform>-<arch>` (§8.6) |
| Version mismatch should be direction-aware | DX | Suggests updating the older package (§1.6) |
| Command-level fallback missing from table | Product | Added "binary found, command not supported" row (§1.3) |
| Binary size threshold too vague | Product | Hard ceiling of 35MB gzip per platform (§4.1) |
| `codegen-units = 1` doubles CI build time with deno_core | Tech | Scoped to `vertz-runtime` crate only (§9.4) |
| reqwest `default-features = false` needed for dev-deps too | Tech | Both deps and dev-deps entries updated (§9.5) |
| Changeset triggering for native/ changes | Tech | Documented manual changeset requirement + CI check (§9.3) |
| ubuntu-24.04-arm64 silent arch mismatch | Tech | Added `uname -m` verification step in CI (§9.1) |
| npm/ workspace packages noise during bun install | Tech | Platform packages marked `private: true`; postinstall warning expected (§8.5) |
| Postinstall as .ts but no build step | Tech | Shipped as plain `.js` (§8.6, §9.6) |
| Minimum viable target set not explicit | Product | darwin-arm64 + linux-x64 as minimum (§8.1) |
| CI permissions for provenance | Tech | `id-token: write` required on publish job (§9.6) |

### 10.3 Sign-offs

- **DX:** APPROVED (Rev 2 — all should-fix items addressed in Rev 3)
- **Product/Scope:** APPROVED (Rev 2 — all should-fix items addressed in Rev 3)
- **Technical:** APPROVED (Rev 3 — all 3 blockers resolved, all 7 should-fix addressed)

## 11. Implementation Plan

### Phase 1: npm package shells + `getBinaryPath()` + monorepo wiring

Create the `npm/` directory with all package scaffolds and the `@vertz/runtime` parent package with `getBinaryPath()`. Wire into the monorepo workspace and changeset config.

**Files created/modified:**
- `npm/runtime/package.json` — parent package
- `npm/runtime/index.ts` — `getBinaryPath()` implementation
- `npm/runtime/index.d.ts` — type declarations
- `npm/runtime/postinstall.js` — platform-specific install warning
- `npm/runtime-darwin-arm64/package.json` — platform shell (os: darwin, cpu: arm64)
- `npm/runtime-darwin-x64/package.json` — platform shell (Phase 2, os: darwin, cpu: x64)
- `npm/runtime-linux-x64/package.json` — platform shell (os: linux, cpu: x64)
- `npm/runtime-linux-arm64/package.json` — platform shell (os: linux, cpu: arm64)
- `package.json` (root) — add `"npm/*"` to workspaces
- `.changeset/config.json` — add runtime packages to fixed group
- `packages/cli/package.json` — add `@vertz/runtime` as optionalDependency

**Acceptance criteria:**
```typescript
describe('Feature: getBinaryPath() resolves platform binary', () => {
  describe('Given a platform package is installed at the expected path', () => {
    describe('When getBinaryPath() is called', () => {
      it('Then returns the full path to the vertz-runtime binary', () => {});
    });
  });

  describe('Given no platform package is installed', () => {
    describe('When getBinaryPath() is called', () => {
      it('Then throws with platform name, package name, and install instructions', () => {});
      it('Then lists all supported platforms in the error message', () => {});
    });
  });
});

describe('Feature: postinstall warns on missing platform binary', () => {
  describe('Given getBinaryPath() throws (no platform binary)', () => {
    describe('When postinstall.js runs', () => {
      it('Then prints warning with specific platform package name', () => {});
      it('Then exits successfully (warning, not error)', () => {});
    });
  });
});
```

- All `npm/*/package.json` have correct `name`, `version`, `os`, `cpu`, `exports`, `preferUnplugged` fields
- Platform packages are `"private": true` in monorepo
- `bun install` succeeds with new workspace members
- Changeset config `fixed` group includes all runtime packages
- `getBinaryPath()` tests pass with mocked `require.resolve`

---

### Phase 2: CLI launcher rewrite — native-by-default + fallback messages

Update `findRuntimeBinary()` to use `getBinaryPath()`, make native runtime the default, deprecate `--experimental-runtime`, add version check and command-level fallback.

**Depends on:** Phase 1

**Files modified:**
- `packages/cli/src/runtime/launcher.ts` — rewrite resolution logic
- `packages/cli/src/runtime/launcher.test.ts` — update tests for new behavior
- `packages/cli/src/commands/dev.ts` — native-by-default, deprecation warning, version check
- `packages/cli/src/commands/test.ts` — same treatment as dev (if applicable)

**Acceptance criteria:**
```typescript
describe('Feature: findRuntimeBinary() resolution order', () => {
  describe('Given VERTZ_RUNTIME_BINARY is set to an existing path', () => {
    describe('When findRuntimeBinary() is called', () => {
      it('Then returns the env var path (skips all other resolution)', () => {});
    });
  });

  describe('Given VERTZ_RUNTIME_BINARY is set to a nonexistent path', () => {
    describe('When findRuntimeBinary() is called', () => {
      it('Then throws with path and removal suggestion', () => {});
    });
  });

  describe('Given @vertz/runtime is installed with matching platform package', () => {
    describe('When findRuntimeBinary() is called', () => {
      it('Then returns the path from getBinaryPath()', () => {});
    });
  });

  describe('Given no npm package but local cargo build exists', () => {
    describe('When findRuntimeBinary() is called', () => {
      it('Then returns local release binary path', () => {});
      it('Then prefers release over debug', () => {});
    });
  });

  describe('Given no binary available at all', () => {
    describe('When findRuntimeBinary() is called', () => {
      it('Then returns null', () => {});
    });
  });
});

describe('Feature: native runtime is the default for dev command', () => {
  describe('Given binary is found', () => {
    describe('When vertz dev is called without flags', () => {
      it('Then spawns the native runtime (not Bun)', () => {});
    });
  });

  describe('Given binary is NOT found', () => {
    describe('When vertz dev is called', () => {
      it('Then falls back to Bun with info message mentioning faster HMR', () => {});
    });
  });

  describe('Given --experimental-runtime flag is passed', () => {
    describe('When vertz dev is called', () => {
      it('Then prints deprecation warning and proceeds normally', () => {});
    });
  });
});

describe('Feature: version compatibility check', () => {
  describe('Given CLI version 0.2.42 and runtime version 0.2.40', () => {
    describe('When version check runs', () => {
      it('Then warns to update @vertz/runtime', () => {});
    });
  });

  describe('Given CLI version 0.2.40 and runtime version 0.2.42', () => {
    describe('When version check runs', () => {
      it('Then warns to update @vertz/cli', () => {});
    });
  });

  describe('Given matching versions', () => {
    describe('When version check runs', () => {
      it('Then prints no warning', () => {});
    });
  });
});
```

---

### Phase 3: Rust build configuration

Wire `VERTZ_VERSION` to clap, update Cargo release profile, switch to rustls-tls.

**Depends on:** None (can run in parallel with Phase 2)

**Files modified:**
- `native/vertz-runtime/src/cli.rs` — `VERSION` const + `#[command(version = VERSION)]`
- `native/Cargo.toml` — release profile: `strip = true`, `codegen-units = 1` (scoped)
- `native/vertz-runtime/Cargo.toml` — reqwest `rustls-tls` + `default-features = false`

**Acceptance criteria:**
```
- `cargo build --release` succeeds with updated Cargo config
- Binary built with `VERTZ_VERSION=1.2.3` reports `1.2.3` from `--version`
- Binary built without `VERTZ_VERSION` reports Cargo.toml version
- `cargo tree` shows no `openssl-sys` dependency (rustls-tls only)
- Binary is stripped (no debug symbols — check with `file` command)
```

---

### Phase 4: CI/CD pipeline

New `runtime-binary.yml` workflow, update `release.yml` to multi-job, update `scripts/publish.sh`.

**Depends on:** Phases 1, 2, 3

**Files created/modified:**
- `.github/workflows/runtime-binary.yml` — new build matrix workflow
- `.github/workflows/release.yml` — multi-job: build-binaries → publish
- `scripts/publish.sh` — scan `npm/`, two-tier publish (npm provenance for binaries)

**Acceptance criteria:**
```
- `runtime-binary.yml` can be triggered manually via workflow_dispatch
- Architecture verification step fails fast on mismatch
- Artifacts are uploaded for each platform
- `release.yml` Job 2 downloads artifacts and publishes in correct order
- `scripts/publish.sh` discovers npm/* packages
- Platform packages use `npm publish --provenance`
- Other packages use `bun publish --access public`
- `id-token: write` permission is set on publish job
```

---

### Phase dependencies

```
Phase 1 (npm packages + getBinaryPath)
  ↓
Phase 2 (CLI launcher rewrite)
  ↓
Phase 3 (Rust build config) — can start in parallel with Phase 2
  ↓
Phase 4 (CI/CD pipeline) — needs all above
```
