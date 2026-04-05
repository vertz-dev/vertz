# Phase 2: Bidirectional WebSocket + MCP Tool (TypeScript side)

- **Author:** main agent
- **Reviewer:** review agent
- **Commits:** 5aa63cb9b
- **Date:** 2026-04-05

## Changes

- `packages/ui-server/src/bun-plugin/state-inspector.ts` (modified — added `setupStateInspector()` + auto-init)
- `packages/ui-server/src/bun-dev-server.ts` (modified — added `inspectState()`, `pendingInspections`, WS message routing, HMR shell injection)
- `packages/ui-server/package.json` (modified — added `./state-inspector` export)
- `packages/ui-server/bunup.config.ts` (modified — added `state-inspector.ts` entry)

## CI Status

- [x] Quality gates passed at 5aa63cb9b

## Review Checklist

- [x] Delivers what the ticket asks for
- [ ] TDD compliance
- [ ] No type gaps or missing edge cases
- [x] No security issues
- [x] Integration correctness (with caveats below)

## Findings

### Changes Requested

---

#### 1. BLOCKER: `setupStateInspector()` does not survive WebSocket reconnection

**File:** `packages/ui-server/src/bun-plugin/state-inspector.ts`, lines 356-392

`setupStateInspector()` captures `overlay._ws` once and monkey-patches `onmessage` on that specific WebSocket instance. However, the overlay's `connect()` function (in `bun-dev-server.ts` line 559-609) sets `V._ws=null` on close and creates a **new** WebSocket on reconnect. After reconnection:

- The old `ws` instance is dead (closed)
- The new WebSocket has the overlay's vanilla `onmessage` handler
- The inspector's patched `onmessage` is gone — `inspect-state` commands will be ignored

This is not a rare edge case. WebSocket disconnection happens on every `restart()` and on any transient network issue. After any server restart, the state inspector becomes permanently broken until full page reload.

**Fix:** Instead of capturing `_ws` once, use `addEventListener('message', ...)` on the WebSocket and re-hook whenever `_ws` changes. One approach: poll/observe `overlay._ws` and re-attach when the reference changes. Alternatively, use a MutationObserver-like pattern or integrate directly with the `connect()` lifecycle. The simplest fix may be to check `overlay._ws` on every invocation and re-hook if the reference changed:

```ts
let currentWs: WebSocket | null = null;

function hookWs(ws: WebSocket): void {
  if (ws === currentWs) return;
  currentWs = ws;
  const originalOnMessage = ws.onmessage;
  ws.onmessage = (event: MessageEvent) => {
    if (originalOnMessage) originalOnMessage.call(ws, event);
    // ... inspect-state handling
  };
}

// Re-check periodically or hook into reconnection
```

Or, better yet, use `ws.addEventListener('message', handler)` instead of replacing `onmessage`, so multiple listeners can coexist. But this still has the reconnect problem -- the new WS instance needs the listener too.

---

#### 2. BLOCKER: No tests for any Phase 2 code

**All Phase 2 files**

The Phase 2 commit adds 135 lines of new production code across 4 files but **zero tests**. Specifically missing:

- `setupStateInspector()`: no test for WebSocket message interception, no test for retry logic, no test for the `originalOnMessage` chain
- `inspectState()`: no test for the timeout path, no test for the "no clients" early return, no test for the broadcast-and-collect flow
- WS `state-snapshot` routing: no test for matching `requestId`, no test for unmatched `requestId`, no test for malformed messages

This is a TDD violation. Every behavior needs a failing test first. The `collectStateSnapshot` and `safeSerialize` functions are well-tested (Phase 1), but the entire WebSocket bidirectional flow is untested.

**Fix:** Add tests for:
1. `setupStateInspector()` — mock `window.__vertz_overlay._ws`, verify it intercepts `inspect-state` messages and sends `state-snapshot` responses
2. `setupStateInspector()` retry — verify it retries after 500ms when `_ws` is not available
3. `inspectState()` — verify it returns "no clients" message when `wsClients` is empty
4. `inspectState()` timeout — verify it resolves with timeout message after 5s
5. `inspectState()` happy path — verify broadcast + response matching via `requestId`

---

#### 3. SHOULD-FIX: `pendingInspections` not cleaned up in `stop()` or `restart()`

**File:** `packages/ui-server/src/bun-dev-server.ts`, lines 2502-2530 (`stop()`) and 2565-2570 (`restart()`)

When `stop()` is called, pending inspection timers and promises are left dangling:
- Timers keep running after the server is stopped (potential CI test hangs per integration-test-safety rules)
- Promises never resolve if the server stops while an inspection is in-flight

In `restart()`, the `pendingInspections` Map is never cleared alongside `pendingRuntimeError`, `lastBuildError`, etc. After restart, stale entries could theoretically match `requestId`s from the new session (UUIDs make collision nearly impossible, but the Map leak is still incorrect).

**Fix:** In `stop()`, iterate `pendingInspections`, clear each timer, resolve each promise with a "server stopped" message, and clear the Map. In `restart()`, add `pendingInspections.clear()` alongside the other state resets (or rely on `stop()` doing it).

```ts
// In stop():
for (const [id, { resolve, timer }] of pendingInspections) {
  clearTimeout(timer);
  resolve({
    components: [],
    totalInstances: 0,
    connectedClients: 0,
    timestamp: new Date().toISOString(),
    message: 'Server stopped.',
  });
}
pendingInspections.clear();
```

---

#### 4. SHOULD-FIX: `setupStateInspector()` retries indefinitely with no cap

**File:** `packages/ui-server/src/bun-plugin/state-inspector.ts`, lines 362-366

If `window.__vertz_overlay._ws` is never established (e.g., the error overlay script failed to load, or the WebSocket endpoint is unreachable), `setupStateInspector` will retry every 500ms **forever**, creating an infinite `setTimeout` chain. This is a minor resource leak and makes debugging harder (no logging, no indication it's retrying).

**Fix:** Add a retry cap (e.g., 10 attempts = 5 seconds), and optionally log a warning when exhausted:

```ts
const MAX_RETRIES = 10;
let retryCount = 0;

export function setupStateInspector(): void {
  if (typeof window === 'undefined') return;
  const overlay = ...;
  if (!overlay?._ws) {
    if (retryCount++ < MAX_RETRIES) {
      setTimeout(setupStateInspector, 500);
    }
    return;
  }
  retryCount = 0; // Reset on success
  // ... hook ws
}
```

---

#### 5. SHOULD-FIX: Multiple tabs race — first response wins, rest are silently dropped

**File:** `packages/ui-server/src/bun-dev-server.ts`, lines 2490-2498

`inspectState()` broadcasts `inspect-state` to **all** connected WS clients (e.g., multiple browser tabs). The first `state-snapshot` response matching the `requestId` resolves the promise and deletes the pending entry. Subsequent responses from other tabs are silently dropped.

This is technically correct but may surprise the MCP consumer. If tab A has the component they're looking for and tab B responds first (with an empty snapshot because it's on a different page), the MCP tool returns an empty result.

**Fix (informational):** This is acceptable for v0.1.x but should be documented. A future improvement could collect responses from all clients within a window and merge/pick the richest snapshot. For now, add a code comment noting this behavior.

---

#### 6. NIT: `inspectState()` return type is `Promise<unknown>` — lose type safety

**File:** `packages/ui-server/src/bun-dev-server.ts`, line 2462

The return type `Promise<unknown>` means callers must cast or assert. The `StateSnapshot` type is already exported from `state-inspector.ts`. The method should return `Promise<StateSnapshot>` (or `Promise<StateSnapshot & { message?: string }>` to cover error cases).

Both the early-return (no clients), timeout, and success paths return objects conforming to `StateSnapshot`. Typing it properly would catch mismatches at compile time.

---

#### 7. NIT: `setupStateInspector` parses empty string on non-string data

**File:** `packages/ui-server/src/bun-plugin/state-inspector.ts`, line 377

```ts
const msg = JSON.parse(typeof event.data === 'string' ? event.data : '');
```

If `event.data` is a `Blob` or `ArrayBuffer`, this passes `''` to `JSON.parse`, which throws `SyntaxError`. The `catch {}` block silences it, so it's functionally correct, but it's wasteful — the `try/catch` fires on every non-string message. A simple guard would be cleaner:

```ts
if (typeof event.data !== 'string') return;
```

before the `try` block (after calling `originalOnMessage`).

---

#### 8. NIT: Duplicate `// -- Helpers --` section comment

**File:** `packages/ui-server/src/bun-plugin/state-inspector.ts`, lines 308 and 403

There are two `// -- Helpers --` section headers. The second one (line 403) was introduced by Phase 2 when `truncateSnapshot` was pushed below the new `setupStateInspector` code. This is confusing — `truncateSnapshot` looks like it belongs to its own section rather than the WebSocket listener section.

**Fix:** Remove the duplicate section header at line 403, or rename it to something more specific like `// -- Truncation --`.

---

## Summary

| # | Severity | Finding |
|---|----------|---------|
| 1 | **Blocker** | `setupStateInspector()` breaks on WebSocket reconnection |
| 2 | **Blocker** | Zero tests for all Phase 2 code (TDD violation) |
| 3 | Should-fix | `pendingInspections` not cleaned up in `stop()`/`restart()` |
| 4 | Should-fix | Unbounded retry loop in `setupStateInspector()` |
| 5 | Should-fix | Multi-tab race condition (first response wins) — needs code comment |
| 6 | Nit | `inspectState()` returns `Promise<unknown>` instead of typed |
| 7 | Nit | Unnecessary JSON.parse of empty string on non-string messages |
| 8 | Nit | Duplicate `// -- Helpers --` section comment |

## Resolution

<to be filled after fixes>
