# Phase 1: Foundation -- Adversarial Review

- **Author:** claude-opus
- **Reviewer:** claude-opus (adversarial)
- **Commits:** 02926e5ac
- **Date:** 2026-04-04

## Changes

- `native/vtz/src/ci/mod.rs` (new) -- execution engine, CiAction enum, sequential runner
- `native/vtz/src/ci/types.rs` (new) -- PipeConfig, TaskDef, Dep, Condition, serde deserializers
- `native/vtz/src/ci/config.rs` (new) -- ConfigBridge NDJSON protocol, secret validation/redaction
- `native/vtz/src/ci/workspace.rs` (new) -- TS package + Rust crate resolution, cycle detection
- `native/vtz/src/ci/logs.rs` (new) -- NDJSON structured logging
- `native/vtz/src/cli.rs` (modified) -- CiArgs, CiCommand, CiCacheCommand clap structs
- `native/vtz/src/main.rs` (modified) -- Command::Ci routing to ci::execute()
- `native/vtz/src/lib.rs` (modified) -- `pub mod ci;`

## CI Status

- [x] Quality gates passed at 02926e5ac

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (types, workspace, logs all have comprehensive tests)
- [ ] No type gaps or missing edge cases (see findings below)
- [ ] No security issues (see findings below)
- [x] Public API matches design doc

---

## Findings

### [BLOCKER] Timeout does not kill the child process

**File:** `native/vtz/src/ci/mod.rs`, lines 370-377

When `tokio::time::timeout` fires, it drops the `child.wait_with_output()` future but does **not** kill the underlying OS process. The child process continues running in the background with no parent waiting on it. On a CI runner with many tasks this leaks orphan processes that consume CPU, hold file locks, or hold port bindings.

The `tokio::process::Child` docs state: "dropping the future returned by `wait_with_output` does not cancel or kill the child process." You must explicitly call `child.kill()` on timeout.

**Fix:** Restructure to retain the `Child` handle, and on timeout call `child.kill().await` followed by `child.wait().await` to reap the zombie:

```rust
let result = if let Some(timeout_ms) = timeout {
    let duration = std::time::Duration::from_millis(timeout_ms);
    match tokio::time::timeout(duration, child.wait_with_output()).await {
        Ok(r) => r.map_err(|e| e.to_string()),
        Err(_) => {
            // kill + reap before reporting timeout
            let _ = child.kill().await;
            let _ = child.wait().await;
            Err(format!("timeout after {timeout_ms}ms"))
        }
    }
} else { ... };
```

However, since `wait_with_output` takes ownership of `child`, you cannot call `child.kill()` afterwards. The function needs to be restructured: take stdout/stderr handles first, spawn a task to read them, then `select!` between `child.wait()` and the timeout, and kill on timeout. This is a non-trivial restructure but critical for correctness.

---

### [BLOCKER] Loader script does not handle async callbacks

**File:** `native/vtz/src/ci/config.rs`, lines 136-139 (LOADER_SCRIPT)

```js
const value = fn ? fn(msg.result) : false;
```

If the user's callback is `async` (returns a Promise), this captures the Promise object, coerces it to `true` via `!!value`, and always returns `true`. The design doc explicitly lists `DepCondition::Callback` as a mechanism for user-defined logic, and users will reasonably write `async (result) => { ... }`. The Rust side faithfully awaits the boolean, but the JS side silently swallows the async result.

**Fix:** `await` the callback result:

```js
const value = fn ? await fn(msg.result) : false;
```

---

### [SHOULD-FIX] ConfigBridge child process not killed on config load failure

**File:** `native/vtz/src/ci/config.rs`, lines 180-252

If `load_config` returns `Err` after the child process is spawned (e.g., `msg_type != "config"`, or `serde_json::from_value` fails), the `Child` is dropped without calling `kill()` or `wait()`. On some platforms (especially Linux), this leaves a zombie process until the parent exits.

The `bridge` is only constructed on the happy path. On any error path between `cmd.spawn()` and the `Ok(...)` return, the `child` variable is dropped without cleanup.

**Fix:** Wrap the child in a scope guard (or call `child.kill()` in each error path) to ensure the process is terminated. Alternatively, restructure so the `ConfigBridge` is created earlier and implements `Drop` with cleanup.

---

### [SHOULD-FIX] `run_task_or_workflow` silently ignores `all`, `scope`, `verbose`, `json`, `concurrency` flags

**File:** `native/vtz/src/ci/mod.rs`, lines 44-50

```rust
CiAction::Run {
    name,
    dry_run,
    quiet,
    ..
} => run_task_or_workflow(root_dir, &name, dry_run, quiet).await,
```

The `all`, `scope`, `verbose`, `json`, and `concurrency` fields are silently discarded via `..`. While Phase 2 will add parallelism, the `scope` flag is Phase 1 functionality (restricting to a single package) and `verbose` is the opposite of `quiet` (stream output live vs. buffer it). Users who pass `--scope @vertz/ui` or `--verbose` will get no behavioral change and no warning. At minimum, print a warning for unimplemented flags, or return an error.

---

### [SHOULD-FIX] `eval_callback` has no timeout -- can hang forever

**File:** `native/vtz/src/ci/config.rs`, lines 47-78

`eval_callback` does a blocking `read_line` from the Bun process stdout with no timeout. If the Bun process hangs or the callback enters an infinite loop, `vtz ci` hangs forever with no way to recover.

**Fix:** Wrap the `read_line` in `tokio::time::timeout` (e.g., 30 seconds). If the callback takes too long, kill the bridge process and return an error.

---

### [SHOULD-FIX] Secret redaction is vulnerable to substring ordering issues

**File:** `native/vtz/src/ci/config.rs`, lines 289-297

`redact()` iterates secrets in order and does `result.replace(secret, "[REDACTED]")`. If one secret is a substring of another (e.g., `TOKEN` and `MY_TOKEN_VALUE`), the shorter match may partially redact the longer one, leaving fragments visible. Example:

- Secrets: `["abc", "xabcy"]`
- Input: `"value is xabcy"`
- After replacing `"abc"`: `"value is x[REDACTED]y"` -- the fragments `x` and `y` leak structure
- The `"xabcy"` replacement then does nothing because the original string is gone

**Fix:** Sort secrets by length (longest first) before replacing. This ensures longer secrets are matched before their substrings can break them apart.

---

### [SHOULD-FIX] No test coverage for `mod.rs` execution logic

**File:** `native/vtz/src/ci/mod.rs`

This file has zero `#[cfg(test)]` tests. It contains the core execution engine: `run_task_or_workflow`, `run_single_task`, `run_command`, `print_dry_run`, and the `CiAction` enum. These are the most critical functions in the module. While integration testing is difficult (needs a real Bun process), the following are testable in isolation:

- `print_dry_run` (pure function, output to stderr can be captured)
- `CiAction` construction from various inputs
- `run_command` with a simple `echo` or `true`/`false` command
- Steps execution: verify early-exit on first failure

The design doc acceptance criteria says "cargo test --all passes" but the spirit of TDD requires tests for every behavior.

---

### [SHOULD-FIX] `Condition::Changed` silently swallows non-string array elements

**File:** `native/vtz/src/ci/types.rs`, lines 318-328

```rust
let patterns = obj
    .get("patterns")
    .and_then(|v| v.as_array())
    .map(|arr| {
        arr.iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect()
    })
    .unwrap_or_default();
```

If a user writes `"patterns": ["src/**", 42, null, "package.json"]`, the `42` and `null` are silently dropped. This applies to `Condition::Branch` (line 338) and `WorkflowFilter::Packages` as well. For `WorkflowFilter::Packages`, the code correctly returns an error for non-strings (line 417), but `Condition` variants are inconsistent -- they silently drop non-strings while `WorkflowFilter` errors.

**Fix:** Either return a deserialization error for non-string array elements (consistent with `WorkflowFilter`), or document the silent-drop behavior as intentional. The former is safer.

---

### [SHOULD-FIX] `Bun workspaces` field can also be an object with `packages` key

**File:** `native/vtz/src/ci/workspace.rs`, lines 274-282

```rust
#[derive(Debug, serde::Deserialize)]
struct MinimalPackageJson {
    workspaces: Option<Vec<String>>,
    ...
}
```

The `workspaces` field in `package.json` can be either an array `["packages/*"]` or an object `{ "packages": ["packages/*"], "nohoist": [...] }` (Yarn syntax, also supported by Bun). The current code only handles the array form. If a user has the object form, deserialization will fail with a confusing serde error about expected sequence vs. found map.

**Fix:** Use a custom deserializer or an enum:

```rust
#[serde(deserialize_with = "deserialize_workspaces")]
workspaces: Option<Vec<String>>,
```

---

### [NIT] `TaskResult` has inconsistent serde rename strategy

**File:** `native/vtz/src/ci/types.rs`, lines 268-278

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskResult {
    pub status: TaskStatus,
    pub exit_code: Option<i32>,    // camelCase => "exitCode" -- good
    #[serde(rename = "duration")]
    pub duration_ms: u64,          // explicit rename to "duration" -- inconsistent
    pub package: Option<String>,
    pub task: String,
    pub cached: bool,
}
```

The struct uses `rename_all = "camelCase"` but then manually renames `duration_ms` to `"duration"`. This means the JSON field is `"duration"` (not `"durationMs"`), which loses the unit suffix. The Rust field name `duration_ms` suggests milliseconds, but the JSON key `"duration"` is ambiguous. Either rename to `"durationMs"` for consistency, or rename the Rust field to `duration` and add a doc comment.

---

### [NIT] `LogEntry` uses `snake_case` for JSON while `TaskResult` uses `camelCase`

**File:** `native/vtz/src/ci/logs.rs` vs `native/vtz/src/ci/types.rs`

`LogEntry::TaskEnd` serializes as `"duration_ms"` (snake_case, no rename attribute), while `TaskResult` serializes duration as `"duration"`. The NDJSON log entries use snake_case (`run_id`, `duration_ms`, `exit_code`, `native_crates`) while the callback protocol uses camelCase (`exitCode`, `duration`). This is inconsistent -- consumers of the NDJSON log and the callback protocol will need different parsing strategies.

The log entries should choose one convention. Since the logs are machine-readable and consumed by tooling, camelCase (matching the JS SDK conventions) would be more consistent with the config bridge protocol.

---

### [NIT] `find_config` error message is slightly misleading

**File:** `native/vtz/src/ci/config.rs`, line 158

```rust
Err(format!("no ci.config.ts found in {}", root_dir.display()))
```

The function also checks for `ci.config.js`, but the error message only mentions `.ts`. Should say "no ci.config.ts or ci.config.js found".

---

### [NIT] `loader.ts` saved with `.mjs` extension

**File:** `native/vtz/src/ci/config.rs`, line 188

```rust
let loader_path = loader_dir.join("_loader.mjs");
```

The loader uses ESM `import` syntax and is correctly saved as `.mjs`. This is fine for both Bun and Node. However, the variable is named `LOADER_SCRIPT` and the design doc refers to it as `loader.ts`. The discrepancy between plan and implementation is minor but worth noting -- the `.mjs` extension is actually the correct choice since the script uses `await import()` at the top level.

---

### [NIT] Multiple `name` values in `CiArgs` are silently truncated

**File:** `native/vtz/src/main.rs`, line 1451

```rust
CiAction::Run {
    name: ci_args.name[0].clone(),
    ...
}
```

`CiArgs.name` is `Vec<String>` (from the positional arg), but only `name[0]` is used. If a user runs `vtz ci build test lint`, only `build` is executed. The extra arguments are silently ignored. Consider either restricting `name` to a single string in the clap definition, or documenting that only the first name is used, or (better) running all named tasks/workflows.

---

## Verdict

**Changes Requested**

Two blockers must be fixed before this phase can proceed:

1. **Timeout process leak** -- timed-out child processes are not killed, leaking OS processes on CI runners. This is a correctness and resource safety issue.

2. **Async callback handling** -- the loader script does not `await` callback results, causing all async callbacks to silently evaluate to `true`.

Additionally, the should-fix items (ConfigBridge cleanup on error, secret redaction ordering, missing execution tests, inconsistent Condition deserialization, workspaces object form) represent real edge cases that will cause user-facing bugs.
