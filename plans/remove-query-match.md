# Remove `queryMatch` Primitive

> Simplify the query rendering story by removing `queryMatch()` and its compiler special-cases. Replace with direct conditional rendering using signals.

## Status

**Draft** — Awaiting human sign-off.

## Problem

`queryMatch()` is a pattern-matching function for query states (loading/error/data). It adds complexity at multiple layers:

1. **Compiler special-cases:**
   - `jsx-analyzer.ts`: `containsSignalApiReference()` function exists solely to detect `queryMatch(todosQuery, ...)` as reactive
   - `jsx-transformer.ts`: Comment and policy to always transform `.map()` to `__list()` cites `queryMatch` as the motivating case (the data handler receives a proxy that's opaque to static analysis)

2. **Runtime complexity:**
   - Creates a `<span style="display:contents">` wrapper node
   - Builds a reactive Proxy for the data handler parameter that intercepts all property access and binds functions
   - WeakMap cache for wrapper node reuse
   - Disposal scope management for branch switching

3. **DX tax:**
   - A biome lint rule (`no-querymatch-destructure.grit`) exists to warn against destructuring the proxy parameter (which breaks reactivity)
   - Developers must learn when to use `queryMatch` vs direct conditionals — two ways to do the same thing

The same behavior is achievable with **direct conditional rendering** using signals, which the compiler already handles without any special-cases.

## Solution

Delete `queryMatch` entirely. Replace all usages with direct conditional rendering.

```tsx
// Before: queryMatch (needs compiler special-cases, proxy, biome rule)
{queryMatch(tasks, {
  loading: () => <div>Loading...</div>,
  error: (err) => <div>Failed: {err.message}</div>,
  data: (response) => (
    <ul>{response.items.map((t) => <TaskCard key={t.id} task={t} />)}</ul>
  ),
})}

// After: direct conditionals (compiler handles natively)
{tasks.loading && <div>Loading...</div>}
{tasks.error && <div>Failed: {tasks.error.message}</div>}
{tasks.data && (
  <ul>{tasks.data.items.map((t) => <TaskCard key={t.id} task={t} />)}</ul>
)}
```

### Why direct conditionals work

The compiler already handles signal property access in JSX:

1. `tasks.loading` — compiler recognizes `tasks` as from `query()` (signal API registry), wraps in getter → reactive conditional via `__conditional()`
2. `tasks.data.items.map(...)` — compiler transforms `tasks.data` to `tasks.data.value`, then `.items.map()` is a plain chain on the unwrapped data. Since `.map()` is always transformed to `__list()`, and `__list()` wraps its source in a `domEffect`, reading `tasks.data.value` inside the effect creates a signal subscription. When data changes, the effect re-fires.

**Key point:** The `.map()` → `__list()` transform is already ungated (applies regardless of reactivity classification). This behavior MUST be preserved — it's correct for the general case, not just for `queryMatch`. Only the comment citing `queryMatch` as rationale needs updating.

### Trade-off: No exhaustive state handling

`queryMatch` forced developers to provide all three handlers (loading, error, data). Direct conditionals don't enforce this — a developer can write only `{tasks.data && ...}` and forget loading/error states.

This is an acceptable trade-off because:
- The pattern is standard and well-known — every React developer handles query states this way
- LLMs reliably generate all three branches when shown the pattern in docs/examples
- A lint rule can be added later if this proves problematic in practice
- The DX benefit of simplicity outweighs the exhaustiveness guarantee

## API Surface

No new API. This is pure deletion.

### Exports removed from `@vertz/ui`:
- `queryMatch` (function)
- `QueryMatchHandlers` (type)

### Replacement pattern:

```tsx
function TaskListPage() {
  const tasks = query(() => api.tasks.list(), { key: 'task-list' });

  return (
    <div>
      {tasks.loading && <div data-testid="loading">Loading tasks...</div>}
      {tasks.error && (
        <div data-testid="error">
          Failed: {tasks.error instanceof Error ? tasks.error.message : String(tasks.error)}
        </div>
      )}
      {tasks.data && (
        <ul>
          {tasks.data.items.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </ul>
      )}
    </div>
  );
}
```

## Manifesto Alignment

### Principle: One Way to Do Things
Removes a redundant API. Direct conditional rendering is the single, standard pattern.

### Principle: AI Agents Are First-Class Users
Direct conditionals are a pattern every LLM knows. `queryMatch` requires understanding proxy semantics, the no-destructure rule, and compiler interactions. An LLM will nail `{tasks.loading && <Spinner />}` on the first try.

### Principle: Compiler Does the Work
Removing `queryMatch` *reduces* compiler complexity. Fewer special-cases, fewer things that can break, less surface area to maintain.

## Non-Goals

1. **Adding a `<QueryView>` or `<QueryBoundary>` component** — Direct conditionals are simpler and more flexible. No new abstractions needed.
2. **Lint rule for missing error/loading handling** — Can be added later if needed, but not in this scope.
3. **Changing how `query()` works** — This only removes the `queryMatch` consumer. The `query()` function and `QueryResult` type are unchanged.

## Unknowns

### Bare signal API variable as function argument

Removing `containsSignalApiReference` means `{myHelper(tasks)}` (passing a query result as a bare argument without accessing signal properties at the call site) is no longer classified as reactive by the JSX analyzer. The mitigation is that users should access signal properties at the call site: `{myHelper(tasks.data, tasks.error)}`. Since `queryMatch` was the only known API using this pattern and it's being removed, this is a theoretical concern — no user code is affected.

## Type Flow Map

```
query() → QueryResult<T, E>
  ↓
QueryResult.loading    → ReadonlySignal<boolean>    → compiler: .value → boolean in JSX
QueryResult.error      → ReadonlySignal<E | undefined> → compiler: .value → E | undefined in JSX
QueryResult.data       → ReadonlySignal<T | undefined> → compiler: .value → T | undefined in JSX
  ↓
{tasks.data && tasks.data.items.map(...)}
  ↓ compiler transforms:
__conditional(() => tasks.data.value, () => __list(() => tasks.data.value.items, ...))
```

No new generics. No type changes. Signal auto-unwrap already handles all cases.

## E2E Acceptance Test

```tsx
describe('Feature: queryMatch removal', () => {
  describe('Given a component using direct conditional rendering with query signals', () => {
    describe('When the query is loading', () => {
      it('Then {tasks.loading && <Spinner />} renders the loading branch', () => {});
    });
    describe('When the query resolves with data', () => {
      it('Then {tasks.data && <List />} renders the data branch', () => {});
      it('Then tasks.data.items.map() produces a reactive __list() that updates on data change', () => {});
    });
    describe('When the query errors', () => {
      it('Then {tasks.error && <Error />} renders the error branch', () => {});
    });
  });

  describe('Given the compiler processes query() usage with direct conditionals', () => {
    describe('When .map() is called on a query data property', () => {
      it('Then the compiler transforms it to __list() (ungated)', () => {});
    });
  });

  describe('Given the @vertz/ui package exports', () => {
    describe('When checking available exports', () => {
      it('Then queryMatch is NOT exported', () => {});
      it('Then QueryMatchHandlers type is NOT exported', () => {});
    });
  });
});
```

## POC Results

Not needed — this is a deletion. The replacement pattern (direct conditionals with signal auto-unwrap) is already used throughout the codebase alongside `queryMatch`.

## Implementation Plan

### Phase 1: Remove `queryMatch`

Single phase — remove implementation, compiler special-cases, and all usages.

**Files to delete:**
- `packages/ui/src/query/query-match.ts`
- `packages/ui/src/query/__tests__/query-match.test.ts`
- `packages/ui/src/query/__tests__/query-match.test-d.ts`
- `biome-plugins/no-querymatch-destructure.grit`

**Files to update — exports:**
- `packages/ui/src/query/index.ts` — remove `queryMatch` and `QueryMatchHandlers` exports
- `packages/ui/src/query/public.ts` — remove `queryMatch` and `QueryMatchHandlers` exports
- `packages/ui/src/index.ts` — remove `queryMatch` and `QueryMatchHandlers` from re-exports

**Files to update — compiler:**
- `packages/ui-compiler/src/analyzers/jsx-analyzer.ts` — remove `containsSignalApiReference()` function and its call site
- `packages/ui-compiler/src/transformers/jsx-transformer.ts` — update comment at the `.map()` always-transform block (remove queryMatch reference, keep the ungated behavior)
- `packages/ui-compiler/src/analyzers/__tests__/jsx-analyzer.test.ts` — remove `queryMatch(todosQuery, ...)` test case
- `packages/ui-compiler/src/transformers/__tests__/list-transformer.test.ts` — remove queryMatch references
- `packages/ui-compiler/src/transformers/__tests__/jsx-children-thunk.test.ts` — remove queryMatch references

**Files to update — examples:**
- `examples/task-manager/src/pages/task-list.tsx` — replace `queryMatch` with direct conditionals
- `examples/task-manager/src/pages/task-detail.tsx` — replace `queryMatch` with direct conditionals
- `examples/entity-todo/src/pages/todo-list.tsx` — replace `queryMatch` with direct conditionals
- `examples/entity-todo/test-compiler-plugin.ts` — remove queryMatch references in comments

**Files to update — create-vertz-app:**
- `packages/create-vertz-app/src/templates/index.ts` — replace `queryMatch` usage in scaffolded templates
- `packages/create-vertz-app/src/templates/__tests__/templates.test.ts` — update assertions
- `packages/create-vertz-app/src/__tests__/scaffold.test.ts` — update assertions

**Files to update — docs:**
- `packages/docs/guides/ui/data-fetching.mdx` — replace "Pattern matching with queryMatch" section with direct conditional rendering pattern
- `packages/docs/guides/ui/auto-field-selection.mdx` — remove queryMatch references

**Files to update — internal references:**
- `packages/ui/src/dom/element.ts` — update `__child` stable-node optimization comment (remove queryMatch as motivating case)
- `packages/ui/src/__tests__/subpath-exports.test.ts` — remove queryMatch from expected exports

**Files to update — plans (non-functional):**
- `plans/cross-file-reactivity-analysis.md` — remove queryMatch references
- `plans/child-comment-markers.md` — remove queryMatch references

**Files to update — biome config:**
- `biome.json` or equivalent — remove `no-querymatch-destructure` plugin registration

**Acceptance criteria:**

```typescript
describe('Feature: queryMatch removed from codebase', () => {
  describe('Given a fresh build', () => {
    it('Then bun test passes across all packages', () => {});
    it('Then bun run typecheck passes', () => {});
    it('Then bun run lint passes (no queryMatch references)', () => {});
  });

  describe('Given the task-manager example', () => {
    it('Then task-list page renders loading/error/data states with direct conditionals', () => {});
    it('Then task-detail page renders loading/error/data states with direct conditionals', () => {});
  });

  describe('Given the entity-todo example', () => {
    it('Then todo-list page renders with direct conditionals', () => {});
  });

  describe('Given a new app scaffolded with create-vertz-app', () => {
    it('Then the generated code uses direct conditionals, not queryMatch', () => {});
  });
});
```

## Design Review Summary

Three reviews conducted (DX, Product/Scope, Technical). All approved Phase 0 (queryMatch removal) as well-scoped and ready to implement. Key findings incorporated:

- **Missing files identified and added** — `create-vertz-app` templates, `auto-field-selection.mdx`, `element.ts` comment, biome config
- **`.map()` ungated transform preserved** — only comment updated, behavior unchanged
- **Exhaustive state handling trade-off acknowledged** — documented as acceptable, lint rule deferred
- **Reactivity path verified** — `tasks.data.items.map()` works via signal subscription in `__list()` domEffect

The SSR single-pass prefetch work (Phases 1-4 of the original plan) has been split into a separate design doc (`plans/ssr-single-pass-prefetch.md`) pending resolution of the prefetch execution mechanism.
