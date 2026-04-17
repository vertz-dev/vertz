---
'@vertz/runtime': patch
---

fix(vtz): `node:http.createServer()` + `listen()` + `fetch()` + `close()` no longer hangs under the vtz test runner (resolves #2718, #2720)

The synthetic `node:http` module exposed `createServer()` whose `listen()`
implementation treated `globalThis.__vtz_http.serve()` as asynchronous —
but `serve()` is a synchronous op that returns the server object directly.
The resulting `.then()` on a non-thenable threw a `TypeError` that was
swallowed by the `new Promise((resolve) => server.listen(0, resolve))`
idiom, so the listen callback never fired and tests hung at the 120 s
watchdog. The same bug existed in the CJS `require('http')` shim.

Fixing the shim surfaced three secondary defects in the underlying op
layer:

- **`close()` aborted the axum task immediately**, cancelling in-flight
  response futures mid-reply so clients hung on `fetch()`. Replaced the
  abort-handle teardown with axum's `with_graceful_shutdown(...)` signal
  so existing connections drain before the task exits.
- **`op_http_serve_respond` keyed the pending oneshot map per server**,
  so replying after close (which removed the `ServerInstance` from state)
  silently dropped the response. Moved the pending-responses map onto
  `HttpServeState` and keyed it globally by `request_id` so in-flight
  replies work across close.
- **`op_http_serve_accept` and `op_http_serve_respond` returned an
  "Unknown server id" error** when the JS accept loop re-polled after
  `close()`, poisoning the event loop and failing unrelated tests. Both
  ops now treat a missing server as a soft null/no-op.

The JS `createServer()` shim also gained proper Node-compatible semantics:
`listen(cb)` invokes the callback via `queueMicrotask`; `close(cb)`
defers the callback until all in-flight requests finish; new connections
received after `close()` receive a `503` instead of entering the user
handler.

Previously-quarantined `packages/ui-server/src/__tests__/node-handler.local.ts`
and `packages/docs/src/__tests__/docs-cli-actions.local.ts` are restored
to `.test.ts` and now run under `vtz test`. The `test:integration` npm
scripts that fell back to bun for these files are removed.
