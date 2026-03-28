# Phase 0: Compiler Crate Refactoring

**Prerequisites:** None — this is the first phase.

**Goal:** Extract compilation logic from the NAPI-bound crate into a pure Rust library that both NAPI and the runtime can depend on.

**Design doc:** `plans/vertz-dev-server.md` — Phase 1.0

---

## Why This Is Needed

The current `native/vertz-compiler/` crate is a `cdylib` (C dynamic library) with `#[napi]` annotations on all public types. Cargo cannot link a `cdylib` as a Rust library dependency. The runtime needs to call the compiler directly from Rust — no NAPI, no JavaScript in between.

---

## Tasks

### Task 1: Create `vertz-compiler-core` crate scaffold

Create the new crate with `crate-type = ["lib"]` (pure Rust library).

**What to do:**
- Create `native/vertz-compiler-core/Cargo.toml` with all current dependencies EXCEPT `napi` and `napi-derive`
- Create `native/vertz-compiler-core/src/lib.rs` as the entry point
- Add `vertz-compiler-core` to `native/Cargo.toml` workspace members

**Files to create:**
```
native/vertz-compiler-core/
├── Cargo.toml         # NEW — lib crate, no NAPI deps
└── src/
    └── lib.rs         # NEW — re-exports everything
```

**Files to modify:**
```
native/Cargo.toml      # MODIFY — add "vertz-compiler-core" to members
```

**Acceptance criteria:**
- [ ] `cargo check -p vertz-compiler-core` compiles successfully
- [ ] No NAPI dependencies in `vertz-compiler-core/Cargo.toml`
- [ ] Crate type is `["lib"]` (not `cdylib`)

---

### Task 2: Define plain Rust types (no NAPI annotations)

Create plain Rust equivalents of the current NAPI-annotated types (`CompileOptions`, `CompileResult`, `Diagnostic`, etc.).

**What to do:**
- In `vertz-compiler-core`, define `CompileOptions`, `CompileResult`, `Diagnostic`, `SignalApiConfig`, `ManifestEntry`, etc. as plain Rust structs with `#[derive(Debug, Clone)]`
- These types should use standard Rust types (no `napi::*` types)
- Add `serde::Serialize` / `serde::Deserialize` where JSON interop is needed

**Current NAPI types to replicate (from `vertz-compiler/src/lib.rs`):**
- `CompileOptions` — filename, target, fast_refresh, signal_api_config, manifest_entries, etc.
- `CompileResult` — code, source_map, css, diagnostics, metadata
- `Diagnostic` — message, severity, span info
- `SignalApiConfig` — maps of API names to signal property sets
- `ManifestEntry` — cross-file reactivity metadata

**Acceptance criteria:**
- [ ] All types compile without NAPI dependencies
- [ ] Types have `Debug` and `Clone` derives
- [ ] Types are exported from `vertz-compiler-core::types` module

---

### Task 3: Move compilation logic to `vertz-compiler-core`

Move all `.rs` source files from `vertz-compiler/src/` into `vertz-compiler-core/src/`, removing NAPI annotations.

**What to do:**
- Move these modules (removing `#[napi]` annotations):
  - `component_analyzer.rs`
  - `reactivity_analyzer.rs`
  - `signal_transformer.rs`
  - `jsx_transformer.rs`
  - `context_stable_ids.rs`
  - `fast_refresh.rs`
  - `css_extractor.rs` (if exists)
  - `magic_string.rs`
  - `signal_api_registry.rs`
  - `utils.rs`
- Create a public `compile()` function in `lib.rs` that takes `CompileOptions` and returns `CompileResult`
- This function contains the same logic as the current NAPI `compile()` function

**Files to move:**
```
native/vertz-compiler/src/*.rs  →  native/vertz-compiler-core/src/*.rs
```

**Acceptance criteria:**
- [ ] `cargo check -p vertz-compiler-core` compiles
- [ ] `vertz-compiler-core` has zero NAPI dependencies
- [ ] Public API: `vertz_compiler_core::compile(source: &str, options: CompileOptions) -> CompileResult`
- [ ] All internal modules are accessible from `vertz-compiler-core`

---

### Task 4: Make `vertz-compiler` a thin NAPI wrapper

Update the existing NAPI crate to depend on `vertz-compiler-core` and just convert between NAPI types and core types.

**What to do:**
- In `vertz-compiler/Cargo.toml`, add `vertz-compiler-core = { path = "../vertz-compiler-core" }`
- Replace `vertz-compiler/src/lib.rs` with a thin wrapper:
  - Keep `#[napi]` function signatures unchanged (so JS callers see no difference)
  - Convert NAPI input types → core types
  - Call `vertz_compiler_core::compile()`
  - Convert core result types → NAPI output types
- Remove all moved source files from `vertz-compiler/src/` (they now live in core)

**Files to modify:**
```
native/vertz-compiler/
├── Cargo.toml         # MODIFY — add vertz-compiler-core dep
└── src/
    └── lib.rs         # REWRITE — thin NAPI wrapper only
```

**Files to delete:**
```
native/vertz-compiler/src/component_analyzer.rs     # MOVED to core
native/vertz-compiler/src/reactivity_analyzer.rs    # MOVED to core
native/vertz-compiler/src/signal_transformer.rs     # MOVED to core
native/vertz-compiler/src/jsx_transformer.rs        # MOVED to core
native/vertz-compiler/src/context_stable_ids.rs     # MOVED to core
native/vertz-compiler/src/fast_refresh.rs           # MOVED to core
native/vertz-compiler/src/magic_string.rs           # MOVED to core
native/vertz-compiler/src/signal_api_registry.rs    # MOVED to core
native/vertz-compiler/src/utils.rs                  # MOVED to core
```

**Acceptance criteria:**
- [ ] `vertz-compiler/src/lib.rs` is < 200 lines (just type conversion + delegation)
- [ ] `cargo build -p vertz-compiler --release` produces the `.node` file
- [ ] All internal source modules live in `vertz-compiler-core`, not `vertz-compiler`

---

### Task 5: Verify all existing tests pass unchanged

Run the full test suite to confirm the refactoring is transparent.

**What to do:**
- Move test files from `vertz-compiler/__tests__/` — they should continue testing via NAPI (no change)
- Run `cd native/vertz-compiler && cargo test` to verify Rust-level tests
- Run `cd native/vertz-compiler && bun test` to verify NAPI integration tests
- Run the app-file-parity tests to confirm output is identical
- Copy the built `.node` file: `cp native/target/release/libvertz_compiler.dylib native/vertz-compiler/vertz-compiler.darwin-arm64.node`

**Acceptance criteria:**
- [ ] `cargo test -p vertz-compiler-core` — all Rust tests pass
- [ ] `cargo test -p vertz-compiler` — NAPI tests pass
- [ ] `bun test native/vertz-compiler/__tests__/` — all 454+ tests pass
- [ ] App parity tests pass (task-manager + linear example)
- [ ] Output of NAPI `compile()` is byte-for-byte identical to before refactoring

---

## Quality Gates

```bash
cd native && cargo check --workspace
cd native && cargo test --workspace
cd native && cargo build -p vertz-compiler --release
cp native/target/release/libvertz_compiler.dylib native/vertz-compiler/vertz-compiler.darwin-arm64.node
bun test native/vertz-compiler/__tests__/
```

---

## Notes

- This is mechanical refactoring — no logic changes, no new features
- The NAPI interface is unchanged — JS callers see zero difference
- Estimated: 1-2 days
- The key risk is NAPI type conversion complexity (some NAPI types have special serialization). Keep the wrapper straightforward — convert struct by struct.
