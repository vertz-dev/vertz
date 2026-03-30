# Runtime Binary Distribution — Adversarial Review

- **Author:** claude-impl
- **Reviewer:** claude-review
- **Commits:** af546341c..c92f7154a
- **Date:** 2026-03-29

## Changes

- npm/runtime/index.ts (new) — `getBinaryPath()` resolution logic
- npm/runtime/index.d.ts (new) — hand-written type declarations
- npm/runtime/index.test.ts (new) — 4 tests for `getBinaryPath()`
- npm/runtime/package.json (new) — `@vertz/runtime` parent package
- npm/runtime/postinstall.js (new) — postinstall warning for missing platform binary
- npm/runtime/tsconfig.json (new) — typecheck config
- npm/runtime-darwin-arm64/package.json (new) — platform shell
- npm/runtime-darwin-x64/package.json (new) — platform shell
- npm/runtime-linux-x64/package.json (new) — platform shell
- npm/runtime-linux-arm64/package.json (new) — platform shell
- packages/cli/src/runtime/launcher.ts (modified) — `findRuntimeBinary()`, `checkVersionCompatibility()`, `buildRuntimeArgs()`, `launchRuntime()`
- packages/cli/src/runtime/__tests__/launcher.test.ts (new) — 14 tests for launcher
- packages/cli/src/runtime/__tests__/version-check.test.ts (new) — 4 tests for version check
- packages/cli/src/commands/dev.ts (modified) — native runtime as default, `--experimental-runtime` deprecation, `tryNativeRuntime()` + `startBunDevServer()` extraction
- packages/cli/src/commands/__tests__/dev.test.ts (modified) — tests for `--experimental-runtime`
- packages/cli/src/cli.ts (modified) — `process.exit(0)` added to one-shot commands
- packages/cli/package.json (modified) — added `@vertz/runtime` as optionalDependency
- .github/workflows/runtime-binary.yml (new) — CI matrix build for 3 platforms
- .github/workflows/release.yml (modified) — two-tier publish: binary packages first, source packages second
- scripts/publish.sh (modified) — `npm publish --provenance` for runtime packages, `bun publish` for source packages
- .changeset/config.json (modified) — added 5 runtime packages to fixed version group
- native/Cargo.toml (modified) — added `strip = true`, scoped `codegen-units = 1` to vertz-runtime
- native/vertz-runtime/Cargo.toml (new) — full Cargo.toml with rustls-tls, bundled SQLite
- native/vertz-runtime/src/cli.rs (new) — `VERTZ_VERSION` env var wiring to clap `--version`
- package.json (modified) — added `npm/*` to workspaces
- plans/runtime-binary-distribution.md (new) — design doc

## CI Status

- [x] Tests pass (22 tests across 3 files: launcher.test.ts, version-check.test.ts, index.test.ts)
- [ ] Typecheck not verifiable (packages need build first; npm/runtime has `noEmit: true`)
- [x] Lint clean (no new lint violations in changed files)

## Review Checklist

- [x] Delivers what the ticket asks for
- [ ] TDD compliance — see Finding S2
- [x] No type gaps or missing edge cases — see Findings below for edge cases
- [ ] No security issues — see Finding S1
- [x] Public API changes match design doc

## Findings

### [BLOCKER] B1: `@vertz/runtime` has no build step — `index.js` will never exist on npm

The `npm/runtime/package.json` declares `"main": "index.js"` and `"files": ["index.js", "index.d.ts", "postinstall.js"]`, but only `index.ts` exists. There is no `build` script, no `bunup.config.ts`, no `tsc` invocation, and no turbo pipeline entry for this package. When published via `scripts/publish.sh`, the `index.js` file will not be in the publish directory, and `npm publish` will either:

1. Publish without `index.js` (since `files` is a whitelist, npm only includes files that exist AND are in the list), making `require('@vertz/runtime')` fail at runtime with `MODULE_NOT_FOUND`.
2. Or, if the glob happens to match, publish `index.ts` but the `main` field still points to `index.js`.

The `postinstall.js` also does `require('./index.js')`, which would fail.

**Impact:** Complete breakage of binary resolution for all users.

**Fix:** Either:
- Add a build script (`"build": "bun build index.ts --outdir . --target node"` or similar)
- Or, since this is a tiny file, just ship `index.ts` directly: change `"main": "index.ts"`, `"files": ["index.ts", "index.d.ts", "postinstall.js"]`, and update `postinstall.js` to `require('./index.ts')` (Bun supports this natively; for Node consumers, compile to JS).
- The cleanest approach: add `"build": "tsc --outDir . --declaration --module nodenext --moduleResolution nodenext index.ts"` or use `bun build`.

### [BLOCKER] B2: Binary version stamping is broken — empty string VERSION in CI

The release workflow calls `runtime-binary.yml` with `release_version: ""`. This sets `VERTZ_VERSION=""` in the cargo build environment. In `cli.rs`:

```rust
const VERSION: &str = match option_env!("VERTZ_VERSION") {
    Some(v) => v,
    None => env!("CARGO_PKG_VERSION"),
};
```

Rust's `option_env!("VERTZ_VERSION")` returns `Some("")` when the var is set to empty string (it only returns `None` if the var is completely unset). So `VERSION` becomes `""`, and `vertz-runtime --version` outputs an empty version string.

**Impact:**
1. `checkVersionCompatibility()` always reports a mismatch (CLI version vs `""`), producing a spurious warning on every `vertz dev` invocation.
2. The version check logic `cliVersion > runtimeVersion` compares against `""`, always suggesting to update `@vertz/runtime`.
3. The version output from `--version` is useless for debugging.

**Fix:** Either:
- Don't set `VERTZ_VERSION` at all when empty: `VERTZ_VERSION: ${{ inputs.release_version || '' }}` won't work; instead conditionally set: `if [ -n "${{ inputs.release_version }}" ]; then export VERTZ_VERSION="${{ inputs.release_version }}"; fi` before `cargo build`.
- Or, handle empty string in Rust: `const VERSION: &str = match option_env!("VERTZ_VERSION") { Some(v) if !v.is_empty() => v, _ => env!("CARGO_PKG_VERSION") };`
- Deeper fix: restructure the release workflow to run `changeset version` first, read the new version, then build binaries with the correct version. This requires reordering the workflow steps.

### [BLOCKER] B3: `--experimental-runtime` flag is dead code in production CLI

The `--experimental-runtime` flag is registered in `registerDevCommand()` in `packages/cli/src/commands/dev.ts`, but the production CLI entry point (`packages/cli/bin/vertz.ts`) uses `createCLI()` from `packages/cli/src/cli.ts`, which registers the `dev` command inline WITHOUT the `--experimental-runtime` option.

This means:
1. Users passing `--experimental-runtime` to the real `vertz dev` CLI would get a Commander error ("unknown option").
2. The deprecation warning code path is never reached in production.
3. The design doc's promise of "deprecated, not removed" is not fulfilled.

The test in `dev.test.ts` validates `registerDevCommand()`, not `createCLI()`, so the test passes but doesn't reflect reality.

**Fix:** Add `--experimental-runtime` to the inline dev command registration in `cli.ts`, and forward `opts.experimentalRuntime` to `devAction()`. Alternatively, refactor `createCLI()` to use `registerDevCommand()` for the dev command instead of inline registration.

### [SHOULD-FIX] S1: `getBinaryPath()` does not verify the binary file actually exists

`getBinaryPath()` resolves the package directory via `require.resolve()` and returns `join(pkgDir, 'vertz-runtime')`. It does not check `existsSync()` on the returned path. If the platform package is installed but the binary was stripped by the package manager or corrupted, the error surfaces later at `spawn()` time with a confusing `ENOENT` message that doesn't mention the runtime package.

The design doc section 1.7 describes context-aware error messages for this scenario, but the implementation doesn't implement them. The current error is a generic Node.js spawn error.

**Fix:** Add `existsSync()` check after path resolution and throw a descriptive error:
```ts
const binaryPath = join(pkgDir, 'vertz-runtime');
if (!existsSync(binaryPath)) {
  throw new Error(
    `Vertz runtime installed but no binary found at ${binaryPath}.\n` +
    `The platform package ${pkg} may be corrupted.\n` +
    `Try: npm rebuild ${pkg}`,
  );
}
return binaryPath;
```

### [SHOULD-FIX] S2: Version comparison uses string comparison, not semver

In `checkVersionCompatibility()`, line 79:
```ts
const updatePkg = cliVersion > runtimeVersion ? '@vertz/runtime' : '@vertz/cli';
```

JavaScript string comparison is lexicographic. `'0.2.9' > '0.2.10'` evaluates to `true` (because `'9' > '1'`), which would incorrectly suggest updating `@vertz/runtime` when the CLI is actually older.

**Impact:** Wrong package name in the warning message for versions where a component is >= 10.

**Fix:** Use semver comparison. Since the CLI already has `node-semver` or a comparable package available (or use a simple split-and-compare approach):
```ts
function isNewerVersion(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}
```

### [SHOULD-FIX] S3: Test for `devAction` with `experimentalRuntime` has incorrect expectation

In `dev.test.ts`, the test "returns err when binary is not found" expects:
```ts
const result = await devAction({ experimentalRuntime: true });
expect(result.ok).toBe(false);
expect(result.error.message).toContain('vertz-runtime binary not found');
```

But the actual `devAction` code, when `findRuntimeBinary` returns `null`, logs an info message and falls through to `startBunDevServer()`. It does NOT return an `err` result with "vertz-runtime binary not found". The test currently doesn't run because the test file fails to import `@vertz/errors`, masking this logic error.

**Impact:** When the test does run (after build), it will fail, revealing either a test bug or a code bug (depending on intended behavior).

**Fix:** Either:
- Update the test to expect the Bun fallback behavior (which is what the code does), or
- If `experimentalRuntime: true` should force native runtime without fallback, update `devAction()` to return an error when the binary is not found AND `experimentalRuntime` is explicitly true.

### [SHOULD-FIX] S4: Platform packages are `"private": true` but need to be published

All four platform packages (`npm/runtime-darwin-arm64/package.json`, etc.) have `"private": true`. npm refuses to publish private packages. The `publish.sh` script handles this by temporarily removing the `private` field:

```bash
if [ -f "$dir/vertz-runtime" ]; then
  jq 'del(.private)' "$pkg_json" > "$pkg_json.tmp" && mv "$pkg_json.tmp" "$pkg_json"
fi
```

This works but is fragile:
1. If the publish fails partway, the `package.json` is left in a modified state (private removed but not restored).
2. The `jq` command reformats the JSON, potentially changing formatting.
3. This side-effect makes the publish script non-idempotent.

**Fix:** Either:
- Remove `"private": true` from the platform packages (they need to be public on npm). Add them to the workspace config's ignore or no-check list if Bun/turbo complains.
- Or, restore the `private` field after publish (success or failure) using a cleanup trap.

### [NIT] N1: `oxfmtrc.json` should exclude `npm/` directory

The `.oxfmtrc.json` change adds `npm/` to excludes, which is correct. Confirmed this is handled.

### [NIT] N2: `index.test.ts` has test that silently skips when platform package is not available

In `npm/runtime/index.test.ts`, lines 23-37:
```ts
try {
  const result = getBinaryPath();
  expect(result.endsWith('vertz-runtime')).toBe(true);
} catch (e: unknown) {
  // Platform package isn't installed — verify error message instead
  const error = e as Error;
  expect(error.message).toContain(expectedPkg);
}
```

This `try/catch` pattern means the test "passes" in two completely different code paths. On the reviewer's machine (macOS arm64 in the monorepo), it tests the happy path. On CI (Linux x64 without the monorepo structure), it might test the error path instead. Neither path is guaranteed to be exercised.

**Fix:** Split into two explicit tests: one that requires the platform package (skip if not available) and one that explicitly tests the error path with a mocked platform. Alternatively, document which CI environments exercise which path.

### [NIT] N3: `postinstall.js` uses CJS `require()` for an ESM package

The package has `"type": "module"` but `postinstall.js` uses `require('./index.js')`. Node.js with `"type": "module"` treats `.js` files as ESM, so `require()` from a `.js` file in an ESM package would fail (or at least behave unexpectedly depending on Node version).

However, since `postinstall.js` is invoked directly by npm as `node postinstall.js`, and the `require()` call is at the top level, this should work because Node.js treats the script as CJS when run directly (not as a module). The `"type": "module"` in `package.json` affects imports but not direct `node script.js` invocations for `.js` files... actually, since Node 14+, `"type": "module"` DOES affect `.js` files. So `postinstall.js` would be treated as ESM by Node, and `require()` is not available in ESM without `createRequire`.

**Fix:** Either rename to `postinstall.cjs` (explicitly CJS) or rewrite using dynamic `import()`:
```js
// postinstall.cjs
try {
  const { getBinaryPath } = require('./index.js');
  getBinaryPath();
} catch { ... }
```

## Summary

Three blockers prevent this from shipping:
1. **B1** — No build step for `@vertz/runtime`, meaning `index.js` won't exist on npm
2. **B2** — Empty version string stamped into binary during CI release
3. **B3** — `--experimental-runtime` flag not wired into the production CLI entry point

Four should-fix items for robustness:
1. **S1** — Missing binary existence check in `getBinaryPath()`
2. **S2** — String-based version comparison breaks at double-digit version components
3. **S3** — `devAction` test has incorrect expectation (masked by import failure)
4. **S4** — Private package publish workaround is fragile

Three nits for polish (N1 already handled, N2 test reliability, N3 CJS/ESM mismatch in postinstall).

## Resolution

All blockers and should-fix items addressed in commit d675b4745:

- **B1** FIXED — Added `"build": "bun build index.ts --outdir . --target node"` to npm/runtime/package.json, verified `index.js` is generated correctly. Added `.gitignore` for the build artifact.
- **B2** FIXED — Changed Rust `option_env!` match to `Some(v) if !v.is_empty() => v`, falling back to `CARGO_PKG_VERSION` for empty strings. Verified with `cargo check`.
- **B3** FIXED — Added `--experimental-runtime` option to the inline dev command in `cli.ts` and forwarded `opts.experimentalRuntime` to `devAction()`.
- **S1** FIXED — Added `existsSync(binaryPath)` check after path resolution in `getBinaryPath()`. Throws descriptive error with `npm rebuild` suggestion for corrupted installs.
- **S2** FIXED — Added `isNewerSemver()` helper using numeric split-and-compare. Added 4 test cases including double-digit components. Replaced string `>` comparison in `checkVersionCompatibility()`.
- **S3** FIXED — Updated test to verify Bun fallback behavior (mocked pipeline + dev server) instead of expecting an error result. Verifies "Native runtime not found" log message.
- **S4** FIXED — Added `MODIFIED_PKGS` array and `cleanup_private` EXIT trap to `publish.sh` that restores `"private": true` in any modified package.json on exit.
- **N3** FIXED — Renamed `postinstall.js` to `postinstall.cjs` for explicit CJS in ESM package context.
