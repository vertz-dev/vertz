# Phase 1: Delete `ReactPlugin` End-to-End

## Context

The vtz Rust crate contains a vestigial React plugin: `ReactPlugin` (726 lines), a `PluginChoice::{Vertz, React}` enum, a `--plugin react` CLI flag, a `.vertzrc` entry, and package.json auto-detection. None of it is used by any real app. This phase removes the entire React surface.

**Full design context:** `plans/vtz-plugin-system/DESIGN.md` §5 (Deletion List — Rust) and §13 decision 1 (CLI flag removed entirely).

Quality gates for this phase: `cd native && cargo test --all && cargo clippy --all-targets -- -D warnings && cargo fmt --all -- --check`. Vtz dev for a Vertz app (e.g., `examples/task-manager`) must still boot.

---

## Tasks

### Task 1: Delete the React plugin file and embedded JS assets

**Files:** (5)
- `native/vtz/src/plugin/react.rs` (delete)
- `native/vtz/src/plugin/mod.rs` (edit — remove `pub mod react;` and any `ReactPlugin` re-exports)
- Any `react-refresh-runtime.js` asset (delete — `include_str!` at `react.rs:6`)
- Any `react-refresh-setup.js` asset (delete — `include_str!` at `react.rs:9`)
- `native/vtz/Cargo.toml` (edit if React-specific features/deps exist; otherwise no change)

**What to implement:**
Delete the `react.rs` source file and its embedded JS fast-refresh assets (grep `include_str!` in `react.rs` to locate exact paths; they live near the plugin source). Remove the module declaration and any re-exports from `plugin/mod.rs`. This task leaves the repo in a temporarily-broken state (callers still reference `ReactPlugin`) — the next tasks fix it.

**Acceptance criteria:**
- [ ] `native/vtz/src/plugin/react.rs` no longer exists
- [ ] `grep -r "pub mod react" native/vtz/src/plugin/mod.rs` returns nothing
- [ ] `grep -r "react-refresh-runtime.js\|react-refresh-setup.js" native/vtz/` returns nothing
- [ ] `cargo check` fails only with errors pointing at consumers of `ReactPlugin` (expected; fixed in Tasks 2–3)

---

### Task 2: Remove `PluginChoice::React` enum and all config plumbing

**Files:** (1)
- `native/vtz/src/config.rs` (edit)

**What to implement:**
In `native/vtz/src/config.rs`:
- Remove the `React` variant from `PluginChoice` enum (line ~5)
- Remove `PluginChoice` parsing for the `react` value (lines ~5–198 contain the full CLI/`.vertzrc` handling)
- Remove the `package.json` auto-detect that picks `PluginChoice::React` when `dependencies.react` exists (lines ~188–192)
- Remove all ~15 React-related unit tests (lines ~660–833) — any test whose name references React or whose body asserts `PluginChoice::React`
- If `PluginChoice` becomes a single-variant enum after removal, collapse it to a unit struct or remove it entirely (pairs with §13 decision 1: `--plugin` CLI flag is removed)

**Acceptance criteria:**
- [ ] `grep "PluginChoice::React\|react" native/vtz/src/config.rs` returns nothing (case-sensitive on `React`; the lowercase `react` check is scoped to config.rs only)
- [ ] `cargo check -p vtz --lib` compiles (consumers of `config.rs` adapt)
- [ ] All remaining tests in `config.rs` pass: `cargo test -p vtz --lib config::`

---

### Task 3: Remove the `PluginChoice::React` match arm and delete the `--plugin` CLI flag

**Files:** (2)
- `native/vtz/src/server/http.rs` (edit — remove the `PluginChoice::React => ReactPlugin::new()` arm around line 1440; simplify the match to a single-branch or direct `VertzPlugin::new()` call)
- `native/vtz/src/main.rs` (edit — remove the `--plugin` CLI argument schema entirely per §13 decision 1)

**What to implement:**
In `http.rs`, the function that constructs the active plugin based on `PluginChoice` becomes a direct `VertzPlugin::new(...)` call. Delete any remaining `ReactPlugin` references.

In `main.rs`, remove the `--plugin` clap/argh/structopt argument definition. If any downstream config code still reads it, either (a) default it to `Vertz` in `config.rs` and delete the CLI surface, or (b) remove the config field entirely if nothing reads it. Prefer (b) for cleaner code.

**Acceptance criteria:**
- [ ] `grep -r "ReactPlugin" native/vtz/` returns nothing
- [ ] `grep -r "\-\-plugin" native/vtz/src/` returns nothing (the CLI flag is gone)
- [ ] `cargo test --all` passes
- [ ] `cargo clippy --all-targets -- -D warnings` passes
- [ ] `cargo fmt --all -- --check` passes
- [ ] Manual smoke test: `vtz dev` boots in `examples/task-manager` and serves a `.tsx` file with Vertz transforms applied (e.g., the page compiles without error and signals work)
