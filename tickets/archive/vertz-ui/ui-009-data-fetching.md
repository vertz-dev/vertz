# ui-009: Data Fetching (query)

- **Status:** 🔴 Todo
- **Assigned:** nora
- **Phase:** Phase 4 — Data Fetching
- **Estimate:** 32 hours
- **Blocked by:** ui-001, ui-002, ui-003
- **Blocks:** ui-014
- **PR:** —

## Description

Implement the `query()` API for reactive data fetching with auto-generated cache keys, deduplication, and SSR handoff. Queries consume the generated SDK from `@vertz/codegen` (already available, PR #130 merged).

The approach is thunk-based: `query(() => api.users.list())`. Cache keys are derived from the thunk execution (URL + method + params). No codegen changes needed for v1.0.

### What to implement

- `query(() => sdkCall, opts)` thunk-based API with reactive dependency tracking
- Cache key derivation from thunk execution (URL + method + params)
- Query-level cache store with abstract `CacheStore` interface
- `.data`, `.loading`, `.error`, `.refetch` reactive accessors
- `initialData` support for SSR handoff
- `debounce` option for search/filter queries
- `enabled` option for conditional fetching
- Custom `key` override
- `revalidate()` for mutation-triggered refetching
- Query deduplication (concurrent identical requests produce single fetch)

### Files to create

- `packages/ui/src/query/query.ts`
- `packages/ui/src/query/cache.ts`
- `packages/ui/src/query/key-derivation.ts`
- All corresponding `__tests__/` files

### External dependency

`@vertz/codegen` — already available (PR #130 merged). Queries consume the generated SDK directly.

### References

- [Implementation Plan — Phase 4](../../plans/ui-implementation.md#phase-4-data-fetching)
- [UI Design Doc](../../plans/ui-design.md)
- [Codegen Impact Analysis](../../../backstage/research/explorations/ui-codegen-impact-analysis.md)

## Acceptance Criteria

- [ ] `query(() => sdkCall, opts)` fetches data and tracks reactive dependencies
- [ ] Cache key is derived from SDK call arguments (URL + method + params)
- [ ] `CacheStore` interface is abstract and swappable (query-level cache for v1.0)
- [ ] `.data` is a reactive accessor that holds the fetched data
- [ ] `.loading` is a reactive accessor that reflects fetch state
- [ ] `.error` is a reactive accessor that holds fetch errors
- [ ] `.refetch` triggers a manual refetch
- [ ] `initialData` option skips the initial fetch (SSR handoff)
- [ ] `debounce` option delays refetch for search/filter queries
- [ ] `enabled` option conditionally enables/disables the query
- [ ] Custom `key` override works
- [ ] `revalidate()` triggers refetching after mutations
- [ ] Concurrent identical queries produce a single network request (deduplication)
- [ ] Integration tests pass (see below)

### Integration Tests

```typescript
// IT-4-1: query() fetches data and exposes reactive accessors
test('query() returns loading then data', async () => {
  server.use(
    mockHandlers.users.list(() => [{ id: '1', name: 'Alice' }])
  );

  function UserList() {
    const results = query(() => api.users.list());
    return (
      <div>
        {results.loading && <span>Loading</span>}
        {results.data && <span>{results.data[0].name}</span>}
      </div>
    );
  }

  const { findByText } = renderTest(<UserList />);
  expect(findByText('Loading')).toBeTruthy();
  await waitFor(() => expect(findByText('Alice')).toBeTruthy());
});

// IT-4-2: query() refetches when reactive dependency changes
test('query() refetches on dependency change', async () => {
  let callCount = 0;
  server.use(
    mockHandlers.users.list(({ request }) => {
      callCount++;
      const url = new URL(request.url);
      const q = url.searchParams.get('q');
      return q === 'Bob' ? [{ id: '2', name: 'Bob' }] : [{ id: '1', name: 'Alice' }];
    })
  );

  function Search() {
    let search = '';
    const results = query(() => api.users.list({ query: { q: search } }));
    return (
      <div>
        <input onInput={(e) => search = e.currentTarget.value} />
        <span>{results.data?.[0]?.name}</span>
      </div>
    );
  }

  const { findByText, type } = renderTest(<Search />);
  await waitFor(() => expect(findByText('Alice')).toBeTruthy());
  await type('input', 'Bob');
  await waitFor(() => expect(findByText('Bob')).toBeTruthy());
  expect(callCount).toBe(2);
});

// IT-4-3: Query deduplication — concurrent identical requests produce single fetch
test('concurrent identical queries produce one fetch', async () => {
  let fetchCount = 0;
  server.use(
    mockHandlers.users.list(() => { fetchCount++; return []; })
  );

  function Parallel() {
    const a = query(() => api.users.list());
    const b = query(() => api.users.list());
    return <div>{a.loading || b.loading ? 'loading' : 'done'}</div>;
  }

  const { findByText } = renderTest(<Parallel />);
  await waitFor(() => expect(findByText('done')).toBeTruthy());
  expect(fetchCount).toBe(1);
});

// IT-4-4: initialData skips the initial fetch (SSR handoff)
test('initialData prevents initial fetch', async () => {
  let fetchCount = 0;
  server.use(mockHandlers.users.list(() => { fetchCount++; return []; }));

  function Prefetched() {
    const results = query(() => api.users.list(), {
      initialData: [{ id: '1', name: 'Prefetched' }],
    });
    return <span>{results.data[0].name}</span>;
  }

  const { findByText } = renderTest(<Prefetched />);
  expect(findByText('Prefetched')).toBeTruthy();
  expect(fetchCount).toBe(0);
});
```

## Progress

- 2026-02-10: Ticket created from implementation plan.
