# Phase 1: esbuild Shim (42 failures)

## Context

The `vtz` runtime cannot load esbuild's native binary (no NAPI support). This blocks 42 test failures in `@vertz/ui-server` and 3 in `@vertz/build`. The fix is to create a synthetic `esbuild` module that shells out to the esbuild CLI binary for `transformSync` and `build()`.

Design doc: `plans/2521-vtz-compat-ops.md`

## Tasks

### Task 1: Implement `op_esbuild_transform_sync` Rust op

**Files:**
- `native/vtz/src/runtime/ops/esbuild.rs` (new)
- `native/vtz/src/runtime/ops/mod.rs` (modified — add `pub mod esbuild;`)

**What to implement:**

Create a new op module with:

```rust
#[derive(Deserialize)]
pub struct EsbuildTransformOptions {
    pub source: String,
    pub loader: Option<String>,
    pub jsx: Option<String>,
    pub jsx_import_source: Option<String>,
    pub target: Option<String>,
    pub sourcemap: Option<bool>,
}

#[derive(Serialize)]
pub struct EsbuildTransformResult {
    pub code: String,
    pub map: String,
    pub warnings: Vec<String>,
}

#[op2]
#[serde]
pub fn op_esbuild_transform_sync(
    #[serde] options: EsbuildTransformOptions,
) -> Result<EsbuildTransformResult, AnyError>
```

The op:
1. Resolves esbuild binary path (see Task 2 for resolution logic)
2. Builds CLI args: `--loader=tsx --jsx=automatic --jsx-import-source=@vertz/ui --bundle=false`
3. Pipes `source` via stdin to the esbuild process
4. Reads stdout as the transformed code
5. Returns `{ code, map, warnings }`

Also implement `op_esbuild_build` (async) for the `build()` API used by `@vertz/build`:
- Takes entryPoints, bundle, format, outdir, platform, external, etc.
- Shells out to `esbuild` CLI with equivalent flags
- Returns build metadata

**Acceptance criteria:**
- [ ] `op_esbuild_transform_sync` transforms TSX source via esbuild CLI
- [ ] `op_esbuild_build` bundles entry points via esbuild CLI
- [ ] Error when esbuild binary not found: `"esbuild binary not found. Ensure dependencies are installed (vtz install)."`
- [ ] Rust unit tests for both ops

---

### Task 2: Binary resolution and op registration

**Files:**
- `native/vtz/src/runtime/ops/esbuild.rs` (modified — add resolution fn)
- `native/vtz/src/runtime/js_runtime.rs` (modified — register ops + bootstrap)

**What to implement:**

Binary resolution function:
```rust
fn resolve_esbuild_binary() -> Result<PathBuf, AnyError>
```

Resolution order:
1. `node_modules/.bin/esbuild` relative to CWD
2. `node_modules/@esbuild/{platform}-{arch}/bin/esbuild` relative to CWD
3. System PATH via `which::which("esbuild")`
4. Fail with user-friendly error

In `js_runtime.rs`:
- Add `ops.extend(esbuild::op_decls());` in `all_op_decls()`
- Add `esbuild::ESBUILD_BOOTSTRAP_JS` in `bootstrap_js()` (empty string — no globals needed)

In `ops/mod.rs`:
- Add `pub mod esbuild;`

**Acceptance criteria:**
- [ ] Binary found at `node_modules/.bin/esbuild` when deps installed
- [ ] Falls back to platform-specific path
- [ ] Falls back to system PATH
- [ ] Clear error message when not found

---

### Task 3: Synthetic `esbuild` module in module_loader

**Files:**
- `native/vtz/src/runtime/module_loader.rs` (modified)

**What to implement:**

Add synthetic module for `esbuild`:

```rust
const ESBUILD_SPECIFIER: &str = "vertz:esbuild";
const ESBUILD_MODULE: &str = r#"
export function transformSync(source, options = {}) {
  return Deno.core.ops.op_esbuild_transform_sync({
    source,
    loader: options.loader,
    jsx: options.jsx,
    jsxImportSource: options.jsxImportSource,
    target: options.target,
    sourcemap: options.sourcemap,
  });
}

export async function build(options = {}) {
  return await Deno.core.ops.op_esbuild_build(options);
}

export default { transformSync, build };
"#;
```

Wire into module resolution:
- In `resolve()`: map `"esbuild"` bare specifier → `ESBUILD_SPECIFIER`
- In `synthetic_module_source()`: map `ESBUILD_SPECIFIER` → `ESBUILD_MODULE`

**Acceptance criteria:**
- [ ] `import { transformSync } from 'esbuild'` resolves to synthetic module
- [ ] `import esbuild from 'esbuild'` works (default export)
- [ ] `transformSync(source, { loader: 'tsx', jsx: 'automatic', jsxImportSource: '@vertz/ui' })` returns `{ code }`
- [ ] JS integration test in Rust: execute script that imports and calls `transformSync`
