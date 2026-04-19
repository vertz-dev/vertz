# Phase 3 — Cross-mode signal + WebSocket/EventSource helpers

## Context

Phase 2 wired AbortSignal end-to-end for streams. Phase 3 makes the signal cross-mode (Promise overload also receives one — see design doc "Every thunk receives an AbortSignal" section), then ships the canonical async-generator wrappers consumers will use most often.

Read [`query-subscriptions.md`](../query-subscriptions.md) — sections "Every thunk receives an `AbortSignal`" and "Helpers".

## Tasks

### Task 1: Extend AbortSignal to the Promise overload

**Files (2):**
- `packages/ui/src/query/query.ts` (modify — Promise overload signature + signal threading)
- `packages/ui/src/query/__tests__/query-stream.test.ts` (extend — Promise-with-signal test)

**What to implement:**
1. Promise-thunk overload becomes:
   ```ts
   export function query<T>(
     thunk: (signal: AbortSignal) => Promise<T> | null,
     options?: QueryOptions<T>,
   ): QueryResult<T>;
   ```
   The parameter is optional at the call site (existing zero-arg thunks compile unchanged) — TypeScript's variadic-arg compatibility handles this.
2. The same `AbortController` machinery from Phase 2 powers Promise queries: `dispose()` aborts; `refetch()` aborts and creates a new one; reactive dep change aborts the old.
3. **Behavioral note:** the signal is threaded through but the existing in-flight tracking by cache key continues to work — abort is a *hint* to producers (`fetch(url, { signal })`) that they may stop early, not a framework guarantee that the resolved promise is dropped. The framework already discards stale resolutions via `fetchId`; abort is purely about saving the producer wasted work.

**Test case (RED first):**
- `Given a promise thunk that observes signal.aborted / When dispose() is called before resolution / Then signal.aborted is true`

**Acceptance criteria:**
- [ ] Promise-with-signal test passes
- [ ] All existing `query.test.ts` tests still pass (zero-arg thunks compile)
- [ ] Type tests cover both signatures: `(signal) => Promise<T>` and `() => Promise<T>`
- [ ] Quality gates clean

---

### Task 2: `fromWebSocket` + `fromEventSource` helpers

**Files (3):**
- `packages/ui/src/query/sources.ts` (new)
- `packages/ui/src/query/__tests__/sources.test.ts` (new — unit tests with mocked WS / ES)
- `packages/ui/src/query/index.ts` (modify — export `fromWebSocket`, `fromEventSource`)

**What to implement:**

```ts
// fromWebSocket — yields each parsed message; closes the socket on signal.abort.
export async function* fromWebSocket(
  url: string,
  signal: AbortSignal,
): AsyncIterable<unknown> {
  const ws = new WebSocket(url);
  signal.addEventListener('abort', () => { try { ws.close(); } catch {} });
  // Wait for open, then iterate events into a queue. On error or close, end.
  // Use a tiny producer/consumer queue (Promise<void> latch) so for-await delivers
  // messages in arrival order even when the consumer is slow.
}

// fromEventSource — same shape, parses event.data, closes on abort.
export async function* fromEventSource(
  url: string,
  signal: AbortSignal,
): AsyncIterable<unknown> { ... }
```

Each helper:
- Tries `JSON.parse(event.data)` and yields the parsed value; falls back to raw `event.data` on parse failure.
- Surfaces socket-level errors by throwing inside the generator (so the query's `.error` populates).
- Cleans up on `signal.abort` (close socket, drop listeners, resolve any pending awaiter).

**Test cases (use mock WebSocket / EventSource — no real server in `.test.ts`; real-server test in Phase 4 `.local.ts`):**
- `Given a WebSocket source that emits 3 messages / Then yields parse all 3 in order`
- `Given a WebSocket that emits a non-JSON message / Then yields raw string`
- `Given the AbortSignal fires / Then the socket closes and the iterator ends`
- `Given the WebSocket emits an error event / Then the iterator throws`

**Acceptance criteria:**
- [ ] All four describe-blocks pass with mocked sockets
- [ ] No `setTimeout` / `setInterval` / open-socket leaks reported by `vtz test`
- [ ] Helpers exported from `@vertz/ui`
- [ ] Quality gates clean

---

### Task 3: Phase 3 commit + adversarial review

**Files (1):**
- `reviews/query-subscriptions/phase-03-signal-and-helpers.md`

Same flow. Reviewer checks:
- Promise overload signal extension does not break any existing call site
- Helpers correctly close sockets on abort (no listener leaks)
- Helpers do not swallow real producer errors
- Mock WS / ES test patterns can't accidentally race the real timers under `vi.useFakeTimers()`

**Acceptance criteria:**
- [ ] Phase 3 commit on branch
- [ ] Review markdown with all findings resolved
- [ ] Quality gates green
