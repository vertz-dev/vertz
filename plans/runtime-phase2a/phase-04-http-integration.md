# Phase 4: HTTP Routing + HMR Integration

## Context

With the Isolate Supervisor (Phase 2) and Message Bus (Phase 3) working, this phase wires them into the dev server's HTTP layer. Incoming API requests are routed to the correct Isolate based on entity, SSR renders use the designated SSR Isolate, and HMR reloads affected Isolates atomically.

Design doc: `plans/vertz-runtime.md` (Phase 2 Architecture Summary, items 1 and 6)

## Tasks

### Task 1: Replace PersistentIsolate with IsolateSupervisor in HTTP server

**Files:**
- `native/vtz/src/server/http.rs` (modified)
- `native/vtz/src/runtime/isolate_supervisor.rs` (modified — add request routing)

**What to implement:**

Change `DevServerState` from holding a single `PersistentIsolate` to an `IsolateSupervisor`:

```rust
// Before:
pub struct DevServerState {
    api_isolate: Arc<RwLock<Option<Arc<PersistentIsolate>>>>,
    // ...
}

// After:
pub struct DevServerState {
    supervisor: Arc<RwLock<Option<Arc<IsolateSupervisor>>>>,
    // ...
}
```

Add request routing to `IsolateSupervisor`:

```rust
impl IsolateSupervisor {
    /// Route an API request to the correct Isolate based on the URL path
    /// e.g. /api/tasks → entity "task" → Isolate for task's group
    pub async fn handle_api_request(
        &self,
        entity_name: &str,
        request: IsolateRequest,
    ) -> Result<IsolateResponse, String>;

    /// Route an SSR request — uses dedicated SSR Isolate or first available
    pub async fn handle_ssr(
        &self,
        request: SsrRequest,
    ) -> Result<SsrResponse, String>;
}
```

Update `dev_server_handler` to extract entity name from the request path and route via the supervisor.

**Acceptance criteria:**
- [ ] API requests route to the correct entity's Isolate
- [ ] SSR requests route to the SSR Isolate
- [ ] Unknown entity in request path returns 404 with clear error
- [ ] Existing single-entity apps (no multi-isolate) still work (backward compatible)
- [ ] Structured logs show which Isolate handled each request

---

### Task 2: HMR — atomic Isolate reload on file change

**Files:**
- `native/vtz/src/runtime/isolate_supervisor.rs` (modified — add HMR support)
- `native/vtz/src/server/http.rs` (modified — wire file watcher to supervisor)

**What to implement:**

When the file watcher detects a change:
1. Determine which Isolates are affected (via module graph — which entities import the changed file)
2. Validate compilation for ALL affected Isolates before applying any
3. If validation succeeds: reload all affected Isolates atomically
4. If validation fails: report error, keep all Isolates on previous code

```rust
impl IsolateSupervisor {
    /// Reload Isolates affected by a file change
    /// Returns the list of reloaded Isolate labels for logging
    pub async fn handle_file_change(
        &self,
        changed_file: &Path,
    ) -> Result<Vec<String>, HmrError>;
}

pub enum HmrError {
    CompilationFailed {
        file: PathBuf,
        error: String,
        affected_isolates: Vec<String>,
    },
}
```

Wire into the existing `FileWatcher` callback in `http.rs`.

**Acceptance criteria:**
- [ ] File change triggers reload of only affected Isolates (not all)
- [ ] Compilation failure in one Isolate prevents ALL affected Isolates from reloading
- [ ] HMR error is broadcast via WebSocket error channel with affected Isolate names
- [ ] Non-affected Isolates continue serving requests during reload
- [ ] Structured log: `[entity:task,comment] Reloaded (file: src/entities/task.ts)`

---

### Task 3: Integration test — HTTP request routing to correct Isolate

**Files:**
- `native/vtz/tests/http_multi_isolate.rs` (new)

**What to implement:**

End-to-end test using the full HTTP server with multi-isolate:

```rust
#[tokio::test]
async fn api_request_routes_to_correct_isolate() {
    // 1. Start dev server with multi-entity fixture
    // 2. Send GET /api/tasks → should hit task entity's Isolate
    // 3. Send GET /api/users → should hit user entity's Isolate
    // 4. Verify each response comes from the expected entity handler
}

#[tokio::test]
async fn hmr_reloads_affected_isolates_only() {
    // 1. Start dev server with multi-entity fixture
    // 2. Modify task entity source file
    // 3. Verify task's Isolate reloaded, user's did not
    // 4. Verify both continue serving requests correctly
}
```

**Acceptance criteria:**
- [ ] HTTP requests route correctly based on entity path
- [ ] HMR affects only the changed entity's Isolate
- [ ] Server remains responsive during HMR reload
- [ ] Error responses include Isolate label context
