# Phase 2: Migrate All Imports + Build Configs

## Context

Issue #2496 replaces `bun:sqlite` imports with `@vertz/sqlite`. Phase 1 created the package and runtime support. This phase performs the actual migration across all TypeScript files, updates build configs, package dependencies, error messages, and audits `bun-types`.

Design doc: `plans/2496-replace-bun-sqlite.md`

## Tasks

### Task 1: Add `@vertz/sqlite` dependency to consumer packages + update build configs

**Files:** (5)
- `packages/agents/package.json` (modified — add `@vertz/sqlite` to dependencies)
- `packages/agents/bunup.config.ts` (modified — add `@vertz/sqlite` to externals)
- `packages/cli/package.json` (modified — add `@vertz/sqlite` to dependencies)
- `packages/cli/bunup.config.ts` (modified — replace `bun:sqlite` with `@vertz/sqlite` in externals)
- `packages/db/package.json` (modified — add `@vertz/sqlite` to dependencies)

**What to implement:**

Add `"@vertz/sqlite": "workspace:*"` to `dependencies` in agents, cli, db package.json files.
Add `"@vertz/sqlite": "workspace:*"` to `devDependencies` in server, integration-tests package.json files.

Update `packages/cli/bunup.config.ts`: replace `'bun:sqlite'` with `'@vertz/sqlite'` in both external arrays.

Update `packages/agents/bunup.config.ts`: add `external: ['@vertz/sqlite']` — currently has no externals because `bun:sqlite` was auto-externalized as a protocol import.

**Acceptance criteria:**
- [ ] `vtz install` succeeds with new workspace dependency
- [ ] `packages/agents` build succeeds with `@vertz/sqlite` externalized
- [ ] `packages/cli` build succeeds with `@vertz/sqlite` externalized

---

### Task 2: Migrate source file imports

**Files:** (3)
- `packages/agents/src/stores/sqlite-store.ts` (modified)
- `packages/cli/src/commands/load-db-context.ts` (modified)
- `packages/db/src/client/sqlite-driver.ts` (modified)

**What to implement:**

**`sqlite-store.ts`:** Change `import { Database } from 'bun:sqlite'` → `import { Database } from '@vertz/sqlite'`

**`load-db-context.ts`:** Change `await import('bun:sqlite')` → `await import('@vertz/sqlite')`. Update error message from "Failed to load bun:sqlite" to reference `@vertz/sqlite`.

**`sqlite-driver.ts`:** In `resolveLocalSqliteDatabase()`, change `await loadModule('bun:sqlite')` → `await loadModule('@vertz/sqlite')`. Update error messages to reference `@vertz/sqlite` instead of `bun:sqlite`. Update the fallback error text to mention `@vertz/sqlite` and `better-sqlite3`. Update comments referencing `bun:sqlite`.

**Acceptance criteria:**
- [ ] All existing tests for agents, cli, db pass unchanged
- [ ] `grep -r "from 'bun:sqlite'" packages/*/src/` returns zero matches (excluding test files)
- [ ] Error messages reference `@vertz/sqlite`

---

### Task 3: Migrate test file imports

**Files:** (5 — batch 1)
- `packages/agents/src/stores/d1-store.test.ts` (modified)
- `packages/server/src/auth/__tests__/test-db-helper.ts` (modified)
- `packages/server/src/auth/__tests__/server-instance.test.ts` (modified)
- `packages/server/src/auth/__tests__/auth-model-validation.test.ts` (modified)
- `packages/server/src/auth/__tests__/auth-initialize.test.ts` (modified)

**What to implement:**

Change all `import { Database } from 'bun:sqlite'` → `import { Database } from '@vertz/sqlite'` in each file.

Add `"@vertz/sqlite": "workspace:*"` to `devDependencies` in `packages/server/package.json` and `packages/integration-tests/package.json`.

**Acceptance criteria:**
- [ ] All auth tests pass
- [ ] Agent d1-store tests pass

---

### Task 4: Migrate remaining test file imports + comments + docs

**Files:** (5 — batch 2)
- `packages/server/src/auth/__tests__/auth-entity-session.test.ts` (modified)
- `packages/integration-tests/src/__tests__/auth-db-stores.test.ts` (modified)
- `packages/db/src/client/__tests__/transaction.test.ts` (modified)
- `packages/db/src/migration/__tests__/introspect.test.ts` (modified)
- `packages/cli/src/commands/__tests__/load-db-context.test.ts` (modified)

**What to implement:**

Change all `bun:sqlite` imports → `@vertz/sqlite` in each file.
For `local-sqlite-driver.test.ts` in db, update any mocks that reference `bun:sqlite`.
Update comment in `examples/entity-todo/src/api/db-d1.ts`.

**Acceptance criteria:**
- [ ] All db tests pass
- [ ] All integration tests pass
- [ ] All CLI tests pass
- [ ] `grep -r "bun:sqlite" packages/*/src/` returns zero matches

---

### Task 5: Native runtime cleanup + `bun-types` audit

**Files:** (3)
- `native/vtz/src/compiler/import_rewriter.rs` (modified — verify `@vertz/sqlite` handling)
- `native/vtz/src/server/module_server.rs` (verify — document decision)
- Audit results documented in commit message

**What to implement:**

**Import rewriter:** Verify that `@vertz/sqlite` is correctly handled. Since it's a scoped package (not a protocol import like `bun:`), the import rewriter should already route it through the standard dependency resolution path to `/@deps/@vertz/sqlite`. In SSR, the module loader intercepts it. In browser, the stubs package correctly throws. Add/update tests if needed.

**Module server:** Verify behavior. `@vertz/sqlite` will be served from node_modules as the stubs package in browser context — this is correct (SQLite is server-only). Document in commit message that this was verified.

**`bun-types` audit:** Check each migrated package (`agents`, `cli`, `db`, `server`, `integration-tests`) for remaining `bun:*` API usage beyond `bun:sqlite`. If a package no longer uses any `bun:*` APIs, remove `bun-types` from its tsconfig. Document audit results.

**Acceptance criteria:**
- [ ] Full quality gates pass: `vtz test && vtz run typecheck && vtz run lint`
- [ ] `cargo test --all` passes (if native changes)
- [ ] `bun-types` audit documented
- [ ] Zero `bun:sqlite` imports remain in `packages/` TypeScript files
