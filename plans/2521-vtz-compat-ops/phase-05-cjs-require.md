# Phase 5: CJS require() in ESM (7 failures)

## Context

The `@vertz/test` package bridges test primitives between Bun and vtz. It uses `require('bun:test')` for runtime detection and `createRequire` from `node:module`. Under vtz, `require()` isn't available as a global in ESM modules, causing 7 test failures.

Design doc: `plans/2521-vtz-compat-ops.md`

## Tasks

### Task 1: Ensure `require()` is available in ESM module scope

**Files:**
- `native/vtz/src/runtime/module_loader.rs` (modified)

**What to implement:**

The CJS bootstrap at line 1288+ already creates `globalThis.__vtz_cjs_require(fromDir)`. The issue is that ESM modules don't have `require` in scope.

Fix: In the CJS bootstrap, expose a `globalThis.require` function scoped to the project root (CWD):

```javascript
if (!globalThis.require) {
  globalThis.require = globalThis.__vtz_cjs_require(
    typeof Deno !== 'undefined' ? Deno.core.ops.op_cwd() : '/'
  );
}
```

Also ensure `createRequire` from `node:module` (lines 1358-1370) properly returns a `require` function that:
1. Resolves Node.js built-in modules (`fs`, `path`, `crypto`, etc.)
2. Resolves relative and absolute paths
3. Resolves bare specifiers from node_modules
4. Has `.resolve()` method

For `require('bun:test')` — map to `@vertz/test` internal primitives when running on vtz:

```javascript
// In the require() function, before resolving as file:
if (specifier === 'bun:test') {
  // Return vtz test runtime primitives
  return globalThis.__vertz_test_runtime || {};
}
```

**Acceptance criteria:**
- [ ] `require('fs')` works in ESM modules
- [ ] `require('./relative')` works in ESM modules
- [ ] `require('bun:test')` doesn't throw (returns empty or vtz test primitives)
- [ ] `createRequire(import.meta.url)` returns a working require function
- [ ] `createRequire(url).resolve(specifier)` returns the resolved path

---

### Task 2: Verify @vertz/test test suite

**Files:**
- No file changes — test verification only

**What to verify:**

```bash
vtz test packages/test/
```

**Acceptance criteria:**
- [ ] All 7 @vertz/test failures resolved
- [ ] `exports.test.ts` passes
- [ ] Runtime detection (`typeof Bun`) works without throwing
- [ ] `require` calls in the test bridge work end-to-end
