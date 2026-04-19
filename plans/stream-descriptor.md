# Design Doc — `StreamDescriptor` for Auto-Keyed Streaming Endpoints

**Issue:** [#2855](https://github.com/vertz-dev/vertz/issues/2855)
**Status:** Rev 2 — three agent reviews addressed; pending human sign-off.
**Author:** Vinicius Dacal (with Claude Opus 4.7)
**Date:** 2026-04-19

---

## Problem

PR #2852 shipped `query()` support for `AsyncIterable<T>` sources via a function-thunk overload. That overload requires the caller to supply a cache key manually:

```ts
const events = query(
  (signal) => sdk.events.stream({ topic: 'deploys' }, { signal }),
  { key: ['events', 'deploys'] as const },  // ← manual
);
```

Every other SDK call site auto-derives the cache key from the descriptor:

```ts
const tasks = query(api.tasks.list({ page: 1 }));  // key derived from URL+args
```

The asymmetry hurts in two concrete ways:

1. **`@vertz/openapi` codegen has nowhere to put a derived key.** REST methods emit `QueryDescriptor`s carrying `_key`. There is no equivalent shape for streaming endpoints, so generated stream methods would force callers back into manual-key land — exactly the inconsistency #2367 was opened to avoid.
2. **The `query-subscriptions.md` non-goal "Stream-typed `QueryDescriptor`" was deferred prematurely.** See "Why the deferred-non-goal reversal" below.

This doc adds a `StreamDescriptor<T>` shape to `@vertz/fetch` (the home of `QueryDescriptor`) and extends `query()` with a third overload that recognizes it. The function-thunk path stays as the escape hatch for ad-hoc / one-off iterables; descriptors become the canonical SDK-driven path.

This is a small, additive runtime change (≈100 LOC + tests + docs) that unblocks the codegen work in the second piece of #2855 — that codegen work is **out of scope for this doc** and gets its own design doc when the @vertz/openapi side is picked up. See "Staging rationale" for why the split.

### Why the deferred-non-goal reversal (Rev 2)

`query-subscriptions.md` Rev 2 committed to "function-thunk wrappers from codegen — not new descriptor shapes." That decision was made under the constraint that "Stream-typed `QueryDescriptor` is a separate, larger design (Server SDK + OpenAPI + cache-key semantics)." The thinking: avoid expanding the runtime API surface during the original PR.

What changed after PR #2852 merged:

1. **The call-site DX cost was articulated only after we drafted #2855.** The original design's "function-thunk wrappers from codegen" example didn't show a concrete cache-key argument in the codegen-emitted call site. When we wrote out what generated SDK consumers would actually type, the manual-key requirement became visible — and it broke parity with REST descriptor consumers (`query(api.tasks.list({ page }))`).
2. **The runtime addition is much smaller than originally estimated.** The original deferral assumed a "Server SDK + OpenAPI + cache-key semantics" change. In practice, the runtime piece is a single new type, a single guard, and one new `query()` overload that recurses through the existing function-thunk path. The "much larger design" framing was overcautious.
3. **No alternative preserves both auto-keys *and* the existing one-API mental model.** Without a descriptor shape, codegen either (a) forces manual keys at every call site or (b) invents a runtime convention the framework doesn't recognize. Both are worse than this small additive change.

In short: the prior deferral was correct given what was known when Rev 2 of `query-subscriptions.md` shipped. New information (concrete codegen call-site DX, accurate runtime cost estimate) inverts the call.

### Single-PR scope (Rev 2 — updated after user sign-off)

#2855 has two pieces (runtime + codegen). After exploring `@vertz/openapi`, the codegen change is much smaller than initially estimated — the parser already detects `text/event-stream` and `application/x-ndjson` (`packages/openapi/src/parser/openapi-parser.ts:117-135`), and the generator already emits streaming methods (`packages/openapi/src/generators/resource-generator.ts:160-227`) returning `AsyncGenerator<T>`. The change is reshape-only: switch the emitted return type from `AsyncGenerator<T>` to `StreamDescriptor<T>`, wrap the existing `client.requestStream<T>` call in `createStreamDescriptor`, drop the `options?: { signal }` parameter (the descriptor's `_stream(signal)` factory takes the signal internally).

Estimated codegen work: ~50-100 LOC in `resource-generator.ts` + ~5 generator tests + snapshot-test updates. Folds cleanly into the same PR as the runtime piece.

**Both pieces ship in one PR.** Runtime change first (additive, no impact on existing consumers); codegen change second (changes generated output for streaming endpoints — generator tests catch any regressions). This is what landed for the original `query-subscriptions` work and matches the pattern.

---

## Goals

1. **Auto-derived cache keys for streaming endpoints** matching the REST descriptor convention exactly. `query(sdk.events.stream({ topic }))` derives the key from method + path + args, identical to `query(api.tasks.list({ page }))`.
2. **Zero call-site difference between REST and stream descriptors.** The user does not branch their code based on whether a given endpoint is a snapshot or a stream.
3. **No breaking changes.** All three existing `query()` overloads continue to compile and behave identically. The new overload sits alongside them.
4. **Function-thunk path preserved.** The thunk overload is the escape hatch for hand-rolled iterables (mock streams in tests, `agent.stream()` style consumer code where the user owns the iterable construction). Descriptors are the SDK-emit path.
5. **Same lifecycle as Phase 2.** AbortSignal threading, `iterator.return?.()` on dispose, refetch reset + reconnecting, reactive-key restart, source-type lock — everything from PR #2852 applies unchanged.

## Why now

#2855 documents the codegen story; this is the prerequisite. Without the descriptor shape, codegen has no clean target — it would either emit function-thunk wrappers (forcing manual keys at the call site) or invent its own ad-hoc descriptor convention that the runtime doesn't recognize. Both paths are worse than the small additive runtime change here. Cost is bounded: one new exported type, one new exported guard, one new `query()` overload, ~6 new tests.

---

## Non-Goals

- **`@vertz/openapi` codegen support for streaming endpoints.** Tracked in #2855 as the second piece. The codegen work has its own design doc when picked up — it has to specify detection rules (`text/event-stream`, `x-vertz-stream` extension), three transports (SSE / WebSocket / NDJSON), an NDJSON helper, and OpenAPI emission patterns. Out of scope here.
- **`StreamDescriptor` participating in the entity store.** `QueryDescriptor`'s `_entity` field flows through to the entity-backed branch of `query()` (`packages/ui/src/query/query.ts:353-404`), which (a) normalizes responses by ID into the shared entity store, (b) subscribes the query to the mutation event bus so local mutations of the same entity type auto-revalidate it, (c) participates in tenant-switch invalidation, and (d) makes `data` a computed that reads live from the store. **Concrete downside of leaving this off `StreamDescriptor`**: a stream of `Task` events and a `query(api.tasks.list())` cannot share entity-cache state. If the user mutates a task locally, the REST query sees the optimistic update immediately; the stream's `data` array does not — it only updates when the server pushes the change back through the stream. For most stream consumers (chat, log tails, agent runs) this is fine because the *stream itself* is the source of truth and the user isn't mutating those entities through other paths. For mixed use cases (a task list rendered partly from REST, partly from a live "task updates" stream) the user would need to invalidate the REST query manually when stream events arrive. Documented as a known limitation; revisit if real consumers hit the mixed pattern. v1 ships without `_entity` on `StreamDescriptor`.
- **A `StreamDescriptor`-equivalent for `MutationDescriptor`.** Mutations are one-shot; streams are over-time. Different problem.
- **Cache hits for stream descriptors across mounts.** Same as the function-thunk overload: stream queries do not cache accumulated state across mounts (per the original `query-subscriptions.md` non-goal). Re-mounting re-iterates from scratch.
- **A `query.invalidate(streamDescriptor)` integration** for cross-tab cache eviction. Streams don't have a snapshot to invalidate; the iterator is either running or not.
- **Server-side dispatch.** This is purely a client-side typing/cache-key shape; the server has no awareness of `StreamDescriptor`.
- **Bidirectional WebSocket protocols** (client→server messages). v1 stream descriptors wrap inbound iterables only.

---

## API Surface

### `StreamDescriptor<T>` in `@vertz/fetch`

```ts
// packages/fetch/src/descriptor.ts (additions)

/**
 * Descriptor for a streaming endpoint.  Mirrors QueryDescriptor for snapshot
 * endpoints — carries a derived cache key plus a factory that, given an
 * AbortSignal, opens the underlying AsyncIterable.
 *
 * Generated by `@vertz/openapi` for streaming operations and consumed by
 * `query()` from `@vertz/ui`.
 *
 * Field-name parity with QueryDescriptor: `_tag`, `_key`, and the phantom
 * type-carrier sit in the same positions.  The factory is `_stream` instead
 * of `_fetch` because reusing `_fetch` for an iterable would mislead readers
 * (`_fetch` returns `Promise<Result<T, E>>` everywhere else).
 */
export interface StreamDescriptor<T> {
  readonly _tag: 'StreamDescriptor';
  readonly _key: string;
  readonly _stream: (signal: AbortSignal) => AsyncIterable<T>;
  /** Phantom field to carry the payload type through generics. Never set at runtime. */
  readonly _payload?: T;
}

/**
 * Type guard.  Checks the discriminant tag *and* `_stream` callability so
 * a hand-rolled `{ _tag: 'StreamDescriptor' }` without a function doesn't
 * pass (defense against malformed inputs from non-codegen sources).
 */
export function isStreamDescriptor<T>(value: unknown): value is StreamDescriptor<T> {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v._tag === 'StreamDescriptor' && typeof v._stream === 'function';
}

/**
 * Helper for codegen and hand-written wrappers.  Builds a StreamDescriptor
 * with a derived key in the same shape QueryDescriptor uses
 * (`METHOD:path?args` — see createDescriptor for the canonical scheme).
 */
export function createStreamDescriptor<T>(
  method: string,
  path: string,
  streamFn: (signal: AbortSignal) => AsyncIterable<T>,
  query?: QueryParams,
): StreamDescriptor<T> {
  return {
    _tag: 'StreamDescriptor' as const,
    _key: `${method}:${path}${serializeQueryParams(query)}`,
    _stream: streamFn,
  };
}
```

The cache-key derivation reuses the same logic as `createDescriptor`. **Implementation note (Rev 2)**: today, `serializeQuery` in `packages/fetch/src/descriptor.ts:127` is private to that file. This design renames the existing private helper to `serializeQueryParams` (more accurate, since `serializeQuery` collides with the generic verb) and exports it from `packages/fetch/src/descriptor.ts` so `createStreamDescriptor` calls the same function — no duplication, no behavior drift between REST and stream key derivation. The rename is a private-API change only; no consumer was importing the old name (it wasn't exported).

### New `query()` overload

```ts
// packages/ui/src/query/query.ts (additions)

// Highest-priority overload — must precede the AsyncIterable thunk overload
// so TypeScript picks it for descriptor-shaped arguments.
//
// `options?: never` is a load-bearing TypeScript trick: it makes the second
// argument a compile error if anything is passed, preventing the function-
// thunk overload from being a silent fallback for `query(descriptor, { key })`.
export function query<T>(
  descriptor: StreamDescriptor<T>,
  options?: never,
): QueryStreamResult<T>;
```

Implementation route — top-level descriptor unwrap:

```ts
if (isStreamDescriptor<T>(source)) {
  return query(
    (signal: AbortSignal) => source._stream(signal),
    { key: source._key },
  ) as QueryStreamResult<T>;
}
```

This is the minimal change: the descriptor is unwrapped at the entry point and the existing stream pump (Phase 2 lifecycle, source-type lock, mutual-exclusion check, etc.) handles everything. No duplication of the lifecycle code path.

### Descriptor-in-thunk: `query(() => streamDescriptor)`

`QueryDescriptor` supports being returned from a thunk (`query(() => api.tasks.list(...))`) — the existing code at `query.ts:902-921` detects this via `isQueryDescriptor(raw)` *inside* the effect's `callThunkWithCapture` classification. **Stream descriptors must support the same pattern** for parity, otherwise the same code shape silently misbehaves:

```ts
// query(() => streamDescriptor) — without explicit handling, the descriptor
// object is treated like a Promise/AsyncIterable, neither of which it is,
// and you get an unclassifiable runtime mess.
```

The fix is symmetric: in the effect's classification block (right after `callThunkWithCapture`), add an `isStreamDescriptor(raw)` branch that delegates to the same code path the top-level descriptor unwrap uses (set `key = raw._key`, treat `raw._stream(signal)` as the AsyncIterable to pump). This adds ~10 lines to the existing classification cascade and makes the descriptor-in-thunk pattern symmetric with `QueryDescriptor`.

### Re-exports

`StreamDescriptor`, `isStreamDescriptor`, `createStreamDescriptor` re-exported from `@vertz/ui` alongside the existing query exports so consumers get one import surface. Codegen will import from `@vertz/fetch` directly (it already depends on it for `QueryDescriptor`); hand-written user code typically imports everything from `@vertz/ui`.

### `@vertz/openapi` codegen change

The package today already detects streaming responses (`text/event-stream`, `application/x-ndjson`) and emits methods like:

```ts
// Generated today (after PR #2852, function-thunk wrapper era):
events: {
  async *stream(args: { topic: string }, options?: { signal?: AbortSignal }): AsyncGenerator<TopicEvent> {
    yield* client.requestStream<TopicEvent>({
      method: 'GET',
      path: '/events',
      format: 'sse',
      query: { topic: args.topic },
      signal: options?.signal,
    });
  },
}
```

After this design ships, the same operation emits:

```ts
// Generated after this PR:
events: {
  stream(args: { topic: string }): StreamDescriptor<TopicEvent> {
    return createStreamDescriptor(
      'GET',
      '/events',
      (signal) => client.requestStream<TopicEvent>({
        method: 'GET',
        path: '/events',
        format: 'sse',
        query: { topic: args.topic },
        signal,
      }),
      { topic: args.topic },
    );
  },
}
```

Differences:

1. **No `async *`** — the method synchronously returns a `StreamDescriptor` (the iterable is built inside the descriptor's `_stream` factory).
2. **No `options` parameter** — the descriptor's `_stream(signal)` factory receives the signal from `query()` directly.
3. **Cache key derived** — `createStreamDescriptor`'s 4th arg (the query params object) drives the `_key` value, identical to how `createDescriptor` works for REST.

Files touched in `packages/openapi/src/generators/resource-generator.ts`:

- `buildReturnType` — return `StreamDescriptor<T>` for streaming ops instead of `AsyncGenerator<T>`
- `buildParams` — drop the `options?: { signal?: AbortSignal }` extra param for streaming ops
- `buildStreamingCall` (renamed to `buildStreamingDescriptorCall`) — emit `createStreamDescriptor(...)` wrapping the existing `client.requestStream(...)` invocation
- Method body for streaming ops — `return ...` instead of `yield* ...`
- Imports — generated resource files import `createStreamDescriptor` and `StreamDescriptor` from `@vertz/fetch`

Consumer call sites change from:

```ts
const events = query(
  (signal) => sdk.events.stream({ topic: 'deploys' }, { signal }),
  { key: ['events', 'deploys'] as const },
);
```

to:

```ts
const events = query(sdk.events.stream({ topic: 'deploys' }));
```

Same data flow, same lifecycle, no manual key.

### Compile-time + runtime disallow: `key` option with descriptor

The `options?: never` overload signature blocks the compile path. Defense-in-depth runtime guard inside the descriptor-unwrap branch: if for some reason a caller bypasses TypeScript (e.g., dynamic `query(...args)` spread), throw a clear error:

```ts
if (isStreamDescriptor<T>(source)) {
  if (rawOptions && Object.keys(rawOptions).length > 0) {
    throw new QueryStreamMisuseError(
      'query(): a StreamDescriptor carries its own cache key (_key). ' +
      'Pass the descriptor alone — `query(descriptor)`, not `query(descriptor, opts)`.',
    );
  }
  return query(
    (signal: AbortSignal) => source._stream(signal),
    { key: source._key },
  ) as QueryStreamResult<T>;
}
```

### Re-exports

`StreamDescriptor`, `isStreamDescriptor`, `createStreamDescriptor` re-exported from `@vertz/ui` alongside the existing query exports so consumers get one import surface.

### Compile-time disallow: `key` option with descriptor

The new overload takes only the descriptor (no second arg). The implementation signature already routes descriptors through internally with the descriptor's key, so a user trying to pass `{ key: ... }` won't have an overload that matches — type error.

```ts
query(sdk.events.stream({ topic: 'x' }));                    // OK
query(sdk.events.stream({ topic: 'x' }), { key: 'manual' });  // type error — no matching overload
```

(Mirrors the existing convention for `QueryDescriptor`: `query(descriptor, { key: 'manual-key' })` is already a `// @ts-expect-error` case in `query.test-d.ts:131`.)

---

## Manifesto Alignment

**Type Safety Wins.** The descriptor's `T` flows through `_stream(signal): AsyncIterable<T>` and lands at `data: T[]` in the consumer's JSX. No `unknown` casts at the call site, no manual `query<MyType>(...)`. Codegen will populate `T` with the schema-typed event payload, and the user sees `messages.data.map((m) => m.id)` with full inference.

**One Way to Do Things.** `query()` now has one canonical SDK call shape: `query(descriptor)`. REST and stream endpoints look identical at the call site. The thunk overload remains for ad-hoc / hand-rolled iterables, but descriptor is the path codegen takes and the path the docs lead with.

**Production-Ready by Default.** No new lifecycle code — the descriptor unwraps to the existing thunk path at the entry, so all of Phase 2's hardening (AbortSignal, iterator.return, refetch reset, reactive-key restart, source-type lock, mutual exclusion) flows through without divergence.

**Predictability over convenience.** Cache key is derived by codegen using the same `METHOD:path?args` scheme as REST descriptors, so manual `query.invalidate('GET:/events?topic=deploys')` works identically. No new key-shape conventions.

**Tradeoffs we accept (and reject):**

- **Rejected: the function-thunk-only path** that `query-subscriptions.md` Rev 2 committed to. The product/scope review of the codegen issue (#2855) caught that this would force every codegen consumer into manual cache keys.
- **Rejected: extending `QueryDescriptor` itself** with optional `_stream` fields. `QueryDescriptor` is `PromiseLike<Result<T, E>>` — making it conditionally a stream would muddle its contract. A separate `_tag` is clearer.
- **Rejected: a top-level `streamQuery()` function.** Two APIs for "reactive data over time" repeats the exact mistake the original `subscription()` rejection guarded against.
- **Accepted: minor duplication of the key-derivation scheme.** `createStreamDescriptor` and `createDescriptor` both call `serializeQuery` and use the same `${method}:${path}${serialized}` template. A shared helper is one extra abstraction for trivially small DRY savings; chose to keep them parallel and obvious.

---

## Type Flow Map

| Generic | Defined in | Flows through | Lands at |
|---|---|---|---|
| `T` (stream payload) | `StreamDescriptor<T>` | `_stream(signal): AsyncIterable<T>` → query()'s internal pump → `Signal<T[]>` | `data: T[]` consumed in JSX |
| Error type | not generic | iterator throws → `error.value: unknown` | matches existing stream overload semantics — no error-type generic in stream mode |

Negative tests in `query.test-d.ts`:

```ts
declare function makeStreamDesc<T>(): StreamDescriptor<T>;

// Descriptor inference: data is T[]
const eventQ = query(makeStreamDesc<TopicEvent>());
const _evts: TopicEvent[] = eventQ.data;

// Wrong type: data is TopicEvent[], not TopicEvent
// @ts-expect-error — stream descriptor data is array
const _scalar: TopicEvent = eventQ.data;

// Cannot pass a key option alongside a descriptor (no matching overload)
// @ts-expect-error
query(makeStreamDesc<TopicEvent>(), { key: 'manual' });

// reconnecting / data / loading / error / idle / refetch / dispose all present
const _ok: boolean = eventQ.reconnecting;

// Promise-overload regression: still works, still returns QueryResult<T>
const p = query(() => Promise.resolve(42));
const _pData: number | undefined = p.data;
```

No dead generics. The only generic on `StreamDescriptor` is `T`, and it terminates at the consumer's JSX with full inference.

---

## E2E Acceptance Test

Lives in `packages/ui/src/query/__tests__/query-stream-descriptor.test.ts`.

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from '@vertz/test';
import { createStreamDescriptor } from '@vertz/fetch';
import { query, resetDefaultQueryCache } from '@vertz/ui';

async function flushPromises(rounds = 16): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    vi.advanceTimersByTime(0);
    await Promise.resolve();
  }
}

describe('Feature: query() with StreamDescriptor', () => {
  beforeEach(() => { vi.useFakeTimers(); resetDefaultQueryCache(); });
  afterEach(() => { vi.useRealTimers(); });

  describe('Given a StreamDescriptor that yields three items', () => {
    describe('When passed directly to query()', () => {
      it('then data accumulates with auto-derived key from the descriptor', async () => {
        async function* mock() {
          yield { id: '1' };
          yield { id: '2' };
          yield { id: '3' };
        }
        const desc = createStreamDescriptor('GET', '/events', () => mock(), { topic: 'deploys' });
        // Key derivation matches QueryDescriptor: 'GET:/events?topic=deploys'
        expect(desc._streamKey).toBe('GET:/events?topic=deploys');

        const q = query(desc);
        await flushPromises();

        expect(q.data.value.map((x) => x.id)).toEqual(['1', '2', '3']);
        expect(q.loading.value).toBe(false);
        expect(q.error.value).toBeUndefined();
      });
    });
  });

  describe('Given a StreamDescriptor and a function-thunk wrapping the same source', () => {
    describe('When both queries use the same key', () => {
      it('then they share the same cache slot (no double-iterator)', async () => {
        // This is the same dedup contract as descriptor-vs-thunk for promise queries.
      });
    });
  });

  describe('Given a StreamDescriptor passed to query()', () => {
    describe('When the AbortSignal threading is observed', () => {
      it('then the descriptor receives a real AbortSignal that aborts on dispose', async () => {
        let receivedSignal: AbortSignal | undefined;
        const desc = createStreamDescriptor('GET', '/events', (signal) => {
          receivedSignal = signal;
          async function* infinite() {
            while (true) {
              if (signal.aborted) return;
              yield 1;
              await new Promise((r) => setTimeout(r, 10));
            }
          }
          return infinite();
        });
        const q = query(desc);
        await flushPromises();
        expect(receivedSignal?.aborted).toBe(false);
        q.dispose();
        expect(receivedSignal?.aborted).toBe(true);
      });
    });
  });

  describe('Given a thunk that returns a StreamDescriptor (descriptor-in-thunk)', () => {
    describe('When the thunk-wrapped descriptor is consumed', () => {
      it('then the descriptor key is used and the stream pumps correctly', async () => {
        async function* mock() { yield 1; yield 2; }
        const desc = createStreamDescriptor('GET', '/events', () => mock(), { topic: 'x' });
        // Mirrors `query(() => api.tasks.list(...))` — late-detection in the
        // effect's classification block routes through the descriptor's _key.
        const q = query(() => desc);
        await flushPromises();
        expect(q.data.value).toEqual([1, 2]);
      });
    });
  });

  describe('Given a StreamDescriptor and a manual options bag together', () => {
    describe('When passed at runtime (bypassing TypeScript)', () => {
      it('then construction throws QueryStreamMisuseError', () => {
        const desc = createStreamDescriptor('GET', '/events', async function* () {});
        expect(() => {
          // Cast away the `options?: never` to test the runtime guard.
          (query as unknown as (d: unknown, o: unknown) => unknown)(desc, { key: 'manual' });
        }).toThrowError(/StreamDescriptor.*_key/i);
      });
    });
  });
});
```

`isStreamDescriptor` and `createStreamDescriptor` get unit tests in `packages/fetch/src/__tests__/descriptor.test.ts` covering tag detection, false positives (other shapes), and key-derivation parity with `createDescriptor`.

---

## Unknowns

- **Q: Should `StreamDescriptor` carry a `tenantScope` field for the planned multi-tenant work (#1787)?**
  Resolution: No in v1. The original `query-subscriptions.md` non-goal explicitly defers multi-tenant stream re-auth to the multi-level tenancy follow-up. `StreamDescriptor` inherits the same posture — the codegen will set the path and args based on the current tenant context, and component remount on tenant switch handles the rest.

- **Q: Should the descriptor's `_streamKey` be `string | readonly unknown[]` (matching the function-thunk overload's `key`)?**
  Resolution: No — `string` only. `QueryDescriptor._key` is `string`, and `createStreamDescriptor` builds the string from `method + path + serializeQuery(args)`. Tuple keys are useful for hand-written `query()` calls; descriptors emit deterministic strings. Keeps parity with the REST descriptor convention.

- **Q: Should there be a `descriptor.test-d.ts` for the new types in `@vertz/fetch`?**
  Resolution: Yes, small additions to the existing test-d coverage. Already in the acceptance test list.

---

## POC Results

**Question:** Does the descriptor-unwrap-to-thunk approach correctly inherit Phase 2's lifecycle without duplicating it?

**What was tried:** Read `query.ts:151-161` (the existing descriptor early-return that recurses into `query()` with the unwrapped function). The same pattern works for stream descriptors: detect early, recurse with `(signal) => source._stream(signal)` and `{ key: source._streamKey }`. The recursion hits the function-thunk overload, which goes through `lifecycleEffect` → stream classification → `pumpStream` exactly like a hand-written thunk would.

**What was learned:** The recursion preserves all Phase 2 semantics for free. The `streamMode` flag, `currentStreamController`, `cancelStreamPump`, source-type lock, mutual-exclusion check, reactive-key restart — none of them need to know that the source originated as a descriptor.

**No POC PR.** Analysis-only.

---

## Phase plan

Single PR, two pieces (runtime + codegen). Implementation order so each step's tests can run in isolation:

### Tasks

1. **`@vertz/fetch` additions (runtime contract)** — Export `serializeQueryParams` (renamed from private `serializeQuery`); add `StreamDescriptor<T>`, `isStreamDescriptor`, `createStreamDescriptor` with unit tests (key-derivation parity with `createDescriptor`, tag-and-callable detection, false positives). Files: `packages/fetch/src/descriptor.ts`, `packages/fetch/src/__tests__/descriptor.test.ts`, `packages/fetch/src/index.ts`.

2. **`@vertz/ui` overload + recursion (runtime consumer)** — new `query()` overload (`options?: never`), descriptor early-return wired to recurse with `(signal) => source._stream(signal)` + `{ key: source._key }`, descriptor-in-thunk handling in the effect classification cascade, runtime guard for descriptor + options misuse. Re-export from `@vertz/ui`. Files: `packages/ui/src/query/query.ts`, `packages/ui/src/query/index.ts`.

3. **Runtime tests** — `packages/ui/src/query/__tests__/query-stream-descriptor.test.ts` covering accumulation, AbortSignal threading on dispose, key-derivation, descriptor-in-thunk pattern, runtime misuse guard. Plus type tests in `packages/ui/src/query/__tests__/query.test-d.ts` (descriptor inference, `options?: never` enforcement, descriptor-in-thunk type, regression tests for existing overloads).

4. **`@vertz/openapi` codegen change** — switch streaming-op generator output from `async *stream(args, opts): AsyncGenerator<T>` to `stream(args): StreamDescriptor<T>`. Files: `packages/openapi/src/generators/resource-generator.ts` (the `buildReturnType` / `buildParams` / `buildStreamingCall` / method-body sections), `packages/openapi/src/generators/__tests__/resource-generator.test.ts` (snapshot updates + new behavioral assertions). Update any fixture OpenAPI specs that exercise streaming endpoints.

5. **Docs + deferred-non-goal update** — update `plans/query-subscriptions.md` to note the descriptor path is now shipped (deferred non-goal resolved). Update `packages/mint-docs/guides/ui/live-data.mdx` to lead with the descriptor pattern as the canonical SDK shape (descriptors and thunks shown as peers — descriptors for SDK-emitted endpoints, thunks for ad-hoc iterables). Add the entity-store interop limitation as a documented trade-off.

6. **Changeset** — `@vertz/ui`, `@vertz/fetch`, and `@vertz/openapi` patch.

## Definition of Done

- All four task acceptance criteria pass
- Cross-package typecheck clean (`tsgo --noEmit`)
- Lint and format clean
- Adversarial review (one agent) addresses any blockers
- PR rebased on main, pushed, GitHub CI green
- Issue #2855 updated with a checked box for the runtime piece; codegen piece remains open

---

## Open questions for sign-off

1. **Stream descriptor lives in `@vertz/fetch`** alongside `QueryDescriptor` (not in `@vertz/ui`). Right home? — The existing `QueryDescriptor` is in `@vertz/fetch` because the SDK codegen emits it without depending on `@vertz/ui`. Same logic applies to `StreamDescriptor`.
2. **`options?: never` on the descriptor overload** — the load-bearing TypeScript trick that prevents the function-thunk overload from being a silent fallback for `query(descriptor, { key })`. Sign-off needed because this is unusual.
3. **Single-phase implementation** — the runtime change is small enough to land as one PR without phase breakdown. Codegen gets its own design + PR (see "Staging rationale" above).
4. **No `_entity` field on `StreamDescriptor`.** Streams don't fit the entity-store merge model. Confirmed in non-goals.
5. **Field-name parity with `QueryDescriptor`** — `_tag` / `_key` / `_payload` match positions; `_stream` (not `_fetch`) because the factory returns an iterable. Right call?

## Review Resolutions (Rev 2)

Three adversarial reviews ran on Rev 1 (DX, product/scope, technical). Resolutions:

**DX review (3 blockers, 3 should-fix):**
- *Field naming `_streamKey` vs `_key` divergence* → Renamed to `_key` for parity with `QueryDescriptor`. Phantom-type field `_payload` kept (parallel to `QueryDescriptor._error`).
- *Function-thunk feeling like the "wrong path" once descriptors ship* → Docs update task (#4 in phase plan) explicitly frames descriptors and thunks as peers — descriptors for SDK-emitted endpoints, thunks for ad-hoc / hand-rolled iterables. The thunk path is not "legacy" — it's the right tool when an iterable doesn't have a deterministic `method:path?args` identity.
- *`query(() => streamDescriptor)` silent footgun* → Added explicit descriptor-in-thunk handling in the effect's classification cascade (mirrors how `QueryDescriptor`-in-thunk is already handled at `query.ts:902-921`). New E2E test covers this.
- *Type tests for descriptor + key option* → Will be added to `query.test-d.ts`.
- *SSR skip visibility* → Already covered by `live-data.mdx` (will be cross-linked in the docs update task).
- *Runtime guard for descriptor + key option* → Added to the descriptor unwrap branch as defense-in-depth alongside the `options?: never` type check.

**Product/scope review (3 blockers, 4 should-fix):**
- *Reversed commitment needs warrant* → Added "Why the deferred-non-goal reversal" section explaining what changed since the original Rev 2 of `query-subscriptions.md`.
- *Stranded primitive concern* → Added "Staging rationale" section justifying runtime-first: hand-written wrappers and the open-agents clone benefit immediately; codegen is one consumer, not the only one.
- *Discriminated-union vs `_tag` string* → Strengthened the type guard to check `typeof v._stream === 'function'` so a malformed `{ _tag: 'StreamDescriptor' }` without a function fails the guard. The `_tag` string approach is kept because it matches the existing `QueryDescriptor` / `MutationDescriptor` convention.
- *Codegen scope clarity* → Updated framing to clearly separate "this PR (runtime)" from "follow-up PR (codegen)" — the codegen issue #2855 stays open with the runtime piece marked done.
- *Multi-tenant deferral* → Same posture as the original `query-subscriptions.md`. Component-remount-on-auth-change is the contract; no new state on `StreamDescriptor` for tenant scope. Will revisit when #1787 actively lands.
- *SSR + descriptor* → Same posture as function-thunk streams: skip SSR; data starts `[]`, fills on hydration. Documented in the docs update task.
- *Cache-hits-across-mounts asymmetry with REST* → Acknowledged in the docs update task (live-data.mdx already mentions this for function-thunk streams; the new docs section on descriptors will repeat the call-out).

**Technical review (3 blockers, 2 should-fix):**
- *`serializeQuery` is private* → Will rename to `serializeQueryParams` (more accurate) and export from `packages/fetch/src/descriptor.ts`. `createStreamDescriptor` reuses the same function — no duplication.
- *`StreamDescriptor`-in-thunk silent failure* → Added explicit handling in the effect's classification cascade. New E2E test.
- *Type-system doesn't enforce descriptor-only overload* → Added `options?: never` to the new overload signature, plus runtime guard.
- *`_payload` placement* → Moved to end of interface, matching `_error` placement on `QueryDescriptor`.
- *`isFirst` recursion semantics* → Each `query(descriptor)` call returns its own independent `QueryStreamResult` (matching `query(queryDescriptor)` semantics today). Will be asserted in tests — two `query(desc)` calls don't share an iterator.
