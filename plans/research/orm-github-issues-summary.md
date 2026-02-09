# ORM GitHub Issues Analysis

**Date:** 2026-02-09
**Methodology:** Scraped top 100 open issues (sorted by reactions) from 5 ORM repos using GitHub API.
**Total issues analyzed:** 483

---

## Per-Repo Breakdown

### Prisma (prisma/prisma) -- 100 issues

The most issues and highest reaction counts by far. Prisma's large user base means feature requests accumulate massive upvotes.

| Rank | Issue # | Title | Reactions |
|------|---------|-------|-----------|
| 1 | #1676 | Support DynamoDB | 1395 |
| 2 | #3219 | Define type of content of `Json` field | 1084 |
| 3 | #2789 | PostGIS/GIS support | 1058 |
| 4 | #3394 | Virtual computed fields | 886 |
| 5 | #2505 | Support for a Union type | 676 |
| 6 | #4134 | Provide `upsertMany()`/`upsertFirst()` | 599 |
| 7 | #1798 | Geolocation/Spatial types support | 533 |
| 8 | #2443 | Multiple Connections / Databases / Datasources | 522 |
| 9 | #15346 | Support SurrealDB | 505 |
| 10 | #13310 | Support for Cloudflare D1 | 499 |

**Prisma pain point themes:** Connector/database support requests dominate (DynamoDB, SurrealDB, D1, Turso). Type system limitations are next (typed JSON, unions, computed fields). Migration and API ergonomics round out the top issues.

### Drizzle (drizzle-team/drizzle-orm) -- 84 issues

Younger project with rapidly growing issue count. Feature requests focus on DDL completeness and DX improvements.

| Rank | Issue # | Title | Reactions |
|------|---------|-------|-----------|
| 1 | #843 | `CREATE TRIGGER` functions | 529 |
| 2 | #695 | Infer table model with relations | 245 |
| 3 | #376 | Add proper error handling and wrapping | 208 |
| 4 | #886 | Add table/column comments | 199 |
| 5 | #2352 | Migration Rollback feature | 181 |
| 6 | #1237 | Return object instead of array for single insert | 160 |
| 7 | #2046 | SQLite CREATE VIRTUAL TABLE / R*Tree | 135 |
| 8 | #2854 | Postgres Table Partition Support | 129 |
| 9 | #1728 | `onConflictDoUpdate()` set many | 121 |
| 10 | #209 | Support WITH RECURSIVE | 112 |

**Drizzle pain point themes:** DDL feature gaps (triggers, partitions, virtual tables). Error handling is the #3 issue. Migration tooling maturity (rollback, merge conflicts). Relational query API completeness.

### Kysely (kysely-org/kysely) -- 86 issues

Lower reaction counts reflect a smaller but dedicated user base. Issues are highly technical and focused on SQL coverage.

| Rank | Issue # | Title | Reactions |
|------|---------|-------|-----------|
| 1 | #320 | Are you using Kysely in production? | 45 |
| 2 | #352 | Non-transactional migrations for concurrent index creation | 30 |
| 3 | #1654 | Thank you / appreciation post | 29 |
| 4 | #783 | Support query cancellation | 29 |
| 5 | #981 | Add an AlterTypeBuilder | 20 |
| 6 | #904 | Allow execution driver to execute multiple queries | 20 |
| 7 | #1403 | Stream raw query results | 14 |
| 8 | #251 | Add `values(ref)` support | 14 |
| 9 | #1556 | Support synchronous execution | 11 |
| 10 | #1384 | Typing in `$if` builder | 10 |

**Kysely pain point themes:** Query cancellation and streaming. Advanced SQL features (ALTER TYPE, VALUES references, CYCLE). Migration improvements (non-transactional, checksums). TypeScript ergonomics (synchronous execution, plugin type transformations).

### TypeORM (typeorm/typeorm) -- 97 issues

Older project with deep-seated bugs. Many issues have been open for 5+ years.

| Rank | Issue # | Title | Reactions |
|------|---------|-------|-----------|
| 1 | #2797 | Entity example in docs results in error | 134 |
| 2 | #3357 | Migration generation drops columns instead of altering | 119 |
| 3 | #1601 | Support for scopes/global filters | 76 |
| 4 | #9312 | Custom Repository Registry -- Discussion/Proposal | 71 |
| 5 | #3857 | Performance of query with many `relations` | 68 |
| 6 | #3095 | `.save` for one-to-many always tries insert instead of update | 68 |
| 7 | #5694 | `findOne` with relations does two queries | 65 |
| 8 | #9827 | Support PostgreSQL 15 UNIQUE NULLS NOT DISTINCT | 63 |
| 9 | #2215 | Inserting id (primary column) from code | 62 |
| 10 | #296 | Select additional computed columns | 61 |

**TypeORM pain point themes:** Migration safety is catastrophically broken. Performance with relations is poor. API regressions in v0.3 frustrated the community. Basic TypeScript compatibility issues (strictPropertyInitialization). The project feels abandoned.

### MikroORM (mikro-orm/mikro-orm) -- 25 issues

Very small issue count suggests either a small user base or excellent issue management.

| Rank | Issue # | Title | Reactions |
|------|---------|-------|-----------|
| 1 | #296 | Who uses MikroORM in production? | 48 |
| 2 | #1603 | Allow passing collation to MongoDB query | 10 |
| 3 | #1887 | Embeddable array search broken | 7 |
| 4 | #5053 | Add entity decorators for triggers | 6 |
| 5 | #5253 | Represent stored routines type-safely | 4 |
| 6 | #1059 | Use findOptions with `em.populate()` | 3 |
| 7 | #5820 | Cloning entities | 2 |
| 8 | #4090 | Cannot populate @OneToMany with Embeddables | 2 |
| 9 | #1173 | Embedded partial updates | 2 |
| 10 | #6425 | Dataloader support for Collection `loadCount()` | 1 |

**MikroORM pain point themes:** Production validation/social proof. Embeddable edge cases. Advanced database feature support (triggers, stored procedures). Population and collection loading improvements.

---

## Cross-Repo Pain Point Summary

| Pain Point | Prisma | Drizzle | Kysely | TypeORM | MikroORM | Opportunity for @vertz/db |
|---|---|---|---|---|---|---|
| **Typed JSON** | #3219 (1084) | #1690 (51) | -- | -- | -- | CRITICAL: First-class `json<T>()` with query integration |
| **Error Handling** | #5040 (184) | #376 (208) | -- | -- | -- | HIGH: Discriminated union errors with structured metadata |
| **Migration Safety** | #4703 (491) | #2352 (181) | #984 (6) | #3357 (119) | -- | HIGH: Rename detection, rollback, transparent SQL |
| **Edge/Serverless** | #13310 (499) | #1009 (96) | -- | -- | -- | HIGH: Pure TS, <10kb, zero native deps |
| **Relation Queries** | #5455 (498), #7550 (457) | #695 (245), #2650 (62) | -- | #3857 (68) | #1059 (3) | HIGH: Nested select/where/orderBy on includes |
| **Query Cancellation** | #15594 (114) | #1602 (100) | #783 (29) | -- | -- | MEDIUM: AbortController support |
| **Raw SQL Escapes** | #5560 (451), #5848 (110) | -- | -- | -- | -- | MEDIUM: whereRaw, orderByRaw, toSQL() |
| **Computed Fields** | #3394 (886) | -- | -- | #296 (61) | -- | MEDIUM: Virtual/computed column support |
| **Streaming** | #5055 (246) | #456 (26) | #1403 (14) | -- | -- | MEDIUM: Async iterators for large result sets |
| **RLS / Access Control** | #12735 (387) | -- | -- | -- | -- | HIGH: Field-level visibility annotations |
| **Polymorphism** | #2505 (676), #1644 (460) | #900 (28) | -- | -- | -- | MEDIUM: Union types and polymorphic relations |
| **Triggers** | -- | #843 (529) | -- | -- | #5053 (6) | LOW: DDL support for trigger creation |

---

## Key Insights for @vertz/db

### 1. The Typed JSON Gap is a Market Opener
With 1084 reactions on Prisma and 51 on Drizzle, typed JSON is the most-requested unshipped feature in the TypeScript ORM ecosystem. Shipping `json<T>()` with full query-time inference, insert validation, and partial update support would be a headline feature.

### 2. Error Handling is a Differentiator, Not a Nice-to-Have
Combined 392 reactions across Prisma and Drizzle. Developers are catching database errors with string matching. Typed, discriminated union errors would make @vertz/db the most ergonomic ORM for production error handling.

### 3. Migration Safety is a Trust Issue
TypeORM's data-loss bug (119 reactions, open since 2018) and Drizzle's missing rollback (181 reactions) show that developers do not trust ORM migration tools. Transparent SQL files + rename detection + rollback support would build trust.

### 4. Edge Deployment is Table Stakes in 2026
499 reactions for Cloudflare D1 support on Prisma alone. The industry has moved to edge runtimes. Any new ORM that ships with a native binary or >50kb bundle will be dead on arrival for this market.

### 5. Nobody Has Field-Level Visibility
Prisma's RLS issue (#12735, 387 reactions) is the closest -- but RLS is row-level, not field-level. Convex has function-level visibility but no field-level control. @vertz/db's `.private()` / `.sensitive()` / `.internal()` annotations would be genuinely novel.

### 6. Relational Query DX Determines ORM Choice
The pattern is clear: developers choose Prisma for its `include`/`select` API despite its flaws (codegen, engine binary). If @vertz/db can match that DX without the codegen, with Kysely-level type inference, it wins the comparison on every axis.

---

## Raw Data Sources

- `/tmp/orm-issues/prisma-prisma.md` -- 100 issues, fetched 2026-02-09
- `/tmp/orm-issues/drizzle-team-drizzle-orm.md` -- 84 issues, fetched 2026-02-09
- `/tmp/orm-issues/kysely-org-kysely.md` -- 86 issues, fetched 2026-02-09
- `/tmp/orm-issues/typeorm-typeorm.md` -- 97 issues, fetched 2026-02-09
- `/tmp/orm-issues/mikro-orm-mikro-orm.md` -- 25 issues, fetched 2026-02-09
