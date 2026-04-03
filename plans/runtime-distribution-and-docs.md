# Runtime Distribution & Documentation Plan

## Status

- **Author:** Vinicius Dacal
- **Date:** 2026-04-03
- **Status:** Draft — awaiting review

---

## Context

The Vertz native runtime (`vtz`) Phase 0 (native compiler) and Phase 1 (dev server) are complete. The runtime is a ~65MB standalone Rust binary that replaces Bun for `vertz dev` and `vertz test`. It starts in ~5ms, includes V8-based SSR, HMR, file watching, and the full compiler pipeline.

**Current state:**
- The `@vertz/cli` already dispatches `dev` and `test` to the native runtime when found (three-tier resolution: env override → monorepo build → npm package)
- npm platform packages (`@vertz/runtime-darwin-arm64`, etc.) are published and contain the binary
- A `v{VERSION}` GitHub release with binary assets exists for `install.sh`
- The `install.sh` script works for both macOS and Linux (same script, auto-detects platform/arch)

---

## Audit Findings (2026-04-03)

### What works

| Component | Status | Notes |
|-----------|--------|-------|
| npm platform packages | **Working** | `@vertz/runtime-{darwin-arm64,darwin-x64,linux-x64,linux-arm64}` all at 0.2.46, ~65MB each |
| GitHub release binary assets | **Working** | `v0.2.46` has all 4 binaries (vtz-darwin-arm64, vtz-darwin-x64, vtz-linux-x64, vtz-linux-arm64) |
| `install.sh` | **Working** | Downloads correct binary for platform, installs to `~/.vtz/bin/`, creates `vertz` symlink, updates shell profile |
| CLI runtime launcher | **Working** | Three-tier resolution (env → monorepo build → npm) with version compatibility check |
| CI binary build pipeline | **Working** | 4-platform build matrix, cross-compilation, artifact upload |

### Issues found

#### P0 — Version string bug

**Binary reports `vtz 0.0.3` instead of `vtz 0.2.46`.**

The version is baked at compile time via `option_env!("VERTZ_VERSION")` with fallback to `CARGO_PKG_VERSION`. Despite the `build.rs` having `cargo:rerun-if-env-changed=VERTZ_VERSION`, the Rust build cache (`rust-cache` action in CI) appears to cache compiled artifacts across version bumps. When a "Version Packages" PR bumps to a new version without changing native code, the `build-binaries` job is skipped (correctly — no native changes). But the binary carried forward still has the version from its original build.

**Root cause hypothesis:** The very first binary build happened before `VERTZ_VERSION` was properly set in CI (likely when `version.txt` read `0.0.3`). Since native code hasn't changed since, no rebuild has occurred, and the same binary is carried across releases.

**Fix:** Force a rebuild by touching a Rust source file, or better: add a `version.rs` file that's auto-generated from `version.txt` in `build.rs` — this guarantees a rebuild when the version changes, regardless of Cargo caching.

**Impact:** The version mismatch triggers a warning from the CLI launcher's `checkVersionCompatibility()`, but doesn't prevent the runtime from functioning.

#### P1 — `#` subpath imports not supported

**The native runtime's module resolver doesn't support Node.js `package.json` `imports` field (aka subpath imports).**

The entity-todo example uses `"imports": { "#generated": "./.vertz/generated/client.ts" }` in its package.json. The runtime's `resolve_node_module()` treats `#generated` as a bare specifier and searches `node_modules/`, which fails.

The Bun-based fallback handles this correctly because Bun's resolver supports `imports`.

**Fix:** Add `imports` field resolution to `resolve_node_module()` in `native/vtz/src/runtime/module_loader.rs`. When a specifier starts with `#`, read the closest `package.json` `imports` field and resolve from there.

**Impact:** Blocks any project using `#` imports (including codegen output) from running on the native runtime.

#### P2 — CSS color token diagnostics (noisy but non-blocking)

The compiler emits `css-unknown-color-token` warnings for CSS values like `text:xs` (size token, not color) and `border:1`. These are false positives — the tokens are valid Vertz CSS shorthand, not color tokens. Noisy but functional.

#### P3 — Docs assume Bun-first workflow

All current docs (installation, quickstart, project-structure) show `bun install`, `bun run dev`, `bunx vertz dev`, etc. The native runtime is barely mentioned (one note in project-structure.mdx about `vtz dev` having fewer fallback paths). There's no documentation about:
- Installing the standalone `vtz` binary
- Using `vtz dev` directly
- The runtime's advantages (5ms startup, built-in test runner)
- Troubleshooting runtime resolution

---

## Plan

### Phase 1: Fix runtime blockers (P0 + P1)

These must be fixed before the runtime is promoted as the primary dev experience.

#### 1a. Fix version string embedding

- Modify `native/vtz/build.rs` to read `version.txt` and generate a `version.rs` include file
- This ensures Cargo rebuilds when the version changes, even if no Rust source changed
- Verify with `vtz --version` after build

#### 1b. Add `#` imports support to module resolver

- In `native/vtz/src/runtime/module_loader.rs`, add handling for specifiers starting with `#`
- When encountered, find the nearest `package.json` with an `imports` field
- Resolve the `#` specifier according to Node.js subpath imports spec
- Add tests for: simple `#foo` mappings, conditional exports in imports, nested patterns

#### 1c. Validate entity-todo runs end-to-end on native runtime

- After fixing 1a and 1b, verify: server starts, SSR renders, API responds, HMR works
- This is the acceptance criterion for Phase 1

### Phase 2: Documentation overhaul

The docs need to reflect that the native runtime is the primary experience while Bun remains a transparent fallback.

#### 2a. New page: Runtime & CLI reference (`runtime.mdx`)

Add to "Getting Started" section after "Installation":

**Content:**
- What the Vertz runtime is (standalone binary, no Bun dependency for dev)
- Installation methods:
  - **Automatic (recommended):** Installed via `@vertz/runtime` npm package (happens transparently when you install `@vertz/cli` or the `vertz` meta-package)
  - **Standalone install:** `curl -fsSL https://raw.githubusercontent.com/vertz-dev/vertz/main/install.sh | sh` — installs to `~/.vtz/bin/`, works on macOS (arm64, x64) and Linux (x64, arm64)
  - **From source:** `cd native && cargo build --release` — binary at `native/target/release/vtz`
- CLI commands reference: `vtz dev`, `vtz test`, `vtz install`, `vtz add`, `vtz run`, etc.
- How resolution works: env override → local build → npm package → Bun fallback
- `VERTZ_RUNTIME_BINARY` env var for custom paths
- Supported platforms table

#### 2b. Update installation.mdx

- Add a "Runtime" section explaining the native binary
- Add `install.sh` one-liner for standalone installation
- Keep Bun commands as they are (they still work — CLI auto-detects)
- Add note: "The Vertz CLI automatically uses the native runtime when available. No configuration needed."

#### 2c. Update quickstart.mdx

- Keep `bunx @vertz/create-vertz-app` as primary scaffolding (unchanged)
- Add note that `bun run dev` transparently uses the native runtime when installed
- Mention `vtz dev` as an alternative direct invocation

#### 2d. Update project-structure.mdx

- Remove the note about `vtz dev` having "fewer features" — reframe as: the runtime is the primary path, Bun is the fallback
- Document that `#` subpath imports are supported (after Phase 1 fix)

### Phase 3: Distribution polish

#### 3a. Verify `install.sh` handles edge cases

- Test with `VTZ_VERSION=0.2.46` (specific version) — **verified working**
- Test with `VTZ_VERSION=latest` (latest release) — needs verification that `releases/latest` points to a release with binary assets (currently `releases/latest` points to `@vertz/icons@0.2.46` which has no binaries)
- **Fix:** The `install.sh` `latest` mode downloads from `releases/latest/download/vtz-{platform}`. This only works if the "Latest" GitHub release has binary assets. Currently the "Latest" release is `@vertz/icons@0.2.46` (no binaries). The `v0.2.46` release has binaries but isn't marked "Latest".

#### 3b. Fix "Latest" release for `install.sh`

Two options:
1. **Mark `v{VERSION}` releases as "Latest"** — change the release workflow to use `--latest` when creating the `v{VERSION}` release. This means the latest release always has binaries.
2. **Change `install.sh` to find the latest `v*` tag** — use `gh api` or GitHub API to find the most recent `v*` release instead of relying on "Latest".

**Recommendation:** Option 1 — simpler, and the `v{VERSION}` release is the canonical release anyway.

#### 3c. Add `create-vertz-app` runtime awareness

The scaffolding template should:
- Include `@vertz/runtime` as an optional dependency (or note it in postinstall output)
- Add a hint after scaffolding: "Using native runtime for fast development. Run `vtz --version` to verify."

#### 3d. Verify cross-platform distribution

- macOS arm64: **verified** — install.sh works, binary runs
- macOS x64: verify binary runs (release has the asset)
- Linux x64: verify binary runs
- Linux arm64: verify binary runs

---

## Acceptance Criteria

- [ ] `vtz --version` reports correct version (matching `version.txt`)
- [ ] entity-todo example starts and renders SSR with `vtz dev`
- [ ] entity-todo API responds correctly with `vtz dev`
- [ ] `install.sh` with no version specified installs the latest binary
- [ ] New `runtime.mdx` doc page exists with install instructions for macOS and Linux
- [ ] `installation.mdx` mentions the native runtime
- [ ] `quickstart.mdx` notes runtime transparency
- [ ] `project-structure.mdx` no longer frames runtime as "fewer features"

## Non-Goals

- Windows support (not in the build matrix today)
- `vertz build` / `vertz start` on native runtime (still Bun-only, by design)
- Package manager replacement (`vtz install` exists but is not the primary path yet)
- Test runner promotion (`vtz test` works but is next-priority, not this plan)

## Summary

The install.sh script works identically for macOS and Linux — it auto-detects the platform and architecture. There's no need for separate install instructions per OS. The main work is:
1. Fix two runtime bugs (version string, `#` imports) so the entity-todo example actually runs
2. Update docs to promote the native runtime as the primary dev experience
3. Fix the GitHub "Latest" release so `install.sh` works without specifying a version
