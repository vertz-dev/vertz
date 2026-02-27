# POC Findings: SDK + Query Descriptor

## Summary

All 5 unknowns from `plans/sdk-query-integration.md` are **resolved — the design works**.

- 29/29 runtime tests pass
- 7/7 `@ts-expect-error` type-level assertions validated
- TypeScript typecheck clean

## Unknown #1: TypeScript inference through QueryDescriptor ✅

**Question:** Does TS correctly infer `T` when `query()` receives a `QueryDescriptor<T>`?

**Answer: Yes.** TypeScript correctly infers:
- `query(api.tasks.list())` → `QueryResult<Task[]>`
- `query(api.tasks.get(id))` → `QueryResult<Task>`
- `tasks.data` is `Task[] | undefined` (not `string`, not `Task`)
- Negative tests (`@ts-expect-error`) all fire correctly

The key insight: `QueryDescriptor<T>` extends `PromiseLike<T>`, and since `PromiseLike` is a well-known interface, TypeScript's inference engine handles it cleanly through `query()` overloads.

## Unknown #2: Thenable + await interaction ✅

**Question:** Does `await descriptor` resolve to `T` and not `QueryDescriptor<T>`?

**Answer: Yes.** All patterns work:
- `const task = await api.tasks.get(id)` → `task` is `Task`
- Error propagation: thrown `FetchError` is catchable
- `Promise.all([desc1, desc2])` correctly resolves to `[Task[], Task]`
- Async function context works naturally

## Unknown #3: Key derivation for parameterized queries ✅

**Question:** How do we serialize query params into a stable key?

**Answer:** Sorted `URLSearchParams` serialization works perfectly:
- `list()` → `"GET:/tasks"`
- `get('abc-123')` → `"GET:/tasks/abc-123"`
- `list({ status: 'done', priority: 'high' })` → `"GET:/tasks?priority=high&status=done"`
- Same params in different order produce identical keys (sorted serialization)
- Different IDs produce different cache entries

## Unknown #4: DELETE 204 handling ✅

**Question:** Does the auto-unwrap handle 204 No Content?

**Answer: Yes.** When the generic type is `void`, `result.data.data` is `undefined`, and `await descriptor` resolves to `undefined`. No ParseError.

Note: The real fix for ParseError on 204 still needs to happen in `@vertz/fetch` (skip JSON parse when `response.status === 204`). The descriptor pattern handles it gracefully because the return type is `QueryDescriptor<void>`.

## Unknown #5: query() overload resolution ✅

**Question:** Does TypeScript correctly distinguish `query(descriptor)` from `query(thunk)`?

**Answer: Yes.** TypeScript picks the correct overload:
- `query(api.tasks.list())` → descriptor overload (auto-key, no `key` option)
- `query(() => Promise.resolve([1,2,3]), { key: '...' })` → thunk overload
- `isQueryDescriptor()` runtime guard works for the implementation
- The descriptor overload's `Omit<QueryOptions<T>, 'key'>` correctly prevents passing `key` (validated by `@ts-expect-error`)

The structural distinction works because:
- A `QueryDescriptor` has `_key`, `_fetch`, and `then` properties
- A thunk is a plain function with none of these

## BearerAuthHandle ✅

The abstraction works as designed:
- `setToken()` / `clear()` / `isAuthenticated` API is clean
- `_strategy` provides the token getter for FetchClient
- Dynamic token via function works (external state store pattern)
- No signals exposed to consumers

## Conclusion

The design in `plans/sdk-query-integration.md` is technically sound. All unknowns resolved positively. Ready for implementation.

### Implementation order recommendation:
1. Fix `@vertz/fetch` bugs (URL resolution, fetch binding, 204 handling) — prerequisites
2. Add `createDescriptor` to `@vertz/fetch` (or a new `@vertz/sdk-runtime` package)
3. Update `@vertz/codegen` to emit `createDescriptor` calls + metadata on all operations
4. Update `@vertz/ui` `query()` with descriptor overload
5. Update `@vertz/codegen` to emit `createClient` with API-driven auth
6. Update task-manager example to use the new DX
