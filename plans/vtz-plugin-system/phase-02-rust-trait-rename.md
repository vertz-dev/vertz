# Phase 2: Rust `FrameworkPlugin` → `VtzPlugin` Trait Rename

## Context

The Rust trait `FrameworkPlugin` (`native/vtz/src/plugin/mod.rs:13`) is the dev-hot-path plugin contract. Its name is misleading — the trait is vtz-specific and its only real impl (`VertzPlugin`) is framework-internal. Rename `FrameworkPlugin` → `VtzPlugin` across all 18 Rust files that reference it.

**Full design context:** `plans/vtz-plugin-system/DESIGN.md` §4 (API Surface — Rust) and §6 (Rename List).

**Rename is mechanical.** All call sites use `Arc<dyn FrameworkPlugin>`, `&dyn FrameworkPlugin`, or `Box<dyn FrameworkPlugin>` — clean trait-object substitution, no generic-bound complications. No signature changes; only the name changes.

**Precondition:** Phase 1 complete (`ReactPlugin` removed). `cargo check` is clean at phase start.

Quality gates: `cd native && cargo test --all && cargo clippy --all-targets -- -D warnings && cargo fmt --all -- --check`.

---

## Tasks

### Task 1: Rename the trait definition + plugin module internals

**Files:** (4)
- `native/vtz/src/plugin/mod.rs` (edit — rename `pub trait FrameworkPlugin` to `pub trait VtzPlugin`; rename any re-exports or helper types that reference the trait name)
- `native/vtz/src/plugin/vertz.rs` (edit — `impl FrameworkPlugin for VertzPlugin` → `impl VtzPlugin for VertzPlugin`)
- `native/vtz/src/compiler/pipeline.rs` (edit — all `FrameworkPlugin` trait-object references)
- `native/vtz/src/bridge/mod.rs` (edit — all `FrameworkPlugin` trait-object references)

**What to implement:**
Use `grep -n "FrameworkPlugin" <file>` in each of the four files to find every occurrence, then replace with `VtzPlugin`. No other changes. Method signatures on the trait stay identical.

**Acceptance criteria:**
- [ ] `cargo check -p vtz --lib` passes after this task (`cargo check` scoped to the lib will catch references in server/runtime files as errors — expected at this stage since Task 2 hasn't run yet; but the trait definition and its impl in `plugin/vertz.rs` must compile together)
- [ ] `grep -rn "FrameworkPlugin" native/vtz/src/plugin/ native/vtz/src/compiler/pipeline.rs native/vtz/src/bridge/mod.rs` returns nothing

*Note: `cargo check --all` will still fail because server/runtime/test/main files haven't been updated yet. That's expected — Tasks 2–4 fix the rest.*

---

### Task 2: Update server modules

**Files:** (4)
- `native/vtz/src/server/http.rs` (edit)
- `native/vtz/src/server/html_shell.rs` (edit)
- `native/vtz/src/server/module_server.rs` (edit)
- `native/vtz/src/server/mcp.rs` (edit)

**What to implement:**
In each file, replace every `FrameworkPlugin` identifier with `VtzPlugin`. No other changes.

**Acceptance criteria:**
- [ ] `grep -rn "FrameworkPlugin" native/vtz/src/server/` returns nothing
- [ ] `cargo check` passes on the combined `plugin + compiler + bridge + server` module graph (equivalent to `cargo check -p vtz --bins` modulo runtime/test/main files, which are fixed in Tasks 3–4)

---

### Task 3: Update runtime, test harness, and `main.rs`

**Files:** (5)
- `native/vtz/src/runtime/js_runtime.rs` (edit)
- `native/vtz/src/runtime/module_loader.rs` (edit)
- `native/vtz/src/test/executor.rs` (edit)
- `native/vtz/src/test/config.rs` (edit)
- `native/vtz/src/main.rs` (edit)

**What to implement:**
Same pattern: replace `FrameworkPlugin` → `VtzPlugin` in each file. No other changes.

**Acceptance criteria:**
- [ ] `grep -rn "FrameworkPlugin" native/vtz/src/` returns nothing
- [ ] `cargo check --all` passes (no more production-source references; only integration tests remain)

---

### Task 4: Update integration tests and verify full quality gates

**Files:** (4)
- `native/vtz/tests/client_render.rs` (edit)
- `native/vtz/tests/sqlite_integration.rs` (edit)
- `native/vtz/tests/error_overlay.rs` (edit)
- `native/vtz/tests/parity/common.rs` (edit)

**What to implement:**
Same rename pattern in each test file. Then run full quality gates.

**Acceptance criteria:**
- [ ] `grep -rn "FrameworkPlugin" native/` returns nothing
- [ ] `cargo test --all` passes (all 4 integration test files + everything else)
- [ ] `cargo clippy --all-targets -- -D warnings` passes
- [ ] `cargo fmt --all -- --check` passes
- [ ] The trait `VtzPlugin` appears in `native/vtz/src/plugin/mod.rs`: `grep -q "pub trait VtzPlugin" native/vtz/src/plugin/mod.rs` returns success
