# Auto-Restart Dev Server on Upstream Package Rebuild

**Issue:** [#1577](https://github.com/vertz-dev/vertz/issues/1577)

## Problem

When developing with the Vertz dev server, rebuilding an upstream workspace package (e.g., `@vertz/theme-shadcn`, `@vertz/ui-primitives`) causes the dev server to get stuck. Bun's bundler caches module references in memory; when a package's `dist/` is overwritten, the stale references cause build failures, infinite reload loops, or the "build failed" error overlay. The only fix is manually killing and restarting the server.

## API Surface

### New option on `BunDevServerOptions`

```ts
export interface BunDevServerOptions {
  // ... existing options ...

  /**
   * Watch workspace-linked package dist directories for changes.
   * When a dist directory changes, automatically restart the server.
   *
   * Accepts an array of package names (e.g., ['@vertz/theme-shadcn', '@vertz/ui'])
   * or `true` to auto-detect all `@vertz/*` packages linked via workspace symlinks.
   *
   * @default false
   */
  watchDeps?: boolean | string[];
}
```

### Developer experience

No code changes needed for the common case. The `vertz dev` CLI passes `watchDeps: true` by default — no new CLI flag is needed. When an upstream package's dist changes:

```
[Server] Watching upstream packages: @vertz/theme-shadcn, @vertz/ui-primitives
...
[Server] Upstream package rebuilt: @vertz/theme-shadcn — restarting...
[Server] Restarting dev server...
[Server] Dev server restarted on port 3000
```

The browser sees the "Restarting..." overlay, then auto-reloads when the server is back.

## Design

### Detection: Workspace symlink resolution

Bun workspaces symlink packages into `node_modules/`. To discover which packages to watch:

1. Read `node_modules/@vertz/` entries (or the specific names from `watchDeps` array)
2. For each entry, `fs.realpathSync()` to get the actual path
3. If the real path differs from the `node_modules/` path (i.e., it's a symlink), it's a workspace-linked package
4. Watch `<realpath>/dist/` for changes

**Scope:** `watchDeps: true` only auto-detects `@vertz/*` scoped packages. For non-`@vertz` workspace packages, use the explicit `string[]` form.

This correctly handles:
- Workspace-linked packages (symlinked → watch their dist)
- Published packages from npm (not symlinked → don't watch)

### Watcher behavior

- Use `fs.watch()` with `{ recursive: true }` on each resolved `dist/` directory
- Debounce **1000ms** (longer than the src watcher's 100ms, since a build writes many files over 1-2s)
- On trigger: log the package name, call `devServer.restart()`
- Handle `fs.watch` error events gracefully (log warning, don't crash) — `dist/` may be temporarily deleted during clean rebuilds (`rm -rf dist && bun build`)
- Reuse the existing `restart()` method which already handles:
  - Broadcasting `{ type: 'restarting' }` to WebSocket clients
  - Stopping and re-creating `Bun.serve()`
  - Client-side reconnection and page reload
  - Port binding retries

### Pending restart pattern

If dist changes arrive while a restart is already in progress (`isRestarting === true`), the changes are queued as a "pending restart". After the current restart completes, a second restart is triggered to pick up the latest dist state. This handles the case where a build writes files over 1+ seconds and the first restart imported a partially-written dist.

### Upstream watcher lifecycle

The upstream watcher is created **once** in the `createBunDevServer()` body, NOT inside `start()`. It persists across soft restarts:

- `createBunDevServer()`: resolve workspace packages, create upstream watcher
- `start()`: src/spec watchers created (as today)
- `restart()` → calls `stop()` then `start()`: upstream watcher **persists** (not closed)
- `stop()`: closes src/spec watchers (as today), does NOT close upstream watcher
- Full shutdown (process exit): upstream watcher closes via its own cleanup

This avoids re-resolving symlinks and re-creating watchers on every restart.

### New module: `upstream-watcher.ts`

Extract the upstream watching logic into its own module for testability:

```ts
// packages/ui-server/src/upstream-watcher.ts

export interface UpstreamWatcherOptions {
  /** Project root directory */
  projectRoot: string;
  /** Package names to watch, or true to auto-detect @vertz/* */
  watchDeps: true | string[];
  /** Called when a dist change is detected */
  onDistChanged: (packageName: string) => void;
  /** Debounce interval in ms. @default 1000 */
  debounceMs?: number;
}

export interface UpstreamWatcher {
  /** List of packages being watched */
  readonly packages: ReadonlyArray<{ name: string; distPath: string }>;
  /** Stop all watchers */
  close(): void;
}

/** Resolve workspace-linked packages to their real dist paths. */
export function resolveWorkspacePackages(
  projectRoot: string,
  filter: true | string[],
): Array<{ name: string; distPath: string }>;

/** Create file watchers for upstream package dist directories. */
export function createUpstreamWatcher(options: UpstreamWatcherOptions): UpstreamWatcher;
```

### Integration with `createBunDevServer`

In the `createBunDevServer()` body (outside `start()`):

```ts
// Set up upstream watcher once — persists across restarts
let upstreamWatcherRef: UpstreamWatcher | null = null;
let pendingDistRestart = false;

if (watchDeps) {
  upstreamWatcherRef = createUpstreamWatcher({
    projectRoot,
    watchDeps,
    onDistChanged: (pkgName) => {
      if (logRequests) {
        console.log(`[Server] Upstream package rebuilt: ${pkgName} — restarting...`);
      }
      if (isRestarting) {
        pendingDistRestart = true;
        return;
      }
      devServer.restart().then(() => {
        if (pendingDistRestart) {
          pendingDistRestart = false;
          devServer.restart();
        }
      });
    },
  });

  if (logRequests && upstreamWatcherRef.packages.length > 0) {
    const names = upstreamWatcherRef.packages.map((p) => p.name).join(', ');
    console.log(`[Server] Watching upstream packages: ${names}`);
  }
}
```

Full shutdown closes the upstream watcher:

```ts
// In the devServer object, add a destroy/shutdown path:
async stop() {
  // ... existing stop logic (src watcher, spec watcher, server) ...
  // Upstream watcher is NOT closed here — persists across restarts
},

// Close upstream watcher only on full process shutdown
// (via the SIGINT/SIGTERM handlers in the CLI)
```

The upstream watcher cleanup happens when the process exits. Since `fs.watch()` does not keep the process alive (`{ persistent: false }` option), this is safe.

### Integration with CLI

In `fullstack-server.ts`, pass `watchDeps: true` to the dev server:

```ts
const devServer = createBunDevServer({
  entry: uiEntry,
  // ... existing options ...
  watchDeps: true,
});
```

No new CLI flag (`--no-watch-deps` etc.) is needed. If someone needs to disable it, they can pass `watchDeps: false` programmatically.

## Manifesto Alignment

- **Principle 7 (Performance is not optional)**: Auto-restart is faster than manually killing and restarting the server. The developer saves 5-10 seconds per upstream rebuild.
- **Principle 2 (One way to do things)**: There's one behavior — upstream dist changes trigger a restart. No manual intervention needed.
- **Principle 3 (AI agents are first-class users)**: AI agents rebuilding upstream packages won't get stuck with a broken dev server.

## Non-Goals

- Watching ALL `node_modules/` packages (only workspace-linked packages)
- Hot-swapping upstream modules without restart (Bun's bundler cache makes this unreliable)
- Watching source files of upstream packages (that's the build tool's job)
- Supporting non-Bun workspace package managers
- Watching packages whose `dist/` doesn't exist at server startup (known limitation — a dev server restart is needed if a package is built for the first time after the server starts)

## Unknowns

None identified. The `restart()` method already exists and is battle-tested (used by stale-graph auto-restart). The only new logic is symlink resolution and dist directory watching.

## Type Flow Map

No generics introduced. The API is `boolean | string[]` → `void` callbacks.

## E2E Acceptance Test

```ts
describe('Feature: Auto-restart on upstream dist change', () => {
  describe('Given a dev server with watchDeps: true', () => {
    describe('When a workspace-linked package dist is rebuilt', () => {
      it('Then logs which package triggered the restart', () => {});
      it('Then calls restart() to refresh the server', () => {});
    });
  });

  describe('Given a dev server with watchDeps: false (or omitted)', () => {
    describe('When a workspace-linked package dist changes', () => {
      it('Then does NOT create upstream watchers', () => {});
    });
  });

  describe('Given a dev server with watchDeps: ["@vertz/theme-shadcn"]', () => {
    describe('When @vertz/theme-shadcn dist changes', () => {
      it('Then triggers a restart', () => {});
    });
    describe('When @vertz/ui dist changes', () => {
      it('Then does NOT trigger a restart (not in filter list)', () => {});
    });
  });

  describe('Given resolveWorkspacePackages()', () => {
    describe('When a package is symlinked (workspace-linked)', () => {
      it('Then includes it in the result with its real dist path', () => {});
    });
    describe('When a package is NOT symlinked (npm-installed)', () => {
      it('Then excludes it from the result', () => {});
    });
    describe('When a package has no dist/ directory', () => {
      it('Then excludes it from the result', () => {});
    });
  });

  describe('Given a restart is already in progress', () => {
    describe('When another dist change arrives', () => {
      it('Then queues a pending restart', () => {});
      it('Then triggers the pending restart after the current one completes', () => {});
    });
  });
});
```

## Implementation Plan

### Phase 1: `resolveWorkspacePackages()` + tests

Create `upstream-watcher.ts` with the `resolveWorkspacePackages()` function. TDD:
- Detects symlinked packages under `node_modules/@vertz/`
- Filters by specific package names when provided
- Skips non-symlinked (npm-installed) packages
- Skips packages without a `dist/` directory
- Returns `{ name, distPath }` tuples

### Phase 2: `createUpstreamWatcher()` + integration

Create the watcher function and integrate into `createBunDevServer`:
- Sets up `fs.watch()` on each resolved dist directory
- Debounces to 1000ms
- Calls `onDistChanged` with the package name
- Handles `fs.watch` error events (log warning, don't crash)
- Upstream watcher created once in `createBunDevServer()` body, persists across restarts
- Pending restart pattern for dist changes during restart
- Startup log listing watched packages
- Integrate with `createBunDevServer` via `watchDeps` option
- Pass `watchDeps: true` from CLI
