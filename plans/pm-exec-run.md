# Design Doc: `vertz exec` and `vertz run`

**Issue:** #2040
**Status:** Approved
**Date:** 2026-03-29

## Sign-offs

- **DX:** Approved (2026-03-29) — familiar API, no lifecycle hooks is the right call
- **Product/Scope:** Approved (2026-03-29) — all 5 acceptance criteria covered
- **Technical:** Approved (2026-03-29) — feasible, maps onto existing infra

## API Surface

### `vertz run [script] [-- args...]` — Run a package.json script

```bash
# Run a named script from package.json "scripts"
vertz run build
vertz run test
vertz run dev

# Forward args to the script via --
vertz run test -- --bail

# List available scripts (no args)
vertz run

# Run a workspace package script (-w must come before script name)
vertz run -w @myorg/api build
vertz run -w packages/shared test
```

**Behavior:**
- Reads `scripts` field from `package.json`
- Prepends `node_modules/.bin` to `PATH` (so scripts can call local binaries)
- Executes the script value via `sh -c "<script>"` (Unix) / `cmd /c "<script>"` (Windows, future)
- Uses inherited stdio (user sees output in real time) — does NOT capture stdout/stderr
- No timeout — user scripts (e.g., `vertz run dev`) may run indefinitely
- Forwards exit code from the script to the process exit code
- With no args, lists all available scripts with their commands
- `-w` flag resolves to a workspace package directory (reuses `workspace::resolve_workspace_dir()`)
- SIGINT: parent `wait()`s on child — child receives SIGINT directly from terminal

### `vertz exec [-w <workspace>] <command> [args...]` — Run a command with `node_modules/.bin` on PATH

```bash
# Run a binary from node_modules/.bin
vertz exec tsc --version
vertz exec eslint src/
vertz exec vitest run

# Workspace context (-w must come BEFORE the command to avoid ambiguity with command flags)
vertz exec -w @myorg/api tsc --build
```

**Behavior:**
- Prepends `node_modules/.bin` to `PATH`
- Executes the command directly (not via a script lookup)
- Forwards all remaining args to the command
- Uses inherited stdio, no timeout
- Forwards exit code
- `-w` flag changes `cwd` to workspace package dir AND prepends that workspace's `node_modules/.bin` to PATH
- `-w` must come before the command name to avoid ambiguity with command flags (e.g., `tsc -w` means watch mode)

## Manifesto Alignment

- **Principle 1 (Zero-config):** `vertz run build` just works — reads package.json, finds the script, executes it.
- **Principle 4 (Convention over configuration):** Follows npm/yarn/pnpm conventions — developers already know `run` and `exec`.
- **Principle 7 (LLM-friendly):** Simple, predictable commands that LLM agents can use without ambiguity.

## Non-Goals

- **No lifecycle hooks (pre/post scripts):** `vertz run build` does NOT auto-run `prebuild`/`postbuild`. Deliberate simplification. Chain explicitly: `"build": "vertz run prebuild && tsc"`.
- **No `npx`-style remote execution:** `vertz exec` only runs locally installed binaries.
- **No Windows support in this iteration:** #2043 tracks Windows shell support separately.
- **No parallel script execution:** No `-p` flag for running scripts in parallel across workspaces.

## Unknowns

None identified.

## Type Flow Map

N/A — Rust CLI feature, no generic type flows.

## Technical Notes (from review)

- **Cannot reuse `run_script_with_timeout()`** from `scripts.rs` — it captures stdout/stderr and has a 60s timeout. User-facing script execution needs inherited stdio and no timeout. New helper: `exec_inherit_stdio(dir, script, env_overrides)`.
- **SIGINT handling:** `tokio::process::Command::spawn()` + `child.wait()` handles this naturally — `wait()` completes when child exits from its own SIGINT. No extra signal wiring needed.
- **PATH prepend:** Standard approach — set `PATH` env var on the child `Command` with `.bin` dirs prepended.

## Implementation Plan

### Phase 1: `vertz run` (with PATH prepend)

**Changes:**
1. `cli.rs` — Add `Run` variant to `Command` enum with `RunArgs` struct
2. `pm/mod.rs` — Add `pub async fn run_script()` and `pub fn list_scripts()` functions
3. `pm/scripts.rs` — Add `pub async fn exec_inherit_stdio()` helper (inherited stdio, no timeout)
4. `main.rs` — Wire up `Command::Run` dispatch
5. `pm/output.rs` — Add `script_list()` method to `PmOutput`

**Acceptance Tests:**
```
Given a package.json with scripts: { "build": "echo built", "test": "echo tested" }
  When run_script("build") is called
    Then exits 0
  When list_scripts() is called
    Then returns ["build": "echo built", "test": "echo tested"]
  When run_script("nonexistent") is called
    Then returns error "script not found: nonexistent"

Given a script that calls a local binary (node_modules/.bin/mybin)
  When run_script("mybuild") where mybuild = "mybin --flag"
    Then mybin resolves from .bin via PATH prepend

Given a workspace with scripts in packages/api/package.json
  When run_script("build", workspace="packages/api") is called
    Then executes the workspace script in the workspace directory
```

### Phase 2: `vertz exec`

**Changes:**
1. `cli.rs` — Add `Exec` variant to `Command` enum with `ExecArgs` struct
2. `pm/mod.rs` — Add `pub async fn exec_command()` function
3. `main.rs` — Wire up `Command::Exec` dispatch

**Acceptance Tests:**
```
Given node_modules/.bin/mybin exists and is executable
  When exec_command("mybin", ["--version"]) is called
    Then executes mybin with --version and forwards exit code

Given the command is not in .bin/ or PATH
  When exec_command("nonexistent") is called
    Then exits with error

Given a workspace at packages/api
  When exec_command("tsc", ["--build"], workspace="packages/api")
    Then runs tsc in the workspace directory with workspace .bin on PATH
```

## E2E Acceptance Test

```
Setup: temp dir with package.json
  { "scripts": { "greet": "echo hello" } }
  node_modules/.bin/mybin (executable stub that echoes "bin-ok")

vertz run greet → stdout contains "hello", exit 0
vertz run → lists "greet: echo hello"
vertz run missing → exit 1, stderr contains "script not found"
vertz run greet -w packages/api → runs in workspace context
vertz exec mybin → stdout contains "bin-ok", exit 0
vertz exec missing → exit 1
vertz exec -w packages/api mybin → runs in workspace context
```
