# Design: query() Null-Return for Conditional/Dependent Queries

**Issue:** #1653
**Status:** Draft (Rev 2 — post-review)
**Author:** seattle

## Problem

The Linear clone (and any app with dependent queries) needs to conditionally skip fetches when dependencies aren't ready. Currently, all queries fire immediately on mount:

```tsx
const issue = query(api.issues.get(issueId));
const comments = query(api.comments.list({ where: { issueId } }));
const labels = query(api.labels.list({ where: { projectId } }));
```

When `comments` depends on `issue.data?.id`, there's no way to defer the fetch until `issue` resolves.

## Design Decision: Null-Return, Not `enabled`

### Why not reactive `enabled`?

Issue #1653 proposes `enabled: () => boolean` — the TanStack Query pattern. That pattern exists because React hooks can't be called conditionally (rules of hooks). In Vertz, `query()` is not a hook — you can call it conditionally. For static conditions (feature flags, props, route params), just don't call `query()`.

For **dependent queries** — where the condition is reactive and changes over time — the thunk already runs inside a `lifecycleEffect`. When the thunk reads a signal, the effect re-runs when that signal changes. We leverage this: **allow the thunk to return `null` to signal "not ready, skip this fetch."**

This eliminates the need for a separate reactive `enabled` option. The thunk itself is the condition. The reactive system handles re-execution.

We also **remove the existing static `enabled` boolean** from `QueryOptions`. It's replaced by the null-return pattern, which is strictly more capable (works reactively) and more aligned with Vertz's "one way to do things" principle.

### Migration impact

The `enabled` option is used in ~8 locations in `query.ts` + tests. All are internal — no external consumers. Migration is straightforward: tests that used `enabled: false` convert to thunks returning `null`.

## API Surface

### Dependent query — fetch after parent resolves

```tsx
const issue = query(api.issues.get(issueId));

const comments = query(() => {
  const id = issue.data?.id;
  if (!id) return null; // skip — effect re-runs when issue.data changes
  return api.comments.list({ where: { issueId: id } });
});
```

### Deferred by UI state (tab/section visibility)

```tsx
let activeTab = 'details';

const analytics = query(() => {
  if (activeTab !== 'analytics') return null; // skip until tab is active
  return api.analytics.get(projectId);
});
```

### When the thunk returns `null`:
- `data` remains `undefined`
- `loading` is `false` (not loading — we haven't started)
- `idle` is `true` (the query has not yet fetched — see Idle Signal section)
- `error` is `undefined`
- Reactive dependencies read before `return null` are tracked
- When those deps change, the effect re-runs the thunk
- Pending debounce timers are cleared
- Polling is paused (resumes on next successful fetch)

### When the thunk returns a `QueryDescriptor`:
- `_key` is extracted and used as the cache key
- `_entity` metadata is extracted for entity store normalization and mutation bus subscription
- `_fetch()` is called to get the actual promise (descriptor is never `.then()`'d — see PromiseLike caveat)
- Everything works exactly like `query(descriptor)` does today

### When the thunk returns a `Promise<T>`:
- Existing behavior, unchanged

### Idle signal

`QueryResult` gains a new reactive property `idle`:

```ts
export interface QueryResult<T, E = unknown> {
  readonly idle: Unwrapped<ReadonlySignal<boolean>>;
  // ... existing properties
}
```

- `idle: true` — the query has never fetched (thunk returned `null`, or no effect has run yet)
- `idle: false` — the query has started at least one fetch

This lets developers distinguish "not started" from "loaded with no data":

```tsx
{(comments.idle || comments.loading) && <Skeleton />}
{!comments.idle && !comments.loading && !comments.data && <EmptyState />}
```

The `idle` signal transitions from `true` to `false` on the first non-null thunk return. It never transitions back — once a query has fetched, it's no longer idle (even if subsequent thunk runs return null, the query has stale data from the previous fetch).

### Type signatures

```ts
// Existing: direct descriptor (unchanged)
export function query<T, E>(
  descriptor: QueryDescriptor<T, E>,
  options?: Omit<QueryOptions<T>, 'key'>,
): QueryResult<T, E>;

// New: thunk returning QueryDescriptor or null (MUST come before Promise overload)
export function query<T, E>(
  thunk: () => QueryDescriptor<T, E> | null,
  options?: Omit<QueryOptions<T>, 'key'>,
): QueryResult<T, E>;

// Existing: thunk returning Promise (now also accepts null)
export function query<T>(
  thunk: () => Promise<T> | null,
  options?: QueryOptions<T>,
): QueryResult<T>;
```

**Overload ordering matters.** The `QueryDescriptor` overload MUST come before the `Promise` overload because `QueryDescriptor<T, E>` extends `PromiseLike<Result<T, E>>`. TypeScript resolves overloads top-to-bottom. If the `Promise` overload were first, a descriptor-returning thunk would match it, losing the `E` error type. `.test-d.ts` tests must verify all three overloads resolve correctly.

### Static conditions — just don't call query

```tsx
function IssueDetailPage({ showComments }: Props) {
  const issue = query(api.issues.get(issueId));

  // Static condition — not a hook, just don't call query
  const comments = showComments
    ? query(api.comments.list({ where: { issueId } }))
    : null;

  return (
    <div>
      <IssueCard issue={issue.data} />
      {comments?.data?.map((c) => <Comment key={c.id} comment={c} />)}
    </div>
  );
}
```

**Important:** The static conditional pattern is for truly static values — props, route params, feature flags that don't change within the component lifecycle. For reactive conditions (e.g., `let showComments = false` which the compiler transforms to a signal), always use the null-return thunk pattern. A reactive `let` in a ternary with `query()` would create/dispose queries on every toggle.

### Dependent query chain

```tsx
function IssueDetailPage() {
  const { id: issueId } = useParams<'/issues/:id'>();
  const issue = query(api.issues.get(issueId));

  // Depends on issue.data — fetches only when issue resolves
  const project = query(() => {
    const pid = issue.data?.projectId;
    if (!pid) return null;
    return api.projects.get(pid);
  });

  // Depends on project.data — chain of dependencies
  const team = query(() => {
    const tid = project.data?.teamId;
    if (!tid) return null;
    return api.teams.get(tid);
  });

  return (
    <div>
      {issue.loading && <Skeleton />}
      {issue.data && <IssueCard issue={issue.data} />}
      {project.data && <ProjectBadge project={project.data} />}
      {team.data && <TeamBadge team={team.data} />}
    </div>
  );
}
```

### Thunk exceptions

If the thunk throws synchronously (not returns null, but throws), the error is caught by the `lifecycleEffect` and surfaced via the `error` signal. The query does not retry automatically — call `refetch()` to try again. This matches the existing behavior for async thunk rejections.

### Invalid usage (compile-time)

```tsx
// @ts-expect-error — thunk must return QueryDescriptor, Promise, or null
const bad = query(() => 42);

// @ts-expect-error — thunk must return QueryDescriptor, Promise, or null
const bad2 = query(() => 'hello');
```

## Implementation Details

### Descriptor decomposition in the effect

**Key insight from technical review:** The current query internals (entity data computed, mutation bus subscription, cache key derivation) are designed around static metadata set at `query()` call time. Making these fully dynamic would be a significant refactor.

Instead, we **decompose the descriptor at the effect level** — the same way the direct-descriptor overload does at call time. When `callThunkWithCapture()` returns a descriptor, the effect:

1. Checks `isQueryDescriptor(result)` **FIRST** (before treating as Promise — critical because `QueryDescriptor` extends `PromiseLike`, and `.then()`-ing it would trigger a double-fetch)
2. Extracts `_key` → used as the cache key for this run
3. Extracts `_entity` → used for entity store normalization
4. Calls `result._fetch()` → unwraps `Result<T, E>` → produces `Promise<T>`
5. Feeds the promise + key into the existing fetch pipeline

Entity metadata (mutation bus subscription, active query registration) is set up **on the first non-null descriptor return** and remains static after that. If a subsequent descriptor returns a different entity type, that's a developer error — we throw.

### `callThunkWithCapture()` changes

Returns the raw thunk result. The caller classifies it:

```ts
function callThunkWithCapture(): unknown {
  const captured: unknown[] = [];
  const prevCb = setReadValueCallback((v) => captured.push(v));
  let result: unknown;
  try {
    result = thunk();
  } finally {
    setReadValueCallback(prevCb);
  }
  // Still capture dep hash even on null — tracks dependencies for re-execution
  const serialized = captured.map((v) => JSON.stringify(v)).join('|');
  untrack(() => {
    depHashSignal.value = hashString(serialized);
  });
  return result;
}
```

### Effect body classification

```ts
const raw = callThunkWithCapture();

if (raw === null) {
  // Thunk says "not ready" — clear pending debounce, skip fetch
  clearTimeout(debounceTimer);
  return;
}

let promise: Promise<T>;
let effectKey: string | undefined;
let effectEntityMeta: EntityQueryMeta | undefined;

if (isQueryDescriptor(raw)) {
  // MUST check before treating as Promise (QueryDescriptor is PromiseLike)
  effectKey = raw._key;
  effectEntityMeta = raw._entity;
  const fetchResult = raw._fetch();
  promise = fetchResult.then((result) => {
    if (!result.ok) throw result.error;
    return result.data;
  });
  // Lazy entity setup on first descriptor
  if (effectEntityMeta && !entityMetaInitialized) {
    initializeEntityMeta(effectEntityMeta);
  }
} else {
  promise = raw as Promise<T>;
}

// ... existing cache/dedup/fetch logic, using effectKey ?? depHash-derived key
```

### Null-to-descriptor transition details

- **Debounce:** When thunk transitions from non-null to null, pending debounce timer is cleared. When it transitions back to non-null, a fresh fetch starts (or is debounced normally).
- **Polling:** Polling only schedules after a successful fetch or cache hit. While the thunk returns null, no interval is scheduled. The visibility handler's `refetch()` call triggers the effect re-run — if the thunk still returns null, nothing happens (harmless no-op).
- **`depHashSignal` instability:** When the thunk returns null early, fewer signals are captured than when it returns a descriptor. This means the dep hash differs. This is fine: for descriptor-returning thunks, `_key` is used as cache key (not dep hash). For Promise-returning thunks, different execution paths producing different captures is a pre-existing characteristic.

### Remove static `enabled`

The `enabled?: boolean` field is removed from `QueryOptions`. Affected locations:
- `query.ts` line 41: type definition
- `query.ts` line 163: destructuring with default
- `query.ts` line 234: initial loading state
- `query.ts` line 343, 385, 491, 594, 803: conditional checks
- `query.test.ts`: ~5 test cases using `enabled: false`

## Manifesto Alignment

| Principle | Alignment |
|---|---|
| **One way to do things** | Removes `enabled` option. The thunk IS the condition — no second mechanism. |
| **If it builds, it works** | Type system enforces valid return types. Overload ordering ensures correct generic inference. Invalid returns are compile errors. |
| **AI agents are first-class** | Single pattern: "return null to skip." LLMs don't need to choose between `enabled` vs conditional call vs null return. JSDoc on `query()` shows the pattern prominently. |
| **Explicit over implicit** | The skip condition is visible in the thunk body, not hidden in an options bag. |

## Non-Goals

- **Reactive `enabled` callback** — Rejected. The thunk body already handles reactivity. Adding `enabled: () => boolean` creates two ways to say "don't fetch."
- **Suspense integration** — Out of scope. Suspense is a separate concern.
- **Automatic retry on null → non-null transition** — Not needed. The reactive effect handles this automatically.
- **Multi-level SSR resolution for dependent chains** — Dependent queries resolve only one level deep during SSR (see Known Limitations). The client hydrates and completes the chain. Iterative SSR passes would add significant complexity for marginal benefit.

## Known Limitations

### SSR: Dependent chains resolve one level deep

SSR does two passes (discovery + render). During pass 1, a dependent query's thunk returns null because the parent hasn't resolved yet. After pass 1, `renderToHTML()` awaits registered promises — but it doesn't re-run dependent thunks. The dependent query has no data on the server.

The client hydrates, the parent data arrives, the dependent effect re-runs, and the chain completes on the client. This means dependent query data won't be in the initial SSR HTML — it loads client-side. This is acceptable for most use cases (comments, related data) and matches how TanStack Query + SSR works in React.

### Descriptor-in-thunk: no entity-store reactivity for mutations

When using `query(() => condition ? descriptor : null)`, entity metadata is set lazily on first non-null descriptor return. However, the `data` computed is bound to `rawData` at construction time (before entity metadata exists). This means:

- **Initial fetch works correctly** — data is normalized into the entity store and `rawData` is updated.
- **Mutations to the entity store (e.g., optimistic updates) are NOT reactively reflected** — because `data === rawData`, not the entity-store-backed computed.

For `query(descriptor)` (direct descriptor), entity metadata is known at construction time, so `data` reads from the entity store and reflects mutations reactively.

This is an acceptable tradeoff for Phase 1. The descriptor-in-thunk pattern is primarily for conditional fetching, and the direct descriptor pattern should be preferred when entity-store reactivity is needed.

## Unknowns

### Resolved: Dependency tracking on null return

**Q:** Are reactive dependencies tracked when the thunk returns null?
**A:** Yes. `setReadValueCallback` captures signal reads synchronously as the thunk executes. Reads happen before `return null`, so they're captured. The effect re-runs when those signals change.

### Resolved: Cache key on null return

**Q:** What happens to the cache key when the thunk returns null?
**A:** `depHashSignal` is still updated from the captured values. The cache key is computed but not used (no fetch happens). When the thunk later returns a descriptor, the descriptor's `_key` is used instead (not the dep hash).

### Resolved: QueryDescriptor is PromiseLike

**Q:** Will the effect accidentally `.then()` a descriptor, causing double-fetch?
**A:** No. The effect body checks `isQueryDescriptor(result)` FIRST, before any Promise handling. Only after confirming the result is NOT a descriptor is it treated as a Promise. This ordering is critical and enforced by the implementation.

## Type Flow Map

```
User thunk: () => QueryDescriptor<Issue, FetchError> | null
         ↓
query() overload resolution → descriptor-thunk overload (overload 2, before Promise overload)
         ↓
callThunkWithCapture() → QueryDescriptor<Issue, FetchError> | null
         ↓ (when non-null)
isQueryDescriptor(result) → true (checked FIRST — before treating as Promise)
         ↓
result._key → string (cache key: "GET:/api/issues/123")
result._entity → EntityQueryMeta { entityType: 'issue', kind: 'get' }
result._fetch() → Promise<Result<Issue, FetchError>>
         ↓
unwrap Result → Promise<Issue>
         ↓
handleFetchPromise → normalizeToEntityStore(data) → rawData.value = Issue
         ↓
QueryResult<Issue, FetchError>.data → Issue | undefined
QueryResult<Issue, FetchError>.idle → false (after first fetch)
QueryResult<Issue, FetchError>.error → FetchError | undefined (preserves E type)
```

### Type-level tests required (.test-d.ts)

```ts
// Overload 1: direct descriptor — preserves E type
const q1 = query(api.issues.get('1'));
// Expect: QueryResult<Issue, FetchError>

// Overload 2: descriptor-in-thunk — preserves E type
const q2 = query(() => condition ? api.issues.get('1') : null);
// Expect: QueryResult<Issue, FetchError>

// Overload 3: Promise-in-thunk — default E = unknown
const q3 = query(() => condition ? fetchIssue('1') : null);
// Expect: QueryResult<Issue, unknown>

// @ts-expect-error — enabled is removed
query(api.issues.get('1'), { enabled: false });

// @ts-expect-error — enabled: true is also removed
query(() => fetch('/api'), { enabled: true });

// @ts-expect-error — reactive enabled is also rejected
query(() => fetch('/api'), { enabled: () => true });

// @ts-expect-error — invalid return type
query(() => 42);
```

## E2E Acceptance Test

```ts
describe('Feature: query() null-return for conditional fetching', () => {
  describe('Given a thunk that returns null initially', () => {
    describe('When the thunk is passed to query()', () => {
      it('Then data is undefined, loading is false, and idle is true', () => {
        const result = query(() => null);
        expect(result.data).toBe(undefined);
        expect(result.loading).toBe(false);
        expect(result.idle).toBe(true);
      });
    });
  });

  describe('Given a thunk that reads a signal and returns null when signal is undefined', () => {
    describe('When the signal changes to a truthy value', () => {
      it('Then the thunk re-executes, idle becomes false, and data is fetched', async () => {
        const issueId = signal<string | undefined>(undefined);
        const result = query(() => {
          const id = issueId.value;
          if (!id) return null;
          return fetchIssue(id);
        });
        expect(result.idle).toBe(true);
        expect(result.loading).toBe(false);

        issueId.value = 'issue-1';
        await flushMicrotasks();

        expect(result.idle).toBe(false);
        expect(result.loading).toBe(true);
        // After fetch resolves:
        expect(result.data).toEqual({ id: 'issue-1', title: 'Test' });
      });
    });
  });

  describe('Given a thunk that returns a QueryDescriptor conditionally', () => {
    describe('When the dependency becomes available', () => {
      it('Then the descriptor _key is used as cache key and entity metadata works', async () => {
        const issueId = signal<string | undefined>(undefined);
        const result = query(() => {
          const id = issueId.value;
          if (!id) return null;
          return api.issues.get(id); // returns QueryDescriptor
        });

        expect(result.idle).toBe(true);

        issueId.value = 'issue-1';
        await flushMicrotasks();

        expect(result.idle).toBe(false);
        expect(result.data).toBeDefined();
      });
    });

    describe('When a mutation fires for the same entity type', () => {
      it('Then the query revalidates (mutation bus subscription works)', async () => {
        const issueId = signal<string | undefined>('issue-1');
        const result = query(() => {
          const id = issueId.value;
          if (!id) return null;
          return api.issues.get(id);
        });

        await flushMicrotasks();
        expect(result.data).toBeDefined();

        // Mutate → bus fires → query revalidates
        await api.issues.update('issue-1', { title: 'Updated' });
        await flushMicrotasks();

        expect(result.data.title).toBe('Updated');
      });
    });
  });

  describe('Given a thunk with debounce and null transition', () => {
    describe('When the thunk transitions from non-null to null', () => {
      it('Then the pending debounce timer is cleared', async () => {
        const issueId = signal<string | undefined>('issue-1');
        const result = query(() => {
          const id = issueId.value;
          if (!id) return null;
          return fetchIssue(id);
        }, { debounce: 200 });

        // Change dep → starts debounce
        issueId.value = 'issue-2';
        // Before debounce fires, set dep to undefined → null return
        issueId.value = undefined;
        await sleep(300);

        // The debounced fetch for 'issue-2' should NOT have fired
        expect(result.idle).toBe(false); // had fetched issue-1 initially
        expect(result.data?.id).toBe('issue-1'); // stale data from first fetch
      });
    });
  });

  describe('Given a deferred-by-UI-state query', () => {
    describe('When the user switches to the analytics tab', () => {
      it('Then the analytics query fetches', async () => {
        const activeTab = signal('details');
        const analytics = query(() => {
          if (activeTab.value !== 'analytics') return null;
          return fetchAnalytics(projectId);
        });

        expect(analytics.idle).toBe(true);
        expect(analytics.data).toBe(undefined);

        activeTab.value = 'analytics';
        await flushMicrotasks();

        expect(analytics.idle).toBe(false);
        expect(analytics.data).toBeDefined();
      });
    });
  });
});
```

## Implementation Plan

### Phase 1: Null-return support + idle signal + remove `enabled`

**Changes:**
1. Add `idle` signal to `QueryResult` (and register in signal-api-registry)
2. Update `callThunkWithCapture()` to return `unknown` (handle null + descriptor + promise)
3. Update effect body: null check → skip fetch, clear debounce
4. Descriptor detection in effect: `isQueryDescriptor()` FIRST, decompose to promise + key + metadata
5. Lazy entity metadata initialization (mutation bus, active query registry)
6. Update type signatures: new descriptor-in-thunk overload (before Promise overload)
7. Remove `enabled` from `QueryOptions`
8. Refactor SSR, hydration, mutation bus code that checked `enabled`
9. Add JSDoc example on `query()` showing the null-return pattern
10. Add `.test-d.ts` type flow tests for all overloads

**Acceptance criteria:**
```ts
describe('Phase 1: null-return + idle + descriptor-in-thunk', () => {
  describe('Given a thunk returning null', () => {
    it('Then idle is true, loading is false, data is undefined', () => {});
    it('Then reactive dependencies are tracked and effect re-runs on change', () => {});
    it('Then pending debounce timers are cleared on null transition', () => {});
  });

  describe('Given a thunk returning QueryDescriptor | null', () => {
    it('Then descriptor _key is used as cache key', () => {});
    it('Then descriptor _entity enables entity store normalization', () => {});
    it('Then mutation bus subscription activates on first non-null descriptor', () => {});
    it('Then E error type is preserved through overload resolution', () => {});
  });

  describe('Given a thunk returning Promise | null', () => {
    it('Then existing behavior is unchanged for non-null returns', () => {});
    it('Then null return skips fetch and sets idle: true', () => {});
  });

  describe('Given enabled option is passed', () => {
    it('Then TypeScript rejects it (removed from QueryOptions)', () => {});
  });

  describe('idle signal behavior', () => {
    it('Then idle starts true for null-returning thunks', () => {});
    it('Then idle becomes false after first non-null fetch', () => {});
    it('Then idle never transitions back to true', () => {});
  });
});
```

### Phase 2: Update examples and docs

**Changes:**
1. Update `examples/linear/src/pages/issue-detail-page.tsx` — convert to null-return for dependent queries
2. Update `examples/linear/src/pages/issue-list-page.tsx` — if applicable
3. Update `packages/mint-docs/` with:
   - Conditional query pattern (null-return)
   - Dependent query chains
   - Tab/section visibility deferral
   - Static vs reactive conditions guidance
   - `idle` signal usage
4. Remove any references to `enabled` option from docs

**Acceptance criteria:**
- Linear clone issue detail page uses null-return for dependent data
- Docs show the null-return pattern as the one way to conditionally fetch
- No references to `enabled` option anywhere
