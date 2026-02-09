# ORM Competitor Analysis for @vertz/db

**Author:** josh (vertz-advocate)
**Date:** 2026-02-09
**Purpose:** Inform design decisions for @vertz/db by analyzing what developers love, hate, and need from TypeScript ORMs.

---

## A. Executive Summary

The TypeScript ORM landscape is fractured across five major players -- Prisma, Drizzle, Kysely, TypeORM, and MikroORM -- each with distinct philosophies and tradeoffs. Prisma dominates mindshare with its options-bag query API and excellent DX but suffers from codegen dependency, a heavy Rust engine binary, and mounting developer frustration around type limitations (typed JSON has 1084 reactions). Drizzle is the fastest-growing alternative with its schema-as-TypeScript approach and zero codegen, but lacks proper error handling and relational query maturity. Kysely provides best-in-class type inference for raw SQL builders but has no schema definition or migration story. TypeORM is in maintenance mode with severe migration bugs (column drops instead of alters, 119 reactions) and decorator-heavy patterns that conflict with modern TypeScript. MikroORM is technically solid but has minimal community traction (only 25 open issues scraped). This creates a clear opportunity for @vertz/db: combine Drizzle's schema-as-code approach, Prisma's intuitive query API, and Kysely's type inference while innovating on field-level visibility, typed JSON, and edge-first architecture.

---

## B. Individual ORM Analysis

### Prisma

**What developers love:**
- Options-bag query API (`findMany({ where, select, include, orderBy })`) is extremely intuitive and LLM-friendly -- by far the most discoverable API pattern
- Best-in-class documentation, onboarding experience, and error messages
- Prisma Studio for visual data browsing; strong ecosystem (Prisma Pulse, Accelerate)

**What developers hate:**
- Codegen dependency: `prisma generate` must run after every schema change; generated `index.d.ts` can be enormous and slow down IDE autocomplete (issue #4807, 106 reactions)
- Heavy Rust engine binary (~15MB) that complicates serverless/edge deployment; the engine is a black box that developers cannot debug
- `select` and `include` are mutually exclusive, forcing awkward workarounds; no typed JSON fields (issue #3219, 1084 reactions); no union types in schema (issue #2505, 676 reactions)

**Key API patterns:**
```typescript
// Options-bag pattern -- the gold standard for discoverability
const users = await prisma.user.findMany({
  where: { email: { contains: '@vertz.dev' } },
  select: { id: true, name: true, posts: { select: { title: true } } },
  orderBy: { createdAt: 'desc' },
  take: 10,
});
```

### Drizzle

**What developers love:**
- Schema defined in plain TypeScript -- no DSL, no codegen step, full IDE support from day one
- Transparent SQL: you can see exactly what query will be generated; `.toSQL()` is a first-class citizen
- Lightweight (~30kb), pure TypeScript, works on edge runtimes (Cloudflare Workers, Vercel Edge)

**What developers hate:**
- No proper error handling or typed errors (issue #376, 208 reactions) -- catching database errors requires string matching on error messages
- Relational query API (`.query.users.findMany({ with: { posts: true } })`) is immature compared to Prisma; ordering/filtering on relations missing (issue #2650, 62 reactions)
- Migration tooling (`drizzle-kit`) has rough edges: no rollback support (issue #2352, 181 reactions), conflicting migration merges (issue #2488, 48 reactions)

**Key API patterns:**
```typescript
// Schema-as-TypeScript
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').unique(),
});

// Query builder -- close to SQL
const result = await db.select().from(users).where(eq(users.email, email));

// Relational queries (Prisma-like)
const usersWithPosts = await db.query.users.findMany({
  with: { posts: true },
});
```

### Kysely

**What developers love:**
- Best-in-class structural type inference: every part of the query is fully typed end-to-end without codegen, using TypeScript's type system directly
- SQL-first philosophy: the API maps 1:1 to SQL concepts, so SQL-literate developers feel immediately at home
- Extremely composable: query builders can be passed around, composed, and reused with full type safety

**What developers hate:**
- No schema definition layer -- you must define your database types manually or use `kysely-codegen` (which requires a running database)
- No built-in migration story beyond basic `up`/`down` functions; migration tooling is community-maintained
- Steep learning curve for TypeScript generics; complex queries can produce unreadable type errors

**Key API patterns:**
```typescript
// Type-safe query building -- SQL-first
const users = await db
  .selectFrom('users')
  .innerJoin('posts', 'posts.author_id', 'users.id')
  .select(['users.id', 'users.name', 'posts.title'])
  .where('users.email', '=', email)
  .execute();
```

### TypeORM

**What developers love:**
- Familiar to developers coming from Java/C# ORMs (Hibernate, Entity Framework) -- Active Record and Data Mapper patterns both supported
- Mature ecosystem with support for many databases (PostgreSQL, MySQL, SQLite, MSSQL, Oracle, MongoDB, CockroachDB)
- Decorator-based entity definition feels natural for NestJS developers

**What developers hate:**
- Migration generation is dangerously broken: drops and recreates columns instead of altering them, causing data loss (issue #3357, 119 reactions)
- Performance issues with relation loading: `findOne` with relations makes two separate queries (issue #5694, 65 reactions); query builder joins are slow with many relations (issue #3857, 68 reactions)
- Effectively in maintenance mode: custom repository API in v0.3 was a regression (issue #9312, 71 reactions); `strictPropertyInitialization` requires workarounds (issue #2797, 134 reactions)

**Key API patterns:**
```typescript
// Decorator-based entity definition
@Entity()
class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @OneToMany(() => Post, post => post.author)
  posts: Post[];
}

// Active Record pattern
const user = await User.findOne({ where: { id: 1 }, relations: ['posts'] });
```

### MikroORM

**What developers love:**
- Proper Unit of Work and Identity Map patterns -- the most "correct" ORM implementation in the TypeScript ecosystem
- Strong NestJS integration with request-scoped entity managers
- Good TypeScript support with decorators AND a `defineEntity` API for those who prefer functions

**What developers hate:**
- Unit of Work complexity: developers must understand `flush()` semantics, identity map lifecycle, and managed vs. detached entities -- steep learning curve
- Small community (25 issues scraped vs. 100 for Prisma) means fewer plugins, fewer examples, fewer StackOverflow answers
- Embeddable/polymorphic entity support has edge cases (issues #1887, #4090, #6523)

**Key API patterns:**
```typescript
// Decorator-based entity
@Entity()
class User {
  @PrimaryKey()
  id!: number;

  @Property()
  name!: string;

  @OneToMany(() => Post, post => post.author)
  posts = new Collection<Post>(this);
}

// Unit of Work -- explicit flush
const user = em.create(User, { name: 'Josh' });
await em.flush(); // persists all tracked changes
```

---

## C. GitHub Issues Analysis

### Methodology

Scraped top 100 open issues (sorted by reactions) from 5 ORM repos using GitHub API on 2026-02-09. Total issues analyzed: 483 (Prisma: 100, Drizzle: 84, Kysely: 86, TypeORM: 97, MikroORM: 25, note: some repos had fewer than 100 qualifying open issues).

### Top Pain Points by Reaction Count

| Rank | Repo | Issue # | Title | Reactions |
|------|------|---------|-------|-----------|
| 1 | prisma | #1676 | Support DynamoDB | 1395 |
| 2 | prisma | #3219 | Define type of content of `Json` field | 1084 |
| 3 | prisma | #2789 | PostGIS/GIS support | 1058 |
| 4 | prisma | #3394 | Virtual computed fields | 886 |
| 5 | prisma | #2505 | Support for a Union type | 676 |
| 6 | prisma | #4134 | Provide `upsertMany()`/`upsertFirst()` | 599 |
| 7 | drizzle | #843 | `CREATE TRIGGER` functions | 529 |
| 8 | prisma | #1798 | Geolocation/Spatial types support | 533 |
| 9 | prisma | #2443 | Multiple Connections / Databases / Datasources | 522 |
| 10 | prisma | #15346 | Support SurrealDB | 505 |
| 11 | prisma | #13310 | Support for Cloudflare D1 | 499 |
| 12 | prisma | #5455 | Create nested relations using `createMany()` | 498 |
| 13 | prisma | #4703 | Programmatic access to migration CLI | 491 |
| 14 | prisma | #6974 | Conditional uniqueness / Partial indexes | 463 |
| 15 | prisma | #1644 | Support for Polymorphic Associations | 460 |
| 16 | prisma | #7550 | Add `findManyAndCount()` | 457 |
| 17 | prisma | #5560 | `whereRaw` for Prisma Client queries | 451 |
| 18 | prisma | #6653 | `groupBy()` over date ranges | 431 |
| 19 | prisma | #3528 | Add runtime validation to models | 422 |
| 20 | prisma | #12735 | Support for row-level security (RLS) | 387 |
| 21 | drizzle | #695 | Infer table model with relations | 245 |
| 22 | prisma | #18442 | Support for `pg_vector` | 249 |
| 23 | prisma | #5055 | Streams / async iterators | 246 |
| 24 | drizzle | #376 | Add proper error handling | 208 |
| 25 | drizzle | #886 | Add table/column comments | 199 |

### Cross-Cutting Themes

**1. Typed JSON / Composite Types (Prisma #3219: 1084, Drizzle #1690: 51)**
The single most impactful gap across ORMs. Developers store structured data in JSON columns but lose all type safety. Prisma has acknowledged this for 6+ years without shipping a solution. Drizzle's `$type<T>()` provides compile-time types but no runtime validation or query integration.

**2. Error Handling (Prisma #5040: 184, Drizzle #376: 208)**
Both top ORMs lack typed, structured error handling. Prisma returns opaque error codes (`P2002`) requiring string matching. Drizzle has no error wrapping at all. Developers want `instanceof`-based error handling with structured metadata (which field caused a unique violation, etc.).

**3. Migration Safety (TypeORM #3357: 119, Drizzle #2352: 181, Drizzle #2488: 48)**
TypeORM's migration generator drops columns instead of altering them. Drizzle has no rollback support. Prisma's migrations are opaque SQL files that cannot be customized. Rename detection is universally poor -- every ORM treats column renames as drop+create.

**4. Relational Query Power (Prisma #5455: 498, Prisma #7550: 457, Drizzle #2650: 62)**
Nested creates with `createMany`, `findManyAndCount` for pagination, ordering/filtering on relation fields -- these are table-stakes features that remain partially implemented or missing.

**5. Edge/Serverless Compatibility (Prisma #13310: 499, Prisma #1964: 325, Drizzle #1009: 96)**
Cloudflare D1, AWS Data API, browser-based SQLite -- the industry is moving to edge runtimes and ORMs are struggling to keep up. Prisma's Rust engine is the biggest blocker; Drizzle is best-positioned here.

**6. Raw SQL Escape Hatches (Prisma #5560: 451, Prisma #5848: 110, Prisma #5052: 200)**
When the ORM's API is insufficient, developers need `whereRaw`, `orderByRaw`, and "get the SQL without executing" capabilities. Every ORM eventually forces you to drop to raw SQL for complex queries.

---

## D. Convex Research

Based on the analysis at `/app/vertz/plans/convex-research.md`:

### Schema Definition Approach
Convex defines schemas in `convex/schema.ts` using TypeScript validators (`v.string()`, `v.object()`, etc.). These validators are runtime objects that carry both TypeScript type information AND runtime validation logic. This is a meaningful difference from Drizzle (compile-time only) and Prisma (DSL + codegen). Running `npx convex dev` generates lightweight type declaration files (`dataModel.d.ts`) -- the codegen is thin (type declarations only), not heavyweight model files like Prisma.

### Access Control Model
Convex has **no field-level visibility system**. Their access control operates at two levels only:
1. **Function-level:** Functions are `query`/`mutation` (public) or `internalQuery`/`internalMutation` (server-only)
2. **Row-level:** Community library (`convex-helpers`) provides RLS via wrappers that filter entire rows

There is no declarative way to say "this field should never leave the server." Developers must manually construct response objects that omit sensitive fields, every time, in every function.

### What Is Innovative
- **Dual-purpose validators:** `v.string()` objects carry both compile-time types AND runtime validation. When you insert a document, Convex validates against the schema at runtime. This eliminates "types say one thing, database says another" bugs.
- **Explicit performance characteristics:** `.withIndex()` is required for indexed queries; `.filter()` always means table scan. No hidden query planner magic, no surprise full-table scans behind a WHERE clause.
- **Server functions as trust boundary:** The database is never directly exposed to clients. Every access goes through a server function, eliminating SQL injection and unauthorized query classes entirely.

### What NOT to Copy
- **Document DB semantics:** No JOINs, no aggregations, no CTEs, no window functions. Their answer to complex queries is "write JavaScript loops." Does not work for PostgreSQL-backed relational applications.
- **Codegen dependency:** Even lightweight codegen requires running `npx convex dev` to regenerate types after schema changes. @vertz/db should use pure TypeScript inference.
- **No field-level access control:** Their "just write code to strip fields" approach is manual, error-prone, and guaranteed to leak data when a developer forgets to omit a sensitive field from one of forty query functions.
- **Platform coupling:** Reactive queries, internal functions, and scheduling all depend on the Convex hosted runtime. @vertz/db must work with any PostgreSQL instance, anywhere.

---

## E. Recommendations for @vertz/db

### Steal

1. **Drizzle's schema-as-TypeScript** -- No DSL, no codegen step. Schema is `.ts` files with full IDE support. Tables are plain exported constants. This is the foundation.

2. **Prisma's options-bag query API** -- `findMany({ where, select, include, orderBy, take })` is the most discoverable and LLM-friendly API pattern. It is what developers reach for intuitively.

3. **Kysely's end-to-end structural type inference** -- Every part of the query should be typed by inference, not codegen. Select a subset of columns? The return type narrows automatically. Join a table? The available columns expand automatically.

4. **Transparent SQL migration files** -- Migrations should be plain `.sql` files that developers can read, review, and modify. No opaque binary formats, no migration engine lock-in.

### Avoid

1. **Codegen dependency** -- No `prisma generate`, no `npx convex dev`, no build step to get types. TypeScript inference from schema definition should be the only source of truth.

2. **Prisma's select/include mutual exclusivity** -- This is the single most complained-about API constraint in Prisma. @vertz/db should allow both selecting specific fields AND including relations in the same query.

3. **Decorators for schema definition** -- TypeORM and MikroORM's decorator patterns require `experimentalDecorators`, `emitDecoratorMetadata`, and `reflect-metadata`. They conflict with modern TypeScript (TC39 decorators) and are hostile to tree-shaking and static analysis.

4. **Heavy engine binaries** -- Prisma's ~15MB Rust engine binary is incompatible with edge runtimes and serverless deployments. @vertz/db must be pure TypeScript with zero native dependencies.

5. **Unit of Work complexity** -- MikroORM's identity map and flush semantics are powerful but create a steep learning curve. Explicit save/update operations are more predictable and LLM-friendly.

### Innovate

1. **Field-level visibility annotations** -- Nobody has this. Convex proves developers want visibility boundaries but only offers function-level control. @vertz/db should be the first ORM with declarative `.private()`, `.sensitive()`, `.internal()` annotations that produce derived schemas at both compile-time (type narrowing) and runtime (automatic field stripping).

2. **Typed JSON with full inference** -- This is Prisma's #2 most-wanted feature (issue #3219, 1084 reactions). @vertz/db should allow `json<T>()` column types where `T` flows through queries, inserts, updates, and filters with full type safety. Combine with runtime validation (like Convex's dual-purpose validators).

3. **Nested query options in relations** -- `include` should support `select`, `where`, `orderBy`, and `limit` on included relations. Prisma partially supports this; Drizzle does not. @vertz/db should make it first-class: `include: { posts: { select: { title: true }, where: { published: true }, orderBy: { createdAt: 'desc' }, limit: 5 } }`.

4. **Typed error handling** -- Both Prisma (#5040, 184 reactions) and Drizzle (#376, 208 reactions) top issues demand this. @vertz/db should return discriminated union errors: `UniqueConstraintError`, `ForeignKeyError`, `NotFoundError` with structured metadata (which field, which constraint), not opaque error codes.

5. **Smart migration rename detection** -- Every ORM treats column/table renames as drop+create (TypeORM #3357, 119 reactions). @vertz/db should detect renames by analyzing schema diffs and asking for confirmation, not silently dropping data.

6. **LLM-optimized API surface** -- Design every API to be maximally discoverable by language models: options bags over positional arguments, consistent naming patterns, self-documenting parameter types. The north star: "My LLM nailed it on the first try."

7. **Edge-first, pure TypeScript, <10kb** -- Zero native dependencies, pure TypeScript, small bundle size. Must work on Cloudflare Workers, Vercel Edge Functions, Deno Deploy, and Bun without configuration.

---

## F. Sources

### GitHub Repositories (Issue Data)
- [prisma/prisma](https://github.com/prisma/prisma) -- 100 top issues scraped
- [drizzle-team/drizzle-orm](https://github.com/drizzle-team/drizzle-orm) -- 84 top issues scraped
- [kysely-org/kysely](https://github.com/kysely-org/kysely) -- 86 top issues scraped
- [typeorm/typeorm](https://github.com/typeorm/typeorm) -- 97 top issues scraped
- [mikro-orm/mikro-orm](https://github.com/mikro-orm/mikro-orm) -- 25 top issues scraped

### Official Documentation
- [Prisma Docs](https://www.prisma.io/docs)
- [Drizzle ORM Docs](https://orm.drizzle.team)
- [Kysely Docs](https://kysely.dev)
- [TypeORM Docs](https://typeorm.io)
- [MikroORM Docs](https://mikro-orm.io)

### Convex Research
- [Convex Database Docs](https://docs.convex.dev/database)
- [Convex Schema Definitions](https://docs.convex.dev/database/schemas)
- [Convex Internal Functions](https://docs.convex.dev/functions/internal-functions)
- [Convex Row-Level Security](https://stack.convex.dev/row-level-security)
- [Convex Sucks (official response)](https://www.convex.sucks/)
- Internal: `/app/vertz/plans/convex-research.md`

### Blog Posts and Discussions
- [Drizzle vs. Prisma comparison (orm.drizzle.team)](https://orm.drizzle.team/docs/prisma)
- [Why Not Prisma (various community posts)](https://github.com/prisma/prisma/issues/4807)
- [TypeORM Migration Safety Issues](https://github.com/typeorm/typeorm/issues/3357)
- [Kysely Production Usage Thread](https://github.com/kysely-org/kysely/issues/320)
