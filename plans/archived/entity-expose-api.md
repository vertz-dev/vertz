# Design Doc: Entity Expose API

## Goal

Replace the current `relations` config on entities with a unified `expose` config that controls the entire VertzQL query surface — both the entity's own fields and its relations — using a fractal structure that mirrors the DB query API.

Today, field visibility is split: column annotations (`.is('hidden')`) control own fields, and `relations` config controls relation exposure. There's no way to:
- Narrow which non-hidden fields are selectable/filterable/sortable at the entity level
- Attach access descriptors to individual fields (e.g., salary visible only with an entitlement)
- Use consistent notation between field config and relation config

The `expose` API unifies this into a single, fractal configuration that maps closely to the DB query API shape.

## API Surface

### Basic usage

```ts
import { entity } from 'vertz/server';
import { rules } from 'vertz/server/rules';

const posts = entity('posts', {
  model: postsModel,
  access: {
    list: rules.authenticated(),
    get: rules.authenticated(),
  },
  expose: {
    // Which of the entity's own fields to expose
    select: {
      id: true,
      title: true,
      content: true,
      status: true,
      createdAt: true,
      // authorId not listed → not exposed even though it's not hidden
    },

    // Which fields clients can filter by (object notation)
    allowWhere: { status: true, createdAt: true },

    // Which fields clients can sort by (object notation)
    allowOrderBy: { createdAt: true, title: true },

    // Relations — under `include`, same fractal shape
    include: {
      comments: {
        select: { id: true, text: true, status: true, createdAt: true },
        allowWhere: { status: true, createdAt: true },
        allowOrderBy: { createdAt: true },
        maxLimit: 50,
      },
      author: {
        select: { id: true, name: true },
      },
    },
  },
});
```

### `select` is required when `expose` is present

Once you opt into `expose`, you must declare which fields to expose. No implicit "all fields" default:

```ts
// No expose at all — current behavior, all public fields exposed
const simple = entity('logs', {
  model: logsModel,
  access: { list: rules.authenticated() },
});

// With expose — select is required
const posts = entity('posts', {
  model: postsModel,
  // @ts-expect-error — expose requires select
  expose: {
    include: { comments: { select: { id: true } } },
  },
});
```

This enforces "explicit over implicit" — if you've opted into controlling your API surface, you control all of it.

### `select: {}` — no own fields

`select: {}` is valid and means the entity exposes no own fields — only relations. This is useful for junction/join entities that exist only to connect other entities:

```ts
expose: {
  select: {},  // no own fields
  include: {
    project: { select: { id: true, name: true } },
    user: { select: { id: true, name: true } },
  },
},
```

### Field-level access descriptors

Fields in `select` can use `rules.*` descriptors instead of `true` for conditional visibility:

```ts
const employees = entity('employees', {
  model: employeesModel,
  access: {
    list: rules.authenticated(),
    get: rules.authenticated(),
  },
  expose: {
    select: {
      id: true,
      name: true,
      email: true,
      department: true,
      // salary visible only with entitlement
      salary: rules.entitlement('hr:view-compensation'),
      // SSN requires MFA verification
      ssn: rules.all(
        rules.entitlement('hr:view-pii'),
        rules.fva(300),
      ),
    },
    allowWhere: {
      department: true,
      name: true,
      // salary filterable only with entitlement
      salary: rules.entitlement('hr:filter-compensation'),
    },
    allowOrderBy: { name: true, department: true },
  },
});
```

**When the user doesn't satisfy the descriptor, the field is `null` in the response.** The SDK types reflect this: descriptor-guarded fields are typed as `T | null`.

```ts
// SDK response type for employees
type EmployeeResponse = {
  id: string;            // always present
  name: string;          // always present
  email: string;         // always present
  department: string;    // always present
  salary: number | null; // null when entitlement not satisfied
  ssn: string | null;    // null when entitlement + FVA not satisfied
}

// Client code
const emp = result.items[0];
if (emp.salary !== null) {
  // User has hr:view-compensation entitlement
  console.log(`Salary: ${emp.salary}`);
}
```

Using `null` (not omission) is intentional:
- `null` signals "this field exists but you can't see its value" — distinguishable from "field doesn't exist on this entity"
- The client always knows the field shape and can check `!== null`
- No runtime type surprises — the field is always in the object

**`allowWhere` with descriptors**: When a user filters by a field they're not entitled to, the error says "field not filterable" (doesn't reveal the field exists but is access-controlled).

**`allowOrderBy` also supports descriptors** for consistency — "users without hr:filter shouldn't sort by salary" is the same access concern:

```ts
allowOrderBy: {
  name: true,
  salary: rules.entitlement('hr:sort-compensation'),
},
```

### Fractal structure — mirrors DB query API

The `expose` config maps 1:1 to the DB query API:

| DB Query | Entity Expose | Purpose |
|----------|---------------|---------|
| `select: { id: true, name: true }` | `select: { id: true, name: true }` | Which fields are available |
| `where: { status: 'active' }` | `allowWhere: { status: true }` | Which fields can be filtered |
| `orderBy: { createdAt: 'desc' }` | `allowOrderBy: { createdAt: true }` | Which fields can be sorted |
| `include: { comments: { ... } }` | `include: { comments: { ... } }` | Relation config (recursive) |

Same shape, same names, same nesting. The `expose` config is the "schema" for what the query API allows.

Note: `select` doesn't use an `allow` prefix because it serves double duty — it defines both which fields are visible in responses AND which fields clients can request via `select`. `allowWhere` and `allowOrderBy` need the prefix to distinguish "these fields are filterable" from actual filter values.

### Nested relation exposure (recursive `include`)

Relations can expose their own relations via nested `include`. Same fractal shape at every level:

```ts
const posts = entity('posts', {
  model: postsModel,
  expose: {
    select: { id: true, title: true, status: true, createdAt: true },
    allowWhere: { status: true, createdAt: true },
    allowOrderBy: { createdAt: true },
    include: {
      comments: {
        select: { id: true, text: true, status: true, createdAt: true },
        allowWhere: { status: true, createdAt: true },
        allowOrderBy: { createdAt: true },
        maxLimit: 50,
        // Nested — expose authors within comments
        include: {
          author: {
            select: { id: true, name: true, avatar: true },
          },
        },
      },
      author: {
        select: { id: true, name: true },
      },
    },
  },
});
```

Client query mirrors it:

```ts
const posts = await api.posts.list({
  select: { title: true, status: true },
  include: {
    comments: {
      where: { status: 'approved' },
      orderBy: { createdAt: 'desc' },
      limit: 10,
      include: {
        author: true,  // all exposed fields (id, name, avatar)
      },
    },
  },
});
// posts[0].comments[0].author → { id: string, name: string, avatar: string }
```

### Narrowing-only principle

`expose.select` can only narrow — you cannot expose a field that's `.is('hidden')` in the schema:

```ts
const usersTable = d.table('users', {
  id: d.uuid().primary(),
  email: d.email(),
  passwordHash: d.text().is('hidden'),
});

const users = entity('users', {
  model: usersModel,
  expose: {
    select: {
      id: true,
      email: true,
      // @ts-expect-error — passwordHash is hidden, can't be exposed
      passwordHash: true,
    },
  },
});
```

TypeScript enforces this: the `select` type only allows `PublicColumnKeys<TTable>` (non-hidden columns, including readOnly columns like `createdAt` — readOnly restricts writes, not reads). The compiler catches the violation, not the runtime.

### allowWhere / allowOrderBy constrained by select

`allowWhere` can only include fields that are in `select`. You can't filter by a field that isn't exposed:

```ts
expose: {
  select: { id: true, title: true, status: true },
  // @ts-expect-error — 'content' not in select, can't be filterable
  allowWhere: { content: true },
}
```

Same for `allowOrderBy` — constrained to fields in `select`.

### Relation boolean shorthand

For simple cases, relations still support boolean shorthand inside `include`:

```ts
expose: {
  select: { id: true, title: true },
  include: {
    tags: true,             // all fields, no filtering/sorting
    internalNotes: false,   // hidden entirely
    comments: {             // fine-grained control
      select: { id: true, text: true },
      allowWhere: { status: true },
      maxLimit: 50,
    },
  },
},
```

### Migration from current `relations` config

Before:
```ts
entity('posts', {
  model: postsModel,
  relations: {
    author: true,
    comments: {
      select: { id: true, text: true },
      allowWhere: ['status'],        // array of strings
      allowOrderBy: ['createdAt'],   // array of strings
      maxLimit: 50,
    },
  },
});
```

After:
```ts
entity('posts', {
  model: postsModel,
  expose: {
    select: { id: true, title: true, content: true, status: true, createdAt: true },
    allowWhere: { status: true },
    allowOrderBy: { createdAt: true },
    include: {
      author: true,
      comments: {
        select: { id: true, text: true },
        allowWhere: { status: true },       // object notation
        allowOrderBy: { createdAt: true },  // object notation
        maxLimit: 50,
      },
    },
  },
});
```

Key changes: (1) `relations` → `expose.include`, (2) `allowWhere`/`allowOrderBy` use `{ field: true }` instead of `['field']`, (3) entity-level `select`/`allowWhere`/`allowOrderBy` added.

Since we're pre-v1 with no external users, this is a clean breaking change — no deprecation period, no backwards-compat shims.

## Manifesto Alignment

- **If it builds, it works**: `select`, `allowWhere`, `allowOrderBy` are type-constrained to valid column keys. Hidden fields can't be exposed. `allowWhere` can't reference fields outside `select`. TypeScript catches violations at compile time.
- **One way to do things**: One `expose` config controls the entire API surface. Same fractal shape at every level. Column annotations (`.is('hidden')`) control the schema level; `expose` controls the API level — two distinct layers, each with one purpose.
- **AI agents are first-class users**: The fractal structure mirrors the DB query API — an LLM that knows `db.posts.list({ select, where, orderBy, include })` already knows how to write the `expose` config.
- **Explicit over implicit**: `select` is required when `expose` is present. Every exposed field is listed explicitly.
- **Compile-time over runtime**: TypeScript enforces narrowing-only, field validity, and `allowWhere`/`allowOrderBy` constrained to `select` keys.

## Non-Goals

- **Replacing column annotations**: `.is('hidden')` and `.readOnly()` remain on the schema. `expose` narrows on top of them — it doesn't replace them. Annotations are the schema-level source of truth; `expose` is the API-level policy.
- **Query-time field selection**: This is about configuring what's *allowed*, not what's *queried*. The client still uses `select`, `where`, `orderBy` in their queries to pick from the allowed set.
- **Row-level access**: Row-level policies (e.g., `rules.where({ createdBy: rules.user.id })`) stay in the `access` config, not in `expose`.

## Unknowns

1. **`allowWhere`/`allowOrderBy` constrained to `select` keys — generic inference**: The type constraint `allowWhere` keys ⊆ `select` keys requires capturing the specific `select` object as a generic parameter on `entity()`. This adds a generic to the already-generic-heavy `entity<TModel, TInject, TActions>()` signature. Needs a POC to verify TypeScript infers the `TSelect` generic correctly without requiring manual annotation.
   - **Resolution plan**: POC in Phase 1. If inference proves too complex, fall back to constraining `allowWhere` to `PublicColumnKeys<TTable>` (same as `select`) with a runtime validation that checks the subset constraint.

2. **Descriptor on `allowWhere` — error shape**: When a user filters by a field they're not entitled to, the error says "field not filterable" (doesn't reveal existence). This is a security-first default. Configurable later if needed.

3. **Descriptor evaluation — async context in filter pipeline**: Currently `stripHiddenFields()` and `narrowRelationFields()` are synchronous, context-free functions. Descriptor evaluation requires auth context (`BaseContext` + `EnforceAccessOptions`) and is async (entitlement checks call `options.can()` which returns `Promise<boolean>`).
   - **Resolution plan**: Pre-evaluate all expose descriptors **once per request** before iterating rows. Expose descriptors are user-level (check entitlements, roles, FVA), not row-level (unlike `rules.where` in access config). One evaluation produces a static "allowed fields set" for the entire response. No per-row async overhead.

4. **Debug diagnostics for null fields**: When a descriptor-guarded field returns `null`, developers consuming the API may wonder why. A debug mode (e.g., `X-Vertz-Redacted-Fields` response header in development) listing which fields were nulled and why would improve DX. This is a follow-up concern, not required for initial implementation.

## POC Results

### Unknown #1: `allowWhere` keys ⊆ `select` keys — generic inference

**Question**: Can TypeScript infer a `TSelect` generic from the `expose.select` object to constrain `allowWhere`/`allowOrderBy` keys at compile time?

**Explored**: Adding a `TSelect` generic to `entity<TModel, TActions, TInject, TSelect>()`. TypeScript CAN infer literal object types from inline objects, but the additional generic on the already-complex signature hurts DX (tooltip noise, longer error messages).

**Decision**: Fallback approach adopted. `allowWhere`/`allowOrderBy` are typed against `PublicColumnKeys<TTable>` (same as `select`) — this catches hidden fields and non-existent fields at compile time. The subset constraint (`allowWhere` keys must be in `select` keys) is enforced at runtime by `validateVertzQL()`, which returns a clear error message. This is sufficient for pre-v1.

**Tests**: `expose-types.test-d.ts` — "POC: allowWhere/allowOrderBy field validity" section. Confirms hidden fields and non-existent fields are rejected at the type level.

### Unknown #2: `T | null` typing for descriptor-guarded fields

**Question**: Can we produce an SDK response type where AccessRule-guarded fields become `T | null`?

**Explored**: Type utility `ExposeResponseType<TTable, TSelect>` using conditional mapped types:
```ts
type ExposeResponseType<TTable, TSelect> = {
  [K in keyof TSelect & keyof TTable]: TSelect[K] extends true ? TTable[K] : TTable[K] | null;
};
```

**Result**: Works perfectly. Fields with `true` retain their original type. Fields with any object value (AccessRule descriptors) get `T | null`. The conditional `extends true` correctly distinguishes between `true` (literal) and object types.

**Tests**: `expose-types.test-d.ts` — "POC: descriptor-guarded field T | null typing" section. Verifies both directions (assignment to `T | null`, rejection of narrow `T` assignment).

## Type Flow Map

```
EntityConfig.expose
  ├─ select: { [K in PublicColumnKeys<TTable>]?: true | AccessRule }
  │    └─ constrains SDK response type
  │    └─ fields with AccessRule → T | null in response type
  ├─ allowWhere: { [K in keyof Select]?: true | AccessRule }
  │    └─ constrains SDK where type
  │    └─ validateVertzQL() checks client where fields against this
  ├─ allowOrderBy: { [K in keyof Select]?: true | AccessRule }
  │    └─ constrains SDK orderBy type
  │    └─ validateVertzQL() checks client orderBy fields against this
  └─ include: { [K in keyof TModel['relations']]?: true | false | RelationExposeConfig }
       ├─ select: { [K in RelationColumnKeys]?: true | AccessRule }
       ├─ allowWhere: { [K in keyof RelationSelect]?: true | AccessRule }
       ├─ allowOrderBy: { [K in keyof RelationSelect]?: true | AccessRule }
       ├─ maxLimit?: number
       └─ include: { ... } (recursive)

Descriptor evaluation flow (once per request):
  1. Extract all AccessRule values from expose config
  2. Evaluate each against BaseContext + EnforceAccessOptions
  3. Produce static allowedFields: Set<string> and nulledFields: Set<string>
  4. Apply to every row in response (sync, no per-row evaluation)
```

## E2E Acceptance Test

```ts
// Developer defines an entity with expose
const tasks = entity('tasks', {
  model: tasksModel,
  access: { list: rules.authenticated(), get: rules.authenticated() },
  expose: {
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      estimate: rules.entitlement('pm:view-estimates'),
    },
    allowWhere: { status: true, createdAt: true },
    allowOrderBy: { createdAt: true, title: true },
    include: {
      assignee: {
        select: { id: true, name: true },
      },
      comments: {
        select: { id: true, text: true, createdAt: true },
        allowWhere: { createdAt: true },
        allowOrderBy: { createdAt: true },
        maxLimit: 20,
        include: {
          author: {
            select: { id: true, name: true },
          },
        },
      },
    },
  },
});

// Client query — valid
const result = await api.tasks.list({
  select: { title: true, status: true },
  where: { status: 'todo' },
  orderBy: { createdAt: 'desc' },
  include: {
    assignee: true,
    comments: {
      where: { createdAt: { gte: '2026-01-01' } },
      limit: 5,
      include: { author: true },
    },
  },
});
// result.items[0].title    → string
// result.items[0].status   → string
// result.items[0].estimate → number | null (descriptor-guarded)
// result.items[0].assignee → { id: string, name: string }
// result.items[0].comments → [{ id, text, createdAt, author: { id, name } }]

// Client query — rejected
// @ts-expect-error — 'description' not in expose.select
api.tasks.list({ select: { description: true } });

// @ts-expect-error — 'title' not in expose.allowWhere
api.tasks.list({ where: { title: 'foo' } });

// @ts-expect-error — 'author' not in comments.allowWhere
api.tasks.list({ include: { comments: { where: { author: 'abc' } } } });
```

## Review Findings Addressed (Rev 2)

| # | Source | Finding | Resolution |
|---|--------|---------|------------|
| 1 | DX+Tech | Namespace collision — relations and config keys at same level | Relations moved under `include: {}` — no collision, mirrors DB API |
| 2 | All 3 | `expose` without `select` = implicit all fields | `select` is required when `expose` is present |
| 3 | DX | `allowWhere`/`allowOrderBy` naming asymmetry with `select` | Documented rationale: `select` serves double duty, `allow*` distinguishes permission from values |
| 4 | DX | `select: {}` empty object behavior | Documented as valid (junction entities) |
| 5 | DX | Descriptor-guarded field silent omission DX | Changed to `null` instead of omission. Debug header as follow-up (Unknown #4) |
| 6 | DX | Migration path needs concrete example | Added before/after migration section |
| 7 | DX | `maxLimit` not on entity level | Entity-level limit controlled by `MAX_LIMIT` constant (1000). Not added to `expose` |
| 8 | DX+Tech | `readOnly` fields should be selectable | Fixed: readOnly restricts writes, not reads. `PublicColumnKeys` correctly includes them |
| 9 | Product | `expose.select` premature — annotations handle field visibility | Kept `expose.select` — it serves a different purpose than annotations. Annotations = schema-level (hidden/readOnly). `expose.select` = API-level narrowing. Two distinct layers. |
| 10 | Product | `relations` → `expose` migration not justified | Pre-v1, no external users — clean break. Fractal structure + `include` wrapper + entity-level `allowWhere`/`allowOrderBy` justify the restructure. |
| 11 | Product | Field-level descriptors should be Phase 1, not Phase 3 | Promoted: descriptors are now part of the type design from Phase 1. Runtime evaluation in Phase 2. |
| 12 | Tech | `allowWhere` constrained to `select` keys — generic inference | Added as Unknown #1 with POC plan and fallback strategy |
| 13 | Tech | Descriptor evaluation needs async auth context | Pre-evaluate once per request (Unknown #3). Expose descriptors are user-level, not row-level. |
| 14 | Tech | `relations` + `expose` coexistence | Pre-v1: clean break, no coexistence. Old `relations` removed. |
| 15 | DX | `allowOrderBy` should also support descriptors | Added descriptor support to `allowOrderBy` for consistency |
| 16 | Product | Doc plan overlap | Documentation is Phase 4 (after implementation). Previous doc-only plan (`docs-entity-field-exposure.md`) superseded by this design. |

## Implementation Plan

### Phase 1: Core types, validation, and descriptor type POC

Add `ExposeConfig` type to `EntityConfig`, update validation, POC the generic inference.

**Deliverables:**
1. `ExposeConfig` type in `packages/server/src/entity/types.ts` with `select` (required), `allowWhere`, `allowOrderBy`, `include`
2. Relations inside `include: {}` — no namespace collision with config keys
3. `allowWhere`/`allowOrderBy` use object notation `{ field: true | AccessRule }`
4. Update `validateVertzQL()` to check against `expose` config
5. POC: TypeScript generic inference for `allowWhere` keys ⊆ `select` keys (resolve Unknown #1)
6. POC: `T | null` typing for descriptor-guarded fields in SDK response type

**Acceptance criteria:**
- Entity with `expose.select` restricts which fields appear in responses
- Entity with `expose.allowWhere` rejects filters on non-allowed fields
- Entity with `expose.allowOrderBy` rejects sorts on non-allowed fields
- Hidden fields can't be in `expose.select` (type error)
- `select` required when `expose` present (type error)
- `allowWhere`/`allowOrderBy` constrained to `select` keys (type error or runtime validation per POC)
- No `expose` = current behavior (backwards compatible)
- Nested `include` with recursive validation works
- Old `relations` property removed (clean break)

### Phase 2: Descriptor runtime evaluation

Add runtime evaluation of `rules.*` descriptors on `select` and `allowWhere` values.

**Deliverables:**
1. Pre-evaluate expose descriptors once per request → static allowed/nulled field sets
2. Descriptor-guarded fields return `null` in responses when user doesn't satisfy the rule
3. Descriptor-guarded `allowWhere` fields return "field not filterable" error (deny existence)
4. Update filter pipeline to accept auth context for descriptor evaluation

**Acceptance criteria:**
- `select: { salary: rules.entitlement('hr:view') }` returns `null` for salary when user lacks entitlement
- `allowWhere: { salary: rules.entitlement('hr:filter') }` rejects filter with "not filterable" when user lacks entitlement
- Descriptor evaluation happens once per request, not per row (performance)
- Response type marks descriptor-guarded fields as `T | null`

### Phase 3: Documentation

Document the full `expose` API in `packages/mint-docs/`.

**Deliverables:**
1. New page `guides/server/entity-exposure.mdx` — "Fields, Relations & Filters"
2. Update `entities.mdx` to reference new page
3. Add navigation entry in `docs.json` and card in `guides/server/overview.mdx`
4. Concrete examples: basic expose, descriptors, nested includes, migration

**Acceptance criteria:**
- Page covers `select`, `allowWhere`, `allowOrderBy`, `include` (recursive)
- Shows fractal structure mapping to DB query API
- Includes descriptor-guarded field examples with `null` semantics
- Error response shapes documented for all rejection cases
- End-to-end traced example (entity definition → client query → server validation → response shape)
- Cross-references to `schema.mdx` (annotations), `entities.mdx` (access rules), `queries.mdx` (DB API)
