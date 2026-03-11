# VertzQL Relation Queries — Filtering, Sorting, Pagination & Depth

**Issue:** #1130
**Status:** Draft
**Date:** 2026-03-10

## Overview

Extend the relation include system across the full Vertz stack to support filtering, sorting, pagination, and deeper nesting on relation queries. Currently, includes only support field narrowing (`select`). This design adds `where`, `orderBy`, `limit`, `offset`, and recursive `include` — all following Prisma-style conventions.

## API Surface

### DB Layer (`@vertz/db`)

```ts
// Current IncludeSpec
interface IncludeSpec {
  [key: string]: true | { select?: Record<string, true>; include?: IncludeSpec };
}

// New IncludeSpec — backward compatible
interface IncludeSpec {
  [key: string]:
    | true
    | {
        select?: Record<string, true>;
        where?: Record<string, unknown>;
        orderBy?: Record<string, 'asc' | 'desc'>;
        limit?: number;
        offset?: number;
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
          include: {
            plan: { select: { tier: true } },
          },
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
        offset?: number;
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
        offset?: number;
        include?: VertzQLOptions['include'];
      }
  >;
  _qError?: string;
}
```

### Entity Relations Config (`@vertz/server`)

```ts
// Current — boolean or field map
type EntityRelationsConfig = {
  [K in keyof TRelations]?: true | false | { [field]: true };
};

// New — adds filterable/sortable declaration
type EntityRelationsConfig = {
  [K in keyof TRelations]?:
    | true
    | false
    | {
        /** Which fields can be selected. Record<field, true>. */
        select?: { [field: string]: true };
        /** Which fields can be filtered on. */
        filterable?: string[];
        /** Which fields can be sorted on. */
        sortable?: string[];
        /** Maximum number of items allowed via limit. */
        maxLimit?: number;
      };
};

// Usage in entity definition
entity('posts', {
  model: postModel,
  relations: {
    comments: {
      select: { text: true, author: true, createdAt: true, status: true },
      filterable: ['status', 'createdAt'],
      sortable: ['createdAt'],
      maxLimit: 100,
    },
    tags: true,
    author: { select: { name: true, email: true } },
  },
});
```

## Manifesto Alignment

### Type Safety Wins
- `IncludeSpec` and all Vertz QL types are structurally typed — the compiler catches invalid field names, wrong operator types, and mismatched relation names.
- `EntityRelationsConfig` constrains which fields are filterable/sortable at the type level.

### One Way to Do Things
- Prisma-style format is THE format — no alternative syntaxes. `where` on a relation include works identically to `where` on the top-level query.

### AI Agents Are First-Class Users
- Prisma conventions are well-known to LLMs. Using the same patterns means agents produce correct queries on the first try.

### Tradeoffs Accepted
- **Explicit over implicit**: Developers declare `filterable`/`sortable` fields in entity config. No auto-exposing everything.
- **Convention over configuration**: Same `where`/`orderBy` syntax everywhere, no special relation-only operators.
- **Compile-time over runtime**: Type system constrains the query shape; validation catches remaining issues at the server boundary.

## Non-Goals

1. **JOINs** — Relations are loaded via batch queries (`WHERE fk IN (...)`), not SQL JOINs. This is a deliberate architectural choice for predictable performance.
2. **Aggregations on relations** — No `count`, `sum`, `avg` on included relations. That's a separate analytics feature.
3. **Cross-relation filtering** — Filtering a parent by a child's fields (e.g., "posts where comments.status = 'spam'") is not in scope. This requires subquery/JOIN support.
4. **Cursor-based pagination on relations** — Only `limit`/`offset` for relation includes. Cursor pagination is top-level only.
5. **Compiler injection of where/orderBy** — The bun plugin currently injects `select` and `include` based on field access analysis. Detecting `.filter()` / `.sort()` patterns and converting them to relation `where`/`orderBy` is future work.

## Unknowns

1. **Performance of deeply nested includes** — At depth 5, each level fires a batch query. 5 levels = at minimum 5 sequential queries per request. Mitigation: `maxLimit` defaults, total row limits, query timeout. **Resolution: acceptable for typical use cases; add a global configurable max-depth if performance becomes an issue.**

2. **Filtering on join table columns for many-to-many** — Currently many-to-many loads go through a join table. Filtering on the join table's columns (e.g., `assignedAt`) requires exposing join table metadata. **Resolution: defer to a separate issue; only support filtering on the target table's columns for now.**

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
  ↓ validated by validateVertzQL against entity schema
IncludeSpec (DB layer)
  ↓ consumed by loadRelations → buildSelect → SQL
```

Each generic flows from the entity definition through to the SQL query. `filterable`/`sortable` constraints flow from `EntityRelationsConfig` through `validateVertzQL` to reject disallowed queries at the API boundary.

## E2E Acceptance Test

```ts
// Developer writes this entity definition:
const postEntity = entity('posts', {
  model: postModel,
  relations: {
    comments: {
      select: { text: true, author: true, createdAt: true, status: true },
      filterable: ['status', 'createdAt'],
      sortable: ['createdAt'],
      maxLimit: 50,
    },
    author: { select: { name: true } },
  },
  access: { list: rules.authenticated(), get: rules.authenticated() },
});

// Client query:
const posts = query(() =>
  api.posts.list({
    include: {
      comments: {
        select: { text: true, author: true },
        where: { status: 'published' },
        orderBy: { createdAt: 'desc' },
        limit: 10,
      },
      author: { select: { name: true } },
    },
  }),
  { key: 'posts' },
);

// Result: posts.data.items[0].comments is sorted by createdAt desc,
// filtered to status=published, limited to 10, with only text+author fields.

// Invalid query — blocked by validation:
api.posts.list({
  include: {
    comments: {
      where: { internalScore: 5 }, // NOT in filterable → 400 error
      // @ts-expect-error — internalScore not in filterable fields
    },
  },
});
```

## Implementation Plan

### Phase 1: DB Layer — IncludeSpec Extension & Depth Increase

Extend `IncludeSpec` to support `where`, `orderBy`, `limit`, `offset` on relation batch queries. Increase max depth from 2 to 5.

**Changes:**
- `packages/db/src/query/relation-loader.ts` — Extend `IncludeSpec` type, update `loadOneRelation`, `loadManyRelation`, `loadManyToManyRelation` to pass `where`/`orderBy`/`limit`/`offset` to `buildSelect`
- `packages/db/src/schema/inference.ts` — Update `IncludeOption` type to include `where`/`orderBy`/`limit`/`offset`

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
    describe('When loading with limit on comments', () => {
      it('Then returns at most N comments per parent row', () => {});
    });
    describe('When loading with offset on comments', () => {
      it('Then skips the first N comments per parent row', () => {});
    });
    describe('When loading with combined where + orderBy + limit', () => {
      it('Then applies all three: filter, sort, then limit', () => {});
    });
  });

  describe('Given 5 levels of relation nesting', () => {
    describe('When loading with depth 5', () => {
      it('Then resolves all 5 levels of nested relations', () => {});
    });
    describe('When loading with depth 6', () => {
      it('Then stops at depth 5 and does not load the 6th level', () => {});
    });
  });

  describe('Given a one relation with where filter', () => {
    describe('When the related row does not match the where clause', () => {
      it('Then returns null for that relation (not found after filter)', () => {});
    });
  });

  describe('Given a many-to-many relation with where filter', () => {
    describe('When loading with where on the target table', () => {
      it('Then only returns target rows matching the where clause', () => {});
    });
  });
});
```

### Phase 2: VertzQL Types — Client & Server Include Extension

Update the VertzQL types on both client (`@vertz/fetch`) and server (`@vertz/server`) to support the extended include format. Update parser and validator.

**Changes:**
- `packages/fetch/src/vertzql.ts` — Extend `VertzQLParams.include` type
- `packages/server/src/entity/vertzql-parser.ts` — Update `VertzQLOptions.include` type, update `parseVertzQL` to decode nested include options from `q=` param, update `validateVertzQL` to validate nested `where`/`orderBy`/`limit`
- `packages/server/src/entity/route-generator.ts` — Pass `include` from parsed VertzQL to DB adapter

**Acceptance Criteria:**

```ts
describe('Feature: VertzQL include with where/orderBy/limit', () => {
  describe('Given a q= param with nested include options', () => {
    describe('When decoding the base64url param', () => {
      it('Then preserves where, orderBy, limit, offset in the include', () => {});
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
```

### Phase 3: Entity Relations Config — Filterable/Sortable Declaration

Extend `EntityRelationsConfig` to declare which fields are filterable and sortable on each relation. Update validation to enforce these constraints.

**Changes:**
- `packages/server/src/entity/types.ts` — Extend `EntityRelationsConfig` with `filterable`, `sortable`, `maxLimit`
- `packages/server/src/entity/vertzql-parser.ts` — Update `validateVertzQL` to check `where` fields against `filterable` and `orderBy` fields against `sortable`
- `packages/codegen/src/generators/entity-schema-manifest-generator.ts` — Include `filterable`/`sortable`/`maxLimit` in the entity schema manifest

**Acceptance Criteria:**

```ts
describe('Feature: Entity relations config with filterable/sortable', () => {
  describe('Given a relation with filterable: ["status", "createdAt"]', () => {
    describe('When where includes a non-filterable field', () => {
      it('Then validateVertzQL returns error', () => {});
    });
    describe('When where includes only filterable fields', () => {
      it('Then validation passes', () => {});
    });
  });

  describe('Given a relation with sortable: ["createdAt"]', () => {
    describe('When orderBy includes a non-sortable field', () => {
      it('Then validateVertzQL returns error', () => {});
    });
    describe('When orderBy includes only sortable fields', () => {
      it('Then validation passes', () => {});
    });
  });

  describe('Given a relation with maxLimit: 50', () => {
    describe('When limit exceeds maxLimit', () => {
      it('Then clamps limit to maxLimit', () => {});
    });
  });
});
```

### Phase 4: Route Handler Wiring & Include Pass-through

Wire the parsed and validated include options through the route handler into the DB adapter. Currently, `include` from VertzQL is validated but not passed to the DB layer.

**Changes:**
- `packages/server/src/entity/route-generator.ts` — Pass `include` to the CRUD pipeline's `list` and `get` operations
- `packages/server/src/entity/crud-pipeline.ts` — Accept `include` in `ListOptions`, pass to `db.list()` and `db.get()`
- `packages/db/src/types/adapter.ts` — Extend `ListOptions` to include `include`

**Acceptance Criteria:**

```ts
describe('Feature: Include pass-through from route to DB', () => {
  describe('Given a GET /api/posts request with q= containing include', () => {
    describe('When the request is processed', () => {
      it('Then the DB adapter receives the include specification', () => {});
      it('Then relation data is included in the response', () => {});
    });
  });

  describe('Given a POST /api/posts/query with include in body', () => {
    describe('When the request is processed', () => {
      it('Then the DB adapter receives include with where/orderBy/limit', () => {});
    });
  });

  describe('Given a GET /api/posts/:id with q= containing include', () => {
    describe('When the request is processed', () => {
      it('Then the single entity response includes relation data', () => {});
    });
  });
});
```

### Phase 5: Codegen & UI Server Updates

Update the entity schema manifest and the bun plugin field selection injector to support the extended include format.

**Changes:**
- `packages/codegen/src/generators/entity-schema-manifest-generator.ts` — Include `filterable`/`sortable`/`maxLimit` in relation metadata
- `packages/ui-server/src/bun-plugin/field-selection-inject.ts` — No changes needed (the injector generates `where`/`orderBy` only if compiler detects those patterns, which is future work per Non-Goals)
- `packages/codegen/src/generators/entity-sdk-generator.ts` — Update SDK type generation to include `where`/`orderBy`/`limit` in typed include options

**Acceptance Criteria:**

```ts
describe('Feature: Entity schema manifest includes relation query metadata', () => {
  describe('Given an entity with filterable/sortable config', () => {
    describe('When codegen generates the entity-schema.json', () => {
      it('Then each relation includes filterable, sortable, maxLimit fields', () => {});
    });
  });
});

describe('Feature: SDK types include where/orderBy on includes', () => {
  describe('Given a generated SDK client for posts entity', () => {
    describe('When using the typed include option', () => {
      it('Then where is constrained to filterable fields', () => {});
      it('Then orderBy is constrained to sortable fields', () => {});
      // @ts-expect-error — non-filterable field in where
      it('Then rejects non-filterable fields in where', () => {});
    });
  });
});
```

## Dependencies Between Phases

```
Phase 1 (DB layer)
  ↓
Phase 2 (VertzQL types) ← can start after Phase 1 types are defined
  ↓
Phase 3 (Entity config) ← can start in parallel with Phase 2
  ↓
Phase 4 (Route wiring) ← depends on Phase 2 + Phase 3
  ↓
Phase 5 (Codegen + SDK) ← depends on Phase 3 for config shape
```

Phases 2 and 3 can run in parallel since they touch different parts of the stack.
