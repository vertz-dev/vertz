# feat(cli): Wire auto-migrate in dev server pipeline

**Issue:** #958

## Problem

The dev server doesn't auto-migrate when schema files change. The `autoMigrate()` function exists in `@vertz/db`, the watcher categorizes `.schema.ts` files, and the orchestrator has a `db-sync` stage — but the stage is a noop with a TODO comment. Users must manually run `vertz db migrate` during development.

## API Surface

No new public API. This wires existing internal pieces:

```ts
// Developer runs:
vertz dev

// Developer edits tasks.schema.ts — terminal shows:
// [auto-migrate] Previous snapshot found. Computing diff...
// [auto-migrate] Applied 1 change(s).
// [auto-migrate] Snapshot saved.
```

Log output comes from `autoMigrate()` directly (prefix `[auto-migrate]`). No wrapping or reformatting.

## What needs to change

### 1. `getAffectedStages('schema')` must include `'db-sync'`

**File:** `packages/cli/src/pipeline/watcher.ts` line 80-82

Currently schema changes return `['codegen', 'openapi']`. Add `'db-sync'` — and place it BEFORE `'codegen'` so the DB schema is current before codegen generates the DB client types.

New return: `['db-sync', 'codegen', 'openapi']`.

### 2. Create a lightweight `loadAutoMigrateContext()` helper

**File:** `packages/cli/src/commands/load-db-context.ts` (new export)

`loadDbContext()` is too heavyweight for hot-path usage — it loads migration files, reads previous snapshots, and creates jiti instances that cache modules. Instead, create `loadAutoMigrateContext()` that returns only what `autoMigrate()` needs:

```ts
interface AutoMigrateContext {
  currentSchema: SchemaSnapshot;
  snapshotPath: string;
  dialect: 'sqlite';
  db: MigrationQueryFn;
  close: () => Promise<void>;
}
```

Key differences from `loadDbContext()`:
- Uses `import()` with cache-busting query string (`?t=<timestamp>`) instead of jiti — ensures schema changes are picked up on every call.
- Returns `snapshotPath` (which `DbCommandContext` currently omits).
- Doesn't load migration files, previous snapshot, or create storage — `autoMigrate()` handles those internally.
- Wraps connection creation so that if schema loading fails, no connection is leaked.

### 3. `runDbSync()` must call `autoMigrate()`

**File:** `packages/cli/src/pipeline/orchestrator.ts`

Replace the noop with:
1. Skip if `config.autoSyncDb` is false (return `success: true`, output: `'DB sync skipped (disabled)'`)
2. Call `loadAutoMigrateContext()` — if it throws (e.g., no `db` config in `vertz.config.ts`), return `success: true` with output `'DB sync skipped (no db config)'`. This handles UI-only projects gracefully.
3. Call `autoMigrate()` with the context
4. Call `context.close()` in a `finally` block
5. Catch migration errors → return `{ success: false, error }` (never crash the dev server)

### 4. Add `runDbSync()` to `runFull()` pipeline

**File:** `packages/cli/src/pipeline/orchestrator.ts`

Add `db-sync` stage after analyze and before codegen in `runFull()`. This ensures auto-migrate runs on initial `vertz dev` startup (e.g., user pulls a branch with schema changes and starts dev server).

### 5. Add `'db-sync'` to `PipelineWatcherHandlers`

**File:** `packages/cli/src/pipeline/types.ts`

Add `'db-sync': (changes: FileChange[]) => void` to the handlers type. Currently the dev command dispatches via `orchestrator.runStages()` (not the handlers type), but this keeps the type consistent with the available stages.

## Manifesto Alignment

- **Convention over configuration**: Auto-migrate is on by default (`autoSyncDb: true`). No setup needed.
- **Predictability over convenience**: Destructive changes (table/column drops) are warned, not silently applied.
- **Explicit over implicit**: Terminal output shows exactly what changed.

## Non-Goals

- Custom migration strategies during dev (always uses `autoMigrate`)
- Rollback support during dev
- Multi-database support in a single dev session
- UI/browser notifications of migration status
- `--no-db-sync` CLI flag (can be added later; `autoSyncDb` config exists but isn't user-exposed yet)
- Postgres support for `autoMigrate()` dialect (currently typed as `'sqlite'` only — tracked separately)

## Unknowns

No unknowns. All pieces exist and are individually tested. This is pure wiring with a lightweight context helper.

## Phases

### Phase 1: Wire `db-sync` stage dispatch + update types

1. Add `'db-sync'` to `getAffectedStages('schema')` — place it first: `['db-sync', 'codegen', 'openapi']`
2. Add `'db-sync': (changes: FileChange[]) => void` to `PipelineWatcherHandlers`
3. Update existing tests that assert schema stages to include `'db-sync'`

**Integration test:** `getStagesForChanges([{ type: 'change', path: 'x.schema.ts' }])` includes `'db-sync'` and `'db-sync'` appears before `'codegen'`.

### Phase 2: Create `loadAutoMigrateContext()` helper

1. Add `loadAutoMigrateContext()` to `packages/cli/src/commands/load-db-context.ts`
2. Uses dynamic `import()` with `?t=<timestamp>` for cache-busting schema loads
3. Returns `AutoMigrateContext` with only what `autoMigrate()` needs
4. Handles missing `vertz.config.ts` / missing `db` config by throwing a specific error (caught upstream)
5. No connection leak: open connection only after schema loads successfully

**Integration test:** `loadAutoMigrateContext()` returns valid context with schema snapshot, snapshot path, and queryFn. Throws clear error when no db config exists.

### Phase 3: Implement `runDbSync()` in orchestrator

1. Replace the noop `runDbSync()` with real implementation using `loadAutoMigrateContext()` + `autoMigrate()`
2. Guard on `config.autoSyncDb` (skip when false)
3. Guard on missing db config (skip gracefully, don't fail)
4. Add `db-sync` to `runFull()` pipeline (after analyze, before codegen)
5. Wrap in try/catch/finally with connection cleanup

**Integration test:** `orchestrator.runStages(['db-sync'])` with `autoSyncDb: true` calls `autoMigrate()` (mocked) and returns `success: true`. With `autoSyncDb: false`, returns `success: true` without calling `autoMigrate()`. With no db config, returns `success: true` (skipped).

### Phase 4: Docs update

Update `packages/docs/guides/db/migrations.mdx` to reflect auto-migrate during dev.
