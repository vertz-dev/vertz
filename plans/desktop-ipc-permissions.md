# Desktop IPC Permissions — Per-Method Allowlist for Production Builds

## Summary

Add a capability-based permission system for desktop IPC methods. Production desktop apps declare which IPC methods they need in `.vertzrc`. The Rust `IpcDispatcher` enforces the allowlist before dispatching. Dev mode (`vtz dev --desktop`) continues to allow all methods unrestricted. Build-time validation warns when app code uses methods not declared in the allowlist.

This is explicitly called out as a prerequisite for production desktop deployment in the [IPC bridge design doc](./desktop-ipc-bridge.md) (Non-Goals section).

## Motivation

The IPC bridge (Phase 0-2) shipped as dev-mode-only. All IPC calls — filesystem, shell, clipboard, dialogs, window control — execute unrestricted. This is fine for development (same security posture as `vtz dev` itself), but a production desktop app needs the principle of least privilege: only the methods the app actually uses should be available.

Without a permission system, a compromised webview (XSS, supply chain attack on a dependency) has full access to `shell.execute()`, `fs.remove()`, and every other IPC method. A permission allowlist limits the blast radius.

## API Surface

### Configuration (`.vertzrc`)

Permissions are declared in `.vertzrc` under a `desktop.permissions` array. Each entry is a **capability string** — either a namespace group or an individual method.

```json
{
  "desktop": {
    "permissions": [
      "fs:read",
      "fs:write",
      "clipboard:read",
      "appWindow:all"
    ]
  }
}
```

### Capability strings

Capabilities map to concrete IPC method strings. Groups use `:` as separator. Individual methods use `.` (matching the wire protocol).

| Capability | Methods included |
|---|---|
| `fs:read` | `fs.readTextFile`, `fs.exists`, `fs.stat`, `fs.readDir` |
| `fs:write` | `fs.writeTextFile`, `fs.createDir`, `fs.remove`, `fs.rename` |
| `fs:all` | All `fs.*` methods |
| `shell:execute` | `shell.execute` (currently the only shell method; `shell:all` exists for forward-compatibility when `shell.spawn()` is added) |
| `shell:all` | All `shell.*` methods |
| `clipboard:read` | `clipboard.readText` |
| `clipboard:write` | `clipboard.writeText` |
| `clipboard:all` | All `clipboard.*` methods |
| `dialog:all` | `dialog.open`, `dialog.save`, `dialog.confirm`, `dialog.message` |
| `appWindow:all` | All `appWindow.*` methods |
| `app:all` | `app.dataDir`, `app.cacheDir`, `app.version` |
| `fs.readTextFile` | Individual method (fine-grained) |
| `shell.execute` | Individual method (fine-grained) |
| *(any `method.name`)* | Individual method (fine-grained) |

**No `*` / allow-all capability.** If you need everything, list each group explicitly. This forces developers to think about what their app actually needs.

**Permissions are additive only.** There are no deny lists. If a method is not covered by any entry in the `permissions` array, it is denied. This avoids the complexity of allow/deny precedence rules.

### Developer usage — a file manager app

`.vertzrc`:
```json
{
  "desktop": {
    "permissions": [
      "fs:all",
      "dialog:all",
      "clipboard:write",
      "app:all"
    ]
  }
}
```

### Developer usage — a read-only dashboard

`.vertzrc`:
```json
{
  "desktop": {
    "permissions": [
      "fs:read",
      "app:all"
    ]
  }
}
```

### Missing or empty permissions

| `.vertzrc` state | Behavior in production |
|---|---|
| No `desktop` key at all | All IPC methods denied. Build warns: "No desktop.permissions found." |
| `"desktop": {}` (no `permissions` key) | All IPC methods denied. Same warning. |
| `"desktop": { "permissions": [] }` | All IPC methods denied. No warning (developer explicitly chose zero permissions). |
| `"desktop": { "permissions": ["fs:read"] }` | Only `fs:read` methods allowed. |

This is the **secure default**: missing configuration = no access. The first two cases produce a build-time warning with a suggested fix so developers aren't silently stuck.

### TypeScript types

```ts
// @vertz/desktop/permissions — exported types for tooling

/** Namespace-level capability groups. */
type IpcCapabilityGroup =
  | 'fs:read'
  | 'fs:write'
  | 'fs:all'
  | 'shell:execute'
  | 'shell:all'
  | 'clipboard:read'
  | 'clipboard:write'
  | 'clipboard:all'
  | 'dialog:all'
  | 'appWindow:all'
  | 'app:all';

/** Individual method string (same as wire protocol). */
type IpcMethodString =
  | 'fs.readTextFile'  | 'fs.writeTextFile' | 'fs.readDir'
  | 'fs.exists'        | 'fs.stat'          | 'fs.remove'
  | 'fs.rename'        | 'fs.createDir'
  | 'shell.execute'
  | 'clipboard.readText' | 'clipboard.writeText'
  | 'dialog.open'     | 'dialog.save'      | 'dialog.confirm' | 'dialog.message'
  | 'appWindow.setTitle' | 'appWindow.setSize' | 'appWindow.setFullscreen'
  | 'appWindow.innerSize' | 'appWindow.minimize' | 'appWindow.close'
  | 'app.dataDir'     | 'app.cacheDir'     | 'app.version';

/** A permission entry is either a group or an individual method. */
type IpcPermission = IpcCapabilityGroup | IpcMethodString;

/** Desktop configuration in .vertzrc. */
interface DesktopConfig {
  permissions: IpcPermission[];
}
```

### Rust types

#### `.vertzrc` config extension (`native/vtz/src/pm/vertzrc.rs`)

A dedicated struct field is added to `VertzConfig` (not relying on `#[serde(flatten)]` `extra`). This ensures compile-time type safety, correct round-trip serialization, and consistency with all other config fields.

```rust
// Added to VertzConfig struct:
#[serde(default, skip_serializing_if = "Option::is_none")]
pub desktop: Option<DesktopConfig>,

// New struct:
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopConfig {
    #[serde(default)]
    pub permissions: Vec<String>,
}

// Accessor on VertzConfig:
impl VertzConfig {
    pub fn desktop_permissions(&self) -> Vec<String> {
        self.desktop
            .as_ref()
            .map(|d| d.permissions.clone())
            .unwrap_or_default()
    }
}
```

#### Permission enforcement (`native/vtz/src/webview/ipc_permissions.rs`)

```rust
use std::collections::HashSet;

/// All known IPC method strings. Used to validate individual method permissions.
const KNOWN_METHODS: &[&str] = &[
    "fs.readTextFile", "fs.writeTextFile", "fs.readDir", "fs.exists",
    "fs.stat", "fs.remove", "fs.rename", "fs.createDir",
    "shell.execute",
    "clipboard.readText", "clipboard.writeText",
    "dialog.open", "dialog.save", "dialog.confirm", "dialog.message",
    "appWindow.setTitle", "appWindow.setSize", "appWindow.setFullscreen",
    "appWindow.innerSize", "appWindow.minimize", "appWindow.close",
    "app.dataDir", "app.cacheDir", "app.version",
];

/// Resolved set of allowed IPC method strings.
///
/// Two states: allow-all (dev mode) or restricted (production).
/// Using an enum makes the states exhaustive and eliminates
/// the impossible state of allow_all=true with a non-empty set.
#[derive(Debug, Clone)]
pub enum IpcPermissions {
    /// Dev mode — all methods allowed, no checking.
    AllowAll,
    /// Production mode — only methods in the set are allowed.
    Restricted(HashSet<String>),
}

impl IpcPermissions {
    /// Dev mode — all methods allowed, no checking.
    pub fn allow_all() -> Self {
        Self::AllowAll
    }

    /// Production mode — resolve capability strings to concrete methods.
    pub fn from_capabilities(capabilities: &[String]) -> Self {
        let mut allowed = HashSet::new();
        for cap in capabilities {
            let resolved = resolve_capability(cap);
            if resolved.is_empty() {
                // Not a group — try as an individual method string
                if KNOWN_METHODS.contains(&cap.as_str()) {
                    allowed.insert(cap.clone());
                }
                // Unknown strings are silently ignored (build-time validation catches them)
            } else {
                for method in resolved {
                    allowed.insert(method.to_string());
                }
            }
        }
        Self::Restricted(allowed)
    }

    /// Check if a method string is allowed.
    pub fn is_allowed(&self, method: &str) -> bool {
        match self {
            Self::AllowAll => true,
            Self::Restricted(set) => set.contains(method),
        }
    }
}

/// Map a capability group string to the concrete method strings it includes.
/// Returns empty vec for non-group strings (individual methods, unknown strings).
fn resolve_capability(cap: &str) -> Vec<&'static str> {
    match cap {
        "fs:read" => vec![
            "fs.readTextFile", "fs.exists", "fs.stat", "fs.readDir",
        ],
        "fs:write" => vec![
            "fs.writeTextFile", "fs.createDir", "fs.remove", "fs.rename",
        ],
        "fs:all" => vec![
            "fs.readTextFile", "fs.writeTextFile", "fs.readDir",
            "fs.exists", "fs.stat", "fs.remove", "fs.rename", "fs.createDir",
        ],
        "shell:execute" | "shell:all" => vec!["shell.execute"],
        "clipboard:read" => vec!["clipboard.readText"],
        "clipboard:write" => vec!["clipboard.writeText"],
        "clipboard:all" => vec!["clipboard.readText", "clipboard.writeText"],
        "dialog:all" => vec![
            "dialog.open", "dialog.save", "dialog.confirm", "dialog.message",
        ],
        "appWindow:all" => vec![
            "appWindow.setTitle", "appWindow.setSize", "appWindow.setFullscreen",
            "appWindow.innerSize", "appWindow.minimize", "appWindow.close",
        ],
        "app:all" => vec!["app.dataDir", "app.cacheDir", "app.version"],
        _ => vec![],
    }
}

/// Reverse lookup: find the capability group(s) that include a given method.
/// Used in error messages to suggest the right group to add.
pub fn suggest_capability(method: &str) -> Option<&'static str> {
    let prefix = method.split('.').next()?;
    match prefix {
        "fs" => {
            // Check if it's a read or write method
            match method {
                "fs.readTextFile" | "fs.exists" | "fs.stat" | "fs.readDir" => Some("fs:read"),
                "fs.writeTextFile" | "fs.createDir" | "fs.remove" | "fs.rename" => Some("fs:write"),
                _ => None,
            }
        }
        "shell" => Some("shell:all"),
        "clipboard" => match method {
            "clipboard.readText" => Some("clipboard:read"),
            "clipboard.writeText" => Some("clipboard:write"),
            _ => None,
        },
        "dialog" => Some("dialog:all"),
        "appWindow" => Some("appWindow:all"),
        "app" => Some("app:all"),
        _ => None,
    }
}
```

### Dispatcher integration

The permission check happens in `IpcDispatcher::dispatch()`, after parsing the method string but before executing the handler. The denial response is sent **synchronously** on the main thread (no `tokio::spawn` needed — the check is a `HashSet::contains` and the response is immediate):

```rust
// ipc_dispatcher.rs — modified dispatch flow

pub struct IpcDispatcher {
    tokio_handle: TokioHandle,
    proxy: EventLoopProxy<UserEvent>,
    permissions: IpcPermissions,  // NEW
}

impl IpcDispatcher {
    pub fn new(
        tokio_handle: TokioHandle,
        proxy: EventLoopProxy<UserEvent>,
        permissions: IpcPermissions,  // NEW
    ) -> Self {
        Self { tokio_handle, proxy, permissions }
    }

    pub fn dispatch(&self, body: &str) {
        let request: IpcRequest = match serde_json::from_str(body) { /* ... */ };

        // ── Permission check BEFORE dispatch (synchronous, no spawn needed) ──
        if !self.permissions.is_allowed(&request.method) {
            let suggestion = suggest_capability(&request.method);
            let message = match suggestion {
                Some(group) => format!(
                    "IPC method '{}' is not allowed. Add \"{}\" (or \"{}\" for fine-grained) to desktop.permissions in .vertzrc",
                    request.method, group, request.method
                ),
                None => format!(
                    "IPC method '{}' is not allowed. Add it to desktop.permissions in .vertzrc",
                    request.method
                ),
            };
            let response = IpcErrResponse {
                id: request.id,
                ok: false,
                error: IpcErrorPayload {
                    code: IpcErrorCode::PermissionDenied.as_str().to_string(),
                    message,
                },
            };
            if let Ok(json) = serde_json::to_string(&response) {
                let js = format!("window.__vtz_ipc_resolve({}, {})", request.id, json);
                let (tx, _rx) = tokio::sync::oneshot::channel();
                let _ = self.proxy.send_event(eval_script_event(js, tx));
            }
            return;
        }

        // ... existing dispatch logic (tokio::spawn for async handler)
    }
}
```

### Build-time validation

During `vtz build`, the build step analyzes `@vertz/desktop` imports and cross-references with the `.vertzrc` permissions:

```
$ vtz build

  warning: Desktop permission mismatch

    src/file-manager.ts uses `fs.remove()` but `fs:write` is not in
    desktop.permissions. Add "fs:write" or "fs.remove" to .vertzrc:

    {
      "desktop": {
        "permissions": ["fs:read", "fs:write"]
      }
    }
```

This is a **warning**, not an error. The app may use dynamic method invocation via `ipc.invoke()` that static analysis can't detect.

### Error experience

When a permission is denied at runtime:

```ts
import { fs } from '@vertz/desktop';

const result = await fs.remove('/tmp/sensitive.txt');
// result.ok === false
// result.error.code === 'PERMISSION_DENIED'
// result.error.message === "IPC method 'fs.remove' is not allowed. Add \"fs:write\" (or \"fs.remove\" for fine-grained) to desktop.permissions in .vertzrc"
```

The error message tells the developer:
1. Which method was denied
2. Which **group capability** covers it (so they reach for the right abstraction level)
3. The fine-grained alternative (for developers who want minimal permissions)
4. Exactly which file and key to edit

This aligns with "AI agents are first-class users" — an LLM can parse the error and update `.vertzrc` automatically.

### Dev mode behavior

When running `vtz dev --desktop`, the dispatcher is constructed with `IpcPermissions::allow_all()`. No permission checking occurs. This is the current behavior — no breaking change.

```rust
// main.rs — dev mode (vtz dev --desktop)
let permissions = IpcPermissions::allow_all();
let dispatcher = IpcDispatcher::new(tokio_handle, proxy, permissions);

// production build (future: vtz build --target desktop)
let vertzrc = load_vertzrc(&project_root)?;
let caps = vertzrc.desktop_permissions(); // accessor on VertzConfig
let permissions = IpcPermissions::from_capabilities(&caps);
let dispatcher = IpcDispatcher::new(tokio_handle, proxy, permissions);
```

### First-run experience

When a developer runs `vtz build --target desktop` for the first time with no `desktop.permissions` configured, the build outputs an actionable message:

```
  warning: No desktop.permissions found in .vertzrc

    Your app uses these @vertz/desktop methods:
      fs.readTextFile, fs.exists, fs.stat, fs.readDir, fs.writeTextFile

    Suggested .vertzrc configuration:

    {
      "desktop": {
        "permissions": ["fs:read", "fs:write"]
      }
    }

    Without permissions, all IPC methods will be denied at runtime.
```

This bridges the gap between dev mode (everything allowed) and production (explicit allowlist required). The build detects which methods the app uses and suggests the minimal set of capabilities.

### Type-level tests (`.test-d.ts`)

```ts
// @vertz/desktop/permissions.test-d.ts
import { expectTypeOf } from 'expect-type';
import type { IpcCapabilityGroup, IpcMethodString, IpcPermission } from '@vertz/desktop/permissions';

// ── Capability groups are string literals ──
expectTypeOf<IpcCapabilityGroup>().toMatchTypeOf<string>();

// ── Method strings match wire protocol ──
expectTypeOf<'fs.readTextFile'>().toMatchTypeOf<IpcMethodString>();
expectTypeOf<'shell.execute'>().toMatchTypeOf<IpcMethodString>();

// ── IpcPermission accepts both groups and individual methods ──
expectTypeOf<'fs:read'>().toMatchTypeOf<IpcPermission>();
expectTypeOf<'fs.readTextFile'>().toMatchTypeOf<IpcPermission>();

// @ts-expect-error — invalid capability string
const bad: IpcPermission = 'invalid:stuff';

// @ts-expect-error — typo in method name
const typo: IpcPermission = 'fs.readTextfile';
```

## Manifesto Alignment

### Principles upheld

- **If it builds, it works** — Build-time validation catches undeclared permissions before runtime. TypeScript types enforce valid capability strings at the config level.
- **One way to do things** — One configuration location (`.vertzrc`), one capability syntax, one enforcement point. No alternative permission mechanisms (no per-file annotations, no runtime APIs to grant permissions).
- **AI agents are first-class users** — The capability syntax is predictable (`namespace:scope` or `method.name`). Error messages include the exact `.vertzrc` fix. An LLM can add the right permission on the first try.
- **Explicit over implicit** — No ambient permissions. Production apps must declare every capability they need. Dev mode is the explicit exception.
- **Compile-time over runtime** — Build-time warnings catch mismatches. Runtime enforcement is the safety net, not the primary feedback loop.

### What we rejected

- **Tauri-style multi-file capabilities** — Tauri uses separate JSON files per capability with `windows`, `permissions`, and `scope` arrays. This is powerful but complex. We use a flat list in `.vertzrc` — one file, one array, no indirection.
- **Runtime permission prompts** — Electron-style "Allow this app to access your filesystem?" dialogs. These train users to click "Allow" and provide false security. We use static declaration instead.
- **Per-component permissions** — Scoping permissions to specific components or routes. This requires a capability system that tracks which component initiated the IPC call, which adds complexity for marginal security benefit.
- **`allow: "*"` wildcard** — Tempting shortcut that defeats the purpose. If you need everything, list the groups explicitly.
- **Path scoping in Phase 1** — Restricting `fs:read` to specific directories (e.g., `"fs:read": { "scope": ["$APP", "$HOME/Documents"] }`) is valuable but adds significant complexity. Deferred to a future phase.

## Non-Goals

- **Path scoping / sandboxing** — Limiting which paths `fs:read` or `fs:write` can access. Important for hardened security but requires canonicalization, symlink resolution, and platform-specific sandboxing. Separate design doc after the basic permission system ships.
- **Runtime permission grants** — APIs like `requestPermission('fs:write')` that let the app request additional permissions at runtime. This opens escape hatches that undermine the static allowlist.
- **Per-window permissions** — Different permissions for different webview windows (future multi-window support). The current architecture has a single webview, so this is premature.
- **Permission UI in the app** — A settings panel where users can toggle permissions. The `.vertzrc` is the source of truth, not a GUI.
- **Code signing / notarization** — OS-level trust (macOS Gatekeeper, Windows SmartScreen). Orthogonal to IPC permissions. Separate initiative under "production app bundling."
- **Custom method permissions** — Permission control for `ipc.invoke()` custom methods. Custom handlers are developer-registered Rust code — the developer controls both sides.
- **Permission versioning / auto-migration** — When Vertz adds new IPC methods in future releases (e.g., `fs.watch`, `shell.spawn`), existing apps won't have them in their allowlist. New methods are opt-in by default — developers add them to `desktop.permissions` when they want to use them. This is the correct secure default and the intended upgrade path, not a bug.

## Unknowns

1. **Build-time static analysis accuracy** — How reliably can `vtz build` detect which `@vertz/desktop` methods an app uses? Direct calls (`fs.readTextFile()`) are easy. Re-exported wrappers (`myFs.read = fs.readTextFile`) and dynamic calls (`ipc.invoke(methodName, ...)`) are harder. **Resolution:** Start with direct call detection (covers 95% of usage). Accept false negatives for dynamic patterns — runtime enforcement is the safety net.

## POC Results

Not required. The architecture is straightforward — a `HashSet` lookup in the dispatch path. The `IpcMethod` enum with exhaustive match already provides the hook point. No new threading model or transport changes needed.

## Type Flow Map

### Trace 1: Permission check in dispatch path

```
Layer                                    Type at this point
──────────────────────────────────────────────────────────────────
.vertzrc JSON                            { "desktop": { "permissions": ["fs:read"] } }
  |
Rust: load_vertzrc()                     VertzConfig { desktop: Some(DesktopConfig { permissions: vec!["fs:read"] }) }
  |
Rust: IpcPermissions::from_capabilities  IpcPermissions { allowed_methods: {"fs.readTextFile", "fs.exists", "fs.stat", "fs.readDir"}, allow_all: false }
  |
Rust: dispatcher.dispatch(body)          IpcRequest { method: "fs.remove", ... }
  |
Rust: permissions.is_allowed("fs.remove") false -- "fs.remove" not in allowed_methods
  |
Rust: suggest_capability("fs.remove")    Some("fs:write") -- reverse lookup for error message
  |
Rust: IpcErrResponse                     { id: N, ok: false, error: { code: "PERMISSION_DENIED", message: "...Add \"fs:write\"..." } }
  |
JS: __vtz_ipc_resolve(N, response)       { ok: false, error: { code: 'PERMISSION_DENIED', message: '...' } }
  |
TS: fs.remove() returns                  Result<void, DesktopError>  -- error.code is DesktopErrorCode
  |
Developer: result.error.code             'PERMISSION_DENIED'  -- DesktopErrorCode literal type
```

### Trace 2: Dev mode allows all

```
Rust: IpcPermissions::allow_all()        IpcPermissions { allowed_methods: {}, allow_all: true }
  |
Rust: permissions.is_allowed("fs.remove") true  -- allow_all short-circuits
  |
Rust: execute_method() proceeds          Normal dispatch, no permission check
```

### Trace 3: TypeScript capability type validation

```
Developer: .vertzrc                      "permissions": ["fs:read"]
  |
TS type: IpcPermission                   'fs:read' matches IpcCapabilityGroup  -- valid
  |
Developer: .vertzrc                      "permissions": ["fs:reed"]
  |
TS type: IpcPermission                   'fs:reed' -- does NOT match any literal
  |
Build-time: vtz build validates          Warning: unknown capability "fs:reed"
```

## E2E Acceptance Test

```ts
import { describe, it, expect } from '@vertz/test';
import { fs, clipboard, shell } from '@vertz/desktop';

describe('Feature: Desktop IPC permissions', () => {
  // ── Tests run with restricted permissions: ["fs:read", "app:all"] ──

  describe('Given a desktop app with permissions ["fs:read", "app:all"]', () => {
    describe('When calling fs.readTextFile() (allowed by fs:read)', () => {
      it('Then returns ok result with file contents', async () => {
        const result = await fs.readTextFile('./test-fixtures/hello.txt');
        expect(result.ok).toBe(true);
        expect(result.data).toBe('Hello from Vertz Desktop!');
      });
    });

    describe('When calling fs.exists() (allowed by fs:read)', () => {
      it('Then returns ok result', async () => {
        const result = await fs.exists('./test-fixtures/hello.txt');
        expect(result.ok).toBe(true);
        expect(result.data).toBe(true);
      });
    });

    describe('When calling fs.writeTextFile() (NOT allowed — needs fs:write)', () => {
      it('Then returns PERMISSION_DENIED error with group suggestion', async () => {
        const result = await fs.writeTextFile('./tmp.txt', 'should fail');
        expect(result.ok).toBe(false);
        expect(result.error.code).toBe('PERMISSION_DENIED');
        expect(result.error.message).toContain('fs.writeTextFile');
        expect(result.error.message).toContain('fs:write');
        expect(result.error.message).toContain('.vertzrc');
      });
    });

    describe('When calling fs.remove() (NOT allowed — needs fs:write)', () => {
      it('Then returns PERMISSION_DENIED error', async () => {
        const result = await fs.remove('./tmp.txt');
        expect(result.ok).toBe(false);
        expect(result.error.code).toBe('PERMISSION_DENIED');
      });
    });

    describe('When calling shell.execute() (NOT allowed)', () => {
      it('Then returns PERMISSION_DENIED error', async () => {
        const result = await shell.execute('echo', ['hello']);
        expect(result.ok).toBe(false);
        expect(result.error.code).toBe('PERMISSION_DENIED');
        expect(result.error.message).toContain('shell.execute');
      });
    });

    describe('When calling clipboard.readText() (NOT allowed)', () => {
      it('Then returns PERMISSION_DENIED error', async () => {
        const result = await clipboard.readText();
        expect(result.ok).toBe(false);
        expect(result.error.code).toBe('PERMISSION_DENIED');
      });
    });
  });

  // ── Dev mode test ──

  describe('Given a desktop app running in dev mode (vtz dev --desktop)', () => {
    describe('When calling any IPC method', () => {
      it('Then all methods are allowed regardless of .vertzrc', async () => {
        // Dev mode uses IpcPermissions::allow_all()
        const read = await fs.readTextFile('./test-fixtures/hello.txt');
        expect(read.ok).toBe(true);

        const write = await fs.writeTextFile('./test-fixtures/tmp.txt', 'dev mode');
        expect(write.ok).toBe(true);

        await fs.remove('./test-fixtures/tmp.txt');
      });
    });
  });

  // ── Type-level tests ──

  // @ts-expect-error — readTextFile requires string path, permission system doesn't change types
  describe('When calling fs.readTextFile(123)', () => {
    it('Then TypeScript catches the error at compile time', () => {});
  });
});
```

## Implementation Phases

### Phase 1: Permission model + Rust enforcement

- `IpcPermissions` struct with `allow_all()` and `from_capabilities()`
- `resolve_capability()` function mapping capability strings to method sets
- Permission check in `IpcDispatcher::dispatch()` before method execution
- `.vertzrc` `desktop.permissions` field in `VertzConfig`
- Dev mode continues using `IpcPermissions::allow_all()`
- Rust unit tests for all capability resolution and permission checking

### Phase 2: TypeScript types + build-time validation

- `@vertz/desktop/permissions` types (`IpcCapabilityGroup`, `IpcMethodString`, `IpcPermission`)
- Type-level tests (`.test-d.ts`)
- `vtz build` reads `.vertzrc` and warns on undeclared method usage
- Static analysis of direct `@vertz/desktop` method calls in app source

**Scope risk:** Build-time static analysis (scanning app imports, resolving `@vertz/desktop` method calls, cross-referencing with `.vertzrc`) is the most complex part of this phase. The TypeScript types are straightforward and can ship independently. If static analysis proves harder than expected, it can be descoped to Phase 3 without blocking the core permission system — runtime enforcement (Phase 1) is the safety net. Build-time analysis also depends on `vtz build --target desktop` infrastructure which doesn't exist yet.

### Phase 3: Integration tests + docs

- E2E tests running desktop app with restricted permissions (via `vtz test --e2e` if available, otherwise Rust integration tests as fallback)
- E2E tests verifying dev mode allows all
- Documentation in `packages/mint-docs/` for the permission system
- Developer guide: how to configure permissions, common recipes
- First-run DX: `vtz build --target desktop` with no permissions configured shows suggested config

### Future: Path scoping (separate design doc)

- `fs:read` with `scope: ["$APP", "$HOME/Documents"]`
- Path canonicalization and validation before handler execution
- Symlink resolution policy

## Key Files

| Component | Path |
|---|---|
| IPC dispatcher (modified) | `native/vtz/src/webview/ipc_dispatcher.rs` |
| IPC permissions (new) | `native/vtz/src/webview/ipc_permissions.rs` |
| `.vertzrc` config (modified) | `native/vtz/src/pm/vertzrc.rs` |
| Desktop mode entry (modified) | `native/vtz/src/main.rs` |
| TS permission types (new) | `packages/desktop/src/permissions.ts` |
| TS type tests (new) | `packages/desktop/src/__tests__/permissions.test-d.ts` |
| Build validation (new) | `packages/cli/src/commands/build-desktop-permissions.ts` |
