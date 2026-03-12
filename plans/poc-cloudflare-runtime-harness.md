# POC: Cloudflare Runtime Adapter Harness

**Issue:** #1157
**Status:** Complete
**Author:** edson
**Date:** 2026-03-11

## Question

What is the smallest reliable way to execute the shared `RuntimeAdapter` contract against the Cloudflare adapter locally?

## What Was Evaluated

### Approach 1: Contract-Level Simulation (Recommended)

Create a `cloudflareAdapter: RuntimeAdapter` that:

1. Receives the raw `(req: Request) => Promise<Response>` handler (same interface as all other adapters)
2. Wraps it through `createHandler()` from `@vertz/cloudflare` to produce a `CloudflareWorkerModule`
3. Serves requests via `Bun.serve`, routing each request through `workerModule.fetch(req, mockEnv, mockCtx)`
4. Provides mock `ExecutionContext` with stub `waitUntil` and `passThroughOnException`

```ts
import { createHandler } from '@vertz/cloudflare';
import type { AppBuilder } from '@vertz/core';
import type { RuntimeAdapter } from './types';

const mockCtx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext;

export const cloudflareAdapter: RuntimeAdapter = {
  name: 'cloudflare',
  async createServer(handler) {
    const app = { handler } as unknown as AppBuilder;
    const worker = createHandler(app);

    const server = Bun.serve({
      port: 0,
      fetch: (req) => worker.fetch(req, {}, mockCtx),
    });

    return {
      port: server.port,
      url: `http://localhost:${server.port}`,
      close: async () => server.stop(),
    };
  },
};
```

**What this tests:**
- `createHandler()` correctly wraps the handler
- Request flows through the Cloudflare handler pipeline (error catching, 500 wrapping)
- Header preservation through the pipeline
- Server lifecycle (start/stop)
- The `@vertz/cloudflare` package import path works

**What this doesn't test:**
- V8 isolate restrictions (no Node APIs, no filesystem)
- Worker-specific bindings (KV, D1, Durable Objects)
- `waitUntil` background task execution
- Network isolation behaviors

**Spike results:** All 4 validation tests passed:
- Basic request passthrough: handler receives correct path/method
- Error handling: handler throw → 500 Internal Server Error
- Header preservation: custom headers round-trip correctly
- Server lifecycle: close stops accepting requests

### Approach 2: Miniflare/workerd Execution (Rejected)

Use Miniflare (Cloudflare's local Worker simulator, backed by the `workerd` C++ runtime) to run the handler in an actual Worker process.

**Why this is not viable for the RuntimeAdapter pattern:**

1. **Serialization barrier.** The `RuntimeAdapter.createServer()` receives a JavaScript function closure — `(req: Request) => Promise<Response>`. Miniflare runs a separate `workerd` process. You cannot serialize a closure with captured state (the integration tests use in-memory `Map`-based stores) and send it across a process boundary. This is a fundamental incompatibility with the adapter contract.

2. **Architecture mismatch.** Making Miniflare work would require rewriting the test infrastructure to pass serializable Worker module source code instead of function closures. The in-memory stores (`createIntegrationApp` in `create-app.ts`) would need to be replaced with Worker bindings (KV/D1), fundamentally changing what the integration tests validate.

3. **Heavy dependency.** Miniflare pulls in `workerd` (~50MB C++ binary). This adds significant install weight and CI complexity for something the adapter contract can't use anyway.

4. **Slow startup.** workerd process startup adds ~1-2 seconds per test vs. ~1ms for in-process `Bun.serve`.

5. **Redundant coverage.** The Cloudflare handler already has 40+ tests in `packages/cloudflare/tests/handler.test.ts` that validate all internal behavior (basePath stripping, security headers, SSR routing, nonce-based CSP, error handling, 404/500 responses). These tests cover the handler's internals more thoroughly than a Miniflare-based adapter ever could.

### Approach 3: workerd Subprocess (Rejected)

A variant of Approach 2 — run `workerd serve` or `wrangler dev` as a subprocess with a generated Worker script.

**Rejected for the same reasons as Approach 2**, plus:
- Port coordination complexity
- Subprocess lifecycle management
- No way to pass the in-memory handler function across process boundaries

## RuntimeAdapter Contract Changes

**None needed.**

The existing interface is sufficient:

```ts
interface RuntimeAdapter {
  name: string;
  createServer(handler: (req: Request) => Promise<Response>): Promise<ServerHandle>;
}
```

The Cloudflare adapter wraps the handler through `createHandler()` internally. The contract's input (a fetch handler) and output (a `ServerHandle` with `port`/`url`/`close`) work without modification.

## Can Phase 2 Proceed Without a Heavy New Dev Dependency?

**Yes.** The contract-level simulation requires zero new dependencies:

- `@vertz/cloudflare` is already a workspace package
- `Bun.serve` is the runtime (same as the existing Bun adapter)
- `ExecutionContext` mock is 3 lines

The only change to `packages/integration-tests/package.json` is adding `@vertz/cloudflare: "workspace:^"` as a dev dependency.

## Exact Files/Interfaces Phase 2 Should Touch

### New files
- `packages/integration-tests/src/runtime-adapters/cloudflare.ts` — the adapter implementation
- `packages/integration-tests/src/runtime-adapters/cloudflare.test.ts` — adapter unit tests

### Modified files
- `packages/integration-tests/src/runtime-adapters/index.ts` — add `cloudflare` to the adapter map
- `packages/integration-tests/package.json` — add `@vertz/cloudflare` dev dependency
- `packages/cloudflare/tests/handler.test.ts` — add runtime smoke tests through meta-package surface if needed

### Interfaces
- `RuntimeAdapter` (no changes)
- `ServerHandle` (no changes)
- `CloudflareWorkerModule.fetch` (consumed as-is from `@vertz/cloudflare`)

## Risk Notes for CI/Runtime Portability

1. **The `ExecutionContext` type.** The adapter mocks it as a plain object. The `@cloudflare/workers-types` package declares `ExecutionContext` as a global. In tests running under Bun, this global doesn't exist — the mock sidesteps this with `as unknown as ExecutionContext`. This is safe because the simple handler mode ignores `ctx` entirely. If a future handler change relies on `ctx.waitUntil()` actually scheduling work, the mock would need to track calls.

2. **`@vertz/ui-server` peer dependency.** The Cloudflare handler imports `@vertz/ui-server/fetch-scope` and dynamically imports `@vertz/ui-server/ssr`. In the simple handler mode (no SSR config), these code paths are not hit. However, the static import of `fetch-scope` means `@vertz/ui-server` must be resolvable. The integration-tests package already depends on `@vertz/ui` and `@vertz/server`; adding `@vertz/ui-server` may be needed if the import fails at module load time.

3. **CI portability.** The adapter runs in-process under Bun — same execution model as the Bun adapter. No external processes, no platform-specific binaries, no port conflicts. CI requires only Bun.

## Recommendation

**Use Approach 1 (contract-level simulation).** It is consistent with how other adapters work, tests the actual `@vertz/cloudflare` code path, requires zero new dependencies, runs fast, and catches handler-level regressions. Phase 2 can proceed immediately.
