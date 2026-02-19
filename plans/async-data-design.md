# Async Data State Design for `query()`

**Author:** UI Architecture Advisory  
**Date:** 2026-02-18  
**Status:** Proposal

---

## 1. The State Model

### The Type

```typescript
type QueryState<T, E = AppError> =
  | { status: 'pending';  value: undefined; error: undefined; isRevalidating: false }
  | { status: 'ready';    value: T;         error: undefined; isRevalidating: boolean }
  | { status: 'error';    value: T | undefined; error: E;     isRevalidating: false  }

// What query() actually returns:
interface Query<T, E = AppError> {
  /** Discriminant — use this for control flow */
  readonly status: 'pending' | 'ready' | 'error'

  /** The data. Defined when status is 'ready', or when status is 'error' and stale data exists. */
  readonly value: T | undefined

  /** The error. Defined only when status is 'error'. */
  readonly error: E | undefined

  /** True when a background fetch is in-flight and we already have data. */
  readonly isRevalidating: boolean

  /** Trigger a refetch. Returns a promise of the Result. */
  revalidate(): Promise<Result<T, E>>

  /** Optimistically set value. Rolls back on next error. */
  optimistic(updater: (current: T) => T): void
}
```

### UX State Mapping

| UX State | `status` | `value` | `error` | `isRevalidating` |
|---|---|---|---|---|
| 1. Initial load | `'pending'` | `undefined` | `undefined` | `false` |
| 2. Stale + revalidating | `'ready'` | `T` (stale) | `undefined` | `true` |
| 3. User-triggered refetch | `'ready'` | `T` (stale) | `undefined` | `true` |
| 4. Error + has data | `'error'` | `T` (stale) | `E` | `false` |
| 5. Error + no data | `'error'` | `undefined` | `E` | `false` |
| 6. Fresh data | `'ready'` | `T` | `undefined` | `false` |

**That's it. Three fields for state, two methods for actions.** Five fields total surface area. Compare to TanStack Query's ~15 returned fields.

---

## 2. Why This Shape

### Every field justified

| Field | Why it exists | What happens without it |
|---|---|---|
| `status` | Single discriminant for control flow. TypeScript narrows `value`/`error` automatically. | Developers write `if (data && !error && !loading)` — fragile, no narrowing. |
| `value` | The data. Can coexist with `error` (stale data + failed revalidation). | Can't implement "show stale data on error" — the most important resilience pattern. |
| `error` | The error, as a value (not thrown). Co-located handling. | Forced into ErrorBoundary — errors separated from where they matter. |
| `isRevalidating` | Distinguishes "stale + refreshing" from "fresh". Purely a UX hint. | Can't show subtle refresh indicators. Everything looks like initial load. |
| `revalidate()` | Explicit, co-located refetch trigger. | Developers reach for global cache invalidation — less discoverable, less local. |

### Comparison: TanStack Query

TanStack Query returns: `data`, `dataUpdatedAt`, `error`, `errorUpdateCount`, `errorUpdatedAt`, `failureCount`, `failureReason`, `fetchStatus`, `isError`, `isFetched`, `isFetchedAfterMount`, `isFetching`, `isInitialLoading`, `isLoading`, `isLoadingError`, `isPaused`, `isPending`, `isPlaceholderData`, `isRefetchError`, `isRefetching`, `isStale`, `isSuccess`, `refetch`, `status`.

That's **24 fields**. Most exist because `status` alone wasn't enough (they added `fetchStatus` as a second axis), and then added boolean shortcuts for every combination.

**What we steal:** The insight that data-state and fetch-state are orthogonal. TanStack's `status` × `fetchStatus` matrix is correct. We just collapse it into `status` + `isRevalidating` — same information, 2 fields instead of 24.

### Comparison: SolidJS

SolidJS `createResource` returns: `data()`, `loading`, `error`.

That's **3 fields**. Too few — `loading` is `true` for both initial load and background revalidation. You can't distinguish "show spinner" from "show data + subtle indicator". Solid Router's `query()` adds caching but not richer state.

**What we steal:** The signal-based reactivity and the non-blocking Suspense execution model (components run, only DOM attachment deferred).

---

## 3. Pattern Examples

### State 1: Initial Load (skeleton/spinner)

```tsx
function UserProfile() {
  const user = query(() => api.users.get(userId))

  if (user.status === 'pending') {
    return <Skeleton variant="profile" />
  }

  if (user.status === 'error') {
    return <ErrorCard error={user.error} onRetry={user.revalidate} />
  }

  // TypeScript knows: user.value is T
  return <ProfileCard user={user.value} />
}
```

### State 2: Stale + Revalidating (subtle indicator)

```tsx
function Dashboard() {
  const stats = query(() => api.dashboard.stats(), { staleTime: 30_000 })

  if (stats.status === 'pending') return <Skeleton />
  if (stats.status === 'error' && !stats.value) return <ErrorCard error={stats.error} />

  return (
    <div>
      {stats.isRevalidating && <RefreshIndicator />}
      {stats.status === 'error' && <Toast message={stats.error.message} />}
      <StatsGrid data={stats.value} />
    </div>
  )
}
```

### State 3: User-Triggered Refetch (search/filter/paginate)

```tsx
function SearchResults() {
  const [searchTerm, setSearchTerm] = signal('')
  const results = query(() => api.search(searchTerm()), {
    key: () => ['search', searchTerm()],
  })

  return (
    <div>
      <SearchInput value={searchTerm()} onChange={setSearchTerm} />

      {results.status === 'pending' && <Skeleton />}
      {results.status === 'ready' && (
        <div class={results.isRevalidating ? 'opacity-60' : ''}>
          <ResultsList items={results.value} />
        </div>
      )}
      {results.status === 'error' && !results.value && (
        <ErrorCard error={results.error} onRetry={results.revalidate} />
      )}
    </div>
  )
}
```

### State 4: Error + Has Data (show data + error toast)

```tsx
function ProductList() {
  const products = query(() => api.products.list())

  // The "resilient UI" pattern — one block handles it all:
  return (
    <div>
      {products.status === 'error' && (
        <Toast
          message="Failed to refresh. Showing cached data."
          action={{ label: 'Retry', onClick: products.revalidate }}
        />
      )}
      {products.value && <Grid items={products.value} />}
      {products.status === 'pending' && <Skeleton />}
      {products.status === 'error' && !products.value && (
        <ErrorCard error={products.error} onRetry={products.revalidate} />
      )}
    </div>
  )
}
```

### State 5: Error + No Data (error state)

```tsx
function OrderDetails({ orderId }: { orderId: string }) {
  const order = query(() => api.orders.get(orderId))

  if (order.status === 'pending') return <Skeleton />

  if (order.status === 'error' && !order.value) {
    return (
      <ErrorCard
        error={order.error}
        onRetry={order.revalidate}
      />
    )
  }

  // value exists (either ready, or error-with-stale-data)
  return <OrderCard order={order.value!} />
}
```

### The Helper: `query.match()` (optional ergonomic sugar)

For developers who want exhaustive matching:

```tsx
function UserProfile() {
  const user = query(() => api.users.get(userId))

  return user.match({
    pending: () => <Skeleton />,
    error: (error, staleValue) =>
      staleValue
        ? <><Toast message={error.message} /><ProfileCard user={staleValue} /></>
        : <ErrorCard error={error} />,
    ready: (value, isRevalidating) => (
      <div>
        {isRevalidating && <RefreshIndicator />}
        <ProfileCard user={value} />
      </div>
    ),
  })
}
```

---

## 4. SSR Integration

### Automatic Suspense for SSR

The CTO wants suspense to be automatic. Here's how:

**On the server**, `query()` returns a signal that starts as `pending`. The Vertz SSR renderer automatically:

1. Sends the HTML shell immediately (everything outside `query()` dependencies).
2. Detects components reading a `pending` query and wraps their DOM output in an **implicit streaming boundary**.
3. When the query resolves, streams the HTML chunk to the client.
4. The client patches the DOM in-place (no full hydration).

**No manual `<Suspense>` boundaries.** The framework infers them from `query()` usage.

```tsx
// Developer writes this:
function Page() {
  const user = query(() => api.users.me())

  return (
    <Layout>
      <h1>Dashboard</h1>
      <ProfileCard user={user.value} />  {/* ← depends on query */}
      <StaticSidebar />                   {/* ← ships immediately */}
    </Layout>
  )
}

// Server behavior:
// 1. <Layout> + <h1> + <StaticSidebar> → sent immediately
// 2. <ProfileCard> placeholder → sent as skeleton
// 3. Query resolves → <ProfileCard> HTML streamed, replaces skeleton
```

### How it works under the hood

**Inspired by:** Qwik's resumability (no re-execution) + SolidJS's non-blocking execution (components run, DOM attachment deferred) + Astro's `server:defer` (implicit streaming boundaries).

```
Server:
  1. Execute component tree
  2. query() calls register themselves with the SSR runtime
  3. Non-dependent DOM → flush immediately
  4. Dependent DOM → hold, send skeleton
  5. Query resolves → stream HTML chunk + serialized state
  6. Repeat until all queries resolved

Client:
  1. Receive shell → render immediately (interactive static parts)
  2. Receive streamed chunks → patch DOM in-place
  3. Rehydrate only event handlers (not full component tree)
  4. query() on client picks up serialized state (no refetch)
```

### Explicit boundaries when you want them

For cases where automatic isn't enough (e.g., you want a specific loading skeleton for a region):

```tsx
import { StreamBoundary } from 'vertz'

function Page() {
  return (
    <Layout>
      <StreamBoundary fallback={<DashboardSkeleton />}>
        <Dashboard />
      </StreamBoundary>
    </Layout>
  )
}
```

This is opt-in, not required. The default automatic behavior handles 90% of cases.

### Client-side: no suspense, always co-located

After initial SSR, all subsequent data fetching is client-side and uses the `query()` return value directly. No suspense boundaries on the client. The developer handles states explicitly with `status`/`value`/`error`.

**Why:** Suspense on the client hides state transitions from developers. Co-located state handling produces better UX (stale-while-revalidate, optimistic updates, error recovery). Suspense is great for SSR streaming; it's a crutch for client-side data.

---

## 5. Errors-as-Values Integration

### query() extends Result, not replaces it

The service layer returns `Result<T, E>`. The query layer wraps that in async state:

```typescript
// Service layer (server):
async function getUser(id: string): Promise<Result<User, AppError>> {
  const user = await db.users.find(id)
  if (!user) return err(notFound('User not found'))
  return ok(user)
}

// query() unwraps the Result automatically:
const user = query(() => api.users.get(userId))
// If service returns ok(user) → status: 'ready', value: user
// If service returns err(e)  → status: 'error', error: e
```

### The chain

```
parse()  → Result<T, ValidationError>
service  → Result<T, AppError>
server   → auto-unwraps Result → HTTP response (200 + body / 4xx + error)
query()  → QueryState<T, AppError>  (async wrapper around the Result)
```

### Is QueryState literally a Result with extra fields?

**No.** A `Result` is synchronous and settled: it's either `ok` or `err`. A `QueryState` has a third state (`pending`) and a dimension Results don't have (`isRevalidating`). But they share DNA:

```typescript
// Result<T, E>:
{ ok: true,  value: T }       | { ok: false, error: E }

// QueryState<T, E>:
{ status: 'pending' }         |
{ status: 'ready', value: T } |
{ status: 'error', error: E, value?: T }
```

When a query settles, you can extract a Result:

```typescript
function toResult<T, E>(q: Query<T, E>): Result<T, E> | null {
  if (q.status === 'ready') return ok(q.value)
  if (q.status === 'error') return err(q.error)
  return null // pending — not settled yet
}
```

---

## 6. Revalidation Patterns

### Stale-While-Revalidate

```tsx
const posts = query(() => api.posts.list(), {
  staleTime: 60_000,       // Consider fresh for 60s
  revalidateOnFocus: true,  // Refetch when tab regains focus
  revalidateOnReconnect: true,
})

// After 60s, next access triggers background revalidation.
// During revalidation: status stays 'ready', isRevalidating becomes true.
// User sees current data + subtle refresh indicator.
```

### Optimistic Updates

```tsx
function TodoItem({ todo }: { todo: Todo }) {
  const todos = query(() => api.todos.list())
  const toggle = mutation(() => api.todos.toggle(todo.id))

  async function handleToggle() {
    // Optimistically update the cache
    todos.optimistic(items =>
      items.map(t => t.id === todo.id ? { ...t, done: !t.done } : t)
    )

    // Fire the mutation
    const result = await toggle.run()

    if (!result.ok) {
      // optimistic() auto-rolls back on next error/revalidation,
      // but you can also show a toast:
      toast.error(result.error.message)
    }
  }

  return (
    <li class={todo.done ? 'line-through' : ''} onClick={handleToggle}>
      {todo.title}
    </li>
  )
}
```

### Pagination

```tsx
function PaginatedList() {
  const [page, setPage] = signal(1)

  const items = query(() => api.items.list({ page: page() }), {
    key: () => ['items', page()],
    keepPreviousValue: true,  // Show previous page while next loads
  })

  return (
    <div>
      <div class={items.isRevalidating ? 'opacity-60' : ''}>
        {items.value?.map(item => <ItemCard key={item.id} item={item} />)}
      </div>

      {items.status === 'pending' && !items.value && <Skeleton />}

      <Pagination
        page={page()}
        onNext={() => setPage(p => p + 1)}
        onPrev={() => setPage(p => p - 1)}
        disabled={items.isRevalidating}
      />
    </div>
  )
}
```

### Dependent Queries

```tsx
function UserPosts({ userId }: { userId: string }) {
  const user = query(() => api.users.get(userId))
  const posts = query(
    () => user.value ? api.posts.byUser(user.value.id) : null,
    { enabled: () => user.status === 'ready' }
  )

  // ...
}
```

### Manual Invalidation

```tsx
import { invalidate } from 'vertz'

function CreatePostForm() {
  const create = mutation(() => api.posts.create(formData()))

  async function handleSubmit() {
    const result = await create.run()
    if (result.ok) {
      invalidate(['posts'])  // All queries with key starting with 'posts' refetch
    }
  }
}
```

---

## 7. What We Steal From Each Framework

| Framework | What we take | How we adapt it |
|---|---|---|
| **TanStack Query** | Data-state and fetch-state are orthogonal axes. `staleTime`, `keepPreviousData`, query key deduplication, optimistic update patterns. | Collapse 24 fields into 5. Keep the caching semantics. |
| **SolidJS** | Fine-grained reactivity (only re-render what changed). Non-blocking Suspense (components execute, DOM deferred). Signal-based API. | Use signals for `query()` return. Adopt non-blocking execution for SSR. |
| **Qwik** | Resumability — don't re-execute on client what ran on server. Serialized state transfer. `track()` for explicit subscriptions. | Serialize query results during SSR, resume on client without refetch. |
| **Astro** | `server:defer` implicit streaming boundaries. Static shell + async islands. | Auto-detect query dependencies for implicit stream boundaries. |
| **React/Next.js** | `useDeferredValue` for stale-while-revalidate UX. `startTransition` for non-urgent updates. `loading.js` convention. | `keepPreviousValue` option. Transitions built into `query()` key changes. |

---

## 8. Anti-Patterns (What We Explicitly Avoid)

### ❌ Boolean `loading`

```tsx
// BAD — can't distinguish initial load from revalidation
const { data, loading, error } = useQuery(...)
if (loading) return <Spinner /> // Hides stale data during revalidation!
```

**Why:** This is the #1 cause of "flash of loading state" in production apps. Initial load and background refresh are fundamentally different UX states.

### ❌ ErrorBoundary for data errors

```tsx
// BAD — separates error handling from data consumption
<ErrorBoundary fallback={<Error />}>
  <Suspense fallback={<Loading />}>
    <MyComponent />
  </Suspense>
</ErrorBoundary>
```

**Why:** Data errors should be co-located with data consumption. ErrorBoundaries are for *unexpected crashes*, not expected business errors (404, validation failure, network timeout). Throwing data errors means you lose stale data — the component unmounts and you can't show "stale data + error toast".

### ❌ Suspense for client-side data transitions

```tsx
// BAD — Suspense hides stale content during revalidation
<Suspense fallback={<Spinner />}>
  <SearchResults query={deferredQuery} />
</Suspense>
```

**Why:** On the client, Suspense replaces content with a fallback. For revalidation, you want to *keep showing* the old content with a loading indicator. Suspense is the wrong primitive for client-side data transitions. We use it only for SSR streaming.

### ❌ Two error patterns (co-located vs boundary)

TanStack Query offers both `isError` (co-located) and `useSuspenseQuery` + ErrorBoundary (boundary-based). Having two patterns means every team debates which to use.

**Our stance:** Co-located, always. One pattern. `status === 'error'` in the component.

### ❌ Conditional query enabling with `enabled: false`

```tsx
// BAD — query exists but doesn't run, confusing state
const { data } = useQuery({ enabled: !!userId, ... })
```

**Our version:** The query function returns `null` to skip, and the query stays in `pending`. No separate `enabled` flag. (We may offer `enabled` as sugar, but the canonical pattern is `null`-return.)

### ❌ Global error handlers that swallow context

```tsx
// BAD — loses the specific query context
queryClient.setDefaultOptions({
  queries: { onError: (err) => toast.error(err.message) }
})
```

**Why:** Error handling should be local. A 404 on a user profile is different from a 404 on a search result. Global handlers produce generic, unhelpful error UX.

### ❌ Re-throwing errors from query to boundary

TanStack Query's `throwOnError` default is clever (only throws if no cached data) but breaks the "errors as values" principle. If the error is a value in the return type, don't also throw it.

**Our stance:** `query()` never throws. Status is always inspectable. If you want a crash boundary for truly unexpected errors, use a framework-level error boundary — but `query()` won't feed into it.

---

## Summary

The `query()` primitive returns **5 fields** (`status`, `value`, `error`, `isRevalidating`, `revalidate` + `optimistic`). It covers all 5 UX states. It's a natural extension of `Result<T, E>` into the async + caching dimension. SSR streaming is automatic via implicit stream boundaries. Client-side state is always co-located, never thrown.

**Design principles:**
1. **One status field to rule them all** — `switch` on `status`, TypeScript narrows the rest
2. **Stale data is a feature** — `value` can coexist with `error`
3. **Revalidation is a hint, not a state** — `isRevalidating` is a boolean overlay, not a fourth status
4. **SSR = automatic, client = explicit** — suspense for streaming, co-located for interaction
5. **Errors are values, always** — never thrown, always inspectable, always co-located
