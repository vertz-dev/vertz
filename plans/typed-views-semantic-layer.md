# Typed Views & Semantic Layer

> **Status:** Roadmap (post-launch)
> **Issue:** #957
> **Scope:** Phase 1 (views) through Phase 4 (pipeline targets)

## Problem

Raw SQL queries (`db.query(sql`...`)`) return untyped results. Users get `Record<string, unknown>` and cast manually. This pushes people toward query builders not because builders read better, but because they're typed.

Meanwhile, complex read patterns (JOINs, aggregations, filtered subsets) get scattered as raw SQL across the codebase with no reuse, no type safety, and no migration support.

## Solution: Views as the Primary Abstraction

Instead of typing arbitrary raw SQL calls, introduce **typed views** as a first-class schema primitive. Users define a view once using raw SQL, the compiler parses the SQL and infers TypeScript types from the known schema, and the view becomes queryable through the same typed SDK used for tables.

This is the right abstraction because:

1. **SQL parsing is bounded** — only runs on schema files, not scattered across the app
2. **Composes with the existing SDK** — views get filters, pagination, ordering for free
3. **Maps to a real DB concept** — `CREATE VIEW` / `CREATE MATERIALIZED VIEW` in migrations
4. **Read-only by nature** — no accidental mutations through a view
5. **Foundation for a semantic layer** — views grow into materialized views, incremental refresh, measures/dimensions, and pipeline targets

Raw `db.query()` stays as an untyped escape hatch for one-off queries. Views are the typed, composable abstraction.

---

## Phase 1: Typed Views

### API

```ts
// Define in schema — compiler infers column types from SQL + known table schemas
const activeTasks = d.view('active_tasks', sql`
  SELECT t.id, t.title, t.status, u.name as assignee_name
  FROM tasks t
  JOIN users u ON t.assignee_id = u.id
  WHERE t.status != 'archived'
`);
// Compiler infers: { id: string; title: string; status: TaskStatus; assigneeName: string }
```

```ts
// Query with the same typed SDK as tables
const result = await db.activeTasks.list({
  where: { assigneeName: { contains: 'Alice' } },
  orderBy: { title: 'asc' },
  limit: 20,
});
```

### Compiler's Role

The compiler (likely a new `@vertz/db-compiler` package or extension to the Bun plugin) needs to:

1. **Extract static SQL** from `sql` tagged template literals in `d.view()` calls
2. **Parse the SQL** to identify tables, columns, aliases, and expressions
3. **Resolve against known schemas** — cross-reference `d.table()` definitions to map columns to TypeScript types
4. **Handle expressions** with known type mappings:

| SQL Expression | Inferred Type | Strategy |
|---|---|---|
| `t.id`, `t.name` | From schema | Direct column lookup |
| `u.name as assignee_name` | From schema + alias | Column lookup + rename |
| `t.*` | All columns from `t` | Wildcard expansion from schema |
| `COUNT(*)` | `number` | Known aggregate function |
| `SUM(amount)`, `AVG(x)` | `number` | Known aggregate function |
| `COALESCE(a, b)` | Type of `a` (non-nullable) | Known function semantics |
| `CASE WHEN ... THEN x ELSE y` | Union of branch types | Expression analysis |
| Exotic expressions | Explicit declaration | Fallback (see below) |

5. **Generate the view's type** — equivalent to `$infer` on tables

### Explicit Column Fallback

When the compiler can't infer a column type (exotic functions, complex expressions), the user provides explicit column declarations for just those columns:

```ts
const taskStats = d.view('task_stats', sql`
  SELECT
    assignee_id,
    status,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time) as p95
  FROM tasks
  GROUP BY assignee_id, status
`, {
  // Compiler infers assignee_id and status from schema
  // User fills the gap for p95:
  columns: {
    p95: d.real(),
  },
});
```

Hybrid approach: compiler infers what it can, user fills gaps only when needed. If the compiler can fully resolve all columns, no `columns` option required.

### Views Are Read-Only

Views expose only the read side of the SDK — `list()`, `get()`, `count()`, `aggregate()`. No `create()`, `update()`, `delete()`. Enforced at the type level via a `ViewDelegate` (vs `ModelDelegate` for tables).

```ts
await db.activeTasks.list({ ... });    // works
await db.activeTasks.create({ ... });  // compile error
```

### Migration Integration

New change types in the differ:

- `view_added` — `CREATE VIEW name AS ...`
- `view_removed` — `DROP VIEW name`
- `view_altered` — `DROP VIEW` + `CREATE VIEW` (views can't be meaningfully ALTER'd)

Schema snapshot gets a `views` section:

```json
{
  "version": 1,
  "tables": { ... },
  "views": {
    "active_tasks": {
      "sql": "SELECT t.id, ...",
      "materialized": false,
      "columns": { "id": "uuid", "title": "text", "status": "text", "assignee_name": "text" }
    }
  },
  "enums": { ... }
}
```

### SQL Parser Selection

Needs a SQL parser as a dev dependency (compile-time only, not runtime). Options:

| Library | Fit | Notes |
|---|---|---|
| `pgsql-ast-parser` | Best for PostgreSQL | ~150KB, comprehensive AST, stable |
| `node-sql-parser` | Multi-dialect | Pure JS, lighter, less PostgreSQL-specific |
| Hand-written regex | Minimal | Covers 80% cases, brittle on complex SQL |

Recommendation: start with `pgsql-ast-parser` for correctness, evaluate if a lighter approach suffices after the POC.

---

## Phase 2: Materialized Views

### API

```ts
const taskStats = d.view('task_stats', sql`
  SELECT assignee_id, status, COUNT(*) as task_count
  FROM tasks
  GROUP BY assignee_id, status
`, { materialized: true });

// Read like any view
const stats = await db.taskStats.list({ where: { status: 'in_progress' } });

// Refresh
await db.taskStats.refresh();                        // full refresh
await db.taskStats.refresh({ concurrently: true });  // non-blocking (requires unique index)
```

### Tenant-Scoped Refresh

PostgreSQL can't partition materialized views natively. But because we own the schema and migrations, the framework can generate the right structure under the hood.

```ts
const tenantStats = d.view('tenant_task_stats', sql`
  SELECT tenant_id, assignee_id, status, COUNT(*) as task_count
  FROM tasks
  GROUP BY tenant_id, assignee_id, status
`, {
  materialized: true,
  scopedRefresh: 'tenant_id',
});

// Refresh only one tenant's data — fast even with millions of rows
await db.tenantStats.refresh({ tenantId: 'org_123' });
```

**What the framework generates:**

Instead of one monolithic `MATERIALIZED VIEW`, it generates:

1. A partitioned backing table (`_mv_tenant_task_stats`) partitioned by `tenant_id`
2. A refresh function that recomputes one partition: `DELETE FROM _mv_... WHERE tenant_id = $1; INSERT INTO _mv_... SELECT ... WHERE tenant_id = $1`
3. A regular view on top for transparent querying

The user sees `d.view()`. The framework handles the partitioning strategy. This is the kind of abstraction we can build because we own the full stack.

### Migration Integration

- `CREATE MATERIALIZED VIEW name AS ...`
- `DROP MATERIALIZED VIEW name`
- `REFRESH MATERIALIZED VIEW [CONCURRENTLY] name`
- For scoped refresh: partitioned table DDL + refresh function

---

## Phase 3: Incremental Materialized Views

dbt-style incremental refresh — only process new/changed rows:

```ts
const dailyRevenue = d.view('daily_revenue', sql`
  SELECT DATE(created_at) as day, SUM(amount) as revenue
  FROM orders
  GROUP BY DATE(created_at)
`, {
  materialized: true,
  incremental: {
    key: 'day',                    // unique key for merge
    watermark: 'created_at',       // only scan rows after last refresh
    strategy: 'merge',             // merge | delete_insert | append
  },
});

await db.dailyRevenue.refresh(); // only processes new orders since last refresh
```

The compiler validates that `watermark` references a real column with the right type, that `key` columns exist in the view output, etc. dbt can't do this — it's untyped SQL strings. We catch schema mismatches at compile time.

### Incremental Strategies

| Strategy | Behavior | Best For |
|---|---|---|
| `append` | INSERT new rows only | Immutable event streams |
| `merge` | UPSERT: update existing + insert new | Aggregations with changing data |
| `delete_insert` | DELETE matching keys + re-insert | Late-arriving data, batch recomputation |

---

## Phase 4: Semantic Layer (Measures & Dimensions)

> **Note:** Naming TBD. Avoid "cube" (Cube.js's concept). Consider `d.metrics()`, `d.semantic()`, `d.lens()`, or a Vertz-specific term.

Typed measures and dimensions built on top of views:

```ts
const orderMetrics = d.metrics('order_metrics', {
  source: orders, // reference to d.table() or d.view()

  measures: {
    count: d.measure.count(),
    revenue: d.measure.sum('amount'),
    avgOrderValue: d.measure.avg('amount'),
  },

  dimensions: {
    status: d.dimension('status'),
    category: d.dimension.join(products, 'category'),
    createdAt: d.dimension.time('created_at', {
      granularities: ['day', 'week', 'month'],
    }),
  },
});

// Query the semantic layer — fully typed
const result = await db.orderMetrics.query({
  measures: ['revenue', 'count'],
  dimensions: ['category', 'createdAt.month'],
  where: { status: 'completed' },
  dateRange: { createdAt: { from: '2025-01-01', to: '2025-12-31' } },
});
// Type: { revenue: number; count: number; category: string; createdAtMonth: Date }[]
```

### Why This Beats dbt and Cube.js

| Concern | dbt | Cube.js | Vertz |
|---|---|---|---|
| Schema definition | SQL files (untyped) | YAML/JS (untyped) | TypeScript (fully typed) |
| Column validation | Runtime errors | Runtime errors | Compile-time errors |
| Rename propagation | Manual | Manual | Automatic (compiler) |
| Incremental logic | SQL convention | Pre-aggregation rules | Typed, validated config |
| Multi-dialect | Per-adapter SQL | Per-driver config | Dialect abstraction |
| Query SDK | None (generates SQL) | REST/GraphQL API | Same typed SDK as tables |

The key advantage: **we own the schema**. Column renames break at compile time. Type mismatches are caught before deployment. No YAML, no runtime surprises.

## Phase 5: Pipeline Targets

Export transformations to external analytics stores:

```ts
const pipeline = d.pipeline('analytics', {
  models: [dailyRevenue, orderMetrics],
  targets: {
    postgres: { refresh: 'incremental' },
    clickhouse: { connection: 'analytics_ch' },
    bigquery: { dataset: 'analytics', project: '...' },
  },
  schedule: '0 2 * * *', // cron
});
```

Because the schema is typed and the transformations are defined as views/metrics, we can generate target-specific SQL (ClickHouse's `INSERT INTO ... SELECT`, BigQuery's `MERGE`, etc.) from the same source definitions.

---

## Manifesto Alignment

- **Compile-time over runtime** — SQL parsed and validated at build time, not at query time
- **Explicit over implicit** — view definitions are explicit schema declarations, not scattered queries
- **One way to do things** — views are THE way to do typed complex reads. Raw `db.query()` is the untyped escape hatch
- **Predictability over convenience** — views are read-only by design, materialized views have explicit refresh semantics

## Non-Goals (Phase 1)

- Full query builder replacing raw SQL (the typed SDK covers standard CRUD)
- ORM-style relation loading in views (use entity `include` API for that)
- Real-time streaming views (Phase 4+ territory)
- Cross-database view federation

## Unknowns

### Needs POC

1. **SQL parser accuracy** — Can `pgsql-ast-parser` handle the range of SQL we need? What are the edge cases (CTEs, window functions, lateral joins)?
2. **Compiler integration** — How does the SQL compiler fit into the build pipeline? Separate package or Bun plugin extension?
3. **Scoped refresh performance** — Does the partitioned backing table approach actually outperform full refresh at realistic tenant counts?

### Discussion-Resolvable

1. **Semantic layer naming** — What do we call `d.metrics()` / `d.cube()` / `d.lens()`?
2. **SQLite view support** — SQLite has views but no materialized views. Do we polyfill with tables + triggers, or only support materialized views on PostgreSQL?
3. **View dependency ordering** — Views can reference other views. How does the migration system handle ordering?
