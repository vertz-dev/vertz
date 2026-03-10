# VertzQL Automatic Field Selection — Compiler-Driven Query Narrowing

**Status:** Draft (Rev 2 — addressing review feedback)
**Priority:** P1
**Owner:** TBD
**Related:** [Entity-Driven Architecture](entity-driven-architecture.md), [SDK Query Integration](sdk-query-integration.md), [Universal Rendering Model](universal-rendering-model.md), [Cross-File Reactivity Analysis](cross-file-reactivity-analysis.md), [Cross-Component Tracing Spec](cross-component-tracing-spec.md)

> **Note:** This is a greenfield project with no external users. Breaking changes are fully allowed. Backward compatibility shims are not a concern.

**Reviews received (Rev 1):**
- [DX Review (josh)](reviews/vertzql-auto-field-selection-dx-review.md) — Changes Requested (3 blocking)
- [Scope Review (pm)](reviews/vertzql-auto-field-selection-scope-review.md) — Approved with concerns (3 blocking)
- [Technical Review (ben)](reviews/vertzql-auto-field-selection-technical-review.md) — Changes Requested (4 blocking)

**Rev 2 changes:** Restructured phases (single-file first), added escape hatch, moved `undefined` gap mitigation to Phase 1, specified injection pipeline stage, resolved package ownership, addressed `items` field path bug, added BDD acceptance criteria.

---

## Problem

Today, every `query()` call fetches **all fields** from the API:

```tsx
// Fetches ALL user fields: id, name, email, bio, avatar, preferences, ...
const users = query(api.users.list());

// But only uses two:
return <ul>{users.data.items.map(u => <li>{u.name}</li>)}</ul>;
```

This is the REST over-fetching problem that GraphQL was created to solve. But GraphQL requires developers to manually write selection queries — which is error-prone, tedious, and creates a maintenance burden when components change.

Vertz has a unique advantage: **the compiler sees everything**. Because all reactive data flows through compiler-controlled primitives (`query()`, signal properties, getter-backed props), the compiler can trace exactly which fields each component reads — across component boundaries — and generate the minimal VertzQL `select` automatically.

### What exists today (disconnected pieces)

| Piece | Location | Status |
|-------|----------|--------|
| **VertzQL parser** — parses `select`, `include`, `where`, `orderBy` from URL params | `packages/server/src/entity/vertzql-parser.ts` | ✅ Working |
| **VertzQL validator** — rejects hidden fields, validates includes against entity config | `packages/server/src/entity/vertzql-parser.ts` | ✅ Working |
| **Field filter runtime** — `applySelect()`, `stripHiddenFields()`, `narrowRelationFields()` | `packages/server/src/entity/field-filter.ts` | ✅ Working |
| **FieldAccessAnalyzer** — ts-morph analyzer tracking field access on `query()` results (18 test cases) | `packages/compiler/src/analyzers/field-access-analyzer.ts` | ✅ Working (standalone) |
| **CrossComponentAnalyzer** — prop flow graph + backward propagation across components | `packages/compiler/src/analyzers/cross-component-analyzer.ts` | ✅ Working (standalone) |
| **QueryDescriptor** — `query()` accepts descriptors with `_key` and `_entity` metadata | `packages/ui/src/query/query.ts` | ✅ Working (PR #763) |
| **Entity Store** — normalized cache with signal-per-entity, query indices | `packages/ui/src/store/entity-store.ts` | ✅ Working |
| **Reactivity manifest system** — cross-file reactivity resolution for custom hooks | `packages/ui-compiler/src/manifest-generator.ts` | ✅ Working (PRs #995, #1011) |

**The gap:** Nothing connects the field access analyzers to the compilation pipeline. The analyzers produce `AggregatedQueryFields[]` but nothing consumes it. No `select` parameter is ever injected into queries.

---

## Desired DX

### Zero-effort field selection (the developer writes nothing)

```tsx
// src/pages/UserListPage.tsx
export function UserListPage() {
  const users = query(api.users.list());
  //    ↑ Compiler infers: needs ['id', 'name', 'email'] from UserCard below

  return (
    <ul>
      {users.data.items.map(user => (
        <UserCard key={user.id} user={user} />
      ))}
    </ul>
  );
}

// src/components/UserCard.tsx
export function UserCard({ user }: { user: User }) {
  return (
    <div>
      <h3>{user.name}</h3>
      <p>{user.email}</p>
    </div>
  );
}
```

**What the compiler produces (conceptually):**

```tsx
// The query is rewritten to include a select parameter:
const users = query(api.users.list({ select: { id: true, name: true, email: true } }));
```

**What hits the wire:**

```
GET /api/users?q=eyJzZWxlY3QiOnsiaWQiOnRydWUsIm5hbWUiOnRydWUsImVtYWlsIjp0cnVlfX0
```

The `q` parameter is base64-encoded `{"select":{"id":true,"name":true,"email":true}}` — already supported by the VertzQL parser.

### Opaque access falls back gracefully

```tsx
export function UserDebugView({ user }: { user: User }) {
  // Spread = opaque access. Compiler can't know which fields are used.
  return <pre>{JSON.stringify({ ...user })}</pre>;
}
```

When `hasOpaqueAccess: true`, the compiler does **not** inject a `select` — the query fetches all fields. No breakage, no surprises.

### Per-query opt-out escape hatch

When the analyzer gets it wrong or the developer has a legitimate reason to fetch all fields:

```tsx
// @vertz-select-all
const user = query(api.users.get(userId));
```

The `// @vertz-select-all` pragma on the line immediately before the `query()` call tells the compiler to skip field selection for this specific query. The developer gets all fields.

This is the escape hatch for:
- Feature-flag-dependent field rendering
- Event handlers that access fields the analyzer can't see
- Debugging (temporarily disable narrowing to verify data)
- Utility functions that receive entity data and access fields opaquely

### Unresolved component fallback

When the compiler can't resolve a child component (barrel re-exports, renamed imports, external libraries), it falls back to **no field selection** for the parent query and logs a diagnostic:

```
[vertz] Could not resolve component <UserCard> in UserListPage.tsx:12
         → field selection disabled for query "users" (conservative fallback)
```

This is the safe default — missing data is worse than extra data.

### Relation includes (future — Phase 4+)

```tsx
export function TaskDetailPage() {
  const { id } = useParams<'/tasks/:id'>();
  const task = query(api.tasks.get(id));

  return (
    <div>
      <h1>{task.data.title}</h1>
      <p>Assigned to: {task.data.assignee.name}</p>
    </div>
  );
}

// Compiler infers: select: { title: true }, include: { assignee: { name: true } }
```

Deferred to Phase 4. Blocked on entity relation config availability at compile time.

---

## API Surface

### No new public API (except escape hatch pragma)

This feature is **entirely compiler-driven**. The developer writes the same `query()` calls they write today. The compiler injects `select` parameters transparently.

The only new surface is the `// @vertz-select-all` pragma for per-query opt-out.

### Injection pipeline stage

The `select` injection happens **before compilation**, as a new MagicString transform step between hydration and the main `compile()` call. At this stage, `api.users.list()` patterns are syntactically intact — the signal/JSX transforms haven't run yet.

Pipeline order in the Bun plugin `onLoad`:
1. Hydration transform (add `data-hid`)
2. Context stable IDs (if HMR)
3. **Field selection injection (new)** — reads manifest, injects `select` into `api.X.list()` / `api.X.get()` calls
4. Compile (reactive signal + JSX transforms)
5. Source map chaining
6. CSS extraction
7. Fast Refresh (if HMR)

### SDK method signature change

SDK list/get methods gain an optional `options` parameter that accepts VertzQL query options. The `encodeVertzQL()` helper lives in `@vertz/fetch` and serializes `{ select, include, where, orderBy }` into the base64 `q=` parameter.

```typescript
// Generated SDK method (today)
list: (query?) => createDescriptor('GET', '/users', () => client.get('/users', { query }))

// Generated SDK method (with field selection support)
list: (options?: VertzQLClientOptions) =>
  createDescriptor('GET', '/users', () => client.get('/users', { query: encodeVertzQL(options) }), options)

// For get():
get: (id: string, options?: VertzQLClientOptions) =>
  createDescriptor('GET', `/users/${id}`, () => client.get(`/users/${id}`, { query: encodeVertzQL(options) }), options)
```

```typescript
// @vertz/fetch — new helper
interface VertzQLClientOptions {
  select?: Record<string, true>;
  include?: Record<string, true | Record<string, true>>;
  where?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  limit?: number;
  after?: string;
}

function encodeVertzQL(options?: VertzQLClientOptions): Record<string, string> | undefined {
  if (!options) return undefined;
  const { select, include, ...rest } = options;
  const q = select || include ? { select, include } : undefined;
  return {
    ...rest,
    ...(q ? { q: btoa(JSON.stringify(q)) } : {}),
  };
}
```

### Field selection manifest (internal, not user-facing)

The compiler produces a manifest at `.vertz/field-selection.json`:

```json
{
  "src/pages/UserListPage.tsx": {
    "queries": [
      {
        "queryVar": "users",
        "line": 3,
        "fields": ["id", "name", "email"],
        "hasOpaqueAccess": false,
        "selectAll": false,
        "source": "api.users.list"
      }
    ]
  }
}
```

This is a build artifact — not committed, not user-facing.

### Dev-mode runtime warning for the `undefined` gap

When field selection is active and a non-selected field is accessed from the entity store, a dev-mode warning is logged:

```
[vertz] Field "bio" was accessed on User#42 but was not included in the field selection
        for query "GET:/users" in UserListPage.tsx:3.
        Selected fields: id, name, email.
        To include it: use {user.bio} in your JSX, or add // @vertz-select-all above the query.
```

This is implemented by tracking which fields were part of the `select` set for each entity instance in the entity store (dev mode only — zero overhead in production).

---

## Architecture

### Two-tier compilation model

**Tier 1 (per-file, Phase 1):** Field access analysis runs inline during the Bun plugin's `onLoad` hook on the original source. Uses lightweight AST pattern matching (same approach as the reactivity manifest — `ts.createSourceFile`, no type checker). Tracks which fields are accessed on `query()` results within the single file being compiled.

**Tier 2 (cross-file, Phase 2):** A project-wide pre-pass runs at dev server startup and incrementally on file changes. Builds the prop flow graph and backward-propagates child field access to parent queries. Produces the full `.vertz/field-selection.json` manifest.

```
Tier 1 (per-file, inline in onLoad):
┌──────────────────────────────────────────────────────────────┐
│  Parse source → find query() calls → track field access       │
│  → inject select for single-file fields only                  │
│                                                              │
│  Input: single .tsx file source                              │
│  Output: select injection into the same file's MagicString    │
│  No external dependencies. No manifest needed.               │
└──────────────────────────────────────────────────────────────┘

Tier 2 (cross-file, Phase 2+):
┌──────────────────────────────────────────────────────────────┐
│  FieldAccessAnalyzer → CrossComponentAnalyzer → Manifest     │
│                                                              │
│  Input: all .tsx files in src/                               │
│  Output: .vertz/field-selection.json                         │
│  Trigger: dev server startup + file watcher (incremental)    │
│  Reads: import graph + prop flow → aggregated fields         │
└──────────────────────────────────────────────────────────────┘
```

This tiered approach means:
- **Phase 1 delivers working field selection immediately** — single-file analysis only, but the developer sees narrowed API responses.
- **Phase 2 adds cross-component intelligence** — prop flow analysis aggregates child field access into parent queries.
- **No ts-morph in the critical path for Phase 1** — uses lightweight `ts.createSourceFile` like the reactivity manifest.

### Package ownership

The field access analyzers will be **moved from `packages/compiler` to `packages/ui-compiler`**. Rationale:
- `@vertz/ui-server` already depends on `@vertz/ui-compiler` (not on `@vertz/compiler`)
- `@vertz/compiler` is the server-side compiler (entity analyzers, codegen, OpenAPI) — wrong home for UI field tracking
- The `BaseAnalyzer` base class won't be used — the new lightweight analyzer uses `ts.createSourceFile` directly (no `ResolvedConfig`, no type checker)

For Phase 2 (cross-file), the existing `FieldAccessAnalyzer` and `CrossComponentAnalyzer` will be **rewritten** to use the lightweight AST approach rather than moved as-is. The existing ts-morph versions remain in `packages/compiler` as reference implementations / research code.

### `items` field path normalization

**Bug fix required (identified in technical review):** The existing `FieldAccessAnalyzer.buildPropertyPath()` strips `data` from field paths but not `items`. For list queries, the typical access pattern is `users.data.items.map(u => u.name)`, which currently produces `items.name` instead of `name`.

The analyzer must strip both `data` and `items` from the property chain when building field paths. The VertzQL `select` operates on entity-level field names, not response envelope properties.

The normalization chain: `users.data.items[0].name` → strip `data` → strip `items` → field: `name`.

### Primary key field

The primary key field is always included in the `select`, even if no component reads it. The entity config knows the primary key field — use that instead of hardcoding `id`. For entities with `uuid` or `_id` primary keys, the correct field is still included.

### Entity store partial merge behavior

When a select-narrowed query merges into the entity store:
- `shallowMerge` preserves existing fields not present in incoming data (this is correct — other queries may have fetched those fields)
- Non-selected fields from a previous broader fetch remain accessible (not deleted)
- Fields never fetched by any query are `undefined`
- **Dev-mode tracking:** The store records which fields were part of each query's `select` set. When a field is read that was never part of any `select` for that entity, the warning fires.
- **Stale field awareness:** Fields preserved from a previous query may be stale. This is a known tradeoff — the entity store always serves the latest value per field from any query. A future "freshness tracking" system could address this but is out of scope.

### HMR timing and ordering

When a file changes during development:

1. File watcher fires (100ms debounce)
2. Discover HMR assets
3. Proactive build check
4. **Regenerate reactivity manifest** for changed file (existing, synchronous)
5. **Regenerate field selection** for changed file (new, synchronous, Tier 1 only in Phase 1)
6. Clear require cache
7. Re-import SSR module (uses updated manifests)

For Phase 1 (single-file), the field selection update is synchronous and fast (< 5ms per file — same as reactivity manifest). There is **no timing gap** because the injection happens during `onLoad`, which runs on the fresh source after the watcher fires.

For Phase 2 (cross-file), when a child's fields change, the parent's manifest entry updates synchronously before the parent is recompiled. The parent's `onLoad` reads the updated manifest. If the parent isn't recompiled in the same HMR cycle (because only the child changed), the parent's compiled output uses the previous manifest — but this only means the parent over-fetches temporarily. A full page refresh or editing the parent triggers recompilation with the updated manifest. The console logs a diagnostic:

```
[vertz] Field selection for "users" in UserListPage.tsx is stale — save the file to recompile.
```

### Utility function and event handler field access

The single-file analyzer tracks field access in:
- JSX text nodes and attributes
- Arrow functions within JSX expressions (event handlers: `onClick={() => user.email}`)
- Array method callbacks (`.map()`, `.filter()`, etc.)
- Destructuring patterns (`const { name } = user`)
- Direct property access in the component body

**Not tracked (falls back to opaque or relies on escape hatch):**
- Calls to external utility functions that receive entity data
- Dynamic property access (`user[key]`)
- Spread into other objects (`{ ...user }`)
- `JSON.stringify(user)` and similar opaque consumers

When entity data is passed to a non-component function, the analyzer cannot trace into it. The developer should use `// @vertz-select-all` for queries where data flows through utility functions that the analyzer can't see.

### Why not runtime field tracking?

An alternative is runtime tracking: `query()` observes which `.value` reads happen during the first render and sends a narrowed re-fetch.

**Rejected because:**
- First render still over-fetches (defeats the purpose for SSR)
- Runtime overhead from proxy/tracking on every field access
- Violates "compile-time over runtime" principle
- Race condition: fields accessed during loading state differ from fields accessed with data
- Can't work with SSR data threshold (need to know fields before the fetch)

---

## Manifesto Alignment

### Compile-time over runtime

Field selection is computed at compile time by static analysis of the source code. No runtime proxies, no first-render observation, no re-fetch dance. The compiler knows which fields are needed before any code runs.

### If it builds, it works

When the compiler can determine the field set, the generated query requests exactly those fields. When it can't (opaque access, unresolved components), it falls back to fetching all fields — never silently drops data. The dev-mode `undefined` gap warning catches cases where the type system and runtime diverge.

### One way to do things

There is one way to fetch data: `query(api.entity.list())`. The compiler handles field narrowing. The developer never writes `select` manually. No `@fields` decorator, no `gql` template tag, no field selection DSL.

### AI agents are first-class users

An LLM writes `query(api.users.list())` and uses `user.name` in JSX. The compiler figures out the rest. No ceremony, no configuration, no "remember to add your fields to the selection set."

### Explicit over implicit

The field selection manifest is inspectable (`.vertz/field-selection.json`). Debug logging (`VERTZ_DEBUG=fields`) shows exactly which fields were selected and why. The `// @vertz-select-all` escape hatch is visible in code review.

### What was rejected

| Alternative | Why rejected |
|-------------|-------------|
| **GraphQL-style selection DSL** | Violates "one way to do things." Forces developers to manually declare fields. |
| **Runtime proxy tracking** | Violates "compile-time over runtime." First render over-fetches. SSR can't benefit. |
| **Directive-based opt-in** (`// @fields`) | Violates "AI agents are first-class." LLMs would need to learn when to add directives. |
| **Schema-driven narrowing** (server decides) | Server can't know which fields the UI reads. The UI is the source of truth. |

---

## Non-Goals

- **Manual field selection API** — No `query(api.users.list(), { select: ['name'] })` user-facing option. The compiler handles this. The only user-facing control is `// @vertz-select-all` to opt out.
- **Runtime field tracking / observation** — No proxy-based field tracking at runtime.
- **Cross-route aggregation** — Each route/page has its own field selection. We don't aggregate fields across all routes.
- **Write-side field narrowing** — `create()`, `update()`, `delete()` mutations are not affected. Only read queries.
- **Relation includes (Phases 1-3)** — Relation `include` injection is deferred to Phase 4.
- **Production build optimization (Phases 1-3)** — Dev server pipeline first. Production integration is Phase 5.

---

## Unknowns

### 1. Cross-file analysis performance (Phase 2 — needs POC before Phase 2 starts)

**Question:** The cross-component analyzer requires loading all source files and building a prop flow graph. Using the lightweight `ts.createSourceFile` approach (no type checker), how fast is the initial analysis for 200+ component projects?

**Strategy:** Build a benchmark as part of Phase 2 preparation. Target: < 500ms cold start for 200 files, < 50ms incremental update per file change. If too slow, evaluate incremental graph building during `onLoad` instead of a pre-pass.

**Note:** This is NOT blocking for Phase 1. Phase 1 uses single-file analysis only (inline in `onLoad`, < 5ms).

### 2. Interaction with QueryDescriptor options merging (resolved)

**Resolution:** Compiler-injected `select` is merged into the SDK method's options parameter. User-provided `select` takes precedence — explicit overrides implicit. The compiler generates `api.users.list({ select: { id: true, name: true } })`. If the user already wrote `api.users.list({ where: { status: 'active' } })`, the compiler merges: `api.users.list({ where: { status: 'active' }, select: { id: true, name: true } })`.

### 3. Primary key always included (resolved)

**Resolution:** The entity's primary key field is always included. Read from entity config (not hardcoded to `id`). Falls back to `id` when entity config is unavailable.

### 4. Dynamic field access patterns (resolved)

**Resolution:** Detected as opaque access. Query falls back to fetching all fields. Safe default.

### 5. SSR and field selection timing (resolved for Phase 1)

**Resolution:** Phase 1 field selection runs synchronously during `onLoad`, before `compile()`. The injection is part of the same synchronous pipeline that produces the compiled output. SSR receives the compiled output with `select` already injected. No timing issue.

### 6. Non-descriptor queries (resolved)

**Resolution:** Field selection requires `QueryDescriptor`. Plain thunk queries are not narrowed. The SDK is the blessed path.

### 7. `isPrimitivePropName` heuristic (resolved — Phase 2)

**Question:** The `FieldAccessAnalyzer` skips props named `name`, `title`, `id`, etc. — which collide with common entity fields.

**Resolution:** The lightweight Phase 1 analyzer doesn't use this heuristic (single-file, no prop analysis). The Phase 2 cross-component analyzer will check the prop's **value expression** (does it trace to query data?), not just the prop name. A prop named `name` with value `{user.name}` is tracked; a prop named `name` with value `{"Submit"}` is not.

---

## Type Flow Map

No new generic type parameters are introduced. The existing type flow is preserved:

```
QueryDescriptor<T, E>
  ↓ (compiler injects select into SDK call options)
api.users.list({ select: Record<string, true> })
  ↓ (SDK creates descriptor with same T)
QueryDescriptor<UserListResponse, FetchError>
  ↓ (query() reads _key, _fetch, _entity)
QueryResult<UserListResponse, FetchError>
  ↓ (signal unwrap in JSX)
users.data.items → UserListResponse['items'] → User[]
```

The `select` parameter narrows the **runtime data** but does **not** narrow the **TypeScript type**. The type remains `User` (all fields), even though the API only returns selected fields. This is intentional:

1. The type system can't express "User but only with `id`, `name`, `email`" without `Pick<>` — which would require the compiler to rewrite type annotations.
2. Selected fields may change across renders (HMR, different routes).
3. Accessing a non-selected field returns `undefined` at runtime — the entity store returns `undefined` for fields not present in the response.

### The `undefined` gap — mitigation

**Phase 1 includes a dev-mode runtime warning.** When field selection is active and a non-selected field is accessed:

```
[vertz] Field "bio" was accessed on User#42 but was not in the select set.
        Query: "GET:/users" in UserListPage.tsx:3
        Selected: id, name, email
        Fix: use {user.bio} in JSX, or add // @vertz-select-all above the query.
```

Implementation: The entity store wraps entities in a dev-mode `Proxy` that intercepts property access and checks against the known `select` set for that entity's latest query. Zero overhead in production (proxy is not created).

Future phases may add:
- Compiler diagnostic for non-JSX field access
- Strict `Pick<>` type narrowing via language service plugin

---

## E2E Acceptance Test

```typescript
// packages/integration-tests/src/vertzql-auto-field-selection.test.ts
import { describe, it, expect } from 'bun:test';

describe('Feature: VertzQL automatic field selection', () => {

  describe('Given a component that accesses user.name and user.email from a query', () => {
    describe('When the component source is compiled by the Bun plugin', () => {
      it('Then the compiled output injects select: { id: true, name: true, email: true } into api.users.list()', () => {
        // Compile src fixture, regex-match the injected select object
      });
    });

    describe('When the compiled component renders and the query fires', () => {
      it('Then the HTTP request contains a q= parameter encoding the select fields', () => {
        // Start test server, render component, intercept HTTP request
        // Decode q= → { select: { id: true, name: true, email: true } }
      });

      it('Then the API response contains only { id, name, email } per user', () => {
        // Verify response body: no bio, no avatar, no other fields
      });
    });
  });

  describe('Given a component with opaque access (spread operator)', () => {
    describe('When the component source is compiled', () => {
      it('Then no select parameter is injected into the query call', () => {
        // Component: { ...user } → hasOpaqueAccess → no injection
      });
    });
  });

  describe('Given a query preceded by // @vertz-select-all pragma', () => {
    describe('When the component source is compiled', () => {
      it('Then no select parameter is injected (escape hatch respected)', () => {
        // Pragma disables field selection for this specific query
      });
    });
  });

  describe('Given a component using the thunk overload (not QueryDescriptor)', () => {
    describe('When the component source is compiled', () => {
      it('Then no select parameter is injected (thunks are opaque)', () => {
        // query(() => fetch('/api/users')) → no injection
      });
    });
  });

  describe('Given a component that accesses a field in an event handler', () => {
    describe('When onClick={() => clipboard.write(user.email)} is in the JSX', () => {
      it('Then email is included in the select set', () => {
        // Event handler field access is tracked
      });
    });
  });

  describe('Given a component that accesses users.data.items.map(u => u.name)', () => {
    describe('When the field path is extracted', () => {
      it('Then the field is "name" (not "items.name")', () => {
        // items is stripped from the path like data is
      });
    });
  });

  describe('Given field selection is active and a non-selected field is accessed at runtime', () => {
    describe('When user.bio is read (bio not in select)', () => {
      it('Then a dev-mode console warning is logged with the field name and query source', () => {
        // Entity store proxy intercepts the access, logs warning
      });

      it('Then the value is undefined', () => {
        // Non-selected fields are not present in the response
      });
    });
  });

  // Type-level tests
  describe('Type safety', () => {
    it('QueryDescriptor type is unchanged — select does not narrow the TypeScript type', () => {
      const users = query(api.users.list());
      const _name: string = users.data.items[0].name; // ✅ compiles
      const _bio: string = users.data.items[0].bio;   // ✅ compiles (undefined at runtime, warned)
    });
  });
});
```

---

## Implementation Plan

### Phase 0: SDK codegen prerequisites

**Goal:** SDK methods accept VertzQL options and serialize them into the `q=` parameter. This is prerequisite infrastructure for all subsequent phases.

**Changes:**
- `packages/fetch/src/vertzql-encode.ts` (new): `encodeVertzQL()` helper that serializes `{ select, include }` into base64 `q=` parameter.
- `packages/codegen/src/generators/entity-sdk-generator.ts`: Update `list()` to accept `options?: VertzQLClientOptions` and pass through `encodeVertzQL(options)` to `client.get()`. Update `get()` to accept optional second parameter `options?: VertzQLClientOptions`.
- `packages/fetch/src/types.ts`: Add `VertzQLClientOptions` interface.

**Acceptance criteria:**

```typescript
describe('Feature: SDK VertzQL options', () => {
  describe('Given a generated SDK list() method', () => {
    describe('When called with { select: { name: true } }', () => {
      it('Then the HTTP request includes q= with base64-encoded {"select":{"name":true}}', () => {});
    });
    describe('When called with { where: { status: "active" }, select: { name: true } }', () => {
      it('Then where params are top-level and select is in q=', () => {});
    });
    describe('When called with no arguments', () => {
      it('Then the HTTP request has no q= parameter (backward compatible)', () => {});
    });
  });

  describe('Given a generated SDK get() method', () => {
    describe('When called with (id, { select: { name: true } })', () => {
      it('Then the HTTP request for /entity/:id includes q= with select', () => {});
    });
  });
});
```

### Phase 1: Single-file field selection (analyze + inject + round-trip)

**Goal:** The thinnest E2E slice — within a single file, the compiler tracks which fields are accessed on `query()` results, injects `select` into the SDK call, and the API responds with fewer fields. Includes dev-mode `undefined` gap warning.

**Changes:**
- `packages/ui-compiler/src/analyzers/field-access-analyzer-lite.ts` (new): Lightweight single-file field access analyzer using `ts.createSourceFile` (no ts-morph, no type checker). Tracks property access on `query()` result variables within a single file. Handles: direct access (`users.data.name`), array access (`users.data.items.map(u => u.name)`), destructuring (`const { name } = users.data`), event handlers (`onClick={() => user.email}`). Strips `data` and `items` from field paths.
- `packages/ui-server/src/bun-plugin/field-selection-inject.ts` (new): MagicString transform that reads field analysis results, detects `// @vertz-select-all` pragma, and injects `{ select: { ... } }` into `api.X.list()` / `api.X.get()` calls. Runs between hydration and compilation in the `onLoad` pipeline.
- `packages/ui-server/src/bun-plugin/plugin.ts`: Add field selection inject step between hydration and compile.
- `packages/ui/src/store/entity-store.ts`: Dev-mode `Proxy` wrapper on entities that logs warnings when non-selected fields are accessed. Track select sets per entity via a `WeakMap<entity, Set<string>>`.
- `VERTZ_DEBUG=fields` logging from Phase 1.

**Acceptance criteria:**

```typescript
describe('Feature: Single-file field selection', () => {
  describe('Given a component file with query(api.users.list()) accessing user.name', () => {
    describe('When compiled by the Bun plugin', () => {
      it('Then the output contains api.users.list({ select: { id: true, name: true } })', () => {});
    });
  });

  describe('Given a component with users.data.items.map(u => u.name) and u.email in JSX', () => {
    describe('When field paths are extracted', () => {
      it('Then fields are ["id", "name", "email"] (items stripped from path)', () => {});
    });
  });

  describe('Given a component with // @vertz-select-all above the query()', () => {
    describe('When compiled', () => {
      it('Then no select is injected', () => {});
    });
  });

  describe('Given a component with { ...user } (opaque access)', () => {
    describe('When compiled', () => {
      it('Then no select is injected', () => {});
    });
  });

  describe('Given field selection is active and user.bio is accessed at runtime (not in select)', () => {
    describe('When the access occurs in dev mode', () => {
      it('Then console.warn is called with field name, entity type, and query info', () => {});
    });
    describe('When the access occurs in production mode', () => {
      it('Then no warning is logged (zero overhead)', () => {});
    });
  });

  describe('Given a full round-trip (component → compile → server → response)', () => {
    describe('When the compiled component renders', () => {
      it('Then the HTTP request contains q= with the select fields', () => {});
      it('Then the API response only contains selected fields', () => {});
      it('Then the component renders correctly with the narrowed data', () => {});
    });
  });
});
```

### Phase 2: Cross-component field propagation

**Goal:** When a parent passes query data to a child via props, the child's field access is aggregated into the parent's query `select`.

**Changes:**
- `packages/ui-compiler/src/analyzers/cross-component-field-analyzer.ts` (new): Lightweight cross-file analyzer using `ts.createSourceFile`. Builds prop flow graph from import declarations (not name matching). Backward-propagates child fields to parent queries. Handles: direct prop passing, array element passing (`.map(u => <Card user={u} />)`). Falls back to opaque (no select) when component can't be resolved.
- `packages/ui-server/src/bun-plugin/field-selection-manifest.ts` (new): Runs at plugin construction (after `generateAllManifests()`). Scans all `.tsx` files, produces `.vertz/field-selection.json`. Incremental updates via file watcher using reverse dependency map.
- `packages/ui-server/src/bun-plugin/plugin.ts`: Read cross-file manifest during `onLoad`. Merge cross-file fields with single-file fields. Inject combined `select`.

**Prerequisites:** Performance benchmark of lightweight cross-file analysis (resolved before Phase 2 starts).

**Acceptance criteria:**

```typescript
describe('Feature: Cross-component field propagation', () => {
  describe('Given Parent with query(api.users.list()) passing user to <UserCard user={u} />', () => {
    describe('When UserCard accesses user.name and user.email', () => {
      it('Then Parent query select includes id, name, email', () => {});
    });
  });

  describe('Given A → B → C prop chain (A queries, B passes through, C accesses fields)', () => {
    describe('When C accesses post.title', () => {
      it('Then A query select includes title', () => {});
    });
  });

  describe('Given a child component imported via barrel re-export', () => {
    describe('When the analyzer cannot resolve the component', () => {
      it('Then the parent query has no select (conservative fallback)', () => {});
      it('Then a diagnostic is logged naming the unresolved component', () => {});
    });
  });

  describe('Given two queries in the same parent passing to the same child', () => {
    describe('When <TaskCard task={task} assignee={user} />', () => {
      it('Then task fields are attributed to the tasks query', () => {});
      it('Then assignee fields are attributed to the users query', () => {});
    });
  });

  describe('Given a child file change that adds a new field access', () => {
    describe('When the manifest is regenerated incrementally', () => {
      it('Then the parent manifest entry includes the new field', () => {});
      it('Then the parent recompilation picks up the updated manifest', () => {});
    });
  });
});
```

### Phase 3: Dev diagnostics

**Goal:** Developers can inspect and debug field selection decisions.

**Changes:**
- `/__vertz_diagnostics` endpoint includes field selection state per file
- Dev overlay shows field count badge on queries with active selection
- Compiler warning when all queries in a component fall back to opaque

**Acceptance criteria:**
- `VERTZ_DEBUG=fields` outputs one log line per query with selected fields (already in Phase 1)
- Diagnostics endpoint includes per-file field selection entries
- Warning fires for components where all query data flows through opaque access

### Phase 4: Relation `include` injection

**Goal:** Extend field tracking to detect relation access (e.g., `task.assignee.name`) and inject VertzQL `include` parameters.

**Blocked on:** Entity relation config available at compile time (codegen must write a schema manifest with relation metadata).

**Changes:**
- Extend analyzer to distinguish flat fields from relation fields (using entity schema metadata from codegen output)
- Generate `include` alongside `select` in the manifest
- Inject `include` parameter in the compilation step

**Acceptance criteria:**
- Component accessing `task.assignee.name` generates `include: { assignee: { name: true } }`
- Non-exposed relations (per entity config) are not included — compiler emits diagnostic

### Phase 5: Production build integration

**Goal:** Field selection works in production builds, not just the dev server.

**Changes:**
- Run field access analysis as a build step (before bundling)
- Integrate with `Bun.build()` production pipeline
- Persist manifest for build reproducibility

**Acceptance criteria:**
- Production bundle contains select-narrowed queries
- Build time impact is < 5% of total build time

---

## Open Questions (carried forward)

1. **Entity schema at compile time (Phase 4 blocker).** Relation `include` injection needs to know which fields are relations vs flat. Options: (a) codegen writes a schema manifest, (b) dev server introspects running server, (c) entity analyzer extracts relation info. Decision deferred to Phase 4 design.

2. **Partial type narrowing (future).** Should we invest in a TypeScript language service plugin that narrows types based on field selection? Premature for now — the dev-mode runtime warning is sufficient. Revisit after user feedback on the `undefined` gap.

3. **Optimistic update interaction.** When a mutation applies an optimistic layer for a field not in the query's `select`, and the subsequent refetch doesn't include that field, does the optimistic value persist or revert? Needs investigation — may need the optimistic handler to be aware of select sets.
