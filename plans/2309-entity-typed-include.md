# Thread TModels Through Entity-Layer TypedIncludeOption

**Issue:** #2309
**Follow-up from:** #2286 (typed nested include in DB IncludeOption)

## Description

The `@vertz/db` layer already threads `TModels` through `IncludeOption` for typed nested includes (depth-capped at 3). The entity layer in `packages/server/src/entity/types.ts` defines its own `TypedIncludeOption` with access-controlled semantics but lacks `TModels` threading. This means:

1. The entity `TypedIncludeOption` has no `include` field for nested relations
2. Nested includes can't validate keys against target model relations
3. Clients using VertzQL can nest includes at runtime, but the types don't help them

This design threads `TModels` and `TRelations` through the entity layer so nested includes are type-validated against the model registry, while preserving access-controlled semantics (entity relations config filtering, select restrictions, `false`-gating).

## API Surface

### Before (no nested include support)

```ts
// Entity TypedIncludeOption only allows flat relations
type PostRelationsConfig = {
  author: { select: { id: true; name: true } };
  comments: true;
};

const opts: TypedIncludeOption<PostRelationsConfig> = {
  author: { select: { id: true } },
  comments: true,
  // No `include` field available for nested relations
};
```

### After (nested include with TModels + TRelations)

```ts
import type { ModelEntry, RelationDef } from '@vertz/db';

// TModels registry (same registry used by @vertz/db)
type Models = {
  users: ModelEntry<typeof usersTable, typeof userRelations>;
  posts: ModelEntry<typeof postsTable, typeof postRelations>;
  comments: ModelEntry<typeof commentsTable, typeof commentRelations>;
};

type PostRelationsConfig = {
  author: { select: { id: true; name: true } };
  comments: true;
};

// With TRelations + TModels — nested include is typed
const opts: TypedIncludeOption<PostRelationsConfig, typeof postRelations, Models> = {
  comments: {
    include: {
      author: true,  // Valid: comments model has 'author' relation
      post: true,    // Valid: comments model has 'post' relation
    },
  },
};

// RelationConfigObject relations also support nested include + select
const withSelect: TypedIncludeOption<PostRelationsConfig, typeof postRelations, Models> = {
  author: {
    select: { id: true },
    include: { posts: true },  // Valid: users model has 'posts' relation
  },
};

// @ts-expect-error — 'bogus' is not a relation on comments model
const bad: TypedIncludeOption<PostRelationsConfig, typeof postRelations, Models> = {
  comments: {
    include: { bogus: true },
  },
};

// Without TModels — backward compatible, nested include is untyped
const untyped: TypedIncludeOption<PostRelationsConfig> = {
  comments: {
    include: { anything: true },  // compiles — untyped fallback
  },
};
```

> **Gotcha: asymmetric validation.** Top-level include keys are filtered by the entity relations config (access-controlled: `false` means hidden). Nested include keys are validated against the raw model relations (does this relation exist on the target model?), not against any target entity's expose config. This means a relation hidden at the top level on one entity could still appear in nested includes from another entity. Runtime access enforcement handles this — the entity CRUD pipeline checks access rules regardless of type-level validation.

### TypedQueryOptions threading

```ts
// TModels + TRelations flow through TypedQueryOptions to TypedIncludeOption
interface TypedQueryOptions<
  TTable extends TableDef = TableDef,
  TRelationsConfig extends EntityRelationsConfig = EntityRelationsConfig,
  TRelations extends Record<string, RelationDef> = Record<string, RelationDef>,
  TModels extends Record<string, ModelEntry> = Record<string, ModelEntry>,
> {
  where?: TypedWhereOption<TTable>;
  orderBy?: { [K in PublicColumnKeys<TTable>]?: 'asc' | 'desc' };
  limit?: number;
  after?: string;
  select?: TypedSelectOption<TTable>;
  include?: TypedIncludeOption<TRelationsConfig, TRelations, TModels>;
}
```

### Key implementation detail: resolving the target table

`EntityRelationsConfig` erases the target table type — its values are `true | false | RelationConfigObject<string>`, not `RelationDef`. To resolve the target table for nested includes, `TypedIncludeOption` needs the original `TRelations` (the model's relation record where each value is a `RelationDef<TargetTable, ...>`).

For each key `K` in `TRelationsConfig`, the nested include is resolved by:
1. Extract `RelationTarget<TRelations[K]>` — the target table from the raw relation definition
2. `FindModelByTable<TModels, TargetTable>` — find the target model in the registry
3. `FindModelRelations<TModels, TargetTable>` — extract the target model's relations
4. Produce `IncludeOption<TargetRelations, TModels, [..._Depth, unknown]>` — recursive typed nested include

### Change to `true`-config relations

Currently, relations configured as `true` in `EntityRelationsConfig` only accept the literal `true` in the include. This changes: `true`-config relations now also accept the structured form `{ where?, orderBy?, limit?, include? }`. This is necessary because nested includes would be useless if only `RelationConfigObject`-configured relations could use them.

For `true`-config relations, `where`/`orderBy` use the target table's columns (derived from `TRelations[K]`). For `RelationConfigObject`-config relations, `where`/`orderBy` remain constrained by the config's `select` restrictions. The `include` field is available on both.

## Manifesto Alignment

**Principle 1 — "If it builds, it works"**: Threading `TModels` means the compiler catches invalid nested relation names at build time. Currently, nested includes are only validated at runtime by the VertzQL parser.

**Principle 3 — "AI agents are first-class users"**: Typed nested includes give LLMs autocomplete-quality type information for nested relation queries. Without this, agents guess relation names and discover errors only at runtime.

**Tradeoff**: Adding `TRelations` and `TModels` as generic parameters increases type complexity (3 params vs 1). But the defaults preserve backward compatibility — untyped callers see no change.

**Rejected alternative**: Making nested includes use the entity relations config of the target entity. This would require a registry of entity configs (not just model entries), which doesn't exist and would couple the entity type system to a runtime registry. Model-level validation is sufficient — the access layer is enforced at runtime regardless.

## Non-Goals

1. **No entity-level nested access filtering in types** — Nested includes validate against _model_ relations (do these relations exist?), not entity expose configs (is this relation exposed?). Access enforcement for nested relations remains a runtime concern.
2. **No new runtime behavior** — This is a type-level-only change. The VertzQL parser and CRUD pipeline are unaffected.
3. **No changes to `@vertz/db` types** — The DB layer already has `TModels` threading. We reuse `FindModelByTable`, `FindModelRelations`, and `ModelEntry` as-is.
4. **No changes to `RelationExposeConfig.include`** — The expose config's loosely-typed `include` is a separate concern (entity configuration vs query typing).
5. **No SDK codegen changes** — Codegen does not yet thread `TModels` into generated types. That is a separate follow-up if needed.

## Unknowns

None identified. The pattern is established in `@vertz/db` — this mirrors it at the entity layer.

## Type Flow Map

```
TRelations (Record<string, RelationDef>)  +  TModels (Record<string, ModelEntry>)
  │                                            │
  └──────────────┬─────────────────────────────┘
                 │
  TypedQueryOptions<TTable, TRelationsConfig, TRelations, TModels>
    │
    └─→ include?: TypedIncludeOption<TRelationsConfig, TRelations, TModels>
          │
          ├─→ [top-level keys filtered by TRelationsConfig — false excluded]
          │
          ├─→ For RelationConfigObject entries:
          │     select?: restricted by config's select
          │     where?, orderBy?, limit? (as before)
          │     include?: EntityNestedInclude<TModels, RelationTarget<TRelations[K]>, _Depth>
          │
          ├─→ For `true` entries:
          │     where?, orderBy?, limit? (uses target table columns from TRelations[K])
          │     include?: EntityNestedInclude<TModels, RelationTarget<TRelations[K]>, _Depth>
          │
          └─→ EntityNestedInclude<TModels, TargetTable, _Depth>
                │
                ├─→ FindModelByTable<TModels, TargetTable>
                │     └─→ finds ModelEntry or never
                │
                ├─→ FindModelRelations<TModels, TargetTable>
                │     └─→ extracts TRelations from ModelEntry
                │
                └─→ IncludeOption<TargetRelations, TModels, [..._Depth, unknown]>
                      └─→ (DB-layer recursive, depth-capped at 3 DB levels)

Consumer: TypedQueryOptions in entity list/get handlers
```

### Key: once we go one level deep, we delegate to `@vertz/db`'s `IncludeOption`

The first level of include keys is filtered by `EntityRelationsConfig` (access-controlled). Nested levels delegate to the DB-layer `IncludeOption` which validates against model relations directly. This is correct because:
- Top-level: entity config controls which relations are exposed
- Nested: model schema controls which relations exist (runtime access is still enforced)

### Depth: 4 total levels (1 entity + 3 DB)

The entity-level `TypedIncludeOption` provides 1 level of typed include (filtered by entity config). Nested includes delegate to `IncludeOption` starting at `_Depth = []`, giving 3 additional typed levels from the DB layer. At depth 3 within the DB layer (4th total nesting level), it falls back to `Record<string, unknown>` (untyped). Total: **4 typed nesting levels** before untyped fallback.

## Backward Compatibility

- **Existing `vertzql-types.test-d.ts` tests require zero modifications.** All existing tests use `TypedIncludeOption<TRelationsConfig>` (1-param form). The new `TRelations` and `TModels` parameters have defaults (`Record<string, RelationDef>` and `Record<string, ModelEntry>`) that produce untyped nested includes — identical to the current behavior where nested includes weren't available.
- **The `true`-config branch change is additive.** Currently `true`-config relations only accept `true`. Now they also accept a structured form. `true` is still accepted — no existing code breaks.

## E2E Acceptance Test

```ts
import type { ModelEntry, RelationDef, TableDef } from '@vertz/db';
import type {
  EntityRelationsConfig,
  TypedIncludeOption,
  TypedQueryOptions,
} from '@vertz/server';

// --- Setup: tables, relations, models ---

declare const usersTable: TableDef<{ id: { _output: string }; name: { _output: string } }>;
declare const postsTable: TableDef<{ id: { _output: string }; title: { _output: string } }>;
declare const commentsTable: TableDef<{ id: { _output: string }; text: { _output: string } }>;

declare const userRelations: { posts: RelationDef<typeof postsTable, 'many'> };
declare const postRelations: {
  author: RelationDef<typeof usersTable, 'one'>;
  comments: RelationDef<typeof commentsTable, 'many'>;
};
declare const commentRelations: {
  author: RelationDef<typeof usersTable, 'one'>;
  post: RelationDef<typeof postsTable, 'one'>;
};

type Models = {
  users: ModelEntry<typeof usersTable, typeof userRelations>;
  posts: ModelEntry<typeof postsTable, typeof postRelations>;
  comments: ModelEntry<typeof commentsTable, typeof commentRelations>;
};

type PostRelConfig = {
  author: { select: { id: true; name: true } };
  comments: true;
};

// --- Test 1: nested include is typed with TModels (true-config relation) ---

const valid: TypedIncludeOption<PostRelConfig, typeof postRelations, Models> = {
  comments: {
    include: {
      author: true,
    },
  },
};

// --- Test 2: nested include is typed with TModels (RelationConfigObject relation) ---

const withSelect: TypedIncludeOption<PostRelConfig, typeof postRelations, Models> = {
  author: {
    select: { id: true },
    include: { posts: true },  // users model has 'posts' relation
  },
};

// --- Test 3: invalid nested key rejected ---

// @ts-expect-error — 'bogus' is not a relation on comments
const invalid: TypedIncludeOption<PostRelConfig, typeof postRelations, Models> = {
  comments: {
    include: { bogus: true },
  },
};

// --- Test 4: backward compatibility without TModels ---

const untyped: TypedIncludeOption<PostRelConfig> = {
  comments: {
    include: { anything: true },  // untyped fallback, compiles
  },
};

// --- Test 5: TModels flows through TypedQueryOptions ---

const queryOpts: TypedQueryOptions<
  typeof postsTable, PostRelConfig, typeof postRelations, Models
> = {
  include: {
    comments: {
      include: { author: true },
    },
  },
};

// @ts-expect-error — invalid nested key through TypedQueryOptions
const badQuery: TypedQueryOptions<
  typeof postsTable, PostRelConfig, typeof postRelations, Models
> = {
  include: {
    comments: {
      include: { bogus: true },
    },
  },
};

// --- Test 6: top-level access filtering preserved ---

type RestrictedConfig = {
  author: false;
  comments: true;
};

// @ts-expect-error — author is set to false in config
const restricted: TypedIncludeOption<RestrictedConfig, typeof postRelations, Models> = {
  author: true,
};

// --- Test 7: depth cap — 4 total levels (1 entity + 3 DB) ---
// At the 4th nesting level (DB depth 3), falls back to untyped Record<string, unknown>

const deepInclude: TypedIncludeOption<PostRelConfig, typeof postRelations, Models> = {
  comments: {                    // entity level 1
    include: {
      author: {                  // DB depth 0
        include: {
          posts: {               // DB depth 1
            include: {
              anything: true,    // DB depth 2 → depth cap reached, untyped fallback
            },
          },
        },
      },
    },
  },
};
```

## Implementation Summary

This is a focused type-level change touching 2 source files and 1 test file:

1. **Add `TRelations` and `TModels` parameters to `TypedIncludeOption`** — with defaults for backward compat. `TRelations` carries the raw `RelationDef` entries needed to resolve target tables.
2. **Add `include` field** to both `RelationConfigObject` and `true`-config branches. Uses `@vertz/db`'s `IncludeOption` for nested resolution via `FindModelByTable`/`FindModelRelations`.
3. **Expand `true`-config branch** — now accepts structured form `{ where?, orderBy?, limit?, include? }` in addition to literal `true`.
4. **Thread `TRelations` and `TModels` through `TypedQueryOptions`** — add parameters, pass to `TypedIncludeOption`.
5. **Type tests** — positive and negative tests for: nested include with both config styles, backward compat, depth cap, access filtering, TypedQueryOptions integration.

## Design Review Sign-offs

- **DX:** CHANGES REQUESTED → addressed (added TRelations, expanded true-config, added gotcha note, added RelationConfigObject+include test)
- **Product/scope:** APPROVED with suggestions → addressed (added SDK codegen non-goal, explicit backward compat statement)
- **Technical:** CHANGES REQUESTED → addressed (added TRelations for target table resolution, expanded true-config branch, clarified depth as 4 not 3)
