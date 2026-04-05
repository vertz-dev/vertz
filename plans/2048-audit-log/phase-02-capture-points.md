# Phase 2: Capture Points

## Context

Wire up all 5 event types at their capture sites. After this phase, the audit log is populated with real events and `vertz_get_audit_log` returns meaningful data.

Design doc: `plans/2048-audit-log.md`
GitHub issue: #2048

## Tasks

### Task 1: API request and SSR render capture

**Files:**
- `native/vtz/src/server/http.rs` (modified)

**What to implement:**

1. **API request capture** — In the API request handler (~line 1130), after `isolate.handle_request()` completes, record an `api_request` event:
   ```rust
   state.audit_log.record(AuditEvent::api_request(
       &method_str, &path, response.status, elapsed.as_secs_f64() * 1000.0
   ));
   ```
   The `Instant::now()` timing already exists at line 1130. Use the same `elapsed`.

2. **SSR render capture** — In the SSR page render path (~line 400), after `isolate.handle_ssr()` completes, record an `ssr_render` event:
   ```rust
   state.audit_log.record(AuditEvent::ssr_render(
       &url, status_code, query_count, ssr_resp.is_ssr, ssr_resp.render_time_ms
   ));
   ```
   The render timing is already available from `ssr_resp.render_time_ms`.

3. **File paths must be relative** — API paths are already relative (e.g., `/api/tasks`). SSR URLs are already relative.

**Acceptance criteria:**
- [ ] After an API request, `vertz_get_audit_log({ type: "api_request" })` returns the event with method, path, status, duration_ms
- [ ] After an SSR render, `vertz_get_audit_log({ type: "ssr_render" })` returns the event with url, status, is_ssr, duration_ms
- [ ] Events appear in chronological order

---

### Task 2: Compilation capture

**Files:**
- `native/vtz/src/server/module_server.rs` (modified) or `native/vtz/src/server/http.rs` (modified)

**What to implement:**

1. **Compilation capture** — At the call site(s) where `state.pipeline.compile_for_browser(path)` is called in `handle_source_file()` (module_server.rs), wrap with timing and record:
   ```rust
   let compile_start = Instant::now();
   let result = state.pipeline.compile_for_browser(&file_path);
   let compile_elapsed = compile_start.elapsed();

   // After getting the result:
   let relative_path = file_path.strip_prefix(&state.root_dir)
       .map(|p| p.to_string_lossy().to_string())
       .unwrap_or_else(|_| file_path.to_string_lossy().to_string());
   state.audit_log.record(AuditEvent::compilation(
       &relative_path,
       result.is_cached(),  // or however cache hit is determined
       result.has_css(),     // or however CSS extraction is determined
       compile_elapsed.as_secs_f64() * 1000.0,
   ));
   ```

2. **Relative paths** — Strip `root_dir` prefix from absolute file paths.

**Acceptance criteria:**
- [ ] After a source file compilation, `vertz_get_audit_log({ type: "compilation" })` returns the event
- [ ] `file` field is a relative path (e.g., `src/App.tsx`, not `/Users/.../src/App.tsx`)
- [ ] `cached` correctly reflects cache hit/miss
- [ ] `duration_ms` reflects actual compile time

---

### Task 3: File change and error capture

**Files:**
- `native/vtz/src/server/http.rs` (modified — watcher loop, ~line 1413)
- `native/vtz/src/errors/broadcaster.rs` (modified — `report_error()`)

**What to implement:**

1. **File change capture** — In the watcher event loop (~line 1413-1430 of `http.rs`), after computing the relative path, record:
   ```rust
   watcher_state.audit_log.record(AuditEvent::file_change(
       &relative_path,
       match change.kind {
           FileChangeKind::Create => "create",
           FileChangeKind::Modify => "modify",
           FileChangeKind::Remove => "remove",
       },
   ));
   ```
   The relative path computation already exists at line 1424.

2. **Error capture** — In `ErrorBroadcaster::report_error()` (~line 75 of `broadcaster.rs`), the broadcaster doesn't have access to the audit log directly. Two options:
   - **Option A:** Add `audit_log: Option<AuditLog>` to `ErrorBroadcaster` and record in `report_error()`.
   - **Option B:** Record at the call sites where `error_broadcaster.report_error(error)` is called (in `http.rs`, `module_server.rs`, `pipeline.rs`).

   **Prefer Option A** — it's the single capture point, avoids missing any call site. The `AuditLog` is cheap to clone (Arc).

   ```rust
   // In ErrorBroadcaster
   pub fn with_audit_log(mut self, audit_log: AuditLog) -> Self {
       self.audit_log = Some(audit_log);
       self
   }

   pub async fn report_error(&self, error: DevError) {
       if let Some(ref audit_log) = self.audit_log {
           audit_log.record(AuditEvent::error(
               &format!("{:?}", error.category),
               &format!("{:?}", error.severity),
               &error.message,
               error.file.as_deref(),
               error.line,
               error.column,
           ));
       }
       // ... existing broadcast logic
   }
   ```

3. **Wire up** — In `http.rs` where `DevServerState` is constructed, set the audit log on the error broadcaster.

**Acceptance criteria:**
- [ ] After a file change, `vertz_get_audit_log({ type: "file_change" })` returns the event with path and kind
- [ ] File paths are relative to project root
- [ ] After an error is reported, `vertz_get_audit_log({ type: "error" })` returns the event
- [ ] Error events have category, severity, message, and optional file/line/column
- [ ] All 5 event types now populate the audit log
- [ ] `vertz_get_audit_log({ last: 100 })` returns a mix of all event types in chronological order

---

### Task 4: Add audit_log.record() at remaining console_log.push() sites

**Files:**
- `native/vtz/src/server/mcp.rs` (modified — 2 console_log.push sites)
- `native/vtz/src/server/http.rs` (modified — AI render + navigate console_log.push sites)

**What to implement:**

Ensure every existing `console_log.push()` call site also has an `audit_log.record()` call. Some sites were already covered in Tasks 1-3. Remaining sites:

1. `mcp.rs:287` — MCP render success → already covered by SSR render capture (same event)
2. `mcp.rs:345` — MCP render error → record as `AuditEvent::error()`
3. `http.rs:480` — AI render client-only fallback → record as `AuditEvent::ssr_render()` with `is_ssr: false`
4. `http.rs:570` — AI navigate → not a core audit event type (navigation is client-side). Skip — this will be handled in Phase 3 when ConsoleLog is removed.

**Acceptance criteria:**
- [ ] All `console_log.push()` sites that map to audit event types have parallel `audit_log.record()` calls
- [ ] No information loss when ConsoleLog is eventually removed
