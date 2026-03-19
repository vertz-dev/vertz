# Integration Test Safety — Preventing CI Hangs

## The Problem

Tests that spin up real servers (`Bun.serve()`), WebSocket connections, or file watchers can hang on CI runners. The event loop stays alive because of unclosed resources, unresolved Promises, or cleanup that only runs on the happy path.

## Rules

### 1. Every async resource must be closed in `afterEach`, not in the test body

```ts
// WRONG — ws.close() only runs if assertions pass
it('broadcasts error', async () => {
  const ws = new WebSocket(`ws://localhost:${port}/__vertz_errors`);
  await waitForMessage(ws);
  expect(parsed.type).toBe('error');
  ws.close(); // skipped if assertion throws
});

// RIGHT — track resources for cleanup
const openWebSockets: WebSocket[] = [];

afterEach(async () => {
  for (const ws of openWebSockets) ws.close();
  openWebSockets.length = 0;
  if (devServer) { await devServer.stop(); devServer = null; }
});

it('broadcasts error', async () => {
  const ws = new WebSocket(`ws://localhost:${port}/__vertz_errors`);
  openWebSockets.push(ws);
  await waitForMessage(ws);
  expect(parsed.type).toBe('error');
});
```

### 2. Every Promise-based wait must have a timeout

```ts
// WRONG — hangs forever if message never arrives
const msg = new Promise<string>((resolve) => {
  ws.onmessage = (e) => resolve(e.data);
});

// RIGHT — reject after timeout
function waitForMessage(ws: WebSocket, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS message timeout')), timeoutMs);
    ws.onmessage = (e) => {
      clearTimeout(timer);
      resolve(typeof e.data === 'string' ? e.data : '');
    };
  });
}
```

### 3. Never fire-and-forget async operations in handlers

If a WebSocket message handler or callback triggers async work, either:
- Await it, or
- Track it so `stop()` can wait for completion, or
- Guard it with a `stopped` flag check before doing I/O

### 4. File watchers need a stopped-state guard

```ts
// WRONG — watcher callback runs after stop()
srcWatcher = watch(srcDir, { recursive: true }, (_event, filename) => {
  refreshSSRModule(); // may do file I/O, imports, etc.
});

// RIGHT — check stopped flag
srcWatcher = watch(srcDir, { recursive: true }, (_event, filename) => {
  if (stopped) return;
  refreshSSRModule();
});
```

### 5. `stop()` must close ALL resources, not just the server

When implementing a `stop()` method:
- Close file watchers
- Clear WebSocket client sets
- Cancel pending timers (setTimeout, setInterval)
- Cancel pending debounce timers
- Clear in-flight Promises or set a flag to short-circuit them

### 6. Integration tests that start real servers go in `.local.ts` files

Tests that `Bun.serve()` on a real port, create WebSocket connections, or use file watchers are **local-only**. They don't run in CI because:
- CI runners have stricter process exit semantics
- Port binding and WebSocket teardown can race with the test runner
- File watcher events are non-deterministic across OS/CI environments

Name these files `*.local.ts` (not `.test.ts`). Add a `test:integration` script in `package.json` for running them explicitly:

```json
"test:integration": "bun test src/__tests__/my-integration.local.ts"
```

### 7. Environment variables must be cleaned up in `afterEach`

```ts
// WRONG — only cleaned in beforeEach, leaks after last test
beforeEach(() => { delete process.env.MY_VAR; });

// RIGHT — clean in afterEach too
afterEach(() => { delete process.env.MY_VAR; });
```

### 8. Use OS-assigned ports (port 0) or random high ports

```ts
// Avoid hardcoded ports — they collide in parallel test runs
const port = 10000 + Math.floor(Math.random() * 50000);
```

## Quick Checklist

Before merging integration tests, verify:
- [ ] All WebSocket connections closed in `afterEach` (not just in test body)
- [ ] All `new Promise()` waits have timeouts
- [ ] All `Bun.serve()` instances stopped in `afterEach`
- [ ] All file watchers closed in `afterEach`
- [ ] No `process.env` leaks between tests
- [ ] Tests that need real servers use `.local.ts` extension
- [ ] No fire-and-forget `async` calls in handlers
