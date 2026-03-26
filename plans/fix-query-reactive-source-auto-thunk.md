# Fix: query() auto-thunk ignores reactive source variables

**Type:** Bug fix (Tier 1 — internal)
**Issue:** query() does not re-fetch when `useSearchParams()` properties change

## Problem

The `QueryAutoThunkTransformer` only checks for `signal` and `computed` variables when deciding whether to wrap a `query()` argument in a thunk:

```ts
// query-auto-thunk-transformer.ts:34-36
const reactiveVars = new Set(
  variables.filter((v) => v.kind === 'signal' || v.kind === 'computed').map((v) => v.name),
);
```

Variables from **reactive source APIs** (`useSearchParams()`, `useContext()`, `useAuth()`) are classified with `kind: 'static'` and `isReactiveSource: true`. They are invisible to the auto-thunk check.

### Broken pattern

```tsx
const sp = useSearchParams<{ page: string }>();
const tasks = query(api.tasks.list({ page: sp.page }));
// → sp not in reactiveVars → NO auto-thunk wrapping
// → sp.page evaluated once at mount → never re-fetches
```

### Expected behavior

The compiler should produce:
```tsx
const sp = useSearchParams<{ page: string }>();
const tasks = query(() => api.tasks.list({ page: sp.page }));
```

So that `sp.page` (which reads the router's searchParams signal via proxy) is captured as a reactive dependency inside the query effect.

## API Surface

No public API changes. This is a compiler bug fix.

## Fix

Two gates must be updated:

### Gate 1: Outer guard in `compiler.ts:119`

The compiler skips the auto-thunk transformer entirely when there are no signals or computeds.
A component with only reactive sources (no `let` signals, no intermediate computeds) never
reaches the transformer.

```ts
// Before:
if (hasSignals || hasComputeds) {

// After:
const hasReactiveSources = variables.some((v) => v.isReactiveSource);
if (hasSignals || hasComputeds || hasReactiveSources) {
```

### Gate 2: Filter in `QueryAutoThunkTransformer.transform()`

```ts
// Before:
const reactiveVars = new Set(
  variables.filter((v) => v.kind === 'signal' || v.kind === 'computed').map((v) => v.name),
);

// After:
const reactiveVars = new Set(
  variables
    .filter((v) => v.kind === 'signal' || v.kind === 'computed' || v.isReactiveSource)
    .map((v) => v.name),
);
```

Both gates must be fixed — the transformer filter alone is insufficient for components
where the reactive source is the only reactive thing (no `let` signals, no derived consts).

## Manifesto Alignment

- **Principle 2 (Compiler does the work)** — The compiler should auto-wrap without forcing developers to write manual thunks for any reactive variable, including reactive sources.
- **Principle 5 (No hidden gotchas)** — `useSearchParams()` returns a reactive proxy. Using it in `query()` should "just work" reactively without special syntax.

## Non-Goals

- Changing how reactive sources are classified in the analyzer (they're correctly classified)
- Adding `.value` insertion for reactive source variables (proxy handles this)
- Modifying the runtime `query()` dep tracking (already works when thunk is present)

## Unknowns

None identified. The fix is a two-site change + tests.

## Type Flow Map

No new generics introduced.

## Reproduction Test — Task Manager Pagination

Add URL-based pagination to the Task Manager example to serve as a real-world E2E test:

1. Seed 50+ tasks in mock data
2. `api.tasks.list()` accepts `{ page, limit }` params, returns paginated results
3. TaskListPage reads `page` from `useSearchParams()` and passes to `query()`
4. Pagination controls update the URL search params
5. Verify: clicking page 2 → URL updates → query re-fetches → new page shown

## E2E Acceptance Test

```tsx
// In TaskListPage — the pattern that must work:
const sp = useSearchParams<{ page: string }>();
const pageNum = parseInt(sp.page || '1', 10);
const tasks = query(api.tasks.list({ page: pageNum, limit: 10 }));

// User clicks "Next" → sp.page = '2' → URL updates → query re-fetches
```

## Implementation Plan

### Phase 1: Compiler fix + unit tests

1. Fix outer guard in `compiler.ts` to include `hasReactiveSources`
2. Fix `QueryAutoThunkTransformer` filter to include `isReactiveSource` variables
3. Add test: `useSearchParams()` property in query arg → auto-thunk wrapping
4. Add test: direct pattern (reactive source is ONLY reactive thing, no signals/computeds) → auto-thunk wrapping
5. Add test: `useContext()` property in query arg → auto-thunk wrapping
6. Add test: `useAuth()` property in query arg → auto-thunk wrapping
7. Add test: reactive source without query arg reference → no wrapping (regression guard)
8. Update transformer JSDoc to mention reactive sources
9. Quality gates: `bun test && bun run typecheck && bun run lint` (ui-compiler package)

### Phase 2: Task Manager pagination

1. Update `TaskListResponse` type with pagination fields
2. Seed 50 tasks in `mock-data.ts`
3. Update `fetchTasks()` to accept `{ page, limit }` and return paginated slice
4. Update `api.tasks.list()` descriptor to accept params
5. Update `TaskListPage` to use `useSearchParams()` + paginated `query()`
6. Add pagination controls (Prev/Next buttons, page indicator)
7. Quality gates

### Phase 3: E2E tests

1. E2E test: pagination renders correct page of tasks
2. E2E test: clicking Next updates URL and shows next page
3. E2E test: navigating directly to `/?page=3` shows page 3
4. Quality gates
