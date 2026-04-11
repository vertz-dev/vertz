# Phase 1: `@vertz/sqlite` Package + Runtime Changes

## Context

Issue #2496 replaces `bun:sqlite` imports with `@vertz/sqlite` across the Vertz framework. This phase creates the npm package and updates the vtz runtime. Phase 2 handles the actual import migration.

Design doc: `plans/2496-replace-bun-sqlite.md`

## Tasks

### Task 1: Create `@vertz/sqlite` package with types and stubs

**Files:** (5)
- `packages/sqlite/package.json` (new)
- `packages/sqlite/tsconfig.json` (new)
- `packages/sqlite/tsconfig.typecheck.json` (new)
- `packages/sqlite/bunup.config.ts` (new)
- `packages/sqlite/src/index.ts` (new)

**What to implement:**

Create a package following the `@vertz/test` pattern (`packages/test/`):

**`package.json`:**
- Name: `@vertz/sqlite`, same version as other packages (`0.2.58`)
- Entry: `dist/index.js`, types: `dist/index.d.ts`
- Exports: `{ ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } }`
- Build: `vtzx bunup`, typecheck: `tsgo --noEmit -p tsconfig.typecheck.json`
- No runtime dependencies

**`tsconfig.json`:** Extends `../../tsconfig.json`, `isolatedDeclarations: true`, `outDir: "dist"`, `rootDir: "src"`

**`tsconfig.typecheck.json`:** Extends `../../tsconfig.json`, `noEmit: true`, types: `["node"]`

**`bunup.config.ts`:** Single entry `src/index.ts`, format `esm`, dts with inferTypes

**`src/index.ts`:**
- Stub error message: `'@vertz/sqlite: this module requires the vtz runtime. Run your app with \`vtz dev\` or \`vtz run <script>\` to use the built-in SQLite driver. For Node.js, use better-sqlite3 instead.'`
- `Database` class with typed method signatures and stub bodies that throw
- `Statement` class with typed method signatures and stub bodies that throw
- `export default Database`
- Type generics: `prepare<TRow, TParams>()` → `Statement<TRow, TParams>`
- JSDoc on `Statement`: "Use db.prepare() to create statements. Exported for type annotations only."
- JSDoc on `transaction()`: documents no argument forwarding, no `.deferred()`/`.immediate()`/`.exclusive()`

**Acceptance criteria:**
- [ ] `packages/sqlite/` builds without errors
- [ ] TypeScript resolves `import { Database, Statement } from '@vertz/sqlite'`
- [ ] `prepare<TRow, TParams>()` generic flows to `Statement.all()`, `.get()`, `.run()`
- [ ] `export default Database` works for default imports
- [ ] Stubs throw with helpful message mentioning vtz and better-sqlite3

---

### Task 2: Add `@vertz/sqlite` resolution + `transaction()` to vtz runtime

**Files:** (3)
- `native/vtz/src/runtime/module_loader.rs` (modified)
- `native/vtz/tests/fixtures/sqlite-test/vertz-sqlite-import-test.js` (new)
- `native/vtz/tests/sqlite_integration.rs` (modified)

**What to implement:**

**Module resolution (`module_loader.rs`):**
Add `@vertz/sqlite` to the specifier intercept alongside `vertz:sqlite` and `bun:sqlite` (around line 1784):
```rust
if specifier == "vertz:sqlite" || specifier == "bun:sqlite" || specifier == "@vertz/sqlite" {
    return Ok(ModuleSpecifier::parse(VERTZ_SQLITE_SPECIFIER)?);
}
```

**`transaction()` in synthetic module (`module_loader.rs`):**
Add to the `Database` class in the `VERTZ_SQLITE_MODULE` string:
```javascript
transaction(fn) {
  this.#assertOpen();
  const self = this;
  return function transactionWrapper() {
    self.exec('BEGIN');
    try {
      const result = fn();
      self.exec('COMMIT');
      return result;
    } catch (e) {
      self.exec('ROLLBACK');
      throw e;
    }
  };
}
```

**Test fixture (`vertz-sqlite-import-test.js`):**
```javascript
import { Database } from '@vertz/sqlite';
// Test basic CRUD + transaction
```

**Integration test (`sqlite_integration.rs`):**
Add test case for `@vertz/sqlite` import specifier.
Add test case for `transaction()` commit and rollback.

**Acceptance criteria:**
- [ ] `import { Database } from '@vertz/sqlite'` resolves to synthetic module in vtz runtime
- [ ] `import { Database } from 'vertz:sqlite'` still works
- [ ] `import { Database } from 'bun:sqlite'` still works
- [ ] `db.transaction(() => { ... })()` commits on success
- [ ] `db.transaction(() => { throw ... })()` rolls back on error
- [ ] Nested `transaction()` throws SQLite error
- [ ] `cargo test --all` passes
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes
- [ ] `cargo fmt --all -- --check` passes
