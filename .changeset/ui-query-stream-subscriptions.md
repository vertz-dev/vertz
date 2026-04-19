---
'@vertz/ui': patch
---

feat(ui): query() now accepts AsyncIterable sources for live data

`query()` accepts an `AsyncIterable<T>` source in addition to promises and SDK
descriptors. Each yield appends to a reactive `data: T[]` array — perfect for
chat transcripts, agent runs, log tails, live dashboards, presence streams.

```ts
import { query, fromWebSocket } from '@vertz/ui';

const ticks = query<TickEvent>(
  (signal) => fromWebSocket<TickEvent>('wss://stream.example/ticks', signal),
  { key: 'ticks' },
);

// In JSX
{ticks.data.map((t) => <Tick key={t.ts} tick={t} />)}
```

The query owns the iterator's lifecycle: `dispose()` (or auto-cleanup on
component unmount) calls `signal.abort()` *and* `iterator.return?.()`.
`refetch()` cancels and starts a fresh iterator, resetting `data` to `[]`
and flipping `reconnecting` to true. Reactive keys (e.g., a signal-backed
`sessionId`) automatically restart the iterator when their values change.

New public API:

- Stream overload of `query()` returning `QueryStreamResult<T>` (`data: T[]`,
  `reconnecting: boolean`, plus the existing `loading` / `error` / `idle` /
  `refetch` / `dispose`).
- `fromWebSocket<T>(url, signal)` and `fromEventSource<T>(url, signal)` helpers
  that yield JSON-parsed messages and close on `signal.abort()`.
- `QueryDisposedReason` (the `signal.reason` set on framework-initiated
  cancellations) and `QueryStreamMisuseError` (thrown for `refetchInterval`
  + stream, missing `key` on stream queries, or source-type swap mid-flight).
- `serializeQueryKey()` for tuple cache keys (recursively sorts object keys
  so `{a:1,b:2}` and `{b:2,a:1}` hash identically).
- The Promise overload's thunk now optionally accepts `(signal?: AbortSignal)`
  too, so signal-aware producers (e.g., `fetch(url, { signal })`) get
  cancellation parity. Existing zero-arg thunks continue to compile unchanged.

See `docs/guides/ui/live-data` for the full guide, including the cursor /
replay pattern, dedup wrapper, and lifecycle pitfalls.

Closes #2846.
