# VertzQL Relation Queries — Filtering, Sorting, Pagination & Depth

**Issue:** #1130
**Status:** Rev 2 (post-review)
**Date:** 2026-03-10

## Overview

Extend the relation include system across the full Vertz stack to support filtering, sorting, pagination, and deeper nesting on relation queries. Currently, includes only support field narrowing (`select`). This design adds `where`, `orderBy`, `limit`, and recursive `include` — all following Prisma-style conventions.

## API Surface

### DB Layer (`@vertz/db`)

```ts
// Current IncludeSpec
interface IncludeSpec {
  [key: string]: true | { select?: Record<string, true>; include?: IncludeSpec };
}

// New IncludeSpec — backward compatible extension
interface IncludeSpec {
  [key: string]:
    | true
    | {
        select?: Record<string, true>;
        where?: Record<string, unknown>;
        orderBy?: Record<string, 'asc' | 'desc'>;
        limit?: number;
        include?: IncludeSpec;
      };
}

// Usage in typed DB client
const post = await db.posts.get({
  where: { id: postId },
  include: {
    comments: {
      select: { text: true, author: true },
      where: { status: 'published' },
      orderBy: { createdAt: 'desc' },
      limit: 10,
    },
    tags: true,
    author: {
      select: { name: true, email: true },
      include: {
        organization: {
          select: { name: true },
        },
      },
    },
  },
});
```

### VertzQL Client (`@vertz/fetch`)

```ts
interface VertzQLParams {
  select?: Record<string, true>;
  include?: Record<
    string,
    | true
    | {
        select?: Record<string, true>;
        where?: Record<string, unknown>;
        orderBy?: Record<string, 'asc' | 'desc'>;
        limit?: number;
        include?: VertzQLParams['include'];
      }
  >;
}
```

### VertzQL Server Parser (`@vertz/server`)

```ts
interface VertzQLOptions {
  where?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  limit?: number;
  after?: string;
  select?: Record<string, true>;
  include?: Record<
    string,
    | true
    | {
        select?: Record<string, true>;
        where?: Record<string, unknown>;
        orderBy?: Record<string, 'asc' | 'desc'>;
        limit?: number;
        include?: VertzQLOptions['include'];
      }
  >;
  _qError?: string;
}
```

### Entity Relations Config (`@vertz/server`)

**Breaking change:** The object form of relation config changes from a flat field map to a structured config. See [Migration / Breaking Changes](#migration--breaking-changes).

```ts
// Current — boolean or field map
type EntityRelationsConfig = {
  [K in keyof TRelations]?: true | false | { [field]: true };
};

// New — structured config with allowWhere/allowOrderBy
type EntityRelationsConfig = {
  [K in keyof TRelations]?:
    | true
    | false
    | {
        /** Which fields can be selected. Record<field, true>. */
        select?: { [field: string]: true };
        /** Which fields can be filtered via `where`. */
        allowWhere?: string[];
        /** Which fields can be sorted via `orderBy`. */
        allowOrderBy?: string[];
        /** Max items per parent row. Defaults to DEFAULT_RELATION_LIMIT (100). */
        maxLimit?: number;
      };
};

// Usage in entity definition
entity('posts', {
  model: postModel,
  relations: {
    comments: {
      select: { text: true, author: true, createdAt: true, status: true },
      allowWhere: ['status', 'createdAt'],
      allowOrderBy: ['createdAt'],
      maxLimit: 100,
    },
    tags: true,
    author: { select: { name: true, email: true } },
  },
});
```

## Defaults

When a relation is configured:

| Config field | Omitted default | Meaning |
|---|---|---|
| `select` | All non-hidden columns | Same as `true` |
| `allowWhere` | `[]` (empty) | No `where` allowed. Safe default — explicit opt-in. |
| `allowOrderBy` | `[]` (empty) | No `orderBy` allowed. Safe default — explicit opt-in. |
| `maxLimit` | `DEFAULT_RELATION_LIMIT` (100) | Framework-level safety cap. |
| `limit` (query-side) | `maxLimit` | When client omits `limit`, the `maxLimit` cap still applies. |

When a relation is declared as `true`: the framework applies `DEFAULT_RELATION_LIMIT` (100) as the max, no `where`/`orderBy` allowed, all non-hidden columns selected.

## Validation Errors

Clear, actionable error messages for every rejection case:

```
// where on a relation with no allowWhere config
"Filtering is not enabled on relation 'comments'. Add 'allowWhere' to the entity relations config."

// where field not in allowWhere
"Field 'internalScore' is not filterable on relation 'comments'. Allowed: status, createdAt"

// orderBy field not in allowOrderBy
"Field 'internalScore' is not sortable on relation 'comments'. Allowed: createdAt"

// limit exceeds maxLimit (clamped silently — dev-mode warning logged)
[dev] "Limit 200 exceeds maxLimit 50 for relation 'comments'; clamped to 50"

// nested validation — prefix with relation path
"Field 'internalRating' is not filterable on relation 'author.organization'"

// hidden field in relation where
"Field 'passwordHash' is not filterable on relation 'author'"
```

## `where` on `one` Relations

`where` on a `one` (belongsTo) relation performs a **conditional load**: the related row is loaded only if it matches the condition. If it doesn't match, the relation returns `null` — it does NOT filter the parent row.

```ts
// This loads the post with author: null if the author is inactive.
// It does NOT exclude the post from results.
include: { author: { where: { active: true } } }
```

This is consistent with Prisma's behavior. For filtering parents by child attributes, see Non-Goal #3 (cross-relation filtering).

## Per-Parent Pagination Strategy

**Problem:** The batch query `WHERE fk IN (pk1, pk2, ...) LIMIT N` applies `LIMIT` globally across all parents, not per parent.

**Solution: Post-fetch grouping.** Load all matching rows in the batch query (with the `maxLimit` safety cap applied as a global limit on total rows), then group by parent FK and apply per-parent `limit` in JavaScript before attaching to parent rows.

```
1. Batch query: SELECT ... WHERE fk IN (...) AND <user-where> ORDER BY <user-orderBy>
   Global limit: maxLimit * number_of_parents (capped at GLOBAL_RELATION_ROW_LIMIT)
2. Group results by parent FK
3. Per parent: slice to [0, limit] (apply per-parent limit)
4. Attach to parent rows
```

**Why not window functions?** `ROW_NUMBER() OVER (PARTITION BY fk)` is more SQL-correct but adds complexity to the SQL builder and isn't needed when `maxLimit` keeps total rows bounded. We can optimize to window functions later if profiling shows the JS grouping is a bottleneck.

**Global safety cap:** `GLOBAL_RELATION_ROW_LIMIT = 10_000`. No single relation batch query returns more than 10K rows regardless of parent count × limit. This prevents accidental DoS from deep includes.

## `offset` — Intentionally Excluded

`offset` is NOT supported on relation includes. Reasons:
1. `offset` pagination degrades on large datasets (DB still scans skipped rows)
2. Per-parent `offset` in batch queries is complex and error-prone
3. The "first N" pattern (`limit` only) covers the vast majority of use cases
4. If paginating within a relation, the client should make a separate list query

## Migration / Breaking Changes

The `EntityRelationsConfig` object form changes shape:

```ts
// Before (current) — flat field map
relations: {
  comments: { text: true, author: true },
  author: { name: true, email: true },
}

// After (new) — structured config with select wrapper
relations: {
  comments: { select: { text: true, author: true } },
  author: { select: { name: true, email: true } },
}
```

Per project policy (pre-v1, breaking changes encouraged), this is acceptable. All existing entity definitions using the object form need updating. Boolean forms (`true` / `false`) are unchanged.

## Manifesto Alignment

### Type Safety Wins
- `IncludeSpec` and all VertzQL types are structurally typed — the compiler catches invalid field names, wrong operator types, and mismatched relation names.
- `EntityRelationsConfig` constrains which fields are filterable/sortable at the type level.

### One Way to Do Things
- Prisma-style format is THE format — no alternative syntaxes. `where` on a relation include uses the same operator set as top-level `where` (eq, ne, gt, lt, in, notIn, contains, startsWith, endsWith, isNull).

### AI Agents Are First-Class Users
- Prisma conventions are well-known to LLMs. Using the same patterns means agents produce correct queries on the first try.

### Tradeoffs Accepted
- **Explicit over implicit**: Developers declare `allowWhere`/`allowOrderBy` fields in entity config. No auto-exposing everything. Omission = no filtering.
- **Convention over configuration**: Same `where`/`orderBy` syntax everywhere, no special relation-only operators.
- **Compile-time over runtime**: Type system constrains the query shape; validation catches remaining issues at the server boundary.

## Non-Goals

1. **JOINs** — Relations are loaded via batch queries (`WHERE fk IN (...)`), not SQL JOINs. Deliberate choice for predictable performance.
2. **Aggregations on relations** — No `count`, `sum`, `avg` on included relations. Separate analytics feature.
3. **Cross-relation filtering** — Filtering a parent by a child's fields (e.g., "posts where comments.status = 'spam'") is not in scope. Requires subquery/JOIN support.
4. **Cursor-based pagination on relations** — Only `limit` for relation includes. Cursor pagination is top-level only.
5. **`offset` on relation includes** — Excluded intentionally. See [offset section](#offset--intentionally-excluded).
6. **Compiler injection of where/orderBy** — Detecting `.filter()` / `.sort()` patterns in the bun plugin is future work.
7. **Filtering on join table columns (M2M)** — `where`/`orderBy` on many-to-many relations applies to the target table only, not the join table.

## Unknowns

1. **Performance of deeply nested includes** — At depth 3, worst case with 3 relations per level = 39 queries. Mitigation: `maxLimit` defaults, `GLOBAL_RELATION_ROW_LIMIT`, query budget counter. **Resolution: start with depth 3, add query budget counter (max 50 queries per request).**

2. **Filtering on join table columns for many-to-many** — Deferred to separate issue. Only target table columns are filterable.

3. **TypeScript recursion limits on nested `IncludeOption`** — At depth 3+, recursive type instantiation may hit TS limits. **Resolution: use `_Depth` tuple counter pattern (already used in `IncludeResolve`). Verify with `.test-d.ts` at depth 3.**

## Type Flow Map

```
EntityConfig.relations (entity definition)
  ↓ validated at definition time
EntityRelationsConfig<TRelations>
  ↓ used by codegen to generate SDK types
TypedIncludeOption<TRelationsConfig>
  ↓ used by SDK client methods
VertzQLParams.include (client-side)
  ↓ encoded via encodeVertzQL → q= base64url param
VertzQLOptions.include (server-side, after parseVertzQL)
  ↓ validated by validateVertzQL against entity schema + allowWhere/allowOrderBy
IncludeSpec (DB layer)
  ↓ consumed by loadRelations → buildSelect → SQL
  ↓ post-fetch grouping applies per-parent limit
```

`allowWhere`/`allowOrderBy` constraints flow from `EntityRelationsConfig` through `validateVertzQL` to reject disallowed queries at the API boundary.

## E2E Acceptance Test

```ts
// Developer writes this entity definition:
const postEntity = entity('posts', {
  model: postModel,
  relations: {
    comments: {
      select: { text: true, author: true, createdAt: true, status: true },
      allowWhere: ['status', 'createdAt'],
      allowOrderBy: ['createdAt'],
      maxLimit: 50,
    },
    author: {
      select: { name: true },
      // author has its own relations:
      // organization: { select: { name: true, tier: true } }
    },
  },
  access: { list: rules.authenticated(), get: rules.authenticated() },
});

// Client query with filtering, sorting, and nested includes:
const posts = query(() =>
  api.posts.list({
    include: {
      comments: {
        select: { text: true, author: true },
        where: { status: 'published' },
        orderBy: { createdAt: 'desc' },
        limit: 10,
      },
      author: {
        select: { name: true },
        include: {
          organization: { select: { name: true } },
        },
      },
    },
  }),
  { key: 'posts' },
);

// Result: posts.data.items[0].comments is sorted by createdAt desc,
// filtered to status=published, limited to 10 PER POST, with only text+author fields.
// posts.data.items[0].author.organization is loaded with name field (depth 3).

// @ts-expect-error — internalScore not in allowWhere fields
api.posts.list({
  include: {
    comments: {
      where: { internalScore: 5 },
    },
  },
});
```

## Implementation Plan

### Phase 1: DB Layer — IncludeSpec Extension & Depth Increase

Extend `IncludeSpec` to support `where`, `orderBy`, `limit` on relation batch queries. Increase max depth from 2 to 3. Add query budget counter.

**Changes:**
- `packages/db/src/query/relation-loader.ts` — Extend `IncludeSpec` type, update `loadOneRelation`, `loadManyRelation`, `loadManyToManyRelation` to pass `where`/`orderBy` to `buildSelect`, implement post-fetch per-parent limit grouping, add query budget counter
- `packages/db/src/schema/inference.ts` — Update `IncludeOption` type to include `where`/`orderBy`/`limit`
- Default `orderBy` to target PK ascending when not specified (deterministic results)

**Acceptance Criteria:**

```ts
describe('Feature: Relation include with filtering and sorting', () => {
  describe('Given a posts table with a many comments relation', () => {
    describe('When loading with where filter on comments', () => {
      it('Then only returns comments matching the where clause', () => {});
    });
    describe('When loading with orderBy on comments', () => {
      it('Then returns comments sorted by the specified field', () => {});
    });
    describe('When loading with limit on comments across multiple parents', () => {
      it('Then returns at most N comments PER PARENT row', () => {});
    });
    describe('When loading with combined where + orderBy + limit', () => {
      it('Then applies all three: filter, sort, then per-parent limit', () => {});
    });
  });

  describe('Given 3 levels of relation nesting', () => {
    describe('When loading with depth 3', () => {
      it('Then resolves all 3 levels of nested relations', () => {});
    });
    describe('When loading with depth 4', () => {
      it('Then stops at depth 3 and does not load the 4th level', () => {});
    });
  });

  describe('Given a one relation with where filter', () => {
    describe('When the related row does not match the where clause', () => {
      it('Then returns null for that relation (conditional load)', () => {});
    });
  });

  describe('Given a many-to-many relation with where filter', () => {
    describe('When loading with where on the target table', () => {
      it('Then only returns target rows matching the where clause', () => {});
    });
  });

  describe('Given a query budget of 50', () => {
    describe('When include tree would trigger more than 50 queries', () => {
      it('Then throws a clear error before executing remaining queries', () => {});
    });
  });
});
```

### Phase 2: VertzQL Types & Entity Config — Full Stack Types

Update VertzQL types (client + server), entity relations config, and validation. This phase is sequential because both VertzQL parser and entity config changes touch `validateVertzQL`.

**Changes:**
- `packages/fetch/src/vertzql.ts` — Extend `VertzQLParams.include` type
- `packages/server/src/entity/types.ts` — Extend `EntityRelationsConfig` with `select`, `allowWhere`, `allowOrderBy`, `maxLimit`
- `packages/server/src/entity/vertzql-parser.ts` — Update `VertzQLOptions.include` type, update `parseVertzQL` to decode nested include options from `q=` param, update `validateVertzQL` to recursively validate nested `where`/`orderBy` against `allowWhere`/`allowOrderBy` and hidden columns
- Relation `where` supports the same operator set as top-level `where`

**Acceptance Criteria:**

```ts
describe('Feature: VertzQL include with where/orderBy/limit', () => {
  describe('Given a q= param with nested include options', () => {
    describe('When decoding the base64url param', () => {
      it('Then preserves where, orderBy, limit in the include', () => {});
    });
  });

  describe('Given a POST /query body with nested include', () => {
    describe('When parsing the request body', () => {
      it('Then extracts where/orderBy/limit from include entries', () => {});
    });
  });

  describe('Given encodeVertzQL on the client', () => {
    describe('When encoding include with where and orderBy', () => {
      it('Then round-trips correctly with server decode', () => {});
    });
  });
});

describe('Feature: Entity relations config with allowWhere/allowOrderBy', () => {
  describe('Given a relation with allowWhere: ["status", "createdAt"]', () => {
    describe('When where includes a non-allowed field', () => {
      it('Then returns error: Field "X" is not filterable on relation "Y"', () => {});
    });
    describe('When where includes only allowed fields', () => {
      it('Then validation passes', () => {});
    });
    describe('When allowWhere is omitted', () => {
      it('Then any where clause returns error: Filtering not enabled on relation "Y"', () => {});
    });
  });

  describe('Given a relation with allowOrderBy: ["createdAt"]', () => {
    describe('When orderBy includes a non-allowed field', () => {
      it('Then returns error: Field "X" is not sortable on relation "Y"', () => {});
    });
  });

  describe('Given a relation with maxLimit: 50', () => {
    describe('When limit exceeds maxLimit', () => {
      it('Then clamps limit to maxLimit', () => {});
    });
  });

  describe('Given nested include validation at depth 2+', () => {
    describe('When a deeply nested where references a non-allowed field', () => {
      it('Then error includes the relation path: "author.organization"', () => {});
    });
  });
});
```

### Phase 3: Route Handler Wiring & Integration

Wire the parsed and validated include options through the route handler into the DB adapter. This is the integration proving ground — the phase where the feature works end-to-end.

**Changes:**
- `packages/server/src/entity/route-generator.ts` — Pass `include` to the CRUD pipeline's `list` and `get` operations
- `packages/server/src/entity/crud-pipeline.ts` — Accept `include` in `ListOptions`, pass to `db.list()` and `db.get()`
- `packages/db/src/types/adapter.ts` — Extend `ListOptions` to include `include`

**Acceptance Criteria:**

```ts
describe('Feature: Full pipeline include pass-through', () => {
  describe('Given a GET /api/posts request with q= containing include', () => {
    describe('When include has where + orderBy + limit', () => {
      it('Then response contains filtered, sorted, per-parent-limited relation data', () => {});
      it('Then relation data respects allowWhere/allowOrderBy constraints', () => {});
    });
  });

  describe('Given a POST /api/posts/query with include in body', () => {
    describe('When include has where + orderBy + limit', () => {
      it('Then response contains correctly processed relation data', () => {});
    });
  });

  describe('Given a GET /api/posts/:id with q= containing include', () => {
    describe('When the request is processed', () => {
      it('Then the single entity response includes filtered relation data', () => {});
    });
  });

  describe('Given include with depth 3', () => {
    describe('When all three levels have where/orderBy', () => {
      it('Then all three levels are correctly filtered and sorted', () => {});
    });
  });
});
```

### Phase 4: Codegen & SDK Updates

Update the entity schema manifest and SDK type generation.

**Changes:**
- `packages/codegen/src/generators/entity-schema-manifest-generator.ts` — Include `allowWhere`/`allowOrderBy`/`maxLimit` in relation metadata
- `packages/codegen/src/generators/entity-sdk-generator.ts` — Update SDK type generation to include `where`/`orderBy`/`limit` in typed include options, constrained by `allowWhere`/`allowOrderBy`

**Acceptance Criteria:**

```ts
describe('Feature: Entity schema manifest includes relation query metadata', () => {
  describe('Given an entity with allowWhere/allowOrderBy config', () => {
    describe('When codegen generates the entity-schema.json', () => {
      it('Then each relation includes allowWhere, allowOrderBy, maxLimit fields', () => {});
    });
  });
});

describe('Feature: SDK types include where/orderBy on includes', () => {
  describe('Given a generated SDK client for posts entity', () => {
    describe('When using the typed include option', () => {
      it('Then where is constrained to allowWhere fields', () => {});
      it('Then orderBy is constrained to allowOrderBy fields', () => {});
    });
  });
});
```

## Dependencies Between Phases

```
Phase 1 (DB layer — IncludeSpec, depth, per-parent limit, query budget)
  ↓
Phase 2 (VertzQL types + entity config + validation) — sequential
  ↓
Phase 3 (Route wiring — integration proving ground) — depends on Phase 1 + 2
  ↓
Phase 4 (Codegen + SDK) — depends on Phase 2 for config shape
```

All phases are sequential. Phase 2 consolidates the previously separate "VertzQL types" and "Entity config" phases since they both touch `validateVertzQL`.
