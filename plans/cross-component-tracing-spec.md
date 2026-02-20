# Cross-Component Field Tracing — Implementation Spec

> **Status:** Draft — Awaiting Review
> **Author:** Mika (VP Eng)
> **Date:** 2026-02-20
> **Design Doc:** `entity-store-design.md` (section 11.5)
> **POC:** `packages/compiler/src/analyzers/field-access-analyzer.ts` (27/27 tests)
> **Package:** `@vertz/compiler` (extends existing analyzer)
> **Depends on:** Field Access Analyzer POC (complete)

---

## 1. Scope

Extend the field-access-analyzer to trace entity data flow across component boundaries via props. When component A queries entity data and passes it to component B, and B accesses `.title`, the compiler attributes that field access back to A's query.

**In scope:**
- JSX prop flow tracking (which props carry entity data)
- Cross-component field access aggregation at query sources
- Multi-hop tracing (A → B → C → field access)
- Cycle detection in component trees
- Integration with existing field-access-analyzer

**Out of scope:**
- Context-based entity passing (v0.2)
- Render props (v0.2)
- Dynamic imports / lazy components (opaque boundary — fallback)
- External component libraries (opaque boundary — fallback)
- VertzQL select clause generation (separate codegen task)

---

## 2. How It Works

### 2.1 The Problem

The POC traces field access within a single component. But entity data often flows through props:

```typescript
// PostList.tsx — has the query
function PostList() {
  const posts = query(() => sdk.posts.list());
  return <div>{posts.data.map(p => <PostCard post={p} />)}</div>;
}

// PostCard.tsx — accesses fields
function PostCard(props: { post: Post }) {
  return <h2>{props.post.title}</h2>;
}
```

The POC traces PostCard and finds `props.post.title → ['title']`. But it doesn't know this traces back to PostList's query. We need to connect these.

### 2.2 Three-Phase Algorithm

**Phase 1: Intra-component analysis** (existing POC)
Run the field-access-analyzer on each component independently. For each component, output:
- Fields accessed on query results (existing)
- Fields accessed on props that look like entity data (new: `props.X.field`)

**Phase 2: Build prop flow graph**
Walk all components' JSX. For each `<ComponentName propName={expression} />`:
- Resolve `ComponentName` to its source file/function
- Determine if `expression` originates from a query result or an entity-typed prop
- Build edge: `ParentComponent.queryVar → ChildComponent.propName`

**Phase 3: Backward propagation**
Starting from leaf components (those that access fields on props), walk backward through the prop flow graph to the originating query. Aggregate all field accesses at the query source.

```
PostList.query(sdk.posts.list)
  ↓ passes posts.data via map callback to PostCard.props.post
PostCard reads props.post.title

Result: PostList's query needs field 'title'
```

### 2.3 Data Structures

```typescript
/** Field access result per component (extended from POC) */
interface ComponentFieldAccess {
  /** Component name / file path */
  component: string;
  /** Fields accessed on query() results (existing POC output) */
  queryAccess: QueryFieldAccess[];
  /** Fields accessed on props (NEW) */
  propAccess: PropFieldAccess[];
}

interface PropFieldAccess {
  /** Prop name (e.g., 'post') */
  propName: string;
  /** Fields accessed on this prop (e.g., ['title', 'author.name']) */
  fields: string[];
  /** Whether any dynamic/opaque access was detected */
  hasOpaqueAccess: boolean;
}

/** Edge in the prop flow graph */
interface PropFlowEdge {
  /** Source component */
  parent: string;
  /** Source expression origin: 'query' | 'prop' | 'unknown' */
  sourceKind: 'query' | 'prop' | 'unknown';
  /** If sourceKind is 'query': which query variable */
  queryVar?: string;
  /** If sourceKind is 'prop': which parent prop */
  parentProp?: string;
  /** Target component */
  child: string;
  /** Target prop name */
  childProp: string;
  /** If true, the prop receives array elements (via .map/.filter), not the array itself */
  isArrayElement?: boolean;
}

/** Final aggregated result */
interface AggregatedQueryFields {
  /** The component containing the query */
  component: string;
  /** The query variable name */
  queryVar: string;
  /** SDK method (e.g., 'sdk.posts.list') */
  sdkMethod: string;
  /** All fields needed across all consuming components */
  fields: string[];
  /** Whether any consumer had opaque access (fallback to all fields) */
  hasOpaqueAccess: boolean;
}
```

---

## 3. File Structure

```
packages/compiler/src/analyzers/
  ├── field-access-analyzer.ts        # Existing POC (extended)
  ├── cross-component-analyzer.ts     # NEW: prop flow graph + backward propagation
  └── __tests__/
      ├── field-access-analyzer.test.ts       # Existing POC tests (27)
      └── cross-component-analyzer.test.ts    # NEW tests
```

---

## 4. Test Plan

### 4.1 Prop Flow Graph Building (~8 tests)

Use ts-morph in-memory projects with multiple source files.

**Basic prop passing:**
```typescript
// File A: function Parent() { const x = query(() => sdk.users.list()); return <Child user={x.data[0]} /> }
// File B: function Child(props) { return <div>{props.user.name}</div> }
// Expected edge: Parent.query → Child.user
// Aggregated: Parent's query needs ['name']
```

**Multi-level:**
```typescript
// A queries, passes to B, B passes to C, C reads .title
// Expected: A's query needs ['title']
```

**Multiple props from same query:**
```typescript
// Parent passes post.author to UserBadge AND post to PostBody
// Both trace back to same query
```

**Spread props:**
```typescript
// <Child {...post} /> — opaque, flag as hasOpaqueAccess
```

**No entity prop (should be ignored):**
```typescript
// <Child className="foo" onClick={handler} /> — no entity data, no edges
```

**Multiple queries in parent:**
```typescript
// Parent has query A (users) and query B (posts)
// Passes user to ChildA, post to ChildB
// Each traces back to correct query
```

**Self-referencing component (cycle):**
```typescript
// TreeNode renders <TreeNode> recursively — must not infinite loop
```

**Unresolvable component (dynamic import):**
```typescript
// const Lazy = lazy(() => import('./Lazy'))
// <Lazy post={p} /> — opaque boundary, don't trace into it
```

**Rest/spread params:**
```typescript
// function Wrapper(props) { return <Inner {...props} /> }
// Spread into child — opaque, flag hasOpaqueAccess on the child
```

**Filter + map chain:**
```typescript
// posts.data.filter(p => p.published).map(p => <PostCard post={p} />)
// Filter doesn't change element type — PostCard still gets entity data
```

**Array variable passed to child:**
```typescript
// const items = posts.data; <List items={items} />
// Variable alias for query data — trace through to List
```

**Inline conditional JSX:**
```typescript
// {isAdmin && <AdminPanel user={u} />}
// Conditional rendering — AdminPanel's field access still counts
```

### 4.2 Backward Propagation (~6 tests)

**Single hop:**
```typescript
// Parent → Child, Child reads .name → Parent's query needs name
```

**Two hops:**
```typescript
// Parent → Middle → Leaf, Leaf reads .name → Parent's query needs name
```

**Diamond pattern:**
```typescript
// Parent → ChildA (reads .name), Parent → ChildB (reads .email)
// Parent's query needs ['name', 'email'] (union)
```

**Opaque child propagates:**
```typescript
// Parent → Child, Child has opaque access → Parent's query flagged hasOpaqueAccess
```

**Mixed query + prop access in same component:**
```typescript
// Component has own query AND receives entity via prop
// Both are tracked independently
```

**Prop not from entity (no propagation):**
```typescript
// <Child count={5} /> — primitive prop, no backward propagation
```

### 4.3 Integration with Existing Analyzer (~4 tests)

**Standalone component (no cross-component, POC still works):**
```typescript
// Single component with query, reads fields directly → same as POC output
```

**Combined output merges query-local and cross-component fields:**
```typescript
// Parent reads .id locally, Child reads .name via prop
// Aggregated: ['id', 'name']
```

**Map callback with cross-component:**
```typescript
// posts.data.map(p => <PostCard post={p} />) — PostCard reads .title
// Aggregated at list query: ['title']
```

**Conditional rendering with cross-component:**
```typescript
// {isAdmin ? <AdminView user={u} /> : <UserView user={u} />}
// Union of AdminView and UserView field accesses
```

**Total: ~22 tests**

---

## 5. Implementation Notes

### 5.1 Identifying Entity Props

A prop carries entity data if its value expression traces back to:
- A `query().data` result (direct or via map callback, filter, or variable alias)
- Another prop that was identified as entity data (transitive)

The analyzer does NOT use TypeScript type information for entity detection in v0.1. It uses **data flow analysis** — if the value comes from `query().data`, it's entity data. This avoids depending on type declarations that might not be available (external components, etc.).

**Entity detection heuristics (v0.1):**
- Trace backward from the JSX prop value expression
- If the trace reaches a `query()` call's `.data` property → entity data
- If the trace reaches another component's prop that is already marked as entity data → entity data (transitive)
- If the trace reaches a `filter()`, `slice()`, or other non-destructive array method → entity data preserved (same element type)
- If the trace reaches an opaque boundary (function call, import, computed property) → not entity data (conservative)

**Known limitation:** Two different entity types passed to the same component via the same prop name (`<Badge user={admin} />` vs `<Badge user={member} />`) are not distinguished. Both contribute fields to whichever query they trace back to. This is correct behavior — the union of fields is fetched. v0.2 may add type-aware disambiguation if needed.

### 5.2 Forwarded Refs and Special Props

- `ref` and `key` are never entity data — skip
- `children` as a prop: if it's a JSX expression, analyze as normal JSX; if it's a render function, treat as opaque boundary (v0.1)
- `forwardRef` wrapping: trace through to the inner component (the forwarded ref itself is not entity data, but props pass through)

### 5.3 Map Callback Handling

```typescript
posts.data.map(p => <PostCard post={p} />)
```

The analyzer already tracks map callback parameters as aliases for array elements (from the POC). The cross-component extension treats the callback parameter `p` as entity data flowing to `PostCard.props.post` with `pathTransform: 'array-element'`.

### 5.4 Cycle Detection

Use a visited set during backward propagation. If a component is visited twice in the same propagation path, stop and use the fields accumulated so far.

### 5.5 Opaque Boundaries

When the analyzer can't resolve a component (dynamic import, external library, computed component reference), it creates an opaque boundary:
- No edges are created into the component
- If entity data flows INTO the opaque component, the parent's query is flagged `hasOpaqueAccess: true`
- The opaque component's own queries (if any) are analyzed independently

---

## 6. Quality Gates

Before PR:
- [ ] `bun run ci` passes (full pipeline)
- [ ] All ~18 new tests + 27 existing POC tests pass
- [ ] No skipped tests
- [ ] Existing POC tests are not modified (backward compatible)
- [ ] Cross-component analyzer extends, doesn't replace, field-access-analyzer

---

## 7. Acceptance Criteria

1. Given components A → B → C where A has a query and C reads fields on a prop, the analyzer correctly attributes C's field accesses to A's query
2. Multiple children reading different fields from the same parent query produce the union of fields
3. Opaque boundaries (dynamic imports, unresolvable components) flag `hasOpaqueAccess` without crashing
4. Cycles in the component tree are detected and handled without infinite loops
5. Existing single-component field tracing continues to work unchanged
