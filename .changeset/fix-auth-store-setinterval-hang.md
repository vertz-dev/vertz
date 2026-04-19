---
'@vertz/server': patch
---

fix(server): auth stores no longer keep the API isolate event loop alive

`InMemoryRateLimitStore` and `InMemorySessionStore` scheduled a 60s cleanup
`setInterval` in their constructors. When `createServer({ auth })` ran at
module top-level inside the `vtz dev` API V8 isolate, the pending timer
prevented `load_side_module`'s `run_event_loop()` from draining, so module
evaluation never completed and the 10s init watchdog fired — returning
HTTP 503 "API isolate failed to initialize" for every request.

Cleanup is now piggybacked on `check()` / `createSession()` and runs at
most once per `CLEANUP_INTERVAL_MS`. No background timer → no event loop
leak. Behavior is unchanged: stale entries still expire within ~60s of the
next store access.

Closes #2851.
