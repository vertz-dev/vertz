# Design: Auto-Install Missing Packages During `vertz dev`

**Issue:** [#2034](https://github.com/vertz-dev/vertz/issues/2034)
**Status:** Draft (Rev 2 — addresses DX, Product, and Technical review feedback)
**Deferred from:** `plans/archived/vertz-package-manager-phase3.md` (Non-Goal #8)

---

## Summary

When the dev server encounters a `/@deps/` request for a package not in `node_modules/`, automatically run `vertz add <package>` and continue — no restart required. This eliminates the "install then restart" workflow.

**Why now:** The original Phase 3 deferral anticipated needing static import analysis to detect missing packages. This design instead intercepts at the `/@deps/` request boundary, which is already available in the dev server. No import analysis is required, making this simpler than originally expected.

---

## API Surface

### Developer Experience

```
# Developer writes code
import { z } from 'zod';

# Dev server detects missing package, terminal shows:
[PM] Auto-installing zod...
[PM] + zod@3.24.0 (^3.24.0 added to package.json) (142ms)

# Browser automatically retries — no manual action needed
```

The terminal output explicitly shows that `package.json` was modified, including the version range written (caret `^` range, matching `vertz add` default behavior).

### Browser Feedback During Install

While `pm::add()` is in-flight (200ms–2000ms typical, up to 30s worst case), the browser tab is waiting for the `/@deps/` response. To avoid a silent freeze, the dev server sends a WebSocket message to connected clients **before** starting the install:

```
[PM] Installing zod...
```

This message is shown as an info banner in the error overlay (not an error — a transient notification). When the install completes (success or failure), the banner is replaced with the result. This requires adding an `Info` variant to the `ErrorBroadcast` enum (see Architecture).

### Configuration (`.vertzrc`)

```json
{
  "autoInstall": true
}
```

`autoInstall` defaults to `true` **in interactive mode** (terminal attached). When the `CI` environment variable is set (`CI=true`, as set by GitHub Actions, GitLab CI, etc.), `autoInstall` defaults to `false` regardless of `.vertzrc`. This prevents unintended package installation in CI/preview environments.

Explicit `.vertzrc` overrides the CI guard — if a team intentionally sets `"autoInstall": true` in a CI pipeline, that is respected.

```json
{
  "autoInstall": false
}
```

### CLI Override

```bash
vertz dev --no-auto-install   # Disable for this session
vertz dev --auto-install       # Enable explicitly (overrides CI guard)
```

**Precedence:** CLI flag > `.vertzrc` > environment default (CI detection).

### Error Overlay (when disabled or install fails)

When auto-install is disabled, the current behavior is preserved: error overlay shows "Package 'zod' is not installed. Run `vertz add zod` to install it."

When auto-install fails (e.g., network error, package doesn't exist on npm), the error overlay shows:

```
Auto-install failed for 'zod': package not found in npm registry.
Run `vertz add zod` manually to debug.
```

---

## Architecture

### Interception Point

The auto-install hooks into `handle_deps_request()` in `server/module_server.rs`. When all resolution attempts fail (pre-bundled, node_modules direct, workspace, Bun cache, package.json exports), instead of returning 404, we:

1. Extract the bare package name from the specifier (using existing `split_package_specifier()`)
2. Check if `autoInstall` is enabled (from `DevServerState.auto_install`)
3. Check the failed-install blacklist — if this package already failed, return 404 immediately
4. Acquire the install slot for this package (see Deduplication below)
5. Call `pm::add()` via `tokio::task::spawn_blocking()` to install the package
6. Re-attempt resolution
7. If resolution succeeds: serve the file (200 OK)
8. If resolution fails: return 404 with error (existing behavior)

### Request Flow

```
Browser: GET /@deps/zod
  │
  ├── 1. Check pre-bundled (.vertz/deps/)     → miss
  ├── 2. Check node_modules/ direct           → miss
  ├── 3. Check workspace node_modules         → miss
  ├── 4. Check Bun cache                      → miss
  ├── 5. Check package.json exports           → miss
  │
  ├── 6. AUTO-INSTALL (new)
  │     ├── Check autoInstall config           → enabled
  │     ├── Check failed_installs blacklist    → not blacklisted
  │     ├── Acquire install slot for "zod"
  │     │   ├── If first request: holds slot, proceeds to install
  │     │   └── If concurrent: waits for first request to finish, then re-resolves
  │     ├── Broadcast info WS message: "Installing zod..."
  │     ├── spawn_blocking { pm::add(root_dir, &["zod"], ...) }
  │     │   └── Timeout: 30 seconds
  │     ├── On success: broadcast clear + re-attempt resolution (steps 2-5)
  │     ├── On failure: add to failed_installs blacklist, broadcast error
  │     └── Release install slot (notify waiters)
  │
  ├── 7a. Resolution succeeds → serve file (200)
  └── 7b. Resolution still fails → 404 with error
```

### Deduplication & Serialization

Two concerns must be addressed:

1. **Per-package dedup**: Multiple browser requests for the same missing package (e.g., `/@deps/zod`, `/@deps/zod/lib/types`) must not trigger multiple `pm::add("zod")` calls.

2. **Cross-package serialization**: `pm::add()` does read-modify-write on `package.json`. Concurrent calls for different packages would race on the file.

**Solution: Single global `Mutex` + per-package `Notify`**

```rust
/// Guards the entire auto-install codepath. Only one pm::add() runs at a time.
pub auto_install_lock: Arc<tokio::sync::Mutex<()>>,

/// Per-package notification: concurrent requests for the same package
/// subscribe to a Notify and wait for the installing request to finish.
pub auto_install_inflight: Arc<std::sync::Mutex<HashMap<String, Arc<tokio::sync::Notify>>>>,

/// Packages that failed to install — prevents retry storms.
pub auto_install_failed: Arc<std::sync::Mutex<HashSet<String>>>,
```

**Flow for a request:**

```
1. Lock `auto_install_inflight` (sync mutex, held briefly)
2. If package is in `auto_install_failed` → return 404 immediately
3. If package is in `auto_install_inflight`:
   a. Get the existing `Notify`
   b. Release sync lock
   c. `notify.notified().await` — waits for installer to finish
   d. Re-attempt resolution (package should now be in node_modules)
4. If package is NOT in `auto_install_inflight`:
   a. Create a new `Notify`, insert into map
   b. Release sync lock
   c. Acquire `auto_install_lock` (async mutex — serializes all installs)
   d. Run pm::add() via spawn_blocking with 30s timeout
   e. On success: clear from inflight map, notify all waiters
   f. On failure: add to `auto_install_failed`, clear from inflight, notify waiters
   g. Release `auto_install_lock`
```

The global `auto_install_lock` serializes all `pm::add()` calls, eliminating the `package.json` write race. The per-package `Notify` allows concurrent requests for the same package to wait without re-entering the install path.

### Blocking I/O Safety

`pm::add()` performs blocking filesystem I/O: `std::fs::read_to_string` for package.json, `fs2::FileExt::lock_exclusive()` for advisory locks, and network I/O via the registry client. To avoid blocking a Tokio worker thread, the `pm::add()` call is wrapped in `tokio::task::spawn_blocking()`:

```rust
let result = tokio::task::spawn_blocking(move || {
    let rt = tokio::runtime::Handle::current();
    rt.block_on(pm::add(root_dir, &[pkg_name], ...))
}).await;
```

### Install Timeout

`pm::add()` involves network calls to the npm registry. On slow connections or for large packages, this can take 10-30+ seconds. A 30-second timeout is applied:

```rust
let result = tokio::time::timeout(
    Duration::from_secs(30),
    spawn_blocking_pm_add(...)
).await;
```

If the timeout fires, the install is treated as a failure: the package is added to `auto_install_failed`, and the response is 404 with a message: "Auto-install timed out for '<package>'. Run `vertz add <package>` manually."

**Accepted limitation:** Chrome's module script fetch has a ~30s timeout. If `pm::add()` takes close to 30s, the browser may time out before the server responds. In this case the developer will see a module load failure and need to refresh. The 30s server-side timeout ensures we don't hold the request indefinitely.

### Failed-Install Blacklist

The `auto_install_failed` set prevents retry storms. If `pm::add("nonexistent-pkg")` fails, subsequent requests for `/@deps/nonexistent-pkg` return 404 immediately without hitting the npm registry.

The blacklist is cleared when:
- The dev server restarts
- A file change is detected (watcher fires) — the developer may have fixed the import

This means: developer types `zodd` (typo) → auto-install fails → developer fixes to `zod` → file save triggers watcher → blacklist clears → next request for `/@deps/zod` triggers a fresh auto-install attempt → succeeds.

### State: `DevServerState` Changes

```rust
pub struct DevServerState {
    // ... existing fields ...

    /// Whether auto-install is enabled for missing packages.
    pub auto_install: bool,

    /// Serializes all pm::add() calls to prevent package.json write races.
    pub auto_install_lock: Arc<tokio::sync::Mutex<()>>,

    /// Per-package notification for concurrent request dedup.
    pub auto_install_inflight: Arc<std::sync::Mutex<HashMap<String, Arc<tokio::sync::Notify>>>>,

    /// Packages that failed to install — prevents retry storms.
    /// Cleared on file change (watcher event).
    pub auto_install_failed: Arc<std::sync::Mutex<HashSet<String>>>,
}
```

### Config: `VertzConfig` Changes

```rust
pub struct VertzConfig {
    #[serde(rename = "trustScripts", default)]
    pub trust_scripts: Vec<String>,

    #[serde(rename = "autoInstall", default = "default_true")]
    pub auto_install: bool,

    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

fn default_true() -> bool { true }
```

### Config Threading: Full Path

1. `VertzConfig` gains `auto_install: bool` (default `true`)
2. `ServerConfig` gains `auto_install: bool`
3. In `dev` command setup (`cli.rs`):
   - Load `.vertzrc` via `load_vertzrc(root_dir)`
   - Apply CI guard: if `std::env::var("CI").is_ok()` and `.vertzrc` does not explicitly set `autoInstall`, default to `false`
   - Apply CLI override: `--no-auto-install` forces `false`, `--auto-install` forces `true`
   - Set `server_config.auto_install` from the resolved value
4. In `build_router()` (`server/http.rs`): read `config.auto_install` into `DevServerState.auto_install`

### Output Adapter: `DevPmOutput`

`pm::add()` takes an `Arc<dyn PmOutput>` for progress reporting. The `PmOutput` trait has 19 methods. `DevPmOutput` implements all of them, with most as no-ops:

```rust
struct DevPmOutput {
    broadcaster: ErrorBroadcaster,
}

impl PmOutput for DevPmOutput {
    fn package_added(&self, name: &str, version: &str, range: &str) {
        eprintln!("[PM] + {}@{} ({} added to package.json) ({}ms)", name, version, range, elapsed);
    }
    fn error(&self, _code: &str, message: &str) {
        eprintln!("[PM] Error: {}", message);
    }
    // All other methods: no-op
    // Specifically NOT TextOutput — no TTY progress bars in dev server output
    fn resolve_started(&self) {}
    fn resolve_complete(&self, _count: usize) {}
    fn download_started(&self, _total: usize) {}
    fn download_tick(&self) {}
    fn download_complete(&self, _count: usize) {}
    fn link_started(&self) {}
    fn link_complete(&self, _packages: usize, _files: usize, _cached: usize) {}
    fn bin_stubs_created(&self, _count: usize) {}
    fn package_removed(&self, _name: &str) {}
    fn package_updated(&self, _name: &str, _from: &str, _to: &str, _range: &str) {}
    fn workspace_linked(&self, _count: usize) {}
    fn script_started(&self, _name: &str, _script: &str) {}
    fn script_complete(&self, _name: &str, _duration_ms: u64) {}
    fn script_error(&self, _name: &str, _error: &str) {}
    fn info(&self, _message: &str) {}
    fn warning(&self, _message: &str) {}
    fn done(&self, _elapsed_ms: u64) {}
}
```

### WebSocket Notification

**New `ErrorBroadcast` variant:**

```rust
#[serde(tag = "type")]
pub enum ErrorBroadcast {
    #[serde(rename = "error")]
    Error { category: ErrorCategory, errors: Vec<DevError> },
    #[serde(rename = "clear")]
    Clear,
    #[serde(rename = "info")]
    Info { message: String },  // NEW — transient info banners
}
```

**Flow:**
- Before install starts: broadcast `Info { message: "Installing zod..." }` — shown as an info banner in the error overlay
- On success: broadcast `Clear` for `ErrorCategory::Resolve` — clears any prior resolve error for the package. The info banner dismisses automatically.
- On failure: broadcast `Error { category: Resolve, errors: [...] }` with the failure message

### Pre-bundle Cache Note

After a successful auto-install, the dev server's request-time resolution serves the package directly from `node_modules/` (resolution steps 2-5). Pre-bundling only runs on `vertz build`, not during dev. If a stale `.vertz/deps/<package>` file exists from a previous build, it would be found first (step 1). This is harmless in practice — `vertz dev` starts fresh — but if it becomes an issue, the auto-install path can skip the pre-bundle check on the re-resolution attempt.

---

## Manifesto Alignment

### "One way to do things"
Auto-install is the default in interactive dev. No manual step. The developer writes an import and it works. The config flag is an escape hatch for CI/offline environments, not an alternative workflow. CLI flag and `.vertzrc` both control the same behavior with clear precedence (CLI > `.vertzrc` > environment default).

### "AI agents are first-class users"
LLM agents frequently add imports without running `npm install`. Auto-install makes this "just work" — no interrupted workflow, no "please install X first" back-and-forth. This is the primary motivating use case.

### "If it builds, it works"
We don't silently swallow install failures. If auto-install fails, the error overlay shows exactly what went wrong and how to fix it. The failed-install blacklist prevents retry storms while still allowing retry after the developer makes a code change.

### "Performance is not optional"
Install runs via `spawn_blocking` while the browser waits. The global mutex serializes installs, the per-package `Notify` dedup prevents redundant installs, and the failed-install blacklist eliminates retry storms. The first request blocks (200-2000ms typical), but subsequent requests for the same package are instant.

---

## Non-Goals

1. **Auto-removing unused packages** — Out of scope. Tree-shaking is a separate concern.
2. **Version pinning during auto-install** — Auto-install calls `pm::add()` with no flags, which writes a caret range (`^3.24.0`) to `package.json` — the same format as `vertz add zod`. Developers who need exact pinning can run `vertz add zod --exact` manually.
3. **Peer dependency resolution** — Auto-install adds to `dependencies`, not `peerDependencies`. Peer dep warnings are logged but not auto-resolved.
4. **Pre-bundling after auto-install** — The newly installed package is served directly from `node_modules/` via the existing fallback path. Pre-bundling on the fly would block too long. Pre-bundling happens on `vertz build`.
5. **Workspace-scoped auto-install** — Installs go to the project root `package.json`. No `--workspace` targeting during auto-install.

---

## Known Limitations

### SSR/API route imports are NOT auto-installed

This feature only covers browser-facing `/@deps/` requests. SSR and API route module resolution happens inside V8 (`PersistentIsolate`), which has a different failure mode (V8 module resolution error, not an HTTP 404).

**What the developer sees:** If a developer imports `zod` in an API route without installing it, the V8 runtime throws a module resolution error. The dev server catches this and broadcasts it as an `ssr`-category error in the error overlay. The message already includes the package name and suggests `vertz add <package>`.

**The asymmetry:** The same `import { z } from 'zod'` auto-installs when used in a browser-facing component but requires manual `vertz add` when used in an API route. This is a deliberate scope limitation for this PR, not the final state.

**Follow-up (committed):** [#2093](https://github.com/vertz-dev/vertz/issues/2093) will add auto-install for SSR/API routes by hooking into the V8 module resolution callback. The callback receives the specifier, can detect "module not found," and can trigger the same `pm::add()` flow before retrying resolution. This is a separate code path and will be tracked as a separate issue after this feature ships.

**Mitigation for shared imports:** If a developer adds a shared utility that imports `zod` and uses it from both a component and an API route, the browser-side auto-install will install `zod` first. By the time the SSR/API route resolves, `zod` is already in `node_modules/`. The asymmetry only manifests when a package is used *exclusively* in SSR/API routes.

---

## Unknowns

1. **Concurrent `pm::add` safety** — `pm::add()` modifies `package.json` and runs resolution. If two different packages are auto-installed simultaneously, do they race on package.json writes?

   **Resolution:** Yes, they would race. Solution: use a single global `tokio::sync::Mutex<()>` (`auto_install_lock`) that serializes all `pm::add()` calls. Only one install runs at a time. This is acceptable because auto-installs are rare events (only on first encounter of a missing package) and the serialization adds negligible latency compared to the npm registry round-trip.

2. **Module graph invalidation** — After installing a new package, does the module graph need updating?

   **Resolution:** No. The module graph tracks local source files only (`src/` imports). Node modules are resolved on-demand per request. The newly installed package will be found on the next `/@deps/` request naturally.

---

## Type Flow Map

This feature is entirely Rust-side. No TypeScript generics involved. The only TypeScript change is the CLI flag parsing for `--no-auto-install` / `--auto-install`, which are boolean flags — no generics.

---

## E2E Acceptance Test

### Happy path: missing package is auto-installed

```
Given: a project with no `zod` in node_modules or package.json
  And: autoInstall is enabled (default)
When: a source file imports `import { z } from 'zod'`
  And: the browser requests `GET /@deps/zod`
Then: the dev server auto-installs zod via pm::add
  And: terminal shows "[PM] Auto-installing zod..."
  And: terminal shows "[PM] + zod@3.24.0 (^3.24.0 added to package.json) (142ms)"
  And: browser overlay shows "Installing zod..." during the install
  And: the response is 200 with the zod module content
  And: package.json now has "zod": "^3.24.0" in dependencies
  And: vertz.lock is updated
  And: running `vertz install` in a clean checkout with this package.json succeeds
```

### Disabled: error overlay as before

```
Given: .vertzrc has `{ "autoInstall": false }`
When: the browser requests `GET /@deps/zod` (not installed)
Then: the response is 404
  And: the error overlay shows install suggestion
  And: package.json is NOT modified
```

### CI environment: auto-install off by default

```
Given: no .vertzrc (or .vertzrc without explicit autoInstall)
  And: CI=true environment variable is set
When: the browser requests `GET /@deps/zod` (not installed)
Then: auto-install does NOT run
  And: 404 is returned with install suggestion
```

### CI environment: explicit override

```
Given: .vertzrc has `{ "autoInstall": true }`
  And: CI=true environment variable is set
When: a missing package is requested
Then: auto-install DOES run (explicit config overrides CI guard)
```

### Dedup: concurrent requests for same package

```
Given: autoInstall is enabled
  And: zod is not installed
When: 5 concurrent requests arrive for /@deps/zod, /@deps/zod/lib/types, etc.
Then: pm::add("zod") is called exactly once
  And: all 5 requests eventually resolve (200)
```

### Install failure: package doesn't exist

```
Given: autoInstall is enabled
When: a source file imports `import { x } from 'nonexistent-pkg-xyz'`
  And: the browser requests `GET /@deps/nonexistent-pkg-xyz`
Then: pm::add fails (404 from registry)
  And: the response is 404
  And: the error overlay shows "Auto-install failed for 'nonexistent-pkg-xyz'"
  And: package.json is NOT modified
  And: subsequent requests for nonexistent-pkg-xyz return 404 immediately (blacklisted)
```

### Failed-install blacklist clears on file change

```
Given: autoInstall is enabled
  And: 'zodd' (typo) was previously attempted and failed (blacklisted)
When: the developer fixes the import to 'zod' and saves the file
  And: the file watcher fires
Then: the failed-install blacklist is cleared
  And: the next request for /@deps/zod triggers a fresh auto-install attempt
  And: zod installs successfully
```

### Install timeout

```
Given: autoInstall is enabled
  And: pm::add takes longer than 30 seconds (e.g., extremely slow registry)
When: the browser requests `GET /@deps/slow-package`
Then: after 30 seconds, the request returns 404
  And: the error overlay shows "Auto-install timed out for 'slow-package'. Run `vertz add slow-package` manually."
  And: slow-package is added to the failed-install blacklist
```

### CLI override: --no-auto-install

```
Given: .vertzrc has `{ "autoInstall": true }`
  And: dev server started with `vertz dev --no-auto-install`
When: a missing package is requested
Then: auto-install does NOT run
  And: 404 is returned with install suggestion
```

### CLI override: --auto-install (overrides CI guard)

```
Given: CI=true environment variable is set
  And: dev server started with `vertz dev --auto-install`
When: a missing package is requested
Then: auto-install DOES run
```

### Reproducibility: vertz install after auto-install

```
Given: auto-install added "zod": "^3.24.0" to package.json during a dev session
When: another developer clones the project and runs `vertz install`
Then: zod is installed successfully from the lockfile
  And: the project builds without errors
```

---

## Testing Strategy

### Unit Tests (Rust)

Config parsing, CLI flag precedence, and blacklist behavior are unit-testable with tempdir + mock filesystem. No network access needed.

### Integration Tests (Rust)

The `pm::add()` call requires a registry. Integration tests use a mock HTTP server (e.g., `wiremock`) that serves canned registry responses and tarballs. This avoids real npm registry calls and runs reliably in CI.

The mock registry serves:
- `GET /<package>` → canned registry metadata JSON
- `GET /<package>/-/<tarball>` → minimal valid tarball

### Existing Test Updates

`suggestions.rs` tests (`test_suggest_install_package`, `test_suggest_unscoped_package`) currently assert on `bun add`. Phase 3 must update these to assert `vertz add`.

---

## Implementation Plan

### Phase 1: Config + VertzConfig field + CLI flags (Rust)

Add `auto_install` field to `VertzConfig` with `default = true`. Add `--no-auto-install` and `--auto-install` CLI flags to `DevArgs`. Wire config through `ServerConfig` to `DevServerState`. Implement CI guard logic. Update error suggestions from `bun add` to `vertz add`.

**Files changed:**
- `native/vertz-runtime/src/pm/vertzrc.rs` — add `auto_install` field
- `native/vertz-runtime/src/cli.rs` — add CLI flags to `DevArgs`
- `native/vertz-runtime/src/config.rs` — add `auto_install` to `ServerConfig`
- `native/vertz-runtime/src/server/http.rs` — wire config into `DevServerState`
- `native/vertz-runtime/src/server/module_server.rs` — add fields to `DevServerState`
- `native/vertz-runtime/src/errors/suggestions.rs` — update `bun add` → `vertz add`

**Acceptance criteria:**
```
describe('Feature: autoInstall config', () => {
  describe('Given .vertzrc with autoInstall: false', () => {
    it('Then VertzConfig.auto_install is false', () => {})
  })
  describe('Given no .vertzrc', () => {
    it('Then VertzConfig.auto_install defaults to true', () => {})
  })
  describe('Given .vertzrc with autoInstall: true', () => {
    it('Then round-trip serialization preserves the field', () => {})
  })
  describe('Given CI=true and no explicit autoInstall in .vertzrc', () => {
    it('Then auto_install resolves to false', () => {})
  })
  describe('Given CI=true and .vertzrc has autoInstall: true', () => {
    it('Then auto_install resolves to true (explicit overrides CI guard)', () => {})
  })
  describe('Given --no-auto-install CLI flag', () => {
    it('Then auto_install is false regardless of .vertzrc', () => {})
  })
  describe('Given --auto-install CLI flag with CI=true', () => {
    it('Then auto_install is true (CLI overrides CI guard)', () => {})
  })
})
describe('Feature: updated suggestions', () => {
  it('Then suggest_build_fix mentions vertz add, not bun add', () => {})
  it('Then suggest_resolve_fix mentions vertz add, not bun add', () => {})
})
```

### Phase 2: Auto-install in handle_deps_request (Rust)

Implement the auto-install logic in `handle_deps_request()`. Add global install lock + per-package `Notify` dedup + failed-install blacklist. Add `DevPmOutput` adapter. Wire `pm::add()` call via `spawn_blocking`. Add `Info` variant to `ErrorBroadcast`. Broadcast WebSocket notifications.

**Files changed:**
- `native/vertz-runtime/src/server/module_server.rs` — auto-install logic + state fields
- `native/vertz-runtime/src/pm/output.rs` — add `DevPmOutput` struct
- `native/vertz-runtime/src/errors/broadcaster.rs` — add `Info` variant to `ErrorBroadcast`

**Acceptance criteria:**
```
describe('Feature: auto-install on missing dep', () => {
  describe('Given auto_install is enabled and package is missing', () => {
    describe('When handle_deps_request receives /@deps/zod', () => {
      it('Then calls pm::add with the package name via spawn_blocking', () => {})
      it('Then re-resolves and returns 200', () => {})
      it('Then prints [PM] auto-install log to stderr', () => {})
      it('Then broadcasts Info WS message before install starts', () => {})
      it('Then broadcasts Clear WS message after successful install', () => {})
      it('Then writes caret range to package.json (same as vertz add)', () => {})
    })
  })
  describe('Given auto_install is disabled', () => {
    describe('When handle_deps_request receives /@deps/zod', () => {
      it('Then returns 404 without calling pm::add', () => {})
    })
  })
  describe('Given concurrent requests for same missing package', () => {
    it('Then pm::add is called exactly once', () => {})
    it('Then all requests eventually return 200', () => {})
  })
  describe('Given concurrent requests for different missing packages', () => {
    it('Then installs are serialized (one at a time)', () => {})
    it('Then both packages end up in package.json', () => {})
  })
  describe('Given pm::add fails (package not on registry)', () => {
    it('Then returns 404 with install failure message', () => {})
    it('Then broadcasts error via WebSocket', () => {})
    it('Then adds package to failed-install blacklist', () => {})
  })
  describe('Given package is in failed-install blacklist', () => {
    it('Then returns 404 immediately without calling pm::add', () => {})
  })
  describe('Given file watcher fires after a failed install', () => {
    it('Then failed-install blacklist is cleared', () => {})
  })
  describe('Given pm::add exceeds 30-second timeout', () => {
    it('Then returns 404 with timeout message', () => {})
    it('Then adds package to failed-install blacklist', () => {})
  })
})
```

---

## Dependencies

- Phase 1 is independent
- Phase 2 depends on Phase 1 (needs config + state fields)
