# Phase 2: ESM Interop Improvements (36 failures)

## Context

CJS npm packages (`ts-morph`, `yaml`, `sharp`, `tiny-inflate`) fail to import correctly in the vtz runtime. The CJS→ESM wrapper in `module_loader.rs` uses `extract_cjs_named_exports()` to detect named exports from CJS source, but edge cases cause some packages to fail.

Pre-investigation found:
- **ts-morph**: Uses `exports.X = Y;` pattern (100+ exports). Should be handled but may fail due to mixed `module.exports =` + `exports.X =` patterns.
- **yaml**: Uses `exports.X = Y;` pattern (20 exports). Should be handled.
- **sharp**: Uses `module.exports = Class` (single default). Should produce `export default`.
- **tiny-inflate**: Uses `module.exports = function` (single default). Same as sharp.

Design doc: `plans/2521-vtz-compat-ops.md`

## Tasks

### Task 1: Diagnose actual failure root causes

**Files:**
- `native/vtz/src/runtime/module_loader.rs` (read + debug)

**What to implement:**

Add diagnostic tracing to understand why each package fails:

1. Write Rust unit tests that call `extract_cjs_named_exports()` on representative source from each failing package (ts-morph first few hundred lines, yaml dist/index.js)
2. Write Rust unit tests that call `wrap_cjs_module()` on small representative CJS files matching each pattern
3. Verify entry point resolution: does the module loader find `dist/ts-morph.js` from `ts-morph`'s package.json `main` field?
4. Verify `is_cjs_module_cached()` correctly identifies each package as CJS

**Acceptance criteria:**
- [ ] Root cause identified for ts-morph named exports failure
- [ ] Root cause identified for yaml named exports failure
- [ ] Root cause identified for sharp default export failure
- [ ] Root cause identified for tiny-inflate default export failure
- [ ] Tests documenting each root cause

---

### Task 2: Fix `extract_cjs_named_exports` edge cases

**Files:**
- `native/vtz/src/runtime/module_loader.rs` (modified)

**What to implement:**

Based on Task 1 diagnosis, likely fixes:

1. **Mixed patterns:** If a CJS file has both `module.exports = { ... }` AND `exports.X = Y;`, the current logic only parses the object literal. Fix: also collect `exports.X = Y` assignments as a fallback when the object parse yields fewer results.
2. **package.json `exports` field:** Ensure the module loader consults `exports` field before falling back to `main`. This may be an entry point issue.
3. **Large file parsing:** If ts-morph's 100K+ line file triggers edge cases in the line-by-line parser, add robustness.

**Acceptance criteria:**
- [ ] `import { SyntaxKind, Project, Node } from 'ts-morph'` resolves all named exports
- [ ] `import { parse } from 'yaml'` resolves `parse` named export
- [ ] `import sharp from 'sharp'` resolves default export
- [ ] `import inflate from 'tiny-inflate'` resolves default export
- [ ] Existing `extract_cjs_named_exports` tests still pass
- [ ] New tests for the fixed patterns

---

### Task 3: Verify cross-package test suites

**Files:**
- No file changes — test verification only

**What to verify:**

Run the affected package test suites:
```bash
vtz test packages/compiler/
vtz test packages/codegen/
vtz test packages/docs/
vtz test packages/theme-shadcn/
```

**Acceptance criteria:**
- [ ] `@vertz/compiler` tests pass (29 failures resolved)
- [ ] `@vertz/codegen` tests pass (3 failures resolved)
- [ ] `@vertz/docs` tests pass (3 failures resolved)
- [ ] `@vertz/theme-shadcn` tests pass (1 failure resolved)
