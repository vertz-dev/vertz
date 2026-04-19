# Design Doc — `query()` Subscription Support (AsyncIterable Sources)

**Issue:** [#2846](https://github.com/vertz-dev/vertz/issues/2846)
**Forcing function:** Open-agents clone Gap #3 (live agent stream events). Independently useful for any Vertz app with live data.
**Status:** Rev 2 — three agent reviews addressed; pending human sign-off.
**Author:** Vinicius Dacal (with Claude Opus 4.7)
**Date:** 2026-04-19

---

## Problem

`query()` today fetches → caches → optionally polls. The thunk returns either a `Promise<T>` or a `QueryDescriptor<T,E>`; the result lands in `rawData.value` as a single snapshot (`packages/ui/src/query/query.ts:138-150`). There is no way to feed live data — agent stream events, WebSocket messages, server-sent events — into a query's reactive collection.

Consumers either:

- Reach for `refetchInterval` (`packages/ui/src/query/query.ts:56`), which is wasteful and latency-bound.
- Reinvent a parallel state world (manual signal + ad-hoc subscription + dispose plumbing per call site).

The framework already has a WebSocket client (`packages/ui/src/auth/access-event-client.ts:77-178`), but it only emits invalidations — it does not append data to a query.

The most concrete consumer right now is the open-agents clone: an `agent.stream(sessionId)` call yields `AgentEvent` objects (assistant tokens, tool calls, tool results) that the UI must render as they arrive. Same shape applies to chat apps, live dashboards, log tailing, presence streams, anything driven by an `AsyncIterable`.

---

## Goals

1. **One primitive, two modes** — the same `query()` accepts either a `Promise<T>` source (existing snapshot semantics) or an `AsyncIterable<T>` source (new accumulation semantics). No new top-level export, no `subscription()` sibling.
2. **Type-driven semantics** — the source's TypeScript type alone determines the data shape. `Promise<T>` → `data: T | undefined`. `AsyncIterable<T>` → `data: T[]`. No string-tagged `appendStrategy` knob.
3. **Lifecycle owned by the query** — when the query disposes (component unmount, HMR, parent scope teardown), the iterator is cancelled via `AbortSignal` *and* `iterator.return?.()`. No leaks on hot reload, no leaks on navigation.
4. **Errors surface on `.error`** — an iterator that throws sets `error.value` and stops iteration. The user can `refetch()` to restart.
5. **AbortSignal in every thunk** — *both* the stream thunk *and* the existing promise thunk gain a `signal: AbortSignal` parameter (Rev 2 — extended from streams-only after DX review). It's a no-op for legacy callers (parameter is optional in the runtime), and gives Promise consumers `fetch(url, { signal })` cancellation parity. LLMs already know this pattern; making it cross-mode removes the "why does only one overload have a signal?" footgun.

## Why now

The issue is the last gate before the open-agents clone (Gap #3 in `plans/open-agents-clone.md`, referenced from #2846) can render streamed agent output without a parallel manual-subscription world. It's also the smallest atomic primitive that unblocks every "live data" use case in Vertz apps — chat, dashboards, log tails, presence — without making each consumer roll its own dispose-on-HMR plumbing.

Cost: ~3-4 days of focused work on a single file (`query.ts`) plus a couple of helpers and docs. Risk is low: the change is purely additive — existing `Promise<T>` and `QueryDescriptor<T,E>` overloads are untouched at the source level, and the new branch is gated by `Symbol.asyncIterator` detection.

Deferring it forces every live-data consumer to re-implement dispose ordering, error mapping, HMR teardown, and AbortSignal threading by hand. That's exactly the parallel-state-world the issue calls out.

---

## Non-Goals

- **SSR for streams.** The whole point of an iterator is "data arrives over time." We can't meaningfully serialize a partial stream into HTML. Stream queries skip SSR entirely; on the client they start from `data: []`. Promise-based queries continue to SSR as today. **The pattern**: components that contain stream queries SSR fine — only the `data` array is empty during the SSR pass; the stream attaches on hydration. No `<Suspense>` boundary needed; the JSX (`messages.data.map(...)`) renders an empty list during SSR, then progressively fills.
- **Caching accumulated stream state across mounts.** A user navigating away and back will re-establish the iterator from scratch. v1 does not store the array snapshot in the query cache. **The user-land pattern** (called out explicitly in the docs page): wrap your iterator with cursor semantics — `agent.stream(sessionId, { since: lastEventId })` — so re-attachment resumes rather than starts over. This is exactly how every production stream consumer (chat, log tail, agent runs) already wants to work.
- **`refetchInterval` interop with streams.** Polling and streaming are mutually exclusive. Passing both is a usage error — we throw at the first effect run, *before* the iterator is opened, with a `VertzException` naming both options. (Rev 2 clarification: the check fires synchronously inside the first `lifecycleEffect` tick after we've classified the thunk's return type, not on every re-run.)
- **Stream-typed `QueryDescriptor` (deferred, not killed).** Descriptors today are HTTP-shaped (`_fetch()` returns `Promise<Result<T, E>>`). Extending them to streams is a separate, larger design (Server SDK + OpenAPI codegen + cache-key semantics). Stream support is **only via the function-thunk overload** in v1. **Forward path** (Rev 2 addition): when OpenAPI SDK codegen (`plans/openapi-sdk-codegen.md`, #2367) lands streaming endpoint support, the generated client will produce `(signal) => sdk.events.stream(args, { signal })` function-thunk wrappers — not new descriptor shapes. This design is the destination, not a temporary measure.
- **Multi-tenant stream re-auth.** v1 assumes single-tenant, single-session auth for the lifetime of the component. If the auth context changes mid-stream (tenant switch, role revocation, RLS rule change), the iterator does *not* re-validate. The component's parent scope is expected to unmount/remount the query when auth state changes (which happens naturally with the existing tenant-switch invalidation). Multi-tenant stream re-auth is deferred to the multi-level tenancy follow-up (#1787 family) once the RLS pipeline (`plans/1756-rls-pipeline.md`) settles. Documented as a known limitation in the "Live data" docs page.
- **Reducer / select / dedup hooks.** No `(prev, next) => merged` callback, no `select` projection. Users who want delta-merging produce the merged shape inside their iterator (the docs page ships a "Dedup wrapper" recipe). v1 stays minimal.
- **Backpressure / flow control.** AsyncIterable's natural backpressure (await on `next()`) is what we get; no extra knobs. High-rate stream perf (`coalesce` / `throttle`) is a documented v1 limitation; revisit when a real consumer hits a wall.
- **Mutating the array in place.** `data` is replaced with a fresh array on each yield. Vertz's keyed `__list` runtime makes the DOM update O(diff). The signal-graph cost (one notify per yield) is the documented trade-off — acceptable for the typical chat / agent-event rate (≤ ~100/sec), revisit only if a consumer streams thousands per second.
- **Server-side fan-out** (one iterator → multiple subscribers). v1 = one query instance owns one iterator. Multi-subscriber sharing belongs to a future broker primitive if real demand emerges.
- **Conditional source-type swap inside one query.** A thunk that returns an `AsyncIterable` on one run and a `Promise` on a later run is **a usage error**. We throw at runtime when the type changes mid-flight (Rev 2 addition — see Implementation Notes). This is preferred over silently re-shaping `data` from `T[]` ↔ `T | undefined`.

---

## API Surface

### Stream-backed query — canonical shape

```ts
import { query } from '@vertz/ui';
import { agent } from '~/agents/triage';

export function SessionTranscript({ sessionId }: { sessionId: string }) {
  const messages = query(
    (signal) => agent.stream(sessionId, { signal }),
    { key: ['session', sessionId, 'messages'] as const },
  );

  return (
    <div>
      {messages.loading && <Spinner />}
      {messages.error && <ErrorBanner error={messages.error} />}
      {messages.data.map((m) => (
        <Message key={m.id} message={m} />
      ))}
    </div>
  );
}
```

- `messages.data` is `AgentEvent[]` (inferred from `agent.stream(...)` returning `AsyncIterable<AgentEvent>`).
- Each yield appends to `data`.
- `messages.loading` is `true` until the first yield, then `false`.
- `messages.error` populates if the iterator throws; iteration halts.
- `messages.refetch()` cancels the current iterator, resets `data` to `[]`, starts fresh.
- `messages.dispose()` (or auto-cleanup on unmount) calls `signal.abort()` and `iterator.return?.()`.

### Every thunk receives an `AbortSignal` (Rev 2 — extended cross-mode)

Both overloads accept a `signal: AbortSignal` parameter on the thunk:

```ts
// Stream
query((signal) => agent.stream(sessionId, { signal }), { key: 'k' });

// Promise — also gets a signal now (Rev 2)
query((signal) => fetch('/api/tasks', { signal }).then((r) => r.json()), { key: 'k' });

// Legacy zero-arg promise thunks still work — the signal arg is optional at the call site
query(() => fetch('/api/tasks').then((r) => r.json()));
```

The signal is bound to the query's lifecycle in both modes:

- `dispose()` → `signal.abort()` (with `signal.reason = new QueryDisposedReason()`).
- `refetch()` → previous signal aborts, a fresh signal is passed to the next thunk call.
- Reactive dep change → same as `refetch()`: previous signal aborts, new signal for the new run.

This removes the asymmetry the DX review flagged ("signal exists for streams but not for promises → LLM reaches for it everywhere and trips up"). For Promise consumers, the signal is just a free `fetch()` cancellation hook. For stream consumers, it's the canonical lifecycle wiring.

**Compatibility:** existing zero-arg thunk callers are unchanged because the parameter is optional at the *call site* (TypeScript: `(...args: [AbortSignal] | []) => ...`). No migration needed.

### Type signatures

```ts
// packages/ui/src/query/query.ts (additions)

/** Options for a stream-backed query. */
export interface QueryStreamOptions {
  /** Explicit cache key. Required for stream queries — iterator thunks have no
   *  reliable string fingerprint and reactive-dep capture is undefined for
   *  iterators (their I/O happens after the first yield, not synchronously). */
  key: string | readonly unknown[];
  /** @internal — reserved; not used by stream queries in v1. */
  _entityMeta?: never;
}

/** Reason attached to the AbortSignal when the query disposes. */
export class QueryDisposedReason extends Error {
  constructor() {
    super('query() disposed');
    this.name = 'QueryDisposedReason';
  }
}

// New overload — must precede the existing Promise/Descriptor overloads so
// TS picks it for thunks that return AsyncIterable.
export function query<T>(
  thunk: (signal: AbortSignal) => AsyncIterable<T> | null,
  options: QueryStreamOptions,
): QueryStreamResult<T>;

// Existing overloads — unchanged.
export function query<T, E>(
  descriptor: QueryDescriptor<T, E>,
  options?: Omit<QueryOptions<T>, 'key'>,
): QueryResult<T, E>;
export function query<T, E>(
  thunk: () => QueryDescriptor<T, E> | null,
  options?: Omit<QueryOptions<T>, 'key'>,
): QueryResult<T, E>;
export function query<T>(
  thunk: () => Promise<T> | null,
  options?: QueryOptions<T>,
): QueryResult<T>;

/** Result of a stream-backed query. */
export interface QueryStreamResult<T> {
  /** Accumulated yields. Starts at [] (never undefined) — see "Always-array data" below. */
  readonly data: Unwrapped<ReadonlySignal<T[]>>;
  /** True until the first yield (or first error). */
  readonly loading: Unwrapped<ReadonlySignal<boolean>>;
  /**
   * True between a refetch()/restart and the next first yield, when data already exists.
   * Mirrors the Promise overload's `revalidating` (Rev 2 — added after DX review).
   */
  readonly reconnecting: Unwrapped<ReadonlySignal<boolean>>;
  /** Last error from the iterator. Iteration halts after this is set. */
  readonly error: Unwrapped<ReadonlySignal<unknown>>;
  /**
   * True when the thunk has not yet been invoked (e.g., returned null pending deps).
   * Becomes false on the first thunk call that returns an iterator — matches the
   * existing query() semantic where idle means "thunk hasn't run." (Rev 2 clarification.)
   */
  readonly idle: Unwrapped<ReadonlySignal<boolean>>;
  /** Cancel the current iterator, reset data to [], start a new iterator. */
  refetch: () => void;
  /** Alias for refetch. */
  revalidate: () => void;
  /** Cancel the iterator and clean up. */
  dispose: () => void;
}
```

Notes on the type design:

- **`key` is required for stream queries.** The existing `deriveKey()` strategy (`thunk.toString()` hash) is fragile for iterators because their identity often comes from runtime values (`sessionId`). Forcing an explicit key matches how every real consumer would name a stream anyway.
- **`key` accepts `readonly unknown[]`** in addition to `string`. Tuples are the LLM-natural way to express keys like `['session', id, 'messages']`. Internally we serialize tuples deterministically (the same scheme as React Query's hash).
- **No `revalidating`** on `QueryStreamResult` — the concept of "stale cached data while we re-fetch" doesn't apply to streams. `loading` covers the initial-pump state; subsequent yields don't toggle anything.

### Detection and source-type invariance (Rev 2 hardened)

`query()` distinguishes a stream thunk from a promise thunk by inspecting the *return value* of the first thunk call:

```ts
function isAsyncIterable(v: unknown): v is AsyncIterable<unknown> {
  return v != null && typeof (v as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function';
}
```

`Promise` does not have `Symbol.asyncIterator`; `AsyncIterable` does. No ambiguity *for a given run.*

**Source-type invariance.** Once the first non-null thunk return classifies the query as stream-mode or promise-mode, that classification is **locked**. If a later thunk re-run returns a value of the *other* kind, we throw a `VertzException` immediately, *before* writing to `rawData`. This prevents the "thunk conditionally returns Promise on Tuesday and AsyncIterable on Wednesday" footgun the technical review flagged. The error message is explicit:

> `query()` was first invoked with an AsyncIterable source and is locked to stream mode. The most recent thunk call returned a Promise. Conditional source-type swaps are not supported — split the work into two queries with distinct keys, or normalize both branches to one source shape.

A thunk returning `null` is always allowed (the existing "skip fetch / not ready" semantic). The lock is set on the first *non-null* return.

### Cache key serialization for tuple keys (Rev 2 specified)

`key` accepts `string | readonly unknown[]`. Tuples are serialized to strings via:

```ts
// packages/ui/src/query/key-serialization.ts (new)
export function serializeQueryKey(key: string | readonly unknown[]): string {
  if (typeof key === 'string') return key;
  return JSON.stringify(key, sortObjectKeys);
}
```

Where `sortObjectKeys` is a JSON.stringify replacer that recursively sorts object keys so `{a:1,b:2}` and `{b:2,a:1}` hash identically. This is the same shape React Query uses (`hashKey`). The serializer is exported and used everywhere a tuple key flows into the cache:

- `cache.set/get/delete` calls inside `query()`
- `invalidate(['session', id, ...])` matching logic in `packages/ui/src/query/invalidate.ts` (extended to accept tuple keys consistently)
- `customKey` derivation paths in the existing `query.ts`

**Backward compatibility:** existing string-key callers are unaffected. The tuple form is a strict addition — any tuple of JSON-serializable values (string, number, boolean, plain object, array) is supported. Functions, symbols, class instances, etc. throw a typed error at the serialization site, naming the offending position in the tuple.

### Helpers — opt-in, separate module

```ts
// packages/ui/src/query/sources.ts
export function fromWebSocket(url: string, signal: AbortSignal): AsyncIterable<MessageEvent>;
export function fromEventSource(url: string, signal: AbortSignal): AsyncIterable<MessageEvent>;
```

These are thin async-generator wrappers (~30 LOC each) so consumers don't have to write the `for-await + cancel + close` boilerplate every time. Re-exported from `@vertz/ui` so the canonical pattern is one import:

```ts
import { fromWebSocket, query } from '@vertz/ui';
const ticks = query((signal) => fromWebSocket('wss://stream.example/ticks', signal), {
  key: 'ticks',
});
```

`fromWebSocket` parses JSON when possible, yielding the parsed object; it surfaces `event.data` as-is for non-JSON messages. (Concrete shape settled in the implementation phase; this is the v1 baseline.)

### Mutual exclusion: `refetchInterval` + stream

Passing `refetchInterval` together with an iterator-returning thunk is a usage error. We throw a `VertzException` **on the first effect run that classifies the source as stream-mode**, *before* the iterator is opened — not lazily on the second yield, not silently on a later effect re-run. The throw fires synchronously inside the effect. Existing fake-timer test patterns will catch it without needing real time to pass.

Implementation note: `query.test.ts` already tests `refetchInterval` for promise queries with fake timers; the stream check sits adjacent in the same effect path, so the test infrastructure carries over.

### Error handling in iterators

```ts
async function* failingStream() {
  yield { id: '1', text: 'ok' };
  throw new Error('upstream gone');
}
const q = query(() => failingStream(), { key: 'fail' });

// after pump: q.data === [{id:'1',text:'ok'}]
// after pump: q.error.value instanceof Error
// after pump: q.loading.value === false
// further yields stop; user must call q.refetch() to restart
```

`refetch()` clears `data` to `[]`, clears `error`, starts a new iterator.

### Implementation Notes (Rev 2 — added after technical review)

These are the load-bearing implementation details surfaced by the technical review. They live in the design doc because they shape the public-facing behavior.

**1. `iterator.return?.()` rejection handling.** When `dispose()` or `refetch()` cancels an iterator, we both abort the signal *and* call `iterator.return?.()`. The return call is wrapped in a discarded promise: `void Promise.resolve(iterator.return?.()).catch(() => {})`. Producers that throw from `return()` (e.g., async cleanup that fails) never produce an unhandled rejection.

**2. Always-array `data`.** `data` is a `Signal<T[]>` initialized to `[]` and assigned a fresh array reference on every yield. Empty `data` is the *only* falsy state for stream queries — there is no `undefined`. Components render `messages.data.map(...)` unconditionally; an empty list renders nothing, which is the correct UX for "stream connecting" (`loading` lights up the spinner). This asymmetry with promise queries (`data: T | undefined`) is documented in the rendering recipes section of the docs page.

**3. `idle` semantics for streams.** Matches the existing query semantic: `idle` is true when the thunk has not yet been called (or returned `null`), and flips to false on the first non-null thunk return — *not* on the first yield. A long-delayed first yield (e.g., the iterator awaits a slow connection) shows `loading: true, idle: false, data: []`. The docs page surfaces this distinction so consumers know which signal to bind their UI to.

**4. Mutation event bus / entity store bypass.** Stream queries never set `_entityMeta` (the only API path is the function-thunk overload), so `entityMeta` stays `undefined` and the existing `entityMeta && !isSSR() && !unsubscribeBus` guards (`query.ts:1104-1106`) naturally short-circuit. No additional code path needed; an explicit comment is added there to document the bypass.

**5. HMR ordering.** Vertz's HMR runtime calls component `dispose()` *before* re-evaluating the module (this is the existing contract that already protects `domEffect`/`lifecycleEffect`). Stream queries piggyback on `_tryOnCleanup(dispose)` exactly like every other query, so HMR cleanup is synchronous. The `.local.ts` HMR test asserts on `signal.aborted === true` for the previous iteration's signal *before* the new module's first thunk call — verifying the contract end-to-end rather than relying on it.

**6. Reactive key change → automatic restart.** Stream queries get the same dep-tracking as promise queries via `lifecycleEffect`. When a reactive value used by the thunk (e.g., `currentSessionId.value`) changes, the effect re-runs: signal aborts, `iterator.return?.()` fires, a fresh thunk call constructs the new iterator. No `refetch()` call needed. The E2E test below covers this explicitly.

**7. `refetchInterval` mutual-exclusion at the type level.** Beyond the runtime throw, `QueryStreamOptions` *omits* `refetchInterval`, so the type-checker rejects the combination without needing a discriminated union shim. The runtime throw is defense-in-depth for cases the type system can't catch (e.g., dynamic option construction).

**8. Performance posture.** Stream queries do *not* call `retainKey`/`releaseCurrentKey` (those are tied to the orphan-aware MemoryCache eviction policy for promise-style cached values, which streams don't use). No leaked refs, no spurious cache touches. The accumulating array sits only in `rawData.value`; on dispose the signal is cleared and GC reclaims it.

---

## Manifesto Alignment

**Type Safety Wins.** The discriminator is the iterator's TypeScript type. `AsyncIterable<AgentEvent>` flows to `data: AgentEvent[]` automatically. There is no `appendStrategy: 'push' | 'replace'` for the LLM to mis-set; the wrong shape is a compile error, not a runtime surprise. The only runtime classification (`Symbol.asyncIterator` check) is a one-time discrimination on first thunk call.

**One Way to Do Things.** No new export. No new mental model — it's still `query(...)`. The thunk's shape is the only signal. We explicitly **rejected** the issue's `appendStrategy: 'push'` knob because it admits a class of mistakes (`{appendStrategy: 'replace'}` on an array source, or vice versa) that the type system already prevents when we let the source type drive semantics. We also rejected a sibling `subscription()` primitive — that doubles the API surface and forces consumers to switch tools when they discover their data became live.

**Production-Ready by Default.** Lifecycle is automatic: `dispose()` aborts the signal and calls `iterator.return?.()`; HMR re-mounts the query and a new iterator starts. No `useEffect`-style cleanup-by-convention; no leaks on hot reload.

**Predictability over convenience.** `key` is required for stream queries, even though we could try to derive one. A stream's identity always depends on runtime values (e.g., `sessionId`), so a derived key would be a footgun (one wrong inferred key → two iterators on the same stream). Required-and-explicit removes that ambiguity.

**Tradeoffs we accept (and reject):**

- **Rejected: `appendStrategy: 'push' | 'replace'`** (from the issue's sketch). Adds a runtime configuration knob the type system can already encode. LLMs would set it inconsistently.
- **Rejected: sibling `subscription()` primitive.** Two APIs for "reactive data over time" is exactly the ambiguity the manifesto warns against.
- **Rejected: caching accumulated array snapshots across mounts.** Adds dedup complexity (replay or skip?) for a use case (nav-back-to-stream) most consumers handle via cursor semantics in their own iterator.
- **Rejected: stream-typed `QueryDescriptor`.** Adds API surface (server SDK, OpenAPI codegen) that no concrete consumer needs in v1. Function-thunk overload is enough.
- **Accepted: stream queries cannot SSR.** The benefit of consistent cross-mode SSR isn't worth the cost of inventing partial-stream serialization. We document this clearly.

---

## Type Flow Map

Trace every generic from definition to consumer.

| Generic | Defined in | Flows through | Lands at |
|---|---|---|---|
| `T` (stream element) | `query<T>` overload signature | `(signal: AbortSignal) => AsyncIterable<T> \| null` thunk return → internal `AsyncIterator<T>` accumulator → `Signal<T[]>` | `data: T[]` consumed in JSX (`messages.data.map(m => ...)`, `m: T`) |
| `T` (Promise overload) | unchanged | unchanged | unchanged |
| `T, E` (descriptor overload) | unchanged | unchanged | unchanged |

Negative type tests in `query.test-d.ts`:

```ts
// Stream overload: missing key is a compile error.
// @ts-expect-error key is required
query((signal) => mockStream(), {});

// Stream overload: data is T[], not T.
const q = query(() => mockStream(), { key: 'k' });
const _expectArray: AgentEvent[] = q.data;
// @ts-expect-error data is AgentEvent[], not AgentEvent
const _expectScalar: AgentEvent = q.data;

// refetchInterval is incompatible with stream queries.
// @ts-expect-error refetchInterval not allowed on stream queries
query(() => mockStream(), { key: 'k', refetchInterval: 1000 });

// Promise overload: data is T | undefined (unchanged).
const p = query(() => Promise.resolve(42));
const _expectNumOrUndef: number | undefined = p.data;

// Stream thunk return type narrows correctly when AbortSignal is used.
query((signal) => {
  const ws = new WebSocket('wss://...');
  signal.addEventListener('abort', () => ws.close());
  return fromWebSocket('wss://...', signal); // AsyncIterable<MessageEvent>
}, { key: 'sock' });
```

No dead generics. Every type parameter on every overload is observed at the consumer.

---

## E2E Acceptance Test

End-to-end developer-perspective test that must pass before this is "done." Lives in `packages/ui/src/query/__tests__/query-stream.test.ts` (and `.local.ts` for the HMR/WebSocket bits).

```ts
import { describe, it, expect, vi } from '@vertz/test';
import { query } from '@vertz/ui';

describe('Feature: query() stream subscription', () => {
  describe('Given an AsyncIterable that yields three items', () => {
    describe('When the query is created', () => {
      it('then loading becomes false after the first yield and data accumulates in order', async () => {
        async function* stream() {
          yield { id: '1', text: 'a' };
          yield { id: '2', text: 'b' };
          yield { id: '3', text: 'c' };
        }
        const q = query(() => stream(), { key: 'acc-test' });

        expect(q.loading.value).toBe(true);
        expect(q.data.value).toEqual([]);
        expect(q.idle.value).toBe(true);

        // Drain the microtask queue — generator yields synchronously enough
        // that all three should land in one tick under fake timers.
        await vi.runAllTimersAsync();

        expect(q.loading.value).toBe(false);
        expect(q.error.value).toBeUndefined();
        expect(q.data.value.map((x) => x.id)).toEqual(['1', '2', '3']);
        expect(q.idle.value).toBe(false);
      });
    });
  });

  describe('Given an iterator that throws after one yield', () => {
    describe('When the query pumps the iterator', () => {
      it('then error is set and data preserves the items yielded before the throw', async () => {
        async function* failing() {
          yield { id: '1' };
          throw new Error('upstream gone');
        }
        const q = query(() => failing(), { key: 'err-test' });
        await vi.runAllTimersAsync();

        expect(q.data.value).toEqual([{ id: '1' }]);
        expect(q.error.value).toBeInstanceOf(Error);
        expect((q.error.value as Error).message).toBe('upstream gone');
        expect(q.loading.value).toBe(false);
      });
    });
  });

  describe('Given an iterator that respects AbortSignal', () => {
    describe('When the query disposes mid-iteration', () => {
      it('then the signal is aborted with QueryDisposedReason and no further yields land in data', async () => {
        let abortFired = false;
        async function* infinite(signal: AbortSignal) {
          signal.addEventListener('abort', () => { abortFired = true; });
          let i = 0;
          while (true) {
            if (signal.aborted) return;
            yield { id: String(i++) };
            await new Promise((r) => setTimeout(r, 10));
          }
        }
        const q = query((sig) => infinite(sig), { key: 'abort-test' });
        await vi.advanceTimersByTimeAsync(25);
        const before = q.data.value.length;
        q.dispose();
        await vi.advanceTimersByTimeAsync(50);

        expect(abortFired).toBe(true);
        expect(q.data.value.length).toBe(before);
      });
    });
  });

  describe('Given refetch is called mid-stream', () => {
    describe('When the new iterator yields', () => {
      it('then data is reset to [] and only new yields land', async () => {
        let invocation = 0;
        async function* makeStream() {
          invocation++;
          const tag = invocation;
          yield { id: `${tag}-1` };
          yield { id: `${tag}-2` };
        }
        const q = query(() => makeStream(), { key: 'refetch-test' });
        await vi.runAllTimersAsync();
        expect(q.data.value.map((x) => x.id)).toEqual(['1-1', '1-2']);

        q.refetch();
        expect(q.data.value).toEqual([]);
        await vi.runAllTimersAsync();
        expect(q.data.value.map((x) => x.id)).toEqual(['2-1', '2-2']);
      });
    });
  });

  describe('Given a stream backed by a reactive sessionId', () => {
    describe('When the sessionId changes', () => {
      it('then the previous iterator aborts and a new iterator starts for the new id', async () => {
        const sessionId = signal('s1');
        const opened: string[] = [];
        const aborted: string[] = [];
        async function* streamFor(id: string, signal: AbortSignal) {
          opened.push(id);
          signal.addEventListener('abort', () => { aborted.push(id); });
          yield { id: `${id}-msg-1` };
        }
        const q = query(
          (signal) => streamFor(sessionId.value, signal),
          { key: () => ['session', sessionId.value, 'messages'] as const } as never,
          // Note: shown as () => key for illustration; v1 derives the reactive key
          // from the thunk's reactive deps, no callback-key needed. See "Reactive
          // key change → automatic restart" in Implementation Notes.
        );
        await vi.runAllTimersAsync();
        expect(opened).toEqual(['s1']);
        expect(q.data.value.map((x) => x.id)).toEqual(['s1-msg-1']);

        sessionId.value = 's2';
        await vi.runAllTimersAsync();
        expect(aborted).toEqual(['s1']);
        expect(opened).toEqual(['s1', 's2']);
        expect(q.data.value.map((x) => x.id)).toEqual(['s2-msg-1']);
      });
    });
  });

  describe('Given a stream query that has yielded once', () => {
    describe('When refetch() is called', () => {
      it('then reconnecting is true between cancel and the next first yield', async () => {
        let resolveNext: (() => void) | undefined;
        async function* slowStream() {
          yield { id: '1' };
          await new Promise<void>((r) => { resolveNext = r; });
          yield { id: '2' };
        }
        const q = query(() => slowStream(), { key: 'reconnect-test' });
        await vi.runAllTimersAsync();
        expect(q.data.value).toEqual([{ id: '1' }]);
        expect(q.reconnecting.value).toBe(false);

        q.refetch();
        expect(q.data.value).toEqual([]);
        expect(q.reconnecting.value).toBe(true);
        await vi.runAllTimersAsync();
        expect(q.data.value).toEqual([{ id: '1' }]);
        expect(q.reconnecting.value).toBe(false);
      });
    });
  });

  describe('Given the thunk returns AsyncIterable on first run and Promise on second', () => {
    describe('When the deps change', () => {
      it('then a VertzException is thrown naming the source-type swap', async () => {
        let mode: 'stream' | 'promise' = 'stream';
        async function* s() { yield 1; }
        const q = query(
          () => (mode === 'stream' ? s() : Promise.resolve(2 as unknown as never)),
          { key: 'swap-test' },
        );
        await vi.runAllTimersAsync();
        mode = 'promise';
        expect(() => q.refetch()).toThrowError(/source-type/i);
      });
    });
  });

  describe('Given refetchInterval and a stream thunk together', () => {
    describe('When the query is constructed', () => {
      it('then construction throws a usage error', () => {
        async function* s() { yield 1; }
        expect(() => {
          // @ts-expect-error refetchInterval not allowed on stream queries
          query(() => s(), { key: 'bad', refetchInterval: 1000 });
        }).toThrow(/refetchInterval.*stream/i);
      });
    });
  });
});
```

Plus a `.local.ts` test (real WebSocket + HMR module re-evaluation) covering:

- `fromWebSocket()` end-to-end against a real `WebSocketServer`.
- HMR of the file containing the `query()` call disposes the previous iterator (verified via `signal.aborted === true` on the captured signal) before the new one starts.

---

## Unknowns

- **Q: Do we need to debounce array re-renders when an iterator yields very fast (e.g., 1k events/sec)?**
  Resolution: Not in v1. Vertz's keyed `__list` already keeps DOM diffing O(diff). If a real consumer hits a perf wall, we add an opt-in `coalesce: number` (ms) option later. Documented as a known consideration.

- **Q: Should stream queries support a `take` / `limit` option to cap the array size (e.g., last 100 items only)?**
  Resolution: No in v1. User can map their iterator (`async function* takeLast(src, n)`) — this is a five-line utility, not a framework concern. Revisit if every consumer ends up writing the same wrapper.

- **Q: Do we need a `Symbol.asyncDispose` integration for stream sources?**
  Resolution: Not yet — `iterator.return?.()` is the AsyncIterable cancellation contract and the wider TS ecosystem still treats `Symbol.asyncDispose` as opt-in. Worth revisiting when TS lib defaults catch up.

- **Q: Should `key` allow a function (`() => string | unknown[]`) to support reactive keys?**
  Resolution: Not in v1. The function-thunk overload's *thunk* already runs reactively (existing pattern), so reactive identity flows through the iterator's construction (`agent.stream(currentSessionId.value, ...)`). A separate reactive-key knob is redundant. Document the pattern.

---

## POC Results

**Question:** Can `query()`'s existing reactive plumbing absorb array-replacing yields without re-render storms or breaking the `data` computed?

**What was tried:** Source review of `packages/ui/src/query/query.ts` (Reading the `data` computed, `rawData.value = result` write semantics, and entity-backed branches) plus `packages/ui/src/__list/` runtime behavior on keyed array swaps.

**What was learned:**
- `rawData.value = newArray` triggers a single signal write → `data` computed re-evaluates once → keyed `__list` does an O(diff) DOM update. No re-render storm at moderate yield rates.
- The entity-backed branch (`entityMeta` set, `entityBacked.value === true`) is opt-in via `QueryDescriptor`. Stream queries are function-thunk only; they never enter that branch. The `data` signal collapses to `rawData` directly, which is the simple path.
- `dispose()` already supports composition with `_tryOnCleanup` so the parent component scope cleans up the iterator without changes.

**No separate POC PR.** Analysis-only; no architectural unknowns left.

---

## Phase plan (sketched here, broken into per-phase files after sign-off)

Each phase is a vertical slice: the first phase is end-to-end usable. Detailed task breakdown lives in `plans/query-subscriptions/phase-NN-*.md` after approval.

1. **Phase 1 — Stream overload (RED → GREEN E2E).** Add `QueryStreamResult`, `QueryStreamOptions`, the new overload, the `Symbol.asyncIterator` discriminator, and the iterator pump that appends yields to a `Signal<T[]>`. Acceptance: the first three describe-blocks of the E2E test pass.
2. **Phase 2 — Lifecycle (AbortSignal + iterator.return).** Wire `dispose()` to abort the signal and call `iterator.return?.()`; `refetch()` cancels and starts fresh; mutual-exclusion check for `refetchInterval`. Acceptance: dispose / refetch / mutual-exclusion describe-blocks pass.
3. **Phase 3 — Helpers.** Ship `fromWebSocket` and `fromEventSource` in `packages/ui/src/query/sources.ts`; export from `@vertz/ui`. Acceptance: a `.local.ts` integration test runs a real `WebSocketServer` and verifies messages flow into `data`.
4. **Phase 4 — HMR + docs.** `.local.ts` HMR test (module re-evaluation aborts the old iterator); docs pages in `packages/mint-docs/` (new "Live data" page, examples for agents and WebSockets). Acceptance: HMR test green, docs lint clean, changeset added.

---

## Definition of Done

- All four phases merged via the local-phase-workflow.
- E2E acceptance test (above) passes.
- `query.test-d.ts` covers every overload (positive + `@ts-expect-error` for the negatives listed in Type Flow Map).
- `.local.ts` HMR + WebSocket tests pass.
- Cross-package typecheck passes (`vtz run typecheck`).
- Docs in `packages/mint-docs/`: new "Live data with `query()` and AsyncIterable" page, plus a section on the agent-stream walkthrough referencing this primitive.
- Changeset `patch` (per `.claude/rules/policies.md`).
- Retrospective in `plans/post-implementation-reviews/query-subscriptions.md` after merge.

---

## Open questions for sign-off

These are the calls I want each reviewer to push back on if they disagree:

1. **Reject the `appendStrategy` knob** (issue's sketch) in favor of source-type-driven semantics. (Manifesto: type safety, one way.)
2. **Reject a sibling `subscription()` primitive** in favor of extending `query()`. (Issue agrees; flagging in case anyone pushes back during DX review.)
3. **Require explicit `key`** for stream queries (no `deriveKey` fallback). Defended on the grounds that stream identity is always runtime-value-dependent — derivation is a footgun.
4. **Drop SSR support** for stream queries; document explicitly. Promise/Descriptor SSR unchanged.
5. **No accumulated-state caching across mounts** in v1; document the cursor-based user-land pattern.
6. **Stream support is function-thunk only**; descriptors stay HTTP-shaped. OpenAPI codegen path documented.
7. **Forbid conditional source-type swaps** (Rev 2 — added per technical review). Throw on first detection, name the offending swap in the error.

## Sequencing — what depends on what (Rev 2)

This design is **shippable independently**. It doesn't block on `@vertz/agents` exposing `run()` as `AsyncIterable<AgentEvent>` (#2844, still open) — and `#2844` doesn't block on this design either. The two will compose naturally when both land. Phase 1 of this design demonstrates value with any user-supplied async generator (the test fixtures and walkthrough use the simplest possible mock); the open-agents clone (Gap #3) consumes it once both pieces are in place.

The competing-priority context per project memory: vtz test runner is the named "next priority," followed by primitives JSX migration, then this. This design is sized for ~3-4 days of focused work on a single file plus helpers and docs — small enough to slot in without pre-empting either of the larger initiatives. Multi-level tenancy and edge auth, both approved/in-flight, do not interact with v1 stream queries (see the multi-tenant non-goal).

## Review Resolutions (Rev 2)

Three adversarial reviews ran on Rev 1 (DX, product/scope, technical). Resolutions:

**DX review (4 blockers, 3 should-fix):**
- *Discrimination by shape alone confuses LLMs* → Hardened: source-type lock + explicit thrown error on swap (Implementation Notes #1, Detection section).
- *Required `key` asymmetry* → Defended in Manifesto Alignment with explicit reasoning; promoted to a numbered open question for sign-off (#3).
- *Dropped `revalidating` breaks porting* → Added `reconnecting: boolean` to `QueryStreamResult`; covered by new E2E test.
- *Signal in stream thunk only* → Extended `signal: AbortSignal` to the promise overload too. Cross-mode parity, free `fetch()` cancellation for promise consumers.
- *Always-array `data` divergence* → Documented the rendering pattern in Implementation Notes #2; docs page will lead with this.
- *AbortSignal threading footgun* → Docs page includes "what happens if you forget to wire the signal" (HMR test catches it; recipe shows the correct shape).
- *`fromWebSocket` naming* → Kept; reviewed as a less-invasive choice than `subscribeWebSocket` (which collides with the `subscription()` primitive we explicitly rejected). Will revisit in implementation if real consumer feedback flags it.

**Product/scope review (3 blockers, 3 should-fix):**
- *OpenAPI codegen incoherence* → Added forward-path paragraph in the Stream-typed Descriptor non-goal (`function-thunk wrappers from codegen`).
- *Multi-tenant / RLS conflict* → Added explicit "Multi-tenant stream re-auth" non-goal with deferral note to #1787 family.
- *`refetch()` on streams without reactive-key example* → Added E2E test case for `sessionId` reactive key change.
- *Cache persistence across nav* → Documented as user-land cursor pattern in the non-goal; not adding `cache: 'session' | 'browser'` knob in v1 (would multiply API surface for a pattern that's 3-line user-land code).
- *Sequencing with #2844* → Added Sequencing section; Phase 1 ships standalone with mock async generators.

**Technical review (3 blockers, 4 should-fix):**
- *Type discrimination + reactive re-runs* → Source-type lock with thrown error on swap (Detection section + new E2E test).
- *Iterator.return rejection unhandled* → Wrapped in `Promise.resolve(...).catch(() => {})` (Implementation Notes #1).
- *Cache key tuple serialization* → Specified `serializeQueryKey` shape and call sites (new section in API Surface).
- *Mutual-exclusion timing* → Specified "first effect run, before iterator opens" (rewrote the Mutual exclusion subsection).
- *`idle` semantics* → Specified "true until first non-null thunk return" (Implementation Notes #3 + clarified field doc).
- *HMR race* → Documented dependence on Vertz HMR's existing dispose-before-re-eval contract, with `.local.ts` test asserting the contract end-to-end (Implementation Notes #5).
- *Entity bus bypass* → Documented natural short-circuit (Implementation Notes #4).
- *Signal subscription cost / array perf* → Acknowledged as v1 trade-off in non-goals (high-rate streams), not blocking for chat / agent-event volumes.
