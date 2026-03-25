# Design: `vertz db pull` — Schema Generation from Existing Database

## Summary

Add a `vertz db pull` CLI command that connects to an existing database, introspects its schema, and generates TypeScript files using the `d.table()` / `d.model()` API. This enables zero-friction adoption for teams with existing databases.

The introspection engine already exists (`introspectSqlite`, `introspectPostgres`). This design covers:
1. **Introspection enhancements** — additional metadata needed for accurate code generation
2. **Code generator** — converts `SchemaSnapshot` → TypeScript source
3. **CLI wiring** — `vertz db pull` command

---

## API Surface

### CLI Command

```bash
# Pull schema from database configured in vertz.config.ts
vertz db pull

# Specify output path (file or directory)
vertz db pull --output src/schema.ts       # Single file
vertz db pull --output src/schema/         # One file per table (trailing slash or dir)

# Preview without writing
vertz db pull --dry-run

# Force overwrite if output file already exists
vertz db pull --force

# Zero-config mode — no vertz.config.ts needed
vertz db pull --url postgres://localhost:5432/myapp --dialect postgres
vertz db pull --url sqlite:./app.db --dialect sqlite

# Defaults: reads db config from vertz.config.ts, outputs to the `schema` path from config
```

**Overwrite safety:** If the target output file already exists and `--force` is not set, the command prints a warning and aborts:

```
File src/schema.ts already exists.
Use --dry-run to preview, or --force to overwrite.
```

This protects developers who have customized their generated schema (added `.readOnly()`, `.hidden()`, relations, access rules).

### `vertz.config.ts` — No new config needed

```typescript
// Existing config — pull uses `dialect` and `url` to connect,
// and `schema` as the default output path
export const db = {
  dialect: 'postgres',
  url: 'postgres://localhost:5432/myapp',
  schema: './src/schema.ts',
};
```

When `--url` and `--dialect` flags are provided, `vertz.config.ts` is not required. This enables zero-config usage for trying the tool before committing to Vertz.

### Code Generator (programmatic API)

```typescript
import { generateSchemaCode } from '@vertz/db';

const files = generateSchemaCode(snapshot, {
  dialect: 'postgres',       // Affects type mapping
  mode: 'single-file',       // 'single-file' | 'per-table'
});

// Returns:
// [{ path: 'schema.ts', content: '...' }]
// or for per-table:
// [
//   { path: 'users.ts', content: '...' },
//   { path: 'posts.ts', content: '...' },
//   { path: 'index.ts', content: '// barrel export' },
// ]
```

### Generated Output Example

Given a Postgres database with `users` and `posts` tables:

**Single-file mode (`schema.ts`):**

```typescript
import { d } from '@vertz/db';

// ---------- users ----------

export const usersTable = d.table('users', {
  id: d.uuid().primary(),
  email: d.text().unique(),
  name: d.text(),
  role: d.enum('role', ['admin', 'user', 'moderator']).default('user'),
  avatarUrl: d.text().nullable(),
  createdAt: d.timestamp().default('now'),
  updatedAt: d.timestamp().default('now'),
});

// ---------- posts ----------

export const postsTable = d.table('posts', {
  id: d.uuid().primary(),
  title: d.text(),
  body: d.text(),
  authorId: d.uuid(),
  published: d.boolean().default(false),
  createdAt: d.timestamp().default('now'),
}, {
  indexes: [
    d.index('authorId', { name: 'idx_posts_author_id' }),
  ],
});

export const postsModel = d.model(postsTable, {
  author: d.ref.one(() => usersTable, 'authorId'),
});
```

> **Note:** Application-level annotations (`.readOnly()`, `.autoUpdate()`, `.hidden()`, `.tenant()`, `.shared()`) are NOT generated — they cannot be inferred from database metadata. The developer adds these after generation. See Non-Goals.

**Per-table mode generates one file per table + a barrel `index.ts`.**

### Column Name Mapping

Database column names are converted from snake_case to camelCase for the generated object keys. The SQL table name is preserved as-is (it's the physical name).

| DB column name | Generated key |
|---|---|
| `created_at` | `createdAt` |
| `author_id` | `authorId` |
| `is_active` | `isActive` |
| `id` | `id` (no change) |

Table names in `d.table('...')` remain unchanged — they're the SQL table name:

```typescript
// Table named "user_profiles" in the database
export const userProfilesTable = d.table('user_profiles', {
  firstName: d.text(),  // DB column: first_name → camelCase key
  // ...
});
```

### Type Mapping — SQL Types to `d.*` Builders

#### PostgreSQL

| SQL type | `d.*` builder | Notes |
|---|---|---|
| `uuid` | `d.uuid()` | |
| `text` | `d.text()` | |
| `character varying` | `d.varchar(length)` | Falls back to `d.text()` if no `character_maximum_length` |
| `boolean` | `d.boolean()` | |
| `integer` | `d.integer()` | `d.serial()` if default matches `nextval(...)` |
| `smallint` | `d.integer()` | Comment: `// Source: smallint` |
| `bigint` | `d.bigint()` | If default matches `nextval(...)`, still `d.bigint()` with comment (no `d.bigserial()`) |
| `numeric` | `d.decimal(precision, scale)` | Uses `numeric_precision` and `numeric_scale` from introspection |
| `real` | `d.real()` | |
| `double precision` | `d.doublePrecision()` | |
| `timestamp with time zone` | `d.timestamp()` | |
| `timestamp without time zone` | `d.timestamp()` | Comment: `// Source: timestamp without time zone` |
| `date` | `d.date()` | |
| `time without time zone` | `d.time()` | |
| `jsonb` | `d.jsonb()` | |
| `json` | `d.jsonb()` | Comment: `// Source: json` |
| `ARRAY` | `d.textArray()` / `d.integerArray()` | Element type resolved via `udt_name` (`_text`, `_int4`) |
| `USER-DEFINED` (enum) | `d.enum(name, values)` | Enum name resolved via `udt_name` |
| `citext` | `d.text()` | Common extension, semantically equivalent |
| `bytea` | `d.text()` | Comment: `// TODO: bytea - no d.blob() builder` |
| Other | `d.text()` | Comment: `// TODO: unmapped type "<type>"` |

The code generator uses `udt_name` (from `information_schema.columns`) to resolve enum names and array element types. See "Introspection Enhancements" below.

#### SQLite

| SQL type (from `mapSqliteType`) | `d.*` builder |
|---|---|
| `text` | `d.text()` |
| `integer` | `d.integer()` |
| `real` | `d.real()` |
| `blob` | `d.text()` + `// TODO: blob type` comment |

**Default value mapping:**

| Default pattern | Generated code |
|---|---|
| `now()` or `CURRENT_TIMESTAMP` | `.default('now')` |
| `nextval(...)` | Use `d.serial()` instead of `d.integer()` |
| `true` / `false` | `.default(true)` / `.default(false)` |
| `'some string'` (quoted) | `.default('some string')` |
| Numeric literal | `.default(42)` |
| Other expressions | `.default(raw)` + `// TODO: verify default` comment |

### Relation Inference

Foreign keys detected by introspection are translated to `d.ref.one()` relations:

```
FK: posts.author_id → users.id
```

Generates:

```typescript
export const postsModel = d.model(postsTable, {
  author: d.ref.one(() => usersTable, 'authorId'),
});
```

**Relation naming heuristic (full algorithm):**
1. Start with the camelCase column name (e.g., `authorId`)
2. Strip `Id` suffix → `author`
3. If no `Id` suffix, strip `Fk` suffix → e.g., `authorFk` → `author`
4. If neither suffix present, use column name as-is
5. If collision (two FKs producing the same relation name), fall back to `${camelCase(targetTable)}By${camelCase(columnName)}`
6. Result is always camelCase

**Tables without foreign keys:** Only generate `d.table()`, no model wrapper.

**Tables with foreign keys:** Generate both `d.table()` and `d.model()` with `d.ref.one()` relations.

### Variable Naming

| DB name | Generated variable |
|---|---|
| `users` | `usersTable` / `usersModel` |
| `user_profiles` | `userProfilesTable` / `userProfilesModel` |
| `post_tags` | `postTagsTable` |

Convention: `camelCase(tableName) + 'Table'` / `camelCase(tableName) + 'Model'`

JS reserved words are not a problem: the `Table`/`Model` suffix prevents collisions (e.g., table `class` → `classTable`, table `default` → `defaultTable`).

### Composite Primary Keys

When a table has multiple primary key columns:

```typescript
export const postTagsTable = d.table('post_tags', {
  postId: d.uuid(),
  tagId: d.uuid(),
  createdAt: d.timestamp().default('now'),
}, {
  primaryKey: ['postId', 'tagId'],
});
```

### Table Ordering — Topological Sort with Cycle Detection

Tables are ordered so that FK targets appear before referencing tables. This uses a topological sort on the FK dependency graph.

**Circular FK handling:** When the graph contains cycles (e.g., `A.bId → B` and `B.aId → A`), the cycle is broken by emitting one of the cycle's tables without its ordering constraint. Since `d.ref.one()` uses lazy `() =>` arrow functions for the target, forward references work at runtime regardless of declaration order. A comment is added:

```typescript
// Note: circular FK reference with <other_table>
```

Self-referential FKs (e.g., `employees.managerId → employees.id`) are handled naturally — the table references itself, which doesn't create an ordering issue.

---

## Introspection Enhancements

The existing Postgres introspection query (`introspectPostgres`) needs to capture additional column metadata for accurate code generation.

### Changes to the Postgres column query

Current:
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = $1 AND table_schema = 'public'
ORDER BY ordinal_position
```

Enhanced:
```sql
SELECT column_name, data_type, is_nullable, column_default,
       udt_name, character_maximum_length, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_name = $1 AND table_schema = 'public'
ORDER BY ordinal_position
```

### Changes to `ColumnSnapshot`

Add optional fields (backward-compatible with existing snapshots):

```typescript
export interface ColumnSnapshot {
  type: string;
  nullable: boolean;
  primary: boolean;
  unique: boolean;
  default?: string;
  annotations?: string[];
  // New fields for code generation:
  udtName?: string;   // Postgres udt_name — resolves enum names and array element types
  length?: number;    // character_maximum_length for varchar
  precision?: number; // numeric_precision for decimal
  scale?: number;     // numeric_scale for decimal
}
```

### How introspection uses the new fields

- When `data_type` is `USER-DEFINED`, store `udt_name` so the codegen can look up `snapshot.enums[udtName]` → generates `d.enum(name, values)`
- When `data_type` is `ARRAY`, `udt_name` is `_text`, `_int4`, etc. → determines `d.textArray()` vs `d.integerArray()`
- When `data_type` is `character varying`, `character_maximum_length` → `d.varchar(length)`
- When `data_type` is `numeric`, `numeric_precision` + `numeric_scale` → `d.decimal(p, s)`

---

## Manifesto Alignment

### "If it builds, it works" (Principle 1)
Generated code uses the same `d.*` API as hand-written schemas. No heuristic-based annotations — only what the database metadata confirms. If the generated file compiles, it's a valid schema.

### "One way to do things" (Principle 2)
Single command: `vertz db pull`. Same `d.table()` / `d.model()` API whether hand-written or generated. The output is fully editable — no special markers or lock files.

### "AI agents are first-class users" (Principle 3)
An LLM can be told "run `vertz db pull`" and get a working schema. The generated code follows the exact same patterns an LLM would write from scratch, making it easy to extend.

### "Performance is not optional" (Principle 7)
Introspection runs batch queries + 3 queries per table (columns, FKs, indexes). For 100 tables, that's ~300 queries against `information_schema` / `pg_catalog` — fast, in-memory lookups. Code generation is pure string manipulation — negligible cost.

---

## Non-Goals

1. **Round-trip sync** — This is a one-time generation tool, not a continuous sync mechanism. After pull, the developer owns the schema file.
2. **Migration generation** — `pull` generates schema code, not migration files. Use `vertz db migrate` after editing the generated schema.
3. **Relation inference beyond FKs** — We only generate `d.ref.one()` for declared foreign keys. We don't guess relations from naming patterns (e.g., `userId` without an FK constraint).
4. **Inverse relation generation** — We generate `d.ref.one()` on the table that has the FK column. We do NOT generate `d.ref.many()` on the target table. The developer adds inverse relations manually after generation (can't reliably infer many-to-many without junction table heuristics).
5. **Application-level annotations** — `.readOnly()`, `.autoUpdate()`, `.hidden()`, `.tenant()`, `.shared()` are application semantics not stored in database metadata. The developer adds these after generation.
6. **View / function / trigger introspection** — Tables and enums only.
7. **Custom type mapping overrides** — No config to customize `uuid → d.uuid()`. The mapping is fixed. Users edit the output if needed.
8. **Schema diffing / merge** — If the user already has a schema file, `pull` does not merge. It requires `--force` to overwrite.

---

## Unknowns

### Resolved

1. **Command name: `pull` vs `introspect`?**
   → `pull`. Shorter, action-oriented, familiar (Prisma uses `db pull`). Follows "one way to do things."

2. **Output mode default?**
   → Single-file when `--output` points to a `.ts` file or is omitted (uses config `schema` path). Per-table when `--output` is a directory.

3. **Can `.readOnly()` / `.autoUpdate()` be inferred?**
   → No. These are application-level annotations with no database metadata. Generating them via naming heuristics would violate "if it builds, it works." Explicitly a non-goal.

4. **Column name casing?**
   → snake_case DB columns are converted to camelCase object keys. Table names in `d.table('...')` are preserved as-is (physical SQL names).

### Open

None identified.

---

## POC Results

No POC needed. The introspection engine is production-tested (used by `vertz db status` for drift detection). The code generator is a deterministic string transform over a well-typed `SchemaSnapshot`.

---

## Type Flow Map

```
                    ┌──────────────┐
                    │  Database    │
                    └──────┬───────┘
                           │ SQL queries (enhanced: +udt_name, +length, +precision)
                           ▼
              ┌────────────────────────┐
              │ introspectPostgres()   │
              │ introspectSqlite()     │
              └────────────┬───────────┘
                           │ SchemaSnapshot (extended ColumnSnapshot)
                           ▼
              ┌────────────────────────┐
              │ generateSchemaCode()   │
              │   mapColumnType()      │  ← uses udtName, length, precision, scale
              │   generateTableCode()  │  ← snake_case → camelCase for column keys
              │   inferRelations()     │  ← FK suffix stripping algorithm
              │   topologicalSort()    │  ← with cycle detection
              └────────────┬───────────┘
                           │ GeneratedFile[]
                           ▼
              ┌────────────────────────┐
              │ CLI: write to disk     │  ← overwrite safety (--force)
              │ or print to stdout     │  ← --dry-run
              └────────────────────────┘
```

No generics flow through user-facing code. `SchemaSnapshot` is the only shared type, and it's already stable and tested. The code generator produces strings, not typed structures.

---

## E2E Acceptance Test

### Happy path — Postgres with relations, enums, indexes

```typescript
describe('Feature: vertz db pull', () => {
  describe('Given a Postgres database with users (enum role, unique email, varchar(255) name) and posts (FK to users, index on authorId)', () => {
    describe('When running generateSchemaCode() in single-file mode', () => {
      it('Then generates valid TypeScript with d.uuid().primary() for PK columns', () => {});
      it('Then generates d.enum("role", ["admin", "user"]) for enum columns using udtName', () => {});
      it('Then generates d.varchar(255) for varchar columns with length', () => {});
      it('Then generates d.decimal(10, 2) for numeric columns with precision/scale', () => {});
      it('Then generates .unique() for unique-constrained columns', () => {});
      it('Then generates .nullable() for nullable columns', () => {});
      it('Then generates .default("now") for timestamp defaults', () => {});
      it('Then generates d.serial() for integer columns with nextval(...) default', () => {});
      it('Then generates d.bigint() (not d.serial()) for bigint columns with nextval(...)', () => {});
      it('Then generates d.index("authorId", { name: "idx_posts_author_id" }) preserving the DB index name', () => {});
      it('Then generates d.model() with d.ref.one() for FK relations', () => {});
      it('Then generates d.table() only (no model) for tables without FKs', () => {});
      it('Then orders tables so FK targets appear before referencing tables', () => {});
      it('Then converts snake_case column names to camelCase object keys', () => {});
      it('Then does NOT generate .readOnly(), .autoUpdate(), .hidden(), or .tenant()', () => {});
      it('Then the generated code compiles without errors', () => {});
    });
  });

  describe('Given a Postgres database with a composite primary key table', () => {
    describe('When running generateSchemaCode()', () => {
      it('Then generates d.table() with { primaryKey: ["col1", "col2"] } option', () => {});
      it('Then does not chain .primary() on individual columns', () => {});
    });
  });

  describe('Given a SQLite database with basic tables', () => {
    describe('When running generateSchemaCode() with dialect "sqlite"', () => {
      it('Then maps INTEGER to d.integer() and TEXT to d.text()', () => {});
      it('Then maps REAL to d.real()', () => {});
    });
  });

  describe('Given generateSchemaCode() in per-table mode', () => {
    describe('When the snapshot has 3 tables', () => {
      it('Then generates 4 files: one per table + barrel index.ts', () => {});
      it('Then each table file imports { d } from "@vertz/db"', () => {});
      it('Then index.ts re-exports all tables and models', () => {});
      it('Then files with FK relations import referenced tables', () => {});
    });
  });

  describe('Given --dry-run flag', () => {
    describe('When running vertz db pull --dry-run', () => {
      it('Then prints generated code to stdout without writing files', () => {});
    });
  });

  describe('Given --force flag with existing output file', () => {
    describe('When running vertz db pull --force', () => {
      it('Then overwrites the existing file', () => {});
    });
  });

  describe('Given existing output file without --force', () => {
    describe('When running vertz db pull', () => {
      it('Then aborts with a warning message', () => {});
    });
  });
});
```

### Edge cases

```typescript
describe('Given a database with no tables', () => {
  describe('When running generateSchemaCode()', () => {
    it('Then returns an empty file with only the import statement', () => {});
  });
});

describe('Given a table with a column type not in the mapping (e.g., tsvector)', () => {
  describe('When running generateSchemaCode()', () => {
    it('Then falls back to d.text() with a TODO comment including the original type', () => {});
  });
});

describe('Given a table with a self-referential FK (e.g., parent_id → same table)', () => {
  describe('When running generateSchemaCode()', () => {
    it('Then generates d.ref.one(() => sameTable, "parentId") correctly', () => {});
  });
});

describe('Given mutual circular FKs (A.bId → B and B.aId → A)', () => {
  describe('When running generateSchemaCode()', () => {
    it('Then emits both tables (cycle broken) with a comment noting the circular reference', () => {});
    it('Then d.ref.one() lazy references work regardless of declaration order', () => {});
  });
});

describe('Given two FKs from one table to the same target table', () => {
  describe('When running generateSchemaCode()', () => {
    it('Then generates distinct relation names using the collision fallback pattern', () => {});
  });
});

describe('Given a table named with a JS reserved word (e.g., "class", "default")', () => {
  describe('When running generateSchemaCode()', () => {
    it('Then generates classTable / defaultTable without collision', () => {});
  });
});

describe('Given Postgres ARRAY columns (text[] and integer[])', () => {
  describe('When running generateSchemaCode()', () => {
    it('Then generates d.textArray() for _text udt_name', () => {});
    it('Then generates d.integerArray() for _int4 udt_name', () => {});
  });
});

describe('Given --url and --dialect flags without vertz.config.ts', () => {
  describe('When running vertz db pull --url postgres://... --dialect postgres --dry-run', () => {
    it('Then connects directly and generates code without requiring config file', () => {});
  });
});
```

---

## `loadIntrospectContext()` — Lightweight Context

The `db pull` command does not need a schema file (the whole point is that no schema exists yet). A new `loadIntrospectContext()` function provides a minimal context:

```typescript
export interface IntrospectContext {
  queryFn: MigrationQueryFn;
  dialect: Dialect;
  close: () => Promise<void>;
}

export async function loadIntrospectContext(
  overrides?: { url?: string; dialect?: 'sqlite' | 'postgres' },
): Promise<IntrospectContext> {
  // If overrides provided (from --url/--dialect flags), use them directly
  // Otherwise, load vertz.config.ts and extract dialect + url only
  // Does NOT require `schema` field in config
}
```

This is distinct from `loadDbContext()` which requires a valid schema file and builds `currentSnapshot`.

---

## Implementation Plan

### Phase 1: Introspection Enhancements + Code Generator (`@vertz/db`)

**What it does:**
- Enhance `introspectPostgres()` to capture `udt_name`, `character_maximum_length`, `numeric_precision`, `numeric_scale`
- Extend `ColumnSnapshot` with optional `udtName`, `length`, `precision`, `scale` fields
- Implement `generateSchemaCode(snapshot, options)` → `GeneratedFile[]`
- Type mapping functions for Postgres and SQLite (using new ColumnSnapshot fields)
- Column chain builder (`.primary()`, `.unique()`, `.nullable()`, `.default()`)
- snake_case → camelCase column name conversion
- Relation inference from `ForeignKeySnapshot` with suffix stripping algorithm
- Topological sort with cycle detection
- Single-file and per-table output modes
- Variable naming (`camelCase + Table/Model`)

**Acceptance criteria:**
```typescript
describe('Given a SchemaSnapshot with users (uuid PK, unique email, enum role, varchar(255) name) and posts (FK authorId → users)', () => {
  describe('When calling generateSchemaCode(snapshot, { dialect: "postgres", mode: "single-file" })', () => {
    it('Then returns one GeneratedFile with valid d.table() and d.model() code', () => {});
    it('Then users table appears before posts table (topological order)', () => {});
    it('Then posts has d.ref.one(() => usersTable, "authorId")', () => {});
    it('Then enum columns use udtName to resolve enum name and values', () => {});
    it('Then varchar columns use length field for d.varchar(N)', () => {});
    it('Then decimal columns use precision/scale for d.decimal(P, S)', () => {});
    it('Then circular FKs are handled with cycle-breaking and comments', () => {});
    it('Then snake_case column names are converted to camelCase keys', () => {});
  });
});
```

### Phase 2: CLI Command (`@vertz/cli`)

**What it does:**
- `vertz db pull` command registration with `--output`, `--dry-run`, `--force`, `--url`, `--dialect` flags
- `loadIntrospectContext()` (lightweight, no schema file required, supports CLI overrides)
- Calls introspection function → code generator → writes output
- Overwrite safety (abort if file exists without `--force`)
- Console formatting

**Acceptance criteria:**
```typescript
describe('Given a valid vertz.config.ts with dialect and url', () => {
  describe('When running dbPullAction()', () => {
    it('Then connects to DB, introspects, generates code, and writes files', () => {});
  });
});

describe('Given --dry-run', () => {
  describe('When running dbPullAction()', () => {
    it('Then returns generated code without writing to disk', () => {});
  });
});

describe('Given existing output file without --force', () => {
  describe('When running dbPullAction()', () => {
    it('Then aborts with overwrite warning', () => {});
  });
});

describe('Given --url and --dialect without config file', () => {
  describe('When running dbPullAction()', () => {
    it('Then connects using CLI flags directly', () => {});
  });
});
```

### Phase 3: Documentation

- Add `vertz db pull` to `packages/mint-docs/guides/db/migrations.mdx`
- Add adoption guide: "Migrating an existing database to Vertz"
- Document type mapping table (including lossy mappings: json→jsonb, smallint→integer)
- Document relation inference rules
- Document that `.readOnly()`, `.autoUpdate()`, `.tenant()` etc. must be added manually

---

## Files to Create/Modify

### New files

| File | Purpose |
|------|---------|
| `packages/db/src/migration/codegen.ts` | Code generator: `SchemaSnapshot` → TypeScript source |
| `packages/db/src/migration/__tests__/codegen.test.ts` | Code generator tests |

### Modified files

| File | Changes |
|------|---------|
| `packages/db/src/migration/introspect.ts` | Postgres column query: add `udt_name`, `character_maximum_length`, `numeric_precision`, `numeric_scale`. Populate new `ColumnSnapshot` fields. |
| `packages/db/src/migration/snapshot.ts` | Add optional fields to `ColumnSnapshot`: `udtName`, `length`, `precision`, `scale` |
| `packages/db/src/migration/__tests__/introspect.test.ts` | Tests for new introspection fields |
| `packages/db/src/migration/index.ts` | Export `generateSchemaCode` and types |
| `packages/cli/src/cli.ts` | Register `vertz db pull` subcommand |
| `packages/cli/src/commands/db.ts` | Add `dbPullAction` |
| `packages/cli/src/commands/load-db-context.ts` | Add `loadIntrospectContext()` (lightweight, supports CLI overrides) |
| `packages/mint-docs/guides/db/migrations.mdx` | Document `vertz db pull` |

### Existing files (reuse as-is)

| File | Reused capability |
|------|---|
| `packages/db/src/migration/introspect.ts` | `introspectSqlite()`, `introspectPostgres()` (enhanced, not replaced) |
| `packages/db/src/migration/snapshot.ts` | `SchemaSnapshot` types (extended, not replaced) |
