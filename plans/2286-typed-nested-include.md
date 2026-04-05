# Design Doc: Typed Nested Include in IncludeOption (#2286)

## Problem

`IncludeOption` in `packages/db/src/schema/inference.ts` accepts `Record<string, unknown>` for nested `include` fields. This means nested relation includes are completely untyped — any key compiles, and the result type doesn't reflect nested includes.

```typescript
// Current: compiles but shouldn't — 'anything' is not a relation on customer
db.orders.findMany({
  include: {
    customer: {
      include: { anything: true }, // no validation
    },
  },
});
```

Two gaps exist:
1. **Input validation** — nested `include` keys aren't validated against the target model's relations
2. **Output typing** — nested include data isn't reflected in `FindResult` (the result type only resolves the first level of includes; the existing `_Depth` parameter on `ResolveOneInclude` is dead — never passed to a recursive call)

## API Surface

### Before (current)

```typescript
// Input: nested include accepts anything
const result = await db.posts.get({
  include: {
    author: {
      include: { anything: true }, // compiles — no validation
    },
  },
});

// Output: result.author has no nested relations
result.author; // { id: string; name: string; ... } — no nested data typed
```

### After (proposed)

```typescript
// Input: nested include validates against target model's relations
const result = await db.posts.get({
  include: {
    author: {
      include: {
        // @ts-expect-error — 'anything' is not a relation on users
        anything: true,
      },
    },
  },
});

// Valid nested includes compile and produce typed results
const result2 = await db.posts.get({
  include: {
    comments: {
      include: {
        author: true,          // valid: comments has an 'author' relation
        post: {                // valid: comments has a 'post' relation
          select: { title: true },
        },
      },
    },
  },
});

// Output: nested includes are reflected in the result type
result2.comments[0].author.name;    // string — typed
result2.comments[0].post.title;     // string — typed
// @ts-expect-error — 'body' not selected
result2.comments[0].post.body;

// Depth cap: 3 typed nesting levels (depth indices 0, 1, 2).
// You can nest `include` inside `include` inside `include`, all typed.
// A 4th nesting level (depth 3) falls back to untyped Record<string, unknown>.
// This matches the existing IncludeResolve depth cap.
// NOTE: The runtime loads depth 3 data but ignores its nested include.
// At depth 3, data IS returned but without type-level include validation.
const result3 = await db.posts.get({
  include: {
    comments: {                    // depth 0: typed
      include: {
        author: {                  // depth 1: typed
          include: {
            posts: {               // depth 2: typed
              include: {
                comments: true,    // depth 3: untyped fallback (Record<string, unknown>)
              },
            },
          },
        },
      },
    },
  },
});
```

### Standalone usage (backward compatible)

```typescript
import type { IncludeOption, IncludeResolve, FindResult } from '@vertz/db';

// Without TModels — nested include stays untyped (current behavior)
type PostInclude = IncludeOption<typeof postRelations>;
// PostInclude nested include → Record<string, unknown> — backward compatible

// With TModels — nested include is typed
type TypedPostInclude = IncludeOption<typeof postRelations, typeof myModels>;
// TypedPostInclude nested include → validated against target relations
```

## Design

### New type utilities

```typescript
/**
 * Find a ModelEntry in the registry by matching its table type.
 * Returns `never` if no match is found.
 *
 * Assumes table types are unique across the registry. If two registry entries
 * share the same table type (which would be a bug in user code), this produces
 * a union of both entries, which may cause `FindModelRelations` to produce a
 * union of both relation sets. In practice, table uniqueness is guaranteed by
 * `d.table()` producing structurally distinct types (different column records).
 *
 * Through-relations (via `.through()`) are handled correctly: `RelationTarget`
 * extracts the final target table (not the join table), so `FindModelByTable`
 * finds the correct target model.
 */
type FindModelByTable<
  TModels extends Record<string, ModelEntry>,
  TTable extends TableDef<ColumnRecord>,
> = {
  [K in keyof TModels]: TModels[K]['table'] extends TTable
    ? TTable extends TModels[K]['table']
      ? TModels[K]
      : never
    : never;
}[keyof TModels];

/**
 * Extract the relations record from the ModelEntry matching a table.
 * Returns empty record if no match found.
 */
type FindModelRelations<
  TModels extends Record<string, ModelEntry>,
  TTable extends TableDef<ColumnRecord>,
> = FindModelByTable<TModels, TTable> extends ModelEntry<infer _T, infer TRels>
  ? TRels
  : {};

/**
 * Resolve nested include type. When the target model is found in the registry,
 * produces a typed IncludeOption. Otherwise falls back to Record<string, unknown>.
 *
 * Uses `[X] extends [never]` (tuple wrapper) to prevent distribution over `never`.
 *
 * The explicit `never` check falls back to `Record<string, unknown>` (permissive)
 * rather than letting `FindModelRelations` return `{}` (which would produce an
 * empty typed map that rejects all keys). The untyped fallback is intentional for
 * the "model not found in registry" case — it preserves backward compat and avoids
 * false compile errors when the registry is incomplete.
 */
type NestedInclude<
  TModels extends Record<string, ModelEntry>,
  TTable extends TableDef<ColumnRecord>,
  _Depth extends readonly unknown[],
> = [FindModelByTable<TModels, TTable>] extends [never]
  ? Record<string, unknown>
  : IncludeOption<
      FindModelRelations<TModels, TTable>,
      TModels,
      [..._Depth, unknown]
    >;
```

### Modified `IncludeOption`

```typescript
/**
 * The shape of include options for a given relations record.
 * Each relation can be:
 * - `true` — include with default fields
 * - An object with `select`, `where`, `orderBy`, `limit` constrained to target columns,
 *   and optionally `include` for nested relation includes (typed when TModels is provided)
 *
 * When `TModels` is not provided (default), nested `include` falls back to
 * `Record<string, unknown>` for backward compatibility.
 *
 * Depth cap: 3 typed nesting levels (depth indices 0, 1, 2). A 4th nesting level
 * (depth index 3, tuple length 3) falls back to untyped Record<string, unknown>.
 * This matches the existing IncludeResolve cap.
 * The runtime (relation-loader.ts) processes depth 0-3 but only recurses for depth < 3.
 * At depth 3, relation data is loaded but nested includes are silently ignored.
 * The type-level cap at 3 means depth 3 falls back to untyped — intentionally loose
 * to avoid over-promising type safety at the boundary.
 */
export type IncludeOption<
  TRelations extends RelationsRecord,
  TModels extends Record<string, ModelEntry> = Record<string, ModelEntry>,
  _Depth extends readonly unknown[] = [],
> = _Depth['length'] extends 3
  ? Record<string, unknown>
  : {
      [K in keyof TRelations]?:
        | true
        | (RelationTarget<TRelations[K]> extends TableDef<infer TCols>
            ? {
                select?: { [C in keyof TCols]?: true };
                where?: FilterType<TCols>;
                orderBy?: OrderByType<TCols>;
                limit?: number;
                include?: NestedInclude<TModels, RelationTarget<TRelations[K]>, _Depth>;
              }
            : never);
    };
```

### Modified `IncludeResolve` and `ResolveOneInclude`

The existing `_Depth` parameter on `ResolveOneInclude` is currently dead — it accepts the parameter but never passes it to a recursive call (because there is no recursive call today). This change activates it by making `ResolveOneInclude` recurse into `IncludeResolve` when a nested `include` is present.

```typescript
export type IncludeResolve<
  TRelations extends RelationsRecord,
  TInclude,
  TModels extends Record<string, ModelEntry> = Record<string, ModelEntry>,
  _Depth extends readonly unknown[] = [],
> = _Depth['length'] extends 3
  ? unknown
  : {
      [K in keyof TInclude as K extends keyof TRelations
        ? TInclude[K] extends false | undefined ? never : K
        : never]: K extends keyof TRelations
        ? RelationType<TRelations[K]> extends 'many'
          ? ResolveOneInclude<TRelations[K], TInclude[K], TModels, _Depth>[]
          : ResolveOneInclude<TRelations[K], TInclude[K], TModels, _Depth>
        : never;
    };

type ResolveOneInclude<
  R extends RelationDef,
  TIncludeValue,
  TModels extends Record<string, ModelEntry> = Record<string, ModelEntry>,
  _Depth extends readonly unknown[] = [],
> = RelationTarget<R> extends TableDef<infer TCols>
  ? (TIncludeValue extends { select: infer TSubSelect }
      ? SelectNarrow<TCols, TSubSelect>
      : SelectNarrow<TCols, undefined>)
    & (TIncludeValue extends { include: infer TNestedInclude }
        ? IncludeResolve<
            FindModelRelations<TModels, RelationTarget<R>>,
            TNestedInclude,
            TModels,
            [..._Depth, unknown]
          >
        : unknown)
  : never;
```

### Modified `FindResult` and `FindOptions`

```typescript
export type FindResult<
  TTable extends TableDef<ColumnRecord>,
  TOptions = unknown,
  TRelations extends RelationsRecord = RelationsRecord,
  TModels extends Record<string, ModelEntry> = Record<string, ModelEntry>,
> =
  TTable extends TableDef<infer TColumns>
    ? SelectNarrow<TColumns, TOptions extends { select: infer S } ? S : undefined> &
        (TOptions extends { include: infer I }
          ? IncludeResolve<TRelations, I, TModels>
          : unknown)
    : never;

export interface FindOptions<
  TColumns extends ColumnRecord = ColumnRecord,
  TRelations extends RelationsRecord = RelationsRecord,
  TModels extends Record<string, ModelEntry> = Record<string, ModelEntry>,
> {
  select?: SelectOption<TColumns>;
  include?: IncludeOption<TRelations, TModels>;
  where?: FilterType<TColumns>;
  orderBy?: OrderByType<TColumns>;
}
```

### Threading `TModels` through the client

```typescript
// ModelDelegate gets TModels
export interface ModelDelegate<
  TEntry extends ModelEntry,
  TModels extends Record<string, ModelEntry> = Record<string, ModelEntry>,
> {
  get<TOptions extends TypedGetOptions<TEntry, TModels>>(
    options?: TOptions,
  ): Promise<
    Result<FindResult<EntryTable<TEntry>, TOptions, EntryRelations<TEntry>, TModels> | null, ReadError>
  >;
  // ... all other methods similarly
}

// TypedGetOptions / TypedListOptions get TModels
type TypedGetOptions<
  TEntry extends ModelEntry,
  TModels extends Record<string, ModelEntry> = Record<string, ModelEntry>,
> = {
  readonly where?: FilterType<EntryColumns<TEntry>>;
  readonly select?: SelectOption<EntryColumns<TEntry>>;
  readonly orderBy?: OrderByType<EntryColumns<TEntry>>;
  readonly include?: IncludeOption<EntryRelations<TEntry>, TModels>;
};

// DatabaseClient AND TransactionClient pass TModels to delegates
export type DatabaseClient<TModels extends Record<string, ModelEntry>> = {
  readonly [K in keyof TModels]: ModelDelegate<TModels[K], TModels>;
} & { ... };

export type TransactionClient<TModels extends Record<string, ModelEntry>> = {
  readonly [K in keyof TModels]: ModelDelegate<TModels[K], TModels>;
} & { ... };
```

### Adapter compatibility

`ResolveInclude<TEntry>` in `packages/db/src/types/adapter.ts` uses `IncludeOption<TRels>` without `TModels`. This stays backward compatible since `TModels` defaults to `Record<string, ModelEntry>`, which triggers the untyped fallback for nested includes. The adapter layer doesn't need `TModels` — it's an implementation bridge, not a user-facing API.

## Manifesto Alignment

### Principle 1: "If it builds, it works"
This change turns a runtime-only validation (relation names checked at query time) into a compile-time guarantee. Invalid nested include keys are caught by the type checker.

### Principle 2: "One way to do things"
No new API surface. The existing `include` field gains deeper typing. Developers don't learn a new pattern — they get better errors on the existing one.

### Principle 3: "AI agents are first-class users"
LLMs currently hallucinate nested include keys because the type system doesn't constrain them. With typed nested includes, autocomplete and type errors guide both humans and LLMs to correct usage on the first try.

### Tradeoffs accepted
- **Increased type complexity** — The recursive type adds ~40 lines of type-level code. This is justified because it eliminates a class of runtime errors.
- **Depth cap at 3** — Prevents infinite recursion. Matches the existing `IncludeResolve` depth cap. The runtime processes depth 0–3 but only recurses for `depth < 3`. At depth 3, the type system falls back to untyped — a pragmatic choice to avoid over-promising type safety at the boundary. See JSDoc on `IncludeOption` for details.

### Rejected alternatives
- **String-based relation path** (e.g., `include: ['author.posts.comments']`) — Not type-safe, harder to autocomplete, diverges from Prisma-like patterns LLMs know.
- **Separate `deepInclude` API** — Adds a second way to do includes, violating principle 2.

## Non-Goals

- **Typed nested includes in the adapter layer** — The `EntityDbAdapter` interface stays untyped for nested includes. It's an internal bridge, not user-facing.
- **Entity-level `TypedIncludeOption`** — `packages/server/src/entity/types.ts` defines its own include type with different semantics (access-controlled relation config). Threading `TModels` through the entity layer is tracked separately as a follow-up (create issue during implementation). The follow-up issue must specify: (1) `TypedIncludeOption` needs `TModels` threading, (2) access-controlled relation semantics remain unchanged, (3) the entity `include` config keys should validate against target model relations.
- **Runtime validation changes** — The runtime relation-loader already validates and depth-caps. No runtime changes needed.
- **Increasing the depth cap beyond 3** — The existing `IncludeResolve` already caps at 3. Changing this would be a separate concern. 3 levels of typed nesting covers the vast majority of real-world usage.

## Unknowns

### TypeScript performance with recursive types
**Risk:** Recursive conditional types with depth tracking can slow down the type checker on large registries (20+ models).

**Mitigation:** The depth cap (3 levels) bounds recursion. The `FindModelByTable` lookup iterates over model keys, which is O(n) in the number of models — acceptable for typical registries (<50 models). The existing `IncludeResolve` already uses this pattern without issues.

**Resolution:** Measure typecheck time on the linear-clone example app (which has 5+ models with relations) before and after. If typecheck regresses >20%, investigate lazy evaluation patterns.

### IDE autocomplete through conditional types
**Risk:** `NestedInclude` uses a conditional type chain (`[FindModelByTable<...>] extends [never]`). TypeScript's language server may defer evaluation, preventing autocomplete from triggering mid-keystroke for nested include keys.

**Resolution:** Verify autocomplete works in VS Code during implementation. If it doesn't trigger, add explicit type aliases (e.g., `NestedIncludeKeys<TModels, TTable>`) that TypeScript can eagerly resolve.

## POC Results

Not applicable — this is a type-level change. The design was validated by tracing the generic flow through the existing codebase and confirming:
1. `RelationTarget<R>` preserves the exact `TableDef` type from `d.ref.one(() => target, fk)` — also works with `createRegistry`'s `TypedRef` which produces `RelationDef<TModels[TTargetName], ...>`
2. `FindModelByTable` can match this against registry entries (confirmed via structural typing analysis — both manual `ModelEntry` construction and `createRegistry`-produced `RegistryOutput` preserve the same table type)
3. Default `TModels = Record<string, ModelEntry>` triggers `[never] extends [never]` → untyped fallback (backward compat)
4. Through-relations: `RelationTarget` extracts the final target table, not the join table, so `FindModelByTable` correctly finds the target model

## Type Flow Map

```
DatabaseClient<TModels>
  ├─ ModelDelegate<TModels[K], TModels>
  │    ├─ TypedGetOptions<TModels[K], TModels>
  │    │    └─ IncludeOption<EntryRelations<TModels[K]>, TModels, []>
  │    │         │
  │    │         ├─ [K2 in relations]: true | { ... }
  │    │         │    └─ include?: NestedInclude<TModels, RelationTarget<R>, [_]>
  │    │         │         │
  │    │         │         ├─ FindModelByTable<TModels, TargetTable> → ModelEntry | never
  │    │         │         │    └─ [never] → Record<string, unknown> (fallback)
  │    │         │         │    └─ ModelEntry → FindModelRelations → TTargetRels
  │    │         │         │
  │    │         │         └─ IncludeOption<TTargetRels, TModels, [_, _]>
  │    │         │              └─ (recurse, capped at depth 3)
  │    │         │
  │    └─ FindResult<Table, TOptions, Relations, TModels>
  │         └─ IncludeResolve<Relations, TInclude, TModels, []>
  │              └─ ResolveOneInclude<R, Value, TModels, []>
  │                   ├─ SelectNarrow<TCols, Select>
  │                   └─ TIncludeValue extends { include: I }
  │                        └─ IncludeResolve<FindModelRelations<TModels, Target>, I, TModels, [_]>
  │                             └─ (recurse, capped at depth 3)
  │
  └─ TransactionClient<TModels>  (same delegate threading as DatabaseClient)
```

**Every generic is consumed:**
- `TModels` — threaded from `DatabaseClient`/`TransactionClient` → `ModelDelegate` → `TypedGetOptions` → `IncludeOption` → `NestedInclude` → recursive `IncludeOption`; also through `FindResult` → `IncludeResolve` → `ResolveOneInclude` → recursive `IncludeResolve`
- `_Depth` — incremented at each recursion level, checked at cap (3). Previously dead on `ResolveOneInclude` — this change activates it.
- `TRelations` — used to map include keys and look up `RelationDef` targets
- `TTable` — used by `FindModelByTable` to match against registry entries

## E2E Acceptance Test

```typescript
import { describe, it } from 'bun:test';
import type { Equal, Expect, Extends, HasKey, Not } from './_type-helpers';
import { d } from '../d';
import { createRegistry } from '../schema/registry';
import type {
  FindResult,
  IncludeOption,
  IncludeResolve,
  ModelEntry,
} from '../schema/inference';
import type { DatabaseClient } from '../client/database';

// --- Fixture: 3-model registry with circular relations ---

const users = d.table('users', {
  id: d.uuid().primary(),
  name: d.text(),
  email: d.text(),
});

const posts = d.table('posts', {
  id: d.uuid().primary(),
  title: d.text(),
  body: d.text(),
  authorId: d.uuid(),
});

const comments = d.table('comments', {
  id: d.uuid().primary(),
  text: d.text(),
  postId: d.uuid(),
  authorId: d.uuid(),
});

// --- Manual model construction ---

const userRelations = {
  posts: d.ref.many(() => posts, 'authorId'),
};

const postRelations = {
  author: d.ref.one(() => users, 'authorId'),
  comments: d.ref.many(() => comments, 'postId'),
};

const commentRelations = {
  post: d.ref.one(() => posts, 'postId'),
  author: d.ref.one(() => users, 'authorId'),
};

type Models = {
  users: ModelEntry<typeof users, typeof userRelations>;
  posts: ModelEntry<typeof posts, typeof postRelations>;
  comments: ModelEntry<typeof comments, typeof commentRelations>;
};

// --- createRegistry-based construction ---

const registryModels = createRegistry({ users, posts, comments }, (ref) => ({
  users: { posts: ref.users.many('posts', 'authorId') },
  posts: {
    author: ref.posts.one('users', 'authorId'),
    comments: ref.posts.many('comments', 'postId'),
  },
  comments: {
    post: ref.comments.one('posts', 'postId'),
    author: ref.comments.one('users', 'authorId'),
  },
}));
type RegistryModels = typeof registryModels;

// --- Self-referencing relation fixture ---

const categories = d.table('categories', {
  id: d.uuid().primary(),
  name: d.text(),
  parentId: d.uuid().nullable(),
});

const categoryRelations = {
  parent: d.ref.one(() => categories, 'parentId'),
  children: d.ref.many(() => categories, 'parentId'),
};

type ModelsWithSelfRef = Models & {
  categories: ModelEntry<typeof categories, typeof categoryRelations>;
};

// --- Many-to-many through-relation fixture ---

const tags = d.table('tags', {
  id: d.uuid().primary(),
  label: d.text(),
});

const postTags = d.table('post_tags', {
  postId: d.uuid(),
  tagId: d.uuid(),
});

const tagRelations = {
  posts: d.ref.many(() => posts).through(() => postTags, 'tagId', 'postId'),
};

type ModelsWithM2M = Models & {
  tags: ModelEntry<typeof tags, typeof tagRelations>;
  postTags: ModelEntry<typeof postTags, {}>;
};

// =========================================================================
// Input validation
// =========================================================================

describe('Feature: Typed nested include input validation', () => {
  describe('Given a model registry with users → posts → comments relations', () => {
    describe('When writing a nested include on posts', () => {
      it('Then accepts valid nested relation names', () => {
        type PostInclude = IncludeOption<typeof postRelations, Models>;
        const _inc: PostInclude = {
          comments: {
            include: {
              author: true,
              post: true,
            },
          },
        };
        void _inc;
      });

      it('Then rejects invalid nested relation names', () => {
        type PostInclude = IncludeOption<typeof postRelations, Models>;
        const _inc: PostInclude = {
          comments: {
            // @ts-expect-error — 'nonExistent' is not a relation on comments
            include: { nonExistent: true },
          },
        };
        void _inc;
      });
    });

    describe('When writing a depth-2 nested include', () => {
      it('Then accepts valid depth-2 nesting', () => {
        type PostInclude = IncludeOption<typeof postRelations, Models>;
        const _inc: PostInclude = {
          comments: {
            include: {
              author: {
                include: {
                  posts: true,
                },
              },
            },
          },
        };
        void _inc;
      });

      it('Then rejects invalid depth-2 nested relation names', () => {
        type PostInclude = IncludeOption<typeof postRelations, Models>;
        const _inc: PostInclude = {
          comments: {
            include: {
              author: {
                // @ts-expect-error — 'bogus' is not a relation on users
                include: { bogus: true },
              },
            },
          },
        };
        void _inc;
      });
    });

    describe('When exceeding the depth cap (3)', () => {
      it('Then falls back to untyped include at depth 3', () => {
        type PostInclude = IncludeOption<typeof postRelations, Models>;
        const _inc: PostInclude = {
          comments: {
            include: {
              author: {
                include: {
                  posts: {
                    include: {
                      anything: true, // depth 3 → untyped, compiles
                    },
                  },
                },
              },
            },
          },
        };
        void _inc;
      });
    });
  });

  describe('Given IncludeOption without TModels (backward compat)', () => {
    it('Then nested include remains untyped', () => {
      type PostInclude = IncludeOption<typeof postRelations>;
      const _inc: PostInclude = {
        author: {
          include: { anything: true },
        },
      };
      void _inc;
    });
  });

  describe('Given a createRegistry-produced model set', () => {
    it('Then nested include is typed through RegistryOutput', () => {
      type PostInclude = IncludeOption<RegistryModels['posts']['relations'], RegistryModels>;
      const _inc: PostInclude = {
        comments: {
          include: {
            author: true,
          },
        },
      };
      void _inc;
    });

    it('Then rejects invalid keys through RegistryOutput', () => {
      type PostInclude = IncludeOption<RegistryModels['posts']['relations'], RegistryModels>;
      const _inc: PostInclude = {
        comments: {
          // @ts-expect-error — 'bogus' not a relation on comments
          include: { bogus: true },
        },
      };
      void _inc;
    });
  });

  describe('Given self-referencing relations', () => {
    it('Then accepts valid self-referencing nested includes', () => {
      type CatInclude = IncludeOption<typeof categoryRelations, ModelsWithSelfRef>;
      const _inc: CatInclude = {
        parent: {
          include: {
            children: true,
          },
        },
        children: {
          include: {
            parent: true,
          },
        },
      };
      void _inc;
    });
  });

  describe('Given many-to-many through-relations', () => {
    it('Then nested include targets the final target model, not the join table', () => {
      type TagInclude = IncludeOption<typeof tagRelations, ModelsWithM2M>;
      const _inc: TagInclude = {
        posts: {
          include: {
            author: true,   // valid: posts has 'author' relation
            comments: true,  // valid: posts has 'comments' relation
          },
        },
      };
      void _inc;
    });
  });

  describe('Given false/undefined in nested includes', () => {
    it('Then false and undefined are excluded from the result', () => {
      type Result = IncludeResolve<
        typeof postRelations,
        { author: false; comments: undefined },
        Models
      >;
      type _t1 = Expect<Not<HasKey<Result, 'author'>>>;
      type _t2 = Expect<Not<HasKey<Result, 'comments'>>>;
    });
  });
});

// =========================================================================
// Output typing
// =========================================================================

describe('Feature: Typed nested include output resolution', () => {
  describe('Given a query with nested include', () => {
    describe('When resolving FindResult with nested include', () => {
      it('Then result contains nested relation data', () => {
        type Result = FindResult<
          typeof posts,
          { include: { comments: { include: { author: true } } } },
          typeof postRelations,
          Models
        >;

        type _t1 = Expect<HasKey<Result, 'id'>>;
        type _t2 = Expect<HasKey<Result, 'title'>>;
        type _t3 = Expect<Extends<Result['comments'], unknown[]>>;

        type Comment = Result['comments'][0];
        type _t4 = Expect<HasKey<Comment, 'author'>>;
        type _t5 = Expect<HasKey<Comment['author'], 'name'>>;
        type _t6 = Expect<HasKey<Comment['author'], 'id'>>;
      });

      it('Then nested select narrows nested result', () => {
        type Result = FindResult<
          typeof posts,
          { include: { comments: { include: { author: { select: { name: true } } } } } },
          typeof postRelations,
          Models
        >;

        type Comment = Result['comments'][0];
        type AuthorType = Comment['author'];
        type _t1 = Expect<HasKey<AuthorType, 'name'>>;
        type _t2 = Expect<Not<HasKey<AuthorType, 'id'>>>;
        type _t3 = Expect<Not<HasKey<AuthorType, 'email'>>>;
      });
    });
  });

  describe('Given FindResult without TModels (backward compat)', () => {
    it('Then resolves first-level includes normally', () => {
      type Result = FindResult<
        typeof posts,
        { include: { author: true } },
        typeof postRelations
      >;
      type _t1 = Expect<HasKey<Result, 'author'>>;
      type _t2 = Expect<HasKey<Result['author'], 'name'>>;
    });
  });
});

// =========================================================================
// DatabaseClient end-to-end
// =========================================================================

describe('Feature: Typed nested include through DatabaseClient', () => {
  // Assume db: DatabaseClient<Models>
  type DB = DatabaseClient<Models>;

  it('Then db.posts.get() validates nested include keys', () => {
    // This test verifies the full generic chain:
    // DatabaseClient<Models> → ModelDelegate<Models['posts'], Models>
    //   → TypedGetOptions<..., Models> → IncludeOption<PostRelations, Models>
    type GetOpts = Parameters<DB['posts']['get']>[0];
    type IncludeField = NonNullable<NonNullable<GetOpts>['include']>;

    // Should accept nested include on comments
    const _valid: IncludeField = {
      comments: {
        include: {
          author: true,
        },
      },
    };
    void _valid;
  });

  it('Then db.posts.get() rejects invalid nested include keys', () => {
    type GetOpts = Parameters<DB['posts']['get']>[0];
    type IncludeField = NonNullable<NonNullable<GetOpts>['include']>;

    const _invalid: IncludeField = {
      comments: {
        // @ts-expect-error — 'bogus' is not a relation on comments
        include: { bogus: true },
      },
    };
    void _invalid;
  });
});

// =========================================================================
// Output typing through createRegistry
// =========================================================================

describe('Feature: Typed nested include output with RegistryModels', () => {
  it('Then FindResult resolves nested includes from createRegistry models', () => {
    type Result = FindResult<
      RegistryModels['posts']['table'],
      { include: { comments: { include: { author: true } } } },
      RegistryModels['posts']['relations'],
      RegistryModels
    >;

    type Comment = Result['comments'][0];
    type _t1 = Expect<HasKey<Comment, 'author'>>;
    type _t2 = Expect<HasKey<Comment['author'], 'name'>>;
  });
});

// =========================================================================
// Nullable FK behavior (documents current behavior)
// =========================================================================

describe('Feature: Nullable FK one-relation output', () => {
  it('Then documents that nullable FK one-relation currently produces non-nullable type', () => {
    // NOTE: This documents pre-existing behavior. The runtime may return null
    // for nullable FK one-relations, but the type system currently produces
    // a non-nullable object. Fixing this is a separate concern.
    type CatResult = FindResult<
      typeof categories,
      { include: { parent: { include: { children: true } } } },
      typeof categoryRelations,
      ModelsWithSelfRef
    >;
    // parent is typed as non-nullable even though parentId is nullable
    type _t1 = Expect<HasKey<CatResult['parent'], 'name'>>;
    type _t2 = Expect<HasKey<CatResult['parent'], 'children'>>;
  });
});
```

## Files Changed

| File | Change |
|------|--------|
| `packages/db/src/schema/inference.ts` | Add `FindModelByTable`, `FindModelRelations`, `NestedInclude`. Modify `IncludeOption`, `IncludeResolve`, `ResolveOneInclude`, `FindResult`, `FindOptions` to accept optional `TModels`. Add JSDoc comments documenting depth cap semantics. |
| `packages/db/src/client/database.ts` | Thread `TModels` through `ModelDelegate`, `TypedGetOptions`, `TypedListOptions`, `DatabaseClient`, `TransactionClient`. |
| `packages/db/src/schema/__tests__/inference.test-d.ts` | Add nested include input validation and output resolution type tests (manual models, createRegistry models, self-ref, M2M, false/undefined). |
| `packages/db/src/__tests__/database-types.test-d.ts` | Add nested include tests through the `DatabaseClient` API (end-to-end generic chain). |

## Implementation Notes

- During implementation, verify IDE autocomplete works for nested include keys in VS Code. If conditional types defer evaluation, add explicit type aliases.
- Create a follow-up GitHub issue for threading `TModels` through the entity layer's `TypedIncludeOption` (`packages/server/src/entity/types.ts`).
- Measure `vtz run typecheck` time on the linear-clone example before and after the change.
