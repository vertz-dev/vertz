# Fix Production Build Pipeline (#2692)

**Rev 4** — Quick fix to unblock external users. `vtz build` with Rolldown tracked separately as a future initiative.

## Problem Statement

Vertz apps cannot be built for production. `vtz dev` works perfectly, but `vertz build` fails due to three cascading issues:

1. **Native compiler not published** — `@vertz/native-compiler` is `"private": true` and never published to npm. Without it, UI builds fall back to esbuild's JSX transpiler, which produces broken apps (no signal reactivity, no CSS extraction, no hydration markers). **This is the blocker.**
2. **Bin link shadowing** — `@vertz/runtime` and `@vertz/cli` both register a `vertz` bin. The runtime's `cli.sh` wins, and it has no `build` subcommand.
3. **esbuild version mismatch** — `@vertz/cli` depends on `esbuild@^0.25.0`, `@vertz/ui-server` on `esbuild@^0.27.3`.

## API Surface

No new public APIs. The developer-facing commands stay the same:

```bash
vertz build                      # Full-stack production build
vertz build --target cloudflare  # Cloudflare Workers bundle
```

## Manifesto Alignment

- **"If your code builds, it runs"** — Currently it doesn't build at all for production. This fix restores the core promise.
- **"Production-Ready by Default"** — A framework that can't produce production builds is not production-ready.
- **"One Way to Do Things"** — The `vertz` bin conflict means there are two `vertz` commands. We need exactly one.

## Non-Goals

- Adding `vtz build` to the Rust binary (tracked separately — requires Rolldown integration, proper POC, and phased rollout).
- Changing the native compiler's NAPI interface or compilation behavior.
- Rewriting the build pipeline. The JS build pipeline in `@vertz/cli` is correct — we're fixing distribution.
- Windows support.

## Unknowns

None. All three issues have clear root causes and fixes within existing patterns (the `@vertz/runtime` platform package pattern is proven).

## Solution

### Fix 1: Publish `@vertz/native-compiler` via platform packages

**Root cause**: `native/vertz-compiler/package.json` has `"private": true` and is never published. The release pipeline builds the `.node` binary on Linux x64 only. External users can't resolve `@vertz/native-compiler`.

**Fix**: Follow the exact pattern used by `@vertz/runtime`:

#### 1a. Create four platform packages

Each contains a single `.node` file for its platform:

```
packages/native-compiler-darwin-arm64/package.json
packages/native-compiler-darwin-x64/package.json
packages/native-compiler-linux-x64/package.json
packages/native-compiler-linux-arm64/package.json
```

```jsonc
// packages/native-compiler-darwin-arm64/package.json
{
  "name": "@vertz/native-compiler-darwin-arm64",
  "version": "0.2.65",
  "private": true,
  "os": ["darwin"],
  "cpu": ["arm64"],
  "files": ["vertz-compiler.darwin-arm64.node"],
  "preferUnplugged": true
}
```

#### 1b. Convert selector package

The selector package stays at `native/vertz-compiler/` (Rust source, Cargo.toml, build scripts, and parity tests all live there — moving the package.json would break relative paths).

Changes to `native/vertz-compiler/package.json`:
- Remove `"private": true`
- Bump version from `0.1.1` to `0.2.65` (sync with monorepo)
- Add `optionalDependencies` pointing to platform packages
- Add `postinstall.cjs` that copies the `.node` file from the correct platform package
- Add `darwin-x64` to exports (currently missing)

```jsonc
// native/vertz-compiler/package.json
{
  "name": "@vertz/native-compiler",
  "version": "0.2.65",
  "main": "index.cjs",
  "scripts": {
    "postinstall": "node postinstall.cjs",
    "build": "...",
    "test": "..."
  },
  "optionalDependencies": {
    "@vertz/native-compiler-darwin-arm64": "0.2.65",
    "@vertz/native-compiler-darwin-x64": "0.2.65",
    "@vertz/native-compiler-linux-x64": "0.2.65",
    "@vertz/native-compiler-linux-arm64": "0.2.65"
  },
  "exports": {
    "./vertz-compiler.darwin-arm64.node": "./vertz-compiler.darwin-arm64.node",
    "./vertz-compiler.darwin-x64.node": "./vertz-compiler.darwin-x64.node",
    "./vertz-compiler.linux-x64.node": "./vertz-compiler.linux-x64.node",
    "./vertz-compiler.linux-arm64.node": "./vertz-compiler.linux-arm64.node"
  },
  "files": [
    "vertz-compiler.*.node",
    "postinstall.cjs",
    "index.cjs"
  ]
}
```

#### 1c. Postinstall — copy `.node` from platform package

```js
// native/vertz-compiler/postinstall.cjs
// Copies the correct platform .node binary from the platform package
// into this selector package directory so require.resolve() finds it.
const fs = require('fs');
const path = require('path');

const platform = process.platform === 'darwin' ? 'darwin' : 'linux';
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
const binaryName = `vertz-compiler.${platform}-${arch}.node`;
const pkgName = `@vertz/native-compiler-${platform}-${arch}`;

try {
  const pkgDir = path.dirname(require.resolve(`${pkgName}/package.json`));
  const src = path.join(pkgDir, binaryName);
  const dest = path.join(__dirname, binaryName);
  if (fs.existsSync(src) && !fs.existsSync(dest)) {
    fs.copyFileSync(src, dest);
  }
} catch {
  // Platform package not available — native compiler will fall back gracefully
}
```

This mirrors `@vertz/runtime`'s `postinstall.cjs` pattern.

#### 1d. Resolution — no changes needed

The existing `resolveBinaryPath()` in `packages/ui-server/src/compiler/native-compiler.ts` already handles this:

1. `require.resolve('@vertz/native-compiler/vertz-compiler.darwin-arm64.node')` — resolves because `postinstall.cjs` copied the file
2. Fallback: workspace-relative walk up to `native/vertz-compiler/` — continues to work in the monorepo

#### 1e. Dependency wiring

```jsonc
// packages/ui-server/package.json — add:
"optionalDependencies": {
  "@vertz/native-compiler": "workspace:^"
}
```

#### 1f. Production build must hard-fail without native compiler

Add an early `loadNativeCompiler()` guard at the top of `buildUI()` in `ui-build-pipeline.ts`, before `createVertzBunPlugin()` is invoked. The `compile()` convenience function silently falls back to esbuild — production builds must fail loudly instead of producing broken output.

```typescript
// packages/cli/src/production-build/ui-build-pipeline.ts — top of buildUI()
import { loadNativeCompiler } from '@vertz/ui-server';

// Fail fast if native compiler is unavailable — the esbuild fallback
// produces apps without signal reactivity, CSS extraction, or hydration.
try {
  loadNativeCompiler();
} catch {
  return {
    success: false,
    error:
      'Native compiler not available. Production builds require @vertz/native-compiler.\n' +
      'Install it: vtz add @vertz/native-compiler\n' +
      'Or install the platform-specific package: vtz add @vertz/native-compiler-darwin-arm64',
    durationMs: 0,
  };
}
```

#### 1g. Release pipeline changes

**Extend `build-binaries` matrix** (`.github/workflows/release.yml`):

After building the `vtz` runtime binary in each matrix entry, also build the compiler:

```yaml
# After the existing cargo build step for vtz:
- name: Build native compiler
  run: |
    cargo build --release --manifest-path native/Cargo.toml -p vertz-compiler --target ${{ matrix.target }}
    if [[ "${{ matrix.target }}" == *apple* ]]; then
      cp native/target/${{ matrix.target }}/release/libvertz_compiler.dylib \
        packages/native-compiler-${{ matrix.pkg_suffix }}/vertz-compiler.${{ matrix.pkg_suffix }}.node
      codesign -s - packages/native-compiler-${{ matrix.pkg_suffix }}/vertz-compiler.${{ matrix.pkg_suffix }}.node
    else
      cp native/target/${{ matrix.target }}/release/libvertz_compiler.so \
        packages/native-compiler-${{ matrix.pkg_suffix }}/vertz-compiler.${{ matrix.pkg_suffix }}.node
    fi

- name: Upload compiler artifact
  uses: actions/upload-artifact@v4
  with:
    name: native-compiler-${{ matrix.pkg_suffix }}
    path: packages/native-compiler-${{ matrix.pkg_suffix }}/
    retention-days: 1
```

**macOS code signing**: `codesign -s -` applied to `.node` files same as runtime binaries — without this, macOS Gatekeeper rejects `dlopen` on unsigned shared libraries.

**Remove the linux-only compiler build** from the `release` job (lines 265-269) — it's now handled by the matrix.

#### 1h. Publish script changes

In `scripts/publish.sh`, add phases for native-compiler packages. The existing `packages/runtime-*` glob won't match — add explicit handling:

```bash
# Phase 1.5: Native compiler platform packages
echo "Phase 1.5: Publishing native compiler platform packages..."
for pkg_json in packages/native-compiler-*/package.json; do
  # Same pattern as Phase 1: strip private, check binary exists, publish
done

# Phase 2.5: Native compiler selector package
echo "Phase 2.5: Publishing native compiler selector..."
# Publish native/vertz-compiler/ (not under packages/, needs explicit path)
cd native/vertz-compiler
npm publish --access public --provenance
cd ../..
```

#### 1i. Version sync

In `scripts/version.sh`, add sync for native-compiler packages:

```bash
# After syncing runtime packages:
# Sync native-compiler package.json version
jq --arg v "$VERSION" '.version = $v' native/vertz-compiler/package.json > tmp && mv tmp native/vertz-compiler/package.json

# Sync native-compiler platform package versions
for pkg_json in packages/native-compiler-*/package.json; do
  jq --arg v "$VERSION" '.version = $v' "$pkg_json" > tmp && mv tmp "$pkg_json"
done

# Sync native-compiler optionalDependencies
jq --arg v "$VERSION" '.optionalDependencies |= with_entries(.value = $v)' \
  native/vertz-compiler/package.json > tmp && mv tmp native/vertz-compiler/package.json
```

### Fix 2: Remove `vertz` bin from `@vertz/runtime`

Remove the `vertz` key from `@vertz/runtime`'s `bin` field:

```jsonc
// packages/runtime/package.json
"bin": {
  "vtz": "./cli.sh",
  "vtzx": "./cli-exec.sh"
  // "vertz" removed — was shadowing @vertz/cli
}
```

**Impact**: This **fixes** `vertz` resolution. After this change, `vertz` correctly resolves to `@vertz/cli`'s `dist/vertz.js`, which has `dev`, `build`, `create`, and all other subcommands. The shadowing was the bug.

**Canonical command**: `vertz` is the user-facing CLI command for all workflows (`vertz dev`, `vertz build`, `vertz create`). `vtz` is the native runtime binary used internally and for direct commands (`vtz test`, `vtz install`, `vtz self-update`).

**Consistency fix**: Update `packages/cli/src/commands/create.ts` post-scaffold message from `vtz dev` to `vertz dev` to match the `package.json` template scripts that already say `"dev": "vertz dev"`.

### Fix 3: Align esbuild versions

Update `@vertz/cli` to `esbuild@^0.27.3`:

```jsonc
// packages/cli/package.json
"dependencies": {
  "esbuild": "^0.27.3"  // was "^0.25.0"
}
```

**Verification**: The CLI's esbuild usage was inspected (`orchestrator.ts`, `build-cloudflare.ts`). It uses standard `esbuild.build()` with common options only. No exotic APIs or breaking changes between 0.25 and 0.27.

## Type Flow Map

N/A — no generic type parameters. This is tooling/infrastructure.

## E2E Acceptance Test

### Native compiler availability (the blocker)

```bash
# Given: a fresh project with @vertz/ui-server installed
# When: running vertz build on a project with src/app.tsx
npx vertz build

# Then: native compiler loads successfully
# Expected: NO "Native compiler binary not available" warning
# Expected: signal transforms, CSS extraction, hydration markers are present
```

### Native compiler missing = hard error

```bash
# Given: @vertz/native-compiler NOT installed (wrong platform, install failure)
# When: running vertz build
npx vertz build

# Then: build fails with clear error message
# Expected: "Native compiler not available. Production builds require @vertz/native-compiler."
# Expected: NOT a silent fallback producing a broken app
```

### Bin link resolution

```bash
# Given: @vertz/cli and @vertz/runtime installed
npm create vertz-app my-app && cd my-app && npm install

# When: running vertz build
npx vertz build
# Then: @vertz/cli build command runs (no "unrecognized subcommand" error)

# When: running vertz dev
npx vertz dev
# Then: dev server starts successfully
```

### esbuild compatibility

```bash
# Given: @vertz/cli and @vertz/ui-server in same project
npx vertz build
# Expected: NO "Host version X does not match binary version Y" error
```

### Automated test

```typescript
// packages/ui-server/src/compiler/__tests__/native-compiler-resolution.test.ts
describe('Native compiler resolution', () => {
  it('loads the native compiler binary', () => {
    const compiler = loadNativeCompiler();
    expect(compiler).toBeDefined();
    expect(typeof compiler.compile).toBe('function');
  });

  it('compiles JSX with signal transforms', () => {
    const compiler = loadNativeCompiler();
    const result = compiler.compile('let x = 0; return <div>{x}</div>', {
      filename: 'test.tsx',
    });
    expect(result.code).toContain('signal');
  });
});
```

## Implementation Plan

### Phase 1: Native compiler platform packages + publish infrastructure

1. Create `packages/native-compiler-{darwin-arm64,darwin-x64,linux-x64,linux-arm64}/package.json`
2. Update `native/vertz-compiler/package.json`: remove `private`, bump to `0.2.65`, add `optionalDependencies`, add `darwin-x64` export
3. Write `native/vertz-compiler/postinstall.cjs`
4. Add `@vertz/native-compiler` as optional dependency of `@vertz/ui-server`
5. Update `scripts/version.sh` to sync native-compiler versions
6. Update `scripts/publish.sh` with Phase 1.5 and 2.5 for native-compiler packages
7. Extend `.github/workflows/release.yml` `build-binaries` matrix to build compiler on all platforms (with macOS code signing)

### Phase 2: Bin link fix + esbuild alignment + hard-fail guard

1. Remove `vertz` from `@vertz/runtime` bin field
2. Update `@vertz/cli` esbuild dependency to `^0.27.3`
3. Update `create.ts` post-scaffold message to say `vertz dev`
4. Add `loadNativeCompiler()` guard at top of `buildUI()` in `ui-build-pipeline.ts`
5. Grep repo for `vertz dev` vs `vtz dev` inconsistencies and fix

### Phase 3: Tests + changeset

1. Add automated test verifying native compiler loads
2. Create changesets for `@vertz/runtime`, `@vertz/cli`, `@vertz/ui-server`, `@vertz/native-compiler`
3. Run full quality gates
4. Verify `vertz build` works end-to-end on an example app

## Future: `vtz build` with Rolldown

The right long-term architecture is `vtz build` — production builds owned by the Rust binary using Rolldown as an embedded bundler. This eliminates the Bun dependency entirely.

**Tracked separately.** Requires:
- POC: verify Rolldown compiles alongside vtz's dependency tree (oxc version compatibility)
- POC: verify Plugin::transform hook works with vertz_compiler_core
- Measure binary size and compile time impact
- Plan migration of all JS pipeline features (reactivity manifests, field selection, image transforms, island IDs, route extraction, per-route CSS)

This is a feature, not a bug fix. It should not block unblocking external users.
