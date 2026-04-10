# Phase 1: Rust Permission Enforcement

## Context

The desktop IPC bridge currently allows all methods unrestricted. This phase adds the core permission enforcement layer in Rust: an `IpcPermissions` enum, capability resolution, and a permission check in `IpcDispatcher::dispatch()` before method execution. Dev mode continues to allow all methods.

Design doc: `plans/desktop-ipc-permissions.md`

## Tasks

### Task 1: IpcPermissions enum and capability resolution

**Files:**
- `native/vtz/src/webview/ipc_permissions.rs` (new)
- `native/vtz/src/webview/mod.rs` (modified — add `mod ipc_permissions`)

**What to implement:**
- `IpcPermissions` enum with `AllowAll` and `Restricted(HashSet<String>)` variants
- `IpcPermissions::allow_all()` constructor
- `IpcPermissions::from_capabilities(&[String])` constructor that resolves capability strings
- `IpcPermissions::is_allowed(&self, method: &str) -> bool`
- `resolve_capability(cap: &str) -> Vec<&'static str>` for group capabilities
- `KNOWN_METHODS` constant for validating individual method strings
- `suggest_capability(method: &str) -> Option<&'static str>` for error messages

**Acceptance criteria:**
- [ ] `IpcPermissions::allow_all().is_allowed("anything")` returns true
- [ ] `IpcPermissions::from_capabilities(&["fs:read"])` allows `fs.readTextFile`, `fs.exists`, `fs.stat`, `fs.readDir`
- [ ] `IpcPermissions::from_capabilities(&["fs:read"])` denies `fs.writeTextFile`, `fs.remove`, `shell.execute`
- [ ] `IpcPermissions::from_capabilities(&["fs.readTextFile"])` allows only that individual method
- [ ] Unknown capability strings are silently ignored (empty allowed set for them)
- [ ] `suggest_capability("fs.remove")` returns `Some("fs:write")`
- [ ] `suggest_capability("unknown.method")` returns `None`
- [ ] All 10+ capability groups resolve to the correct method sets

---

### Task 2: VertzConfig desktop field

**Files:**
- `native/vtz/src/pm/vertzrc.rs` (modified — add `DesktopConfig` struct and field)

**What to implement:**
- `DesktopConfig` struct with `permissions: Vec<String>`
- Add `desktop: Option<DesktopConfig>` field to `VertzConfig`
- Add `desktop_permissions(&self) -> Vec<String>` accessor method
- Ensure round-trip serialization works (unknown fields preserved, desktop field optional)

**Acceptance criteria:**
- [ ] Loading `.vertzrc` with `{"desktop": {"permissions": ["fs:read"]}}` produces `VertzConfig` with `desktop.permissions == ["fs:read"]`
- [ ] Loading `.vertzrc` without `desktop` key returns `None` for desktop field
- [ ] `desktop_permissions()` returns empty vec when desktop is None
- [ ] Round-trip: load → modify other fields → save preserves desktop config
- [ ] Empty `{"desktop": {}}` deserializes with `permissions: []`

---

### Task 3: Permission check in IpcDispatcher

**Files:**
- `native/vtz/src/webview/ipc_dispatcher.rs` (modified — add permissions field and check)
- `native/vtz/src/webview/mod.rs` (modified — update IpcDispatcher construction in ipc_handler)

**What to implement:**
- Add `permissions: IpcPermissions` field to `IpcDispatcher`
- Update `IpcDispatcher::new()` to take `permissions` parameter
- Add permission check in `dispatch()` before `tokio::spawn` — synchronous denial response
- Use `IpcErrorCode::PermissionDenied` and `suggest_capability()` in error message
- Update all call sites (main.rs) to pass `IpcPermissions::allow_all()` for dev mode

**Acceptance criteria:**
- [ ] `IpcDispatcher` with `AllowAll` permissions dispatches all methods (existing behavior preserved)
- [ ] `IpcDispatcher` with `Restricted({"fs.readTextFile"})` allows fs.readTextFile
- [ ] `IpcDispatcher` with `Restricted({"fs.readTextFile"})` returns PERMISSION_DENIED for fs.writeTextFile
- [ ] PERMISSION_DENIED error message includes the method name
- [ ] PERMISSION_DENIED error message includes the suggested group capability
- [ ] Permission denial is synchronous (no tokio::spawn for the error response)
- [ ] Dev mode (`main.rs`) passes `IpcPermissions::allow_all()` — no behavioral change
