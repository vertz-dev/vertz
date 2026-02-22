# Design Doc: Schema Migrations — Integration, Not Rebuilding

**Author:** Ben (Tech Lead)  
**Date:** 2026-02-22  
**Status:** Draft

> **TL;DR:** Most of this already exists in `@vertz/db`. We're wiring it together, not building from scratch.

---

## 1. Existing Infrastructure (What's Already There)

### `@vertz/db` Already Provides:

| Component | Location | What It Does |
|-----------|----------|---------------|
| `runner.ts` | `packages/db/src/migration/` | History table (`_vertz_migrations`), checksums, drift detection, out-of-order detection |
| `snapshot.ts` | `packages/db/src/migration/` | Converts `d.table()` → `SchemaSnapshot` |
| `differ.ts` | `packages/db/src/migration/` | Computes structural diff between snapshots |
| `sql-generator.ts` | `packages/db/src/migration/` | Generates dialect-specific SQL from diff |
| `push.ts` | `packages/db/src/cli/` | Direct apply to database |
| `migrate-dev.ts` | `packages/db/src/cli/` | Generate migration file + apply + update snapshot |
| `migrate-deploy.ts` | `packages/db/src/cli/` | Apply pending migrations in order |
| `status.ts` | `packages/db/src/cli/` | Show pending migrations |

### What's NOT Built Yet (Gaps to Acknowledge)
- ❌ Rollback generation (manual `@rollback` comments only)
- ❌ Data migrations (structural only)
- ❌ Type safety integration with entity schema
- ❌ Snapshot persistence (in-memory only currently)

---

## 2. What We're Building (Integration Layer)

This is a thin integration layer that wires existing pieces together with developer experience improvements.

### 2.1 `createDbProvider()` — The Main Entry Point

```typescript
import { createDbProvider } from '@vertz/db';

const db = createDbProvider({
  dialect: 'sqlite',  // or 'd1'
  schema: schema,     // your d.table() definitions
  connection: { path: './data.db' },
  
  // New: migration integration
  migrations: {
    autoApply: true,        // default: true in dev, false in prod
    snapshotPath: '.vertz/schema-snapshot.json',
  },
});
```

**Dev/Prod Mode Detection:**
- Uses `process.env.NODE_ENV` or `process.env.VERTZ_ENV`
- Default: `autoApply = true` when `NODE_ENV !== 'production'`

### 2.2 Snapshot Storage (NEW)

```typescript
// packages/db/src/migration/snapshot-storage.ts
interface SnapshotStorage {
  load(path: string): Promise<SchemaSnapshot | null>;
  save(snapshot: SchemaSnapshot, path: string): Promise<void>;
}

// Usage in createDbProvider:
const previous = await snapshotStorage.load(opts.migrations.snapshotPath);
const current = snapshot.create(opts.schema);

if (previous) {
  const diff = differ.compute(previous, current);
  if (diff.hasChanges) {
    const sql = sqlGenerator.generate(diff);
    await runner.apply(queryFn, sql, 'auto-migration');
  }
}

await snapshotStorage.save(current, opts.migrations.snapshotPath);
```

### 2.3 Column Rename Detection

The differ already detects column changes, but renames look like drop+add. Add heuristic:

```typescript
// If column X dropped and column Y added with same type → treat as rename
if (droppedColumn && addedColumn && 
    sameType(dropped, added) && 
    similarName(dropped.name, added.name)) {
  return { type: 'rename', from: dropped.name, to: added.name };
}
```

### 2.4 Destructive Change Handling

```typescript
function classifyChange(diff: SchemaDiff): 'safe' | 'destructive' | 'blocking' {
  const destructiveTypes = ['drop_table', 'drop_column', 'alter_column_type'];
  
  if (diff.has(destructiveTypes)) {
    return isProduction ? 'blocking' : 'destructive';
  }
  return 'safe';
}

// In dev: log warning, proceed anyway
// In prod: require --force flag
```

---

## 3. Developer Experience

### 3 Steps to Get Started

```bash
# 1. Add schema
echo "export const schema = d.table('todos', { ... })" > src/schema.ts

# 2. Initialize (auto-creates snapshot)
pnpm vertz db init

# 3. Run dev — auto-applies changes
pnpm dev
```

### CLI Commands

```bash
# Direct apply for rapid prototyping (dev only)
vertz db push

# Generate migration file + apply locally
vertz db migrate dev --name add_priority

# Apply pending migrations (CI/production)
vertz db migrate deploy

# Show pending migrations
vertz db status
```

### Migration File Format

```sql
-- Migration: add_priority_column
-- Created: 2026-02-22T16:00:00Z
-- Checksum: sha256...

ALTER TABLE todos ADD COLUMN priority INTEGER DEFAULT 0;

-- @rollback
ALTER TABLE todos DROP COLUMN priority;
```

---

## 4. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      Developer Workflow                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  schema.ts ──► createDbProvider() ──► [dev: auto-apply]         │
│       │                    │                                     │
│       │                    ▼                                     │
│       │           snapshot.ts (existing) ──► SchemaSnapshot    │
│       │                    │                                     │
│       │                    ▼                                     │
│       │           differ.ts (existing) ──► SchemaDiff           │
│       │                    │                                     │
│       │                    ▼                                     │
│       │           sql-generator.ts (existing) ──► SQL          │
│       │                    │                                     │
│       ▼                    ▼                                     │
│  [NEW] snapshot-storage.ts ◄── [NEW] .vertz/schema-snapshot.json│
│                                                                  │
│  push.ts (existing) ──► migrate-dev.ts (existing)               │
│                  └──► migrate-deploy.ts (existing)              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Implementation Steps

### Phase 1: Integration (Priority)
1. **Implement `SnapshotStorage`** — File-based persistence for snapshots
2. **Wire into `createDbProvider()`** — Auto-migration on init
3. **Dev/prod detection** — `NODE_ENV` + `--force` flag

### Phase 2: DX Improvements
4. **Column rename detection** — Heuristic in differ
5. **Destructive change warnings** — Log in dev, block in prod
6. **`vertz db init`** — Bootstrap command

### Phase 3: Polish
7. **`vertz db status`** — Show pending with diff preview
8. **Test with entity-todo** — End-to-end verification

---

## 6. Open Questions

| Question | Current Thinking |
|----------|------------------|
| Snapshot location | `.vertz/schema-snapshot.json` (gitignored) |
| D1 bundling | Use Vite `import.meta.glob` for migrations at build time |
| Rollback generation | Manual for now; @rollback comment is enough |
| Data migrations | Out of scope; manual SQL only |

---

## 7. Summary

- ✅ `runner.ts` — handles history, checksums, drift ✓
- ✅ `snapshot.ts` — schema → snapshot ✓
- ✅ `differ.ts` — diff computation ✓
- ✅ `sql-generator.ts` — SQL generation ✓
- ✅ CLI commands (push, migrate-dev, migrate-deploy, status) ✓
- ⏳ Snapshot persistence (file-based)
- ⏳ Auto-migration in createDbProvider()
- ⏳ Column rename detection
- ⏳ Destructive change handling

**Most exists. We're wiring it together.**
