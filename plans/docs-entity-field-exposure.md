# Design Doc: Entity Field Exposure, Relations & Filters Documentation

## Goal

Create a new documentation page `guides/server/entity-exposure.mdx` titled **"Fields, Relations & Filters"** that documents how developers control which fields are exposed through an entity, how to configure relation exposure, and how to control which filters clients can use via VertzQL.

This fills a gap: the existing `entities.mdx` covers definition, access rules, hooks, and actions — but not how to control the shape of what the API returns and what clients can query.

## API Surface

The documentation covers three existing APIs that are currently undocumented:

### 1. Field visibility (column annotations)

```ts
const usersTable = d.table('users', {
  id: d.uuid().primary({ generate: 'cuid' }),
  email: d.email().unique(),
  name: d.text(),
  passwordHash: d.text().is('hidden'),              // never sent to clients
  createdAt: d.timestamp().default('now').readOnly(),  // read-only
});
```

Already documented in `schema.mdx` — this page links there and only adds the new information: **how annotations affect filtering and sorting** (hidden fields are rejected in `where`, `orderBy`, and `select` from clients).

### 2. Relations config

```ts
const posts = entity('posts', {
  model: postsModel,
  relations: {
    // Boolean — expose all fields, no filtering/sorting
    tags: true,

    // Boolean — hide this relation entirely
    secrets: false,

    // Structured — fine-grained control
    comments: {
      select: { id: true, text: true, author: true, createdAt: true },
      allowWhere: ['status', 'createdAt'],
      allowOrderBy: ['createdAt'],
      maxLimit: 50,
    },

    // Structured — expose subset of fields, no filtering
    author: {
      select: { id: true, name: true },
    },
  },
});
```

### 3. VertzQL query syntax (client-side)

```ts
// Using the generated SDK (recommended)
const posts = await api.posts.list({
  where: { status: 'published' },
  include: { comments: { where: { status: 'approved' }, limit: 10 } },
  orderBy: { createdAt: 'desc' },
  limit: 20,
});
```

Which generates:

```
GET /api/posts?where[status]=published&orderBy=createdAt:desc&limit=20
```

Or the structured `q=` parameter for complex queries (base64url-encoded JSON):

```ts
const query = {
  select: { title: true, status: true },
  include: {
    comments: {
      select: { text: true },
      where: { status: 'approved' },
      orderBy: { createdAt: 'desc' },
      limit: 10,
    },
  },
};
// GET /api/posts?q=<base64url-encoded JSON>
```

Or the POST `/query` endpoint for very large queries:

```ts
POST /api/posts/query
Content-Type: application/json

{ "select": { "title": true }, "include": { ... } }
```

## Manifesto Alignment

- **Compile-time over runtime**: Hidden fields are enforced at the type level — the SDK won't allow selecting or filtering on hidden fields.
- **Declarative over imperative**: Relations config is a plain object, not callbacks.
- **Deny-by-default**: Relations not in the config aren't queryable. `allowWhere` and `allowOrderBy` are allowlists, not blocklists.

## Non-Goals

- This doc does NOT cover access rules (already in `entities.mdx`).
- This doc does NOT cover the DB query API (already in `queries.mdx`).
- This doc does NOT cover schema definition (already in `schema.mdx`).
- No new framework features — purely documentation of existing behavior.

## Unknowns

None identified — the implementation is stable and well-tested.

## POC Results

N/A — documentation only.

## Type Flow Map

N/A — documentation only.

## E2E Acceptance Test

N/A — documentation only. Acceptance criteria are content-based:

1. Page renders correctly in Mintlify
2. All code examples use correct API (`.is('hidden')`, not `.hidden()`)
3. Navigation link appears in the `vertz/server` group in `docs.json`
4. Cross-references to `schema.mdx`, `entities.mdx`, and `queries.mdx` link correctly
5. Card added to `guides/server/overview.mdx` `<CardGroup>` for discoverability

## Page Structure

### `guides/server/entity-exposure.mdx` — "Fields, Relations & Filters"

```
---
title: "Fields, Relations & Filters"
description: "Control which fields, relations, and filters are exposed through your entity API"
---

## Field visibility
  - Brief: annotations control what's exposed. Link to schema.mdx for full reference.
  - NEW info only: how .is('hidden') and .readOnly() affect filtering/sorting
  - Callout: "For the entity's own fields, visibility is controlled by column annotations.
    There is no top-level `select` config on the entity — annotations are the single source of truth."

## Exposing relations
  - Deny-by-default callout: "Relations defined in the model but NOT listed in the entity's
    `relations` config are not exposed through the API."
  - Boolean config (true/false) with examples
  - Structured config: select, allowWhere, allowOrderBy, maxLimit
  - RelationConfigObject properties table
  - Full realistic entity example
  - What happens when a client queries a non-exposed relation (error response shape)

## Querying from the client
  - Audience callout: "This section is for developers consuming the entity API."
  - SDK example first (recommended path), then URL params as reference
  - Flat URL params: where, orderBy, limit, after, offset
  - Filter operators: link to queries.mdx for the full reference, only add
    URL-param syntax specifics (e.g. where[age][gt]=18)
  - Array operators (Postgres-only): arrayContains, arrayContainedBy, arrayOverlaps
  - Logical operators: AND, OR, NOT
  - Selecting fields (select)
  - Including relations (include with nested select, where, orderBy, limit)
  - Structured q= parameter (base64url JSON) for complex queries
  - POST /query endpoint for very large queries
  - Error responses for rejected queries (HTTP status + error body shape)

## Putting it together
  - Concrete traced example:
    1. Entity definition (with relations config + hidden field)
    2. Client sends a query (SDK + equivalent URL)
    3. Server validates (rejects disallowed filter, clamps maxLimit)
    4. Response shape (hidden fields stripped, relation fields narrowed)
  - What the server rejects (with error shapes) vs. silently clamps (maxLimit)
```

## Review Findings Addressed

| # | Source | Finding | Resolution |
|---|--------|---------|------------|
| 1 | Product+DX | Title "Querying Entities" collides with `queries.mdx` | Renamed to "Fields, Relations & Filters" / `entity-exposure.mdx` |
| 2 | Technical | `.hidden()` should be `.is('hidden')` | Fixed in all code examples |
| 3 | Product+DX | Operator table duplicates `queries.mdx` | Link to `queries.mdx`, only add URL-param syntax specifics |
| 4 | Product+DX | Client query section bleeds into other docs | Added audience callout, SDK-first approach, HTTP reference framing |
| 5 | Product | Missing entity-level vs relation-level select distinction | Added explicit callout in Field visibility section |
| 6 | Product | Missing deny-by-default for undeclared relations | Added explicit callout in Exposing relations section |
| 7 | Technical | Missing array/logical operators | Added to Querying section |
| 8 | Technical | `offset` in `q=` param not documented | Added to flat URL params list |
| 9 | Technical | POST `/query` endpoint not mentioned | Added as alternative for large queries |
| 10 | DX | Missing SDK examples | SDK example shown first, URL as reference |
| 11 | DX | "How it all connects" needs concrete example | Renamed to "Putting it together" with traced example |
| 12 | DX | Field visibility duplicates schema.mdx | Tightened to link + new info only (filtering/sorting) |
| 13 | DX | Add card to server overview | Added to acceptance criteria |

## Implementation Plan

### Phase 1: Write the documentation page

**Deliverables:**
1. Create `packages/docs/guides/server/entity-exposure.mdx`
2. Add page to `docs.json` navigation under `vertz/server` group (after `entities`)
3. Add card to `guides/server/overview.mdx` `<CardGroup>`

**Acceptance criteria:**
- Page covers field visibility (linking to schema.mdx, not duplicating), relation config, and VertzQL query syntax
- All code examples use correct API (`.is('hidden')`, `RelationConfigObject`, VertzQL operators)
- SDK examples shown alongside URL params
- Deny-by-default behavior explicitly called out for both fields and relations
- Error response shapes documented for all rejection cases
- Concrete traced end-to-end example in "Putting it together" section
- Navigation entry exists in `docs.json`
- Card added to server overview page
- Cross-references to `schema.mdx`, `entities.mdx`, `queries.mdx` are correct
