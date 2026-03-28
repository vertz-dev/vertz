# TypeScript Error Integration in the Dev Server Overlay

> Surface TypeScript type errors in the dev server's browser error overlay by running a type checker (`tsc` or `tsgo`) as a managed child process.

## Context

The Vertz compiler (oxc) strips types but does **not** type-check. Developers currently need a separate terminal running `tsc --watch` or rely on their editor. Surfacing type errors in the same browser overlay as build/runtime errors closes the feedback loop: save a file → see type errors alongside build errors → fix → overlay auto-dismisses.

This is table stakes for DX parity with Vite + vue-tsc and aligns with Manifesto principle "Compile-time over runtime" — type errors are compile-time errors that should be surfaced as first-class dev server diagnostics.

### Checker-Agnostic Design

The feature is designed to support multiple type checker backends. TypeScript 7 (`tsgo`, the Go port) promises ~10x faster type checking. Rather than hardcoding `tsc`, the binary detection and process management are **checker-agnostic**:

- **Detection priority:** `tsgo` (local) → `tsgo` (PATH) → `tsc` (local) → `tsc` (PATH)
- **Output parsing:** Both `tsc` and `tsgo` use the same `--pretty false` diagnostic format. If `tsgo` diverges, the parser can handle both formats via the `TscParsed` abstraction.
- **`--typecheck-binary <path>` escape hatch:** Developers can point to any type checker binary that speaks the `tsc --pretty false` output format.
- **Zero config for tsgo adoption:** When a project has `tsgo` installed, it's automatically preferred. No config change needed.

---

## API Surface

### CLI

```bash
# Default: typecheck enabled (auto-detects tsgo or tsc)
vertz-runtime dev

# Explicitly disable typechecking
vertz-runtime dev --no-typecheck

# Custom tsconfig path
vertz-runtime dev --tsconfig tsconfig.app.json

# Explicit type checker binary (any binary that speaks tsc --pretty false format)
vertz-runtime dev --typecheck-binary ./node_modules/.bin/tsgo
```

**CLI convention note:** `--no-typecheck` is the first boolean toggle flag in the CLI (existing flags are all `--key value`). This sets the precedent for future boolean options. Implementation uses clap's `default_value_t = true` with negation via `--no-typecheck`.

### Config

```rust
// ServerConfig additions
pub struct ServerConfig {
    // ... existing fields ...
    /// Whether to run type checking (default: true).
    pub enable_typecheck: bool,
    /// Custom tsconfig path (default: None — let checker auto-detect).
    /// When None, the checker uses its own detection (walks up from cwd).
    /// When Some, passes --project <path> to the checker.
    pub tsconfig_path: Option<PathBuf>,
    /// Explicit type checker binary path (default: None — auto-detect tsgo/tsc).
    /// When set, skips binary detection and uses this path directly.
    pub typecheck_binary: Option<PathBuf>,
}
```

### Error Category

```rust
// ErrorCategory — TypeCheck inserted between Ssr and Resolve.
// Resolve and Build discriminant values shift up by 1.
// Wire format uses serde rename_all = "lowercase" (string-based),
// so the numeric shift has no serialization impact.
pub enum ErrorCategory {
    Runtime = 0,
    Ssr = 1,
    TypeCheck = 2,  // NEW
    Resolve = 3,    // was 2
    Build = 4,      // was 3
}
```

**Priority rationale:** Build errors (syntax/parse) are the highest priority — if the code can't parse, type errors are noise. Resolve errors (missing modules) are next — if a module can't be found, type errors in that module are moot. TypeCheck errors come after resolve but before SSR/Runtime — they represent real code problems that will cause runtime failures.

**Implementation note:** The `active_errors()` method in `ErrorState` uses a hardcoded priority array that MUST be updated to include `TypeCheck`. The `Display` impl must also include the new variant.

### Error Overlay Integration

Type errors appear in the existing overlay with:
- File path, line, column (from tsc output)
- Error message (TS error code + description)
- Code snippet (extracted from source file)
- Suggestion (common fixes for well-known TS error codes, only when genuinely actionable)

**Batch update semantics:** Type errors are updated atomically per compilation pass — not one-at-a-time. The parser buffers all diagnostics within a tsc compilation pass and flushes them on the sentinel line (`Found N errors`). This prevents overlay flicker (brief "no errors" → "errors back") during incremental checks. Requires a new `ErrorState::replace_category(category, errors)` method that atomically swaps all errors of a category and triggers a single broadcast.

Type errors are **auto-cleared** when tsc's incremental output reports `Found 0 errors`.

### DevServerState

```rust
pub struct DevServerState {
    // ... existing fields ...
    /// Handle to the tsc watcher subprocess (None if disabled or tsc not found).
    pub typecheck_handle: Option<TypeCheckHandle>,
}
```

---

## Architecture

### Component: `typecheck` module

```
native/vertz-runtime/src/typecheck/
├── mod.rs           — public API: TypeCheckHandle, start_typecheck()
├── process.rs       — child process lifecycle (spawn, crash detection, shutdown)
└── parser.rs        — parse tsc --watch output into DevError structs
```

### Flow

```
Server startup
  └─ start_typecheck(config, error_broadcaster)
       ├─ Detect checker binary:
       │    ├─ If --typecheck-binary set → use that exact path
       │    └─ Otherwise: tsgo (local) → tsgo (PATH) → tsc (local) → tsc (PATH)
       ├─ If not found → log actionable warning, return None
       └─ Spawn: <checker> --noEmit --watch --pretty false --preserveWatchOutput [--project tsconfig.json]
            ├─ stdout reader task (tokio::spawn)
            │    ├─ Buffer diagnostics per compilation pass
            │    ├─ On sentinel line → replace_category(TypeCheck, buffered_errors)
            │    ├─ On "Found 0 errors" → clear_category(TypeCheck)
            │    └─ On EOF (tsc exited) → log warning, clear TypeCheck errors
            └─ stderr reader task (tokio::spawn)
                 └─ Capture fatal tsc errors (invalid tsconfig, etc.) → report as DevError

tsc lifecycle logging:
  └─ "[Server] TypeScript checking started..."
  └─ "[Server] TypeScript checking complete (N errors, Xs)" (after first sentinel)
  └─ "[Server] tsc exited unexpectedly (code N) — type checking disabled" (on crash)

File change detected (watcher)
  └─ tsc --watch detects the change itself (no action needed from us)
       └─ Outputs new diagnostic block → buffered → flushed on sentinel → broadcast

Server shutdown
  └─ TypeCheckHandle implements Drop
       └─ Sends SIGTERM to child process, joins reader tasks
       └─ Guarantees no zombie processes even on panic
```

### Key Design Decisions

1. **`--pretty false --preserveWatchOutput` for machine-parseable output.** The `--pretty false` format is stable and well-defined: `file(line,col): error TSxxxx: message`. Both `tsc` and `tsgo` use this format. The `--preserveWatchOutput` prevents terminal clear sequences that would be noise in our stdout reader. The pretty format uses ANSI colors and multi-line formatting that's fragile to parse.

2. **The checker manages its own file watching.** We do NOT feed file changes to the checker — it has its own watcher via `--watch`. This avoids duplicating file watching logic and ensures the checker sees the same files its resolver would see. Our watcher and the checker's watcher are independent.

3. **Checker-agnostic binary detection.** The feature is not hardcoded to `tsc`. Detection prefers `tsgo` (TypeScript 7, Go port, ~10x faster) when available, falling back to `tsc`. The `--typecheck-binary` escape hatch allows pointing to any binary that speaks the `--pretty false` output format. This future-proofs the feature for alternative type checkers.

4. **TypeCheck as a distinct ErrorCategory.** Not merged with Build because:
   - Build errors (oxc parse failures) mean the code can't even be loaded
   - TypeCheck errors mean the code loads but has type problems
   - Different suppression behavior: Build suppresses TypeCheck, but TypeCheck doesn't suppress Build

5. **Graceful degradation.** If no type checker is found, the server starts normally and logs a single actionable warning: `[Server] TypeScript checker not found — type checking disabled. Install with: bun add -d typescript`. No error, no retry.

6. **One checker process per server lifetime.** We don't restart the checker on config changes — the developer must restart the dev server. If the checker crashes unexpectedly (OOM, SIGKILL, invalid tsconfig mid-session), the stdout reader detects EOF, logs a warning with the exit code, clears all TypeCheck errors (stale errors are worse than no errors), and sets the handle to a stopped state. No auto-restart — the developer must restart the dev server.

7. **Batch error replacement, not incremental.** Each `--watch` compilation pass outputs the **complete** set of current errors (not a delta). We buffer all diagnostics between sentinel lines and atomically replace the TypeCheck category's error set on each flush. This prevents overlay flicker and avoids the complexity of per-file incremental tracking.

8. **Both stdout and stderr are captured.** stdout carries diagnostic lines and sentinel summaries. stderr carries fatal errors (invalid tsconfig, missing referenced projects). Fatal stderr output is reported as a single DevError with category TypeCheck.

9. **`Drop` impl for zombie process protection.** `TypeCheckHandle` implements `Drop` to send SIGTERM to the child process. This guarantees cleanup on server shutdown, panic, or any other exit path. Without this, repeated `vertz-runtime dev` restarts accumulate orphan tsc processes.

---

## Manifesto Alignment

- **"Compile-time over runtime"** — Type errors are compile-time diagnostics. Surfacing them in the dev overlay makes them impossible to miss. Today they're siloed in editor diagnostics or a separate terminal.
- **"One way to do things"** — Developers shouldn't need a separate tsc terminal alongside the dev server. The dev server IS the feedback loop.
- **"AI agents are first-class users"** — LLMs reading `/__vertz_ai/errors` or MCP `vertz_get_errors` will see type errors alongside build errors. No separate tsc parsing needed.
- **"Performance is not optional"** — Both `tsc` and `tsgo` use incremental checking in `--watch` mode. Memory: ~30MB for typical projects (<100 source files), 200-500MB for large monorepos (500+ files). `tsgo` is ~10x faster for initial checks. Zero CPU when idle. The auto-detection of `tsgo` means projects that install TypeScript 7 get the faster checker automatically.

---

## Non-Goals

- **Running tsc as a library (ts.createProgram).** We run it as a child process. Embedding the TS compiler in Rust/V8 would be massive complexity for marginal benefit.
- **Replacing editor type checking.** The overlay supplements, not replaces, editor diagnostics. Editor diagnostics are still faster (keystroke-level).
- **Type-checking dependencies.** We pass `--noEmit` and respect the project's tsconfig. If the tsconfig skips `node_modules`, so do we.
- **Custom type checker (oxc type checker, stc, etc.).** We support `tsc` and `tsgo` (TypeScript 7). When oxc's type checker matures, it can be added as another detection target. The `--typecheck-binary` escape hatch already supports arbitrary checkers.
- **Formatting tsc output with ANSI in the browser overlay.** The overlay has its own styling. We parse the raw output and render it in the overlay's format.
- **Composite TypeScript projects with `references` or multiple `tsconfig.json` files.** Only one `tsc --watch` process is spawned per server. Monorepo setups with project references should point `--tsconfig` at their root config. Multi-project support (multiple tsc child processes) can be added later.

---

## Unknowns

1. **`--watch` output format stability.** The `--pretty false` format (`file(line,col): error TSxxxx: message`) has been stable across TS 4.x, 5.x, and is shared by `tsgo`. We'll pin to this format and add a version check on startup to warn if the TS version is below 4.7.
   - **Resolution:** Use `--pretty false` format. If format changes in future versions, the parser will log unparseable lines as warnings rather than crashing.

2. **Startup latency.** `tsc --noEmit --watch` can take 2-10 seconds on large projects. `tsgo` is expected to be ~10x faster (sub-second for most projects). During startup, no type errors are shown.
   - **Resolution:** Acceptable. Terminal log lines signal the lifecycle: `[Server] TypeScript checking started (tsgo)...` on spawn, `[Server] TypeScript checking complete (N errors, Xs)` after first sentinel. The overlay shows build/runtime errors immediately. Type errors appear once the checker finishes its first pass.

3. **`tsgo` `--watch` mode availability.** As of this design, `tsgo` may not support `--watch` in its initial releases. If `tsgo` is detected but doesn't support `--watch`, we fall back to `tsc`.
   - **Resolution:** During binary detection, verify `--watch` support by checking `tsgo --help` output or attempting to spawn with `--watch` and detecting immediate exit. If `--watch` is unsupported, skip `tsgo` and fall back to `tsc`. Log: `[Server] tsgo found but --watch not supported — falling back to tsc`.

---

## Type Flow Map

This feature is pure Rust — no TypeScript generics involved. The type flow is:

```
checker stdout (String lines — tsgo or tsc, same format)
  → parser::parse_tsc_line(&str)
  → TscParsed::Diagnostic(TscDiagnostic { file, line, col, code, message })
     or TscParsed::Continuation(String)       — multi-line error continuation
     or TscParsed::Sentinel { count: u32 }    — "Found N errors" summary
     or TscParsed::Ignored                    — non-diagnostic output

Buffered per compilation pass:
  Vec<TscDiagnostic>
  → Vec<DevError> (via DevError::typecheck(msg).with_file(f).with_location(l,c))

On sentinel flush:
  → ErrorState::replace_category(TypeCheck, Vec<DevError>)  — atomic swap
  → ErrorBroadcaster broadcasts once
  → ErrorBroadcast::Error { category: TypeCheck, errors: Vec<DevError> }
  → WebSocket JSON to overlay client

checker stderr (fatal errors):
  → DevError::typecheck(stderr_content)
  → ErrorBroadcaster::report_error(DevError)
```

No dead types. Every struct flows from parsing to client.

---

## E2E Acceptance Test

### Happy path: type error appears and auto-clears

```
Given: A Vertz project with a valid app.tsx
When:  Developer introduces a type error: `const x: number = "hello"`
Then:  The browser overlay shows:
         Category: typecheck
         File: src/app.tsx
         Line: N, Column: M
         Message: "TS2322: Type 'string' is not assignable to type 'number'."
When:  Developer fixes the error: `const x: number = 42`
Then:  The overlay auto-dismisses (clear message broadcast)
```

### Type error suppressed by build error

```
Given: A file with both a syntax error (missing brace) and a type error
When:  The file is saved
Then:  Only the build error appears (higher priority)
When:  The syntax error is fixed (but type error remains)
Then:  The type error appears
```

### No type checker installed

```
Given: A project without TypeScript installed (no tsgo or tsc in node_modules or PATH)
When:  The dev server starts
Then:  The server starts normally
And:   A single warning is logged: "[Server] TypeScript checker not found — type checking disabled. Install with: bun add -d typescript"
And:   No type errors are ever reported
```

### --no-typecheck flag

```
Given: A project with TypeScript installed
When:  The dev server starts with `--no-typecheck`
Then:  No type checker process is spawned
And:   No type errors are ever reported
```

### Type checker crash recovery

```
Given: The dev server is running with type checking active
When:  The checker process crashes unexpectedly (e.g., OOM)
Then:  A warning is logged: "[Server] Type checker exited unexpectedly (code N) — type checking disabled"
And:   All TypeCheck errors are cleared (stale errors are worse than no errors)
And:   The server continues running normally without type checking
```

### MCP/AI integration

```
Given: A type error exists in the project
When:  An LLM calls `vertz_get_errors` via MCP
Then:  The response includes the type error with category "typecheck"
```

---

## Implementation Plan

### Phase 1: tsc Output Parser + ErrorCategory + Batch Replace API

**Goal:** Parse tsc `--pretty false --watch` output into `DevError` structs. Add `TypeCheck` category. Add `replace_category()` to ErrorState for atomic batch updates.

**Acceptance Criteria:**

```rust
describe!("Feature: tsc output parsing", {
    describe!("Given a tsc --pretty false diagnostic line", {
        describe!("When the line matches the standard format", {
            it!("Then parses file, line, column, code, and message", {
                let line = "src/app.tsx(10,5): error TS2322: Type 'string' is not assignable to type 'number'.";
                let result = parse_tsc_line(line);
                // Returns TscParsed::Diagnostic { file, line, col, code, message }
            });
        });
        describe!("When the line is a multi-line continuation (indented)", {
            it!("Then returns TscParsed::Continuation with the text", {
                let line = "  Property 'id' is missing in type '{ name: string; }'.";
                let result = parse_tsc_line(line);
                // Returns TscParsed::Continuation("Property 'id' is missing...")
            });
        });
        describe!("When the line is a watch-mode sentinel with timestamp", {
            it!("Then returns TscParsed::Sentinel with the error count", {
                // Real format includes timestamp prefix and suffix
                let line = "[12:34:56 PM] Found 3 errors. Watching for file changes.";
                let result = parse_tsc_line(line);
                // Returns TscParsed::Sentinel { count: 3 }
            });
            it!("Then handles singular 'error' (count=1)", {
                let line = "[12:34:56 PM] Found 1 error. Watching for file changes.";
                let result = parse_tsc_line(line);
                // Returns TscParsed::Sentinel { count: 1 }
            });
            it!("Then handles zero errors", {
                let line = "[12:34:56 PM] Found 0 errors. Watching for file changes.";
                let result = parse_tsc_line(line);
                // Returns TscParsed::Sentinel { count: 0 }
            });
        });
        describe!("When the line is a warning diagnostic", {
            it!("Then parses as a diagnostic with severity 'warning'");
        });
        describe!("When the line is not a diagnostic", {
            it!("Then returns TscParsed::Ignored", {
                let result = parse_tsc_line("[12:34:56 PM] Starting compilation in watch mode...");
                // Returns TscParsed::Ignored
            });
        });
    });

    describe!("Given the TypeCheck error category", {
        it!("Then Build suppresses TypeCheck", {
            assert!(ErrorCategory::Build.suppresses(ErrorCategory::TypeCheck));
        });
        it!("Then Resolve suppresses TypeCheck", {
            assert!(ErrorCategory::Resolve.suppresses(ErrorCategory::TypeCheck));
        });
        it!("Then TypeCheck suppresses Ssr and Runtime", {
            assert!(ErrorCategory::TypeCheck.suppresses(ErrorCategory::Ssr));
            assert!(ErrorCategory::TypeCheck.suppresses(ErrorCategory::Runtime));
        });
        it!("Then active_errors() returns TypeCheck when it's highest priority", {
            let mut state = ErrorState::new();
            state.add(DevError::typecheck("err"));
            let active = state.active_errors();
            assert_eq!(active[0].category, ErrorCategory::TypeCheck);
        });
        it!("Then active_errors() returns Build over TypeCheck", {
            let mut state = ErrorState::new();
            state.add(DevError::typecheck("type err"));
            state.add(DevError::build("syntax err"));
            let active = state.active_errors();
            assert_eq!(active[0].category, ErrorCategory::Build);
        });
        it!("Then TypeCheck serializes as 'typecheck'", {
            let json = serde_json::to_string(&ErrorCategory::TypeCheck).unwrap();
            assert_eq!(json, "\"typecheck\"");
        });
        it!("Then Display shows 'typecheck'", {
            assert_eq!(format!("{}", ErrorCategory::TypeCheck), "typecheck");
        });
    });

    describe!("Given ErrorState::replace_category()", {
        it!("Then atomically replaces all errors for a category", {
            let mut state = ErrorState::new();
            state.add(DevError::typecheck("old err 1"));
            state.add(DevError::typecheck("old err 2"));
            state.replace_category(ErrorCategory::TypeCheck, vec![
                DevError::typecheck("new err"),
            ]);
            assert_eq!(state.errors_for(ErrorCategory::TypeCheck).len(), 1);
        });
        it!("Then clears the category when given an empty vec", {
            let mut state = ErrorState::new();
            state.add(DevError::typecheck("err"));
            state.replace_category(ErrorCategory::TypeCheck, vec![]);
            assert!(!state.has_errors());
        });
    });
});
```

**Files changed:**
- `src/errors/categories.rs` — add `TypeCheck` variant (shift Resolve/Build discriminants), `DevError::typecheck()` constructor, update `active_errors()` hardcoded array, update `Display` impl, add `ErrorState::replace_category()`
- `src/typecheck/mod.rs` (new) — module declaration
- `src/typecheck/parser.rs` (new) — `parse_tsc_line()`, `TscDiagnostic` struct, `TscParsed` enum (Diagnostic, Continuation, Sentinel, Ignored)
- `src/lib.rs` — add `pub mod typecheck`

### Phase 2: Child Process Manager

**Goal:** Spawn and manage the type checker child process (`tsgo` or `tsc`) with `--noEmit --watch --pretty false --preserveWatchOutput`, stdout/stderr reading, crash detection, and zombie-safe cleanup.

**Acceptance Criteria:**

```rust
describe!("Feature: type checker binary detection", {
    describe!("When --typecheck-binary is set", {
        it!("Then uses the specified binary directly (no auto-detection)");
    });
    describe!("When tsgo exists in node_modules/.bin/", {
        it!("Then returns tsgo (preferred over tsc)");
    });
    describe!("When tsgo is in PATH but not local", {
        it!("Then returns global tsgo (preferred over local tsc)");
    });
    describe!("When only node_modules/.bin/tsc exists", {
        it!("Then returns the local tsc path");
    });
    describe!("When only tsc is in PATH", {
        it!("Then returns the global tsc path as fallback");
    });
    describe!("When no type checker is found", {
        it!("Then returns None");
    });
    describe!("When tsgo is found but doesn't support --watch", {
        it!("Then falls back to tsc");
    });
});

describe!("Feature: type checker child process lifecycle", {
    describe!("When started with valid config", {
        it!("Then spawns the detected checker with --noEmit --watch --pretty false --preserveWatchOutput");
        it!("Then reads stdout lines via async BufReader");
        it!("Then reads stderr lines for fatal errors");
        it!("Then logs '[Server] TypeScript checking started (<binary>)...'");
    });
    describe!("When stop() is called", {
        it!("Then sends SIGTERM to the child process");
        it!("Then the reader tasks complete");
    });
    describe!("When TypeCheckHandle is dropped (server shutdown or panic)", {
        it!("Then the child process is killed (Drop impl)");
        it!("Then no zombie process remains");
    });
    describe!("When the checker process exits unexpectedly (crash/OOM)", {
        it!("Then the stdout reader detects EOF");
        it!("Then a warning is logged with the exit code");
        it!("Then all TypeCheck errors are cleared");
    });
    describe!("When the checker writes to stderr (fatal error)", {
        it!("Then the stderr content is reported as a DevError");
    });
});
```

**Files changed:**
- `src/typecheck/process.rs` (new) — `detect_checker()` (tsgo → tsc priority), `TypeCheckProcess`, `start()`, `stop()`, `Drop` impl
- `src/typecheck/mod.rs` — `TypeCheckHandle` public API

### Phase 3: Integration with ErrorBroadcaster + Server Startup

**Goal:** Wire the tsc process into the dev server lifecycle. Buffer diagnostics → batch replace on sentinel → auto-clear on fix. Add CLI flags and config fields.

**Acceptance Criteria:**

```rust
describe!("Feature: tsc integration with error broadcaster", {
    describe!("Given tsc outputs a compilation pass with errors", {
        it!("Then errors are buffered and flushed atomically on sentinel line");
        it!("Then only one WebSocket broadcast occurs per compilation pass");
        it!("Then each error includes file, line, column, and TS error code");
    });
    describe!("Given tsc reports 'Found 0 errors'", {
        it!("Then all TypeCheck errors are cleared via replace_category");
    });
    describe!("Given a build error exists and type errors are reported", {
        it!("Then type errors are suppressed in active_errors (build has higher priority)");
    });
    describe!("Given multi-line tsc errors", {
        it!("Then continuation lines are appended to the previous diagnostic's message");
    });
});

describe!("Feature: tsc lifecycle logging", {
    it!("Then logs '[Server] TypeScript checking started...' on spawn");
    it!("Then logs '[Server] TypeScript checking complete (N errors, Xs)' after first sentinel");
    it!("Then logs '[Server] tsc exited unexpectedly (code N)' on crash");
});

describe!("Feature: CLI flags", {
    describe!("Given --no-typecheck flag", {
        it!("Then enable_typecheck is false in ServerConfig");
        it!("Then no checker process is spawned");
    });
    describe!("Given --tsconfig <path> flag", {
        it!("Then the custom tsconfig path is passed to the checker via --project");
    });
    describe!("Given no --tsconfig flag", {
        it!("Then the checker uses its own auto-detection (no --project passed)");
    });
    describe!("Given --typecheck-binary <path> flag", {
        it!("Then the specified binary is used directly (skips auto-detection)");
    });
});

describe!("Feature: ErrorBroadcaster batch replace", {
    describe!("Given replace_category is called", {
        it!("Then broadcasts the new error set in a single message");
        it!("Then broadcasts clear if the new set is empty");
    });
});
```

**Files changed:**
- `src/cli.rs` — add `--no-typecheck`, `--tsconfig`, and `--typecheck-binary` args to `DevArgs`
- `src/config.rs` — add `enable_typecheck`, `tsconfig_path`, `typecheck_binary` fields
- `src/errors/broadcaster.rs` — add `replace_category()` method
- `src/server/http.rs` — spawn tsc process in `start_server()`, store handle, stop on shutdown
- `src/server/module_server.rs` — add `typecheck_handle` to `DevServerState`
- `src/typecheck/mod.rs` — `start_typecheck()` that wires process → parser → broadcaster with buffering

### Phase 4: Code Snippets + Suggestions

**Goal:** Enrich type errors with source code snippets and actionable suggestions for well-known TS errors. Only add suggestions that are genuinely actionable (not generic restatements of the error).

**Acceptance Criteria:**

```rust
describe!("Feature: type error enrichment", {
    describe!("Given a type error with a valid file path", {
        it!("Then the error includes a code snippet around the error line");
    });
    describe!("Given TS2307 (Cannot find module)", {
        it!("Then suggests checking the import path and ensuring the package is installed");
    });
    describe!("Given TS2304 (Cannot find name)", {
        it!("Then suggests checking imports or declaring the variable");
    });
    describe!("Given TS2345 (Argument type mismatch)", {
        it!("Then suggests checking the function signature and argument types");
    });
    describe!("Given an unknown or self-explanatory TS error code (e.g., TS2322)", {
        it!("Then no suggestion is added (the error message is sufficient)");
    });
});
```

**Files changed:**
- `src/typecheck/parser.rs` — add `enrich_error()` that reads source file for snippet
- `src/errors/suggestions.rs` — add `suggest_typecheck_fix()` for select TS error codes

---

## Review Findings Resolution

### Technical Review — Changes Requested → Resolved

| Finding | Severity | Resolution |
|---------|----------|------------|
| `active_errors()` hardcoded array must include TypeCheck | Blocker | Added to API Surface (implementation note) and Phase 1 acceptance criteria |
| No crash/exit handling for tsc process | Blocker | Added to Key Design Decision #6, Architecture flow (EOF detection), Phase 2 acceptance criteria, E2E test |
| No zombie process cleanup on server shutdown | Blocker | Added Key Design Decision #9 (`Drop` impl), Phase 2 acceptance criteria |
| Parser edge cases (multi-line, sentinels, stderr) | Should-fix | Added multi-line `TscParsed::Continuation` to Type Flow Map, real sentinel format to Phase 1 tests, stderr reader to Architecture flow |
| stderr not captured for fatal errors | Should-fix | Added stderr reader task to Architecture, Key Design Decision #8 |
| Batch error reporting race condition | Should-fix | Added batch update semantics to API Surface, `replace_category()` to Phase 1 + Phase 3, Key Design Decision #7 |
| Incremental vs full replacement semantics | Should-fix | Addressed in Key Design Decision #7 (full replacement per pass) |
| Prefer local tsc over global | Nit | Confirmed: detection order documented in Architecture flow |
| Add `--preserveWatchOutput` flag | Nit | Added to CLI args and Key Design Decision #1 |
| Cargo.toml deps sufficient | Nit | Confirmed |
| Memory claim qualification | Nit | Updated Manifesto Alignment to qualify (<100 files vs 500+ files) |

### DX Review — Approved → Findings Addressed

| Finding | Severity | Resolution |
|---------|----------|------------|
| Suppressed error indicator | Should-fix | Deferred: overlay UX is shared infrastructure. The transition behavior (build → typecheck) is intentional and documented in Priority rationale. A suppressed-error count badge can be added as overlay-level improvement independent of this feature. |
| `--no-typecheck` CLI convention | Should-fix | Documented as CLI convention note in API Surface |
| tsc startup latency UX | Should-fix | Added lifecycle log lines to Architecture flow and Phase 3 acceptance criteria |
| Error batch semantics (overlay flash) | Should-fix | Resolved via `replace_category()` atomic batch replacement |
| Suggestion system scope | Nit | Phase 4 scoped to genuinely actionable suggestions only (TS2307, TS2304, TS2345). Self-explanatory errors (TS2322) get no suggestion. |
| `--tsconfig` default detection | Nit | Documented in Config: "When None, let checker auto-detect (no --project passed)" |
| Missing tsc warning actionability | Nit | Updated to include install command in warning message |
| TS error code as clickable link | Nit | Deferred: overlay rendering is separate infrastructure |

### Product/Scope Review — Approved → Findings Addressed

| Finding | Severity | Resolution |
|---------|----------|------------|
| Missing non-goal: composite tsconfig | Should-fix | Added to Non-Goals |
| ErrorCategory numeric values | Nit | Added explicit note about discriminant shift and serde string-based serialization |
| tsc crash handling | Nit | Added to Key Design Decisions #6 and E2E test |
| Open question in next-steps.md resolved | Nit | Will mark resolved when implementation begins |

### Post-Review Addition: Checker-Agnostic Design (tsgo support)

Added during review resolution based on user feedback:
- Detection priority: `tsgo` (local) → `tsgo` (PATH) → `tsc` (local) → `tsc` (PATH)
- `--typecheck-binary <path>` escape hatch for explicit binary override
- New Unknown #3: tsgo `--watch` mode availability with fallback strategy
- All acceptance criteria updated to reference "checker" instead of "tsc" where appropriate
