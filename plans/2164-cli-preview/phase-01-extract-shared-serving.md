# Phase 1: Extract Shared Serving Functions

## Context

Issue #2164 adds a `vertz preview` command. Before implementing preview, we need to extract the serving logic from `start.ts` into reusable functions that both `start` and `preview` can call. Currently, `startUIOnly`, `startFullStack`, and `startApiOnly` are private functions with side effects (signal handlers, `process.exit`, console logging) that make them non-composable.

Design doc: `plans/2164-cli-preview.md`

## Tasks

### Task 1: Create `serve-shared.ts` with extracted serving functions

**Files:**
- `packages/cli/src/commands/serve-shared.ts` (new)
- `packages/cli/src/commands/__tests__/serve-shared.test.ts` (new)

**What to implement:**

Extract pure serving functions from `start.ts` into `serve-shared.ts`. These functions:
- Accept `ServeOptions` (projectRoot, port, host, verbose)
- Return `Result<ServeResult, Error>` where `ServeResult` contains `{ server, url, aotRouteCount }`
- Do NOT register signal handlers
- Do NOT call `console.log` (caller handles output)
- Do NOT call `process.exit`

Functions to extract:
```typescript
export interface ServeOptions {
  projectRoot: string;
  port: number;
  host: string;
  verbose: boolean;
}

export interface ServeResult {
  server: { port: number; stop(): void };
  url: string;
  aotRouteCount: number;
}

export async function serveUIOnly(options: ServeOptions): Promise<Result<ServeResult, Error>>;
export async function serveFullStack(options: ServeOptions): Promise<Result<ServeResult, Error>>;
export async function serveApiOnly(options: ServeOptions): Promise<Result<ServeResult, Error>>;
export function setupGracefulShutdown(server: { stop(): void }): void;
```

Also extract the pure helper functions that are already well-factored:
- `discoverSSRModule` (already exported)
- `validateBuildOutputs` (already exported)
- `discoverInlineCSS` (already exported)
- `serveStaticFile` (already exported)
- `servePrerenderHTML` (already exported)

These stay in `start.ts` as re-exports or move to `serve-shared.ts` — whichever is cleaner.

`setupGracefulShutdown` should call `server.stop()` but NOT `process.exit(0)`. The event loop will naturally end when no listeners remain.

**Acceptance criteria:**
- [ ] `serveUIOnly()` returns a server instance without logging or signal handlers
- [ ] `serveFullStack()` returns a server instance without logging or signal handlers
- [ ] `serveApiOnly()` returns a server instance without logging or signal handlers
- [ ] `setupGracefulShutdown()` stops the server without calling `process.exit`
- [ ] All functions return `Result<ServeResult, Error>` on failure (e.g., missing SSR module)

---

### Task 2: Refactor `start.ts` to use shared functions

**Files:**
- `packages/cli/src/commands/start.ts` (modified)
- `packages/cli/src/commands/__tests__/start.test.ts` (modified, if exists)

**What to implement:**

Refactor `startAction()` to delegate to the shared serving functions. The `start` command becomes a thin orchestrator:
1. Find project root
2. Detect app type
3. Validate build outputs
4. Call the appropriate `serve*()` function from `serve-shared.ts`
5. Log the URL
6. Register signal handlers via `setupGracefulShutdown()`

Existing behavior must be identical — same output messages, same signal handling, same error messages. This is a pure refactor with no behavior changes.

**Acceptance criteria:**
- [ ] `vertz start` produces identical console output as before
- [ ] `vertz start` handles SIGINT/SIGTERM identically
- [ ] All existing `start.ts` tests continue to pass
- [ ] No code duplication between `start.ts` and `serve-shared.ts`

---

### Task 3: Extend `buildAction()` to accept pre-resolved context

**Files:**
- `packages/cli/src/commands/build.ts` (modified)
- `packages/cli/src/commands/__tests__/build.test.ts` (modified, if exists)

**What to implement:**

Extend `BuildCommandOptions` (or create `BuildActionOptions`) to accept optional pre-resolved context:

```typescript
export interface BuildActionOptions extends BuildCommandOptions {
  /** Pre-resolved project root. If omitted, discovered from cwd. */
  projectRoot?: string;
  /** Pre-resolved app detection. If omitted, detected from projectRoot. */
  detected?: DetectedApp;
}
```

When these fields are provided, `buildAction()` skips its own `findProjectRoot()` and `detectAppType()` calls. When omitted, behavior is unchanged (backward compatible).

**Acceptance criteria:**
- [ ] `buildAction({ projectRoot, detected })` skips re-detection
- [ ] `buildAction({})` behaves identically to before (backward compatible)
- [ ] Existing build tests continue to pass
