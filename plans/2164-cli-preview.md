# Design Doc: `vertz preview` Command

**Issue:** #2164
**Author:** viniciusdacal
**Date:** 2026-04-05
**Status:** Draft (Rev 2 — addresses DX, Product, Technical reviews)

## Summary

Add a `vertz preview` command that serves the production build locally for testing before deployment. It fills the gap between `vertz dev` (dev mode with HMR) and actual deployment — catching production-only issues (SSR failures, missing assets, build misconfigurations) in 30 seconds instead of deploy-test-fix cycles.

## API Surface

### CLI Usage

```bash
# Basic — serves production build on localhost:4000
vertz preview

# Custom port
vertz preview --port 5000

# Custom host (e.g., test from mobile on same network)
vertz preview --host 0.0.0.0

# Force rebuild even if dist/ is fresh
vertz preview --build

# Skip auto-build (fail if dist/ missing)
vertz preview --no-build

# Open browser on start
vertz preview --open

# Verbose output
vertz preview -v
```

### Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-p, --port <port>` | number | `PORT` env or `4000` | Server port |
| `--host <host>` | string | `localhost` | Server host |
| `--build` | boolean | `false` | Force rebuild before serving |
| `--no-build` | boolean | `false` | Skip auto-build, fail if dist/ missing |
| `--open` | boolean | `false` | Open browser on start |
| `-v, --verbose` | boolean | `false` | Verbose output |

The `--build` / `--no-build` pair uses Commander's `--no-*` convention (same as `--no-typecheck` on `vertz build` and `vertz dev`). Default behavior (neither flag) is auto-detect freshness.

### Behavior

1. **Find project root** — same as `vertz start`
2. **Detect app type** — `api-only`, `ui-only`, `full-stack`
3. **Check build freshness:**
   - If `--no-build`: skip to step 5, fail if build missing
   - If `--build`: always run build
   - If build output missing: run build
   - If `src/` (or config files) have newer files than build output: run build
   - Otherwise: use existing build
4. **Run build** (if needed) — delegates to shared `runBuild()` with pre-resolved context
5. **Serve** — delegates to shared serving functions extracted from `start.ts`
6. **Print URL** — with preview banner
7. **Open browser** — if `--open` flag is set
8. **Exit cleanly on Ctrl+C** — graceful shutdown

### Console Output

```
vertz preview

  Building for production...
  Build completed in 2.3s

  Preview server running at http://localhost:4000
  AOT: 4 route(s) loaded

  This is a local preview. For production, use "vertz start".
  Press Ctrl+C to stop.
```

When build is fresh:
```
vertz preview

  Using existing build (dist/ is up to date)
  Run with --build to force a rebuild.

  Preview server running at http://localhost:4000

  This is a local preview. For production, use "vertz start".
  Press Ctrl+C to stop.
```

### Build Freshness Detection

Freshness is determined by comparing the most recent `mtime` of source files against the `mtime` of the build output marker.

**Source files scanned:**
- All files in `src/` with extensions: `.ts`, `.tsx`, `.js`, `.jsx`, `.css`, `.html`
- `vertz.config.ts` (if exists)
- `package.json`
- Symlinks are skipped
- Uses `readdirSync({ recursive: true, withFileTypes: true })`

**Build output markers (by app type):**
- **UI apps:** `dist/client/_shell.html` (preferred) or `dist/client/index.html` (legacy)
- **API apps:** `.vertz/build/index.js`
- **Full-stack:** `min(api_marker_mtime, ui_marker_mtime)` — the oldest marker must still be newer than the newest source file

The heuristic is deliberately conservative: false rebuilds are acceptable (correctness over speed). If the heuristic gets it wrong, `--build` forces a rebuild and `--no-build` skips it entirely.

**Known limitation:** Generated files inside `src/` (e.g., `src/__generated__/`) may have newer mtimes than build output, causing unnecessary rebuilds. This is acceptable — the rebuild is fast and correct.

### Relationship to `vertz start`

`vertz preview` and `vertz start` serve different operational contexts:

| | `vertz start` | `vertz preview` |
|---|---|---|
| **Purpose** | Production deployment | Local testing before deploy |
| **When to use** | Dockerfiles, PaaS start commands, production | Developer laptops, CI smoke tests |
| **Default host** | `0.0.0.0` | `localhost` |
| **Default port** | `PORT` env or `3000` | `PORT` env or `4000` |
| **Auto-build** | No (fails if missing) | Yes (freshness check) |
| **Open browser** | No | `--open` flag |
| **Console banner** | "Vertz server running at..." | "Preview server running at..." + local preview reminder |

**Long-term positioning:** Both commands are permanent. `start` is the production entrypoint (referenced in Dockerfiles and deployment docs). `preview` is the developer-facing "test my build" command. If the Rust runtime gains a `start` command in the future, `preview` should delegate to it — but that's out of scope for now.

### Code Extraction Strategy

To share serving logic between `preview` and `start` without duplication, the following functions are extracted from `start.ts` into a new `packages/cli/src/commands/serve-shared.ts`:

```typescript
// serve-shared.ts — pure serving functions, no side effects

export interface ServeOptions {
  projectRoot: string;
  port: number;
  host: string;
  verbose: boolean;
}

export interface ServeResult {
  server: BunServer;
  url: string;
  aotRouteCount: number;
}

/** Serve a UI-only app. Returns server instance — caller handles logging and signals. */
export async function serveUIOnly(options: ServeOptions): Promise<Result<ServeResult, Error>>;

/** Serve a full-stack app. Returns server instance — caller handles logging and signals. */
export async function serveFullStack(options: ServeOptions): Promise<Result<ServeResult, Error>>;

/** Serve an API-only app. Returns server instance — caller handles logging and signals. */
export async function serveApiOnly(options: ServeOptions): Promise<Result<ServeResult, Error>>;

/** Register graceful shutdown handlers. Caller chooses when to register. */
export function setupGracefulShutdown(server: BunServer): void;
```

Key design decisions:
- **No `process.exit(0)`** in `setupGracefulShutdown` — it calls `server.stop()` and lets the caller decide exit behavior
- **No console.log** in serve functions — they return `ServeResult` and the caller (start or preview) handles output
- **No signal handlers** registered by serve functions — the caller registers them after logging
- `startAction()` is refactored to call these shared functions + add its own logging/signals
- `previewAction()` calls the same shared functions + adds its own logging/signals/build logic

### Build Integration Strategy

To avoid double app-type detection, `buildAction()` is refactored to accept optional pre-resolved context:

```typescript
export interface BuildActionOptions extends BuildCommandOptions {
  /** Pre-resolved project root. If omitted, discovered from cwd. */
  projectRoot?: string;
  /** Pre-resolved app type. If omitted, detected from projectRoot. */
  detected?: DetectedApp;
}
```

`previewAction()` resolves `projectRoot` and `detected` once, passes them to `buildAction()` (if build needed), then passes the same values to the serve functions. No triple-detection.

If `buildAction()` returns an error, preview prints "Build failed. Fix the errors above and try again." and exits with code 1. Build's own console output (progress, errors) is displayed as-is — preview does not wrap it with redundant "Building for production..." messages.

## Manifesto Alignment

### One way to do things
`vertz preview` is the one canonical way to test a production build locally. `vertz start` is the one canonical way to run in production. Different contexts, different commands — not competing alternatives for the same task.

### AI agents are first-class users
Zero required arguments, clear defaults, predictable behavior. An LLM can use it correctly on the first try: `vertz preview` just works.

### If you can't test it, don't build it
The serving logic is already tested via `vertz start`. The new code (freshness detection, auto-build orchestration) is pure and testable without spinning up servers.

### Performance is not optional
Uses the same production SSR pipeline (single-pass, AOT) as real deployment. No shortcuts or degraded mode.

## Non-Goals

- **File watching / HMR** — that's `vertz dev`. Preview is a static serve of a production build.
- **Platform-specific preview** — no `wrangler dev` integration, no Cloudflare Workers emulation. This is platform-agnostic.
- **HTTPS/TLS** — local preview doesn't need TLS. If needed later, it's a separate enhancement.
- **Build caching or incremental builds** — freshness is binary (stale or not). Incremental builds are a `vertz build` concern.
- **Native runtime delegation** — unlike `vertz dev`, preview doesn't delegate to the Rust runtime. It's Bun-only since it reuses `vertz start` serving logic which is Bun-based. When the Rust runtime gains a `start` command, `preview` should be updated to delegate — but that's a future enhancement.

## Unknowns

None identified. The serving infrastructure already exists in `vertz start`. The new logic is straightforward (freshness check + auto-build + shared serving).

## Type Flow Map

No new generic types are introduced. The command uses existing types:
- `ServeOptions` / `ServeResult` → new but non-generic
- `BuildActionOptions` → extended from `BuildCommandOptions` (non-generic)
- `AppType` → reused from app detector
- `Result<void, Error>` → standard CLI return type

No `.test-d.ts` needed — no new type-level API.

## E2E Acceptance Test

### Scenario 1: Auto-build when dist/ missing

```typescript
describe('Feature: vertz preview', () => {
  describe('Given a Vertz project with src/ but no dist/', () => {
    describe('When running vertz preview', () => {
      it('Then builds the project before serving', () => {
        // dist/ is created
        // Server starts and responds to HTTP requests
      });
    });
  });
});
```

### Scenario 2: Stale build detection

```typescript
describe('Given a Vertz project with dist/ older than src/', () => {
  describe('When running vertz preview', () => {
    it('Then rebuilds before serving', () => {
      // Build runs
      // Server serves fresh content
    });
  });
});
```

### Scenario 3: Fresh build reuse

```typescript
describe('Given a Vertz project with dist/ newer than src/', () => {
  describe('When running vertz preview', () => {
    it('Then uses existing build without rebuilding', () => {
      // No build step
      // Server starts immediately
    });
  });
});
```

### Scenario 4: --no-build with missing dist/

```typescript
describe('Given a Vertz project with no dist/', () => {
  describe('When running vertz preview --no-build', () => {
    it('Then fails with a clear error message', () => {
      // Returns error: "Missing build outputs... Run 'vertz build' first."
      // Does not attempt to build
    });
  });
});
```

### Scenario 5: --build forces rebuild

```typescript
describe('Given a Vertz project with fresh dist/', () => {
  describe('When running vertz preview --build', () => {
    it('Then rebuilds even though dist/ is fresh', () => {
      // Build runs regardless of freshness
      // Server serves newly built content
    });
  });
});
```

### Scenario 6: SSR works same as production

```typescript
describe('Given a built full-stack Vertz app', () => {
  describe('When running vertz preview and requesting a page', () => {
    it('Then returns SSR-rendered HTML with hydration data', () => {
      // Response contains rendered HTML (not empty shell)
      // Response contains __VERTZ_DATA__ script
      // Response contains inline CSS
    });
  });
});
```

### Scenario 7: Static assets with correct MIME types

```typescript
describe('Given a built Vertz app with assets', () => {
  describe('When requesting /assets/main-abc123.js', () => {
    it('Then returns the file with correct Content-Type and cache headers', () => {
      // Content-Type: application/javascript (or text/javascript)
      // Cache-Control: public, max-age=31536000, immutable
    });
  });
});
```

### Scenario 8: Clean exit on Ctrl+C

```typescript
describe('Given vertz preview is running', () => {
  describe('When SIGINT is received', () => {
    it('Then shuts down cleanly', () => {
      // Process exits with code 0
      // Console shows "Shutting down..."
    });
  });
});
```

### Scenario 9: Build failure during auto-build

```typescript
describe('Given a Vertz project with invalid source code', () => {
  describe('When running vertz preview (auto-build triggered)', () => {
    it('Then shows build errors and exits with code 1', () => {
      // Build errors displayed
      // "Build failed. Fix the errors above and try again."
      // Process exits with code 1
      // Server is NOT started
    });
  });
});
```

### Scenario 10: API-only app preview

```typescript
describe('Given a built API-only Vertz app', () => {
  describe('When running vertz preview and making a GET request to /api/health', () => {
    it('Then returns the API response', () => {
      // API handler responds correctly
      // No SSR attempted
    });
  });
});
```

### Scenario 11: Config file change triggers rebuild

```typescript
describe('Given a Vertz project with fresh dist/ but vertz.config.ts modified after build', () => {
  describe('When running vertz preview', () => {
    it('Then rebuilds because config changed', () => {
      // Build runs
      // Server serves content built with new config
    });
  });
});
```
