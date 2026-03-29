# Phase 4a: Codemod, Config, Imports, Preload

- **Author:** claude-opus
- **Reviewer:** claude-opus (adversarial)
- **Commits:** 54da08869..19d5fb573
- **Date:** 2026-03-29

## Changes

- `native/vertz-runtime/src/runtime/module_loader.rs` (modified) — Intercepts `@vertz/test` and `bun:test` imports, returns synthetic module re-exporting test harness globals
- `native/vertz-runtime/src/test/config.rs` (new) — Loads `vertz.config.ts`/`.js`, evaluates in a V8 runtime, extracts test config
- `native/vertz-runtime/src/test/codemod.rs` (new) — `vertz migrate-tests` codemod: rewrites `bun:test` imports, `vi.fn()`/`vi.spyOn()` calls, manages import specifiers
- `native/vertz-runtime/src/test/executor.rs` (modified) — Adds preload script execution before test file loading
- `native/vertz-runtime/src/test/runner.rs` (modified) — Adds `preload` field to `TestRunConfig`, resolves relative paths, passes to executor
- `native/vertz-runtime/src/test/watch.rs` (modified) — Wires preload paths into watch mode execution
- `native/vertz-runtime/src/cli.rs` (modified) — Adds `MigrateTests` subcommand with `--dry-run` flag and `--no-preload` flag to test command
- `native/vertz-runtime/src/main.rs` (modified) — Config loading, CLI-to-config merging, `migrate-tests` command wiring
- `native/vertz-runtime/tests/test_runner.rs` (modified) — E2E tests for codemod + `@vertz/test` import integration

## CI Status

- [ ] Quality gates pending

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before/alongside implementation)
- [ ] No type gaps or missing edge cases — see findings
- [ ] No security issues (injection, XSS, etc.) — see findings
- [x] Public API changes match design doc

## Findings

### BLOCKER-1: `transform_default_export` is a naive string replace — breaks on string literals containing "export default"

**File:** `config.rs`, line 131
**Severity:** Blocker

```rust
fn transform_default_export(code: &str) -> String {
    code.replace("export default ", "globalThis.__vertz_config = ")
}
```

This does a global string replace of `"export default "`. If the config file contains a string literal that includes `"export default "` (e.g., a comment, a string value, or a template literal), it will corrupt the file content. For example:

```ts
export default {
  test: {
    description: "This is the export default config"
  }
};
```

The string `"export default config"` inside the value would also be replaced, producing invalid JS: `"This is the globalThis.__vertz_config = config"`.

**Fix:** Use a regex that matches `export default` only at the start of a line (or after a semicolon/newline), not inside strings. A minimal fix: match only the *first* occurrence, e.g., `code.replacen("export default ", "globalThis.__vertz_config = ", 1)`. Better: use a regex like `^export default ` (with multiline mode) to anchor to line start.

---

### BLOCKER-2: `add_to_import` produces double closing brace

**File:** `codemod.rs`, line 143
**Severity:** Blocker

```rust
let new_line = line.replace(" }", &format!(", {} }}", name));
```

This replaces `" }"` with `", mock }}"` — note the double `}}`. The format string `", {} }}"` produces the literal string `, mock }` (because `}}` is the escape for a literal `}` in format strings). However, the replace target is `" }"` which matches the space-brace before the closing of the destructuring. Let me trace through:

Input line: `import { describe, it, expect } from '@vertz/test';`
Replace `" }"` with `, mock }` → `import { describe, it, expect, mock } from '@vertz/test';`

Actually — `}}` in Rust format strings produces a literal `}`, so `format!(", {} }}", name)` with `name="mock"` produces `, mock }`. This is correct. My mistake, this is **not** a blocker.

**Retracted** — after careful analysis, the `}}` in the format macro correctly escapes to a single `}`. The output is correct.

---

### SHOULD-FIX-1: Codemod `vi` removal patterns are fragile — miss common formatting variants

**File:** `codemod.rs`, lines 85-97
**Severity:** Should-fix

The patterns for removing `vi` from imports are:
```rust
(", vi ", ", "),     // trailing comma + space
(", vi}", "}"),      // trailing comma, no space before brace
("vi, ", ""),        // leading position
("{ vi }", "{}"),    // sole import
```

These miss several real-world formatting patterns:
- `{ describe, vi, it }` — `vi` in the middle produces `", vi,"` (no trailing space before comma). The pattern `", vi "` wouldn't match `", vi,"`.
- `{ vi, describe }` — matches `"vi, "` pattern correctly.
- `{vi}` — no spaces, missed by `"{ vi }"`.
- `{ describe,vi }` — no space after comma before `vi`, missed.

More importantly, after removing `vi`, the code should also check whether `mock` and `spyOn` are already imported before adding them. The current logic on line 106-121 uses `find_vertz_test_import` which returns the *original* import line (before any modifications to `result`), so it might not reflect the vi removal. Wait — actually `find_vertz_test_import` runs on `result` (the modified source), so it should find the updated import. But the stale `import_line` variable from `find_vertz_test_import` could be stale relative to further edits. Specifically, if `mock` is added on line 108-111, then the `import_line` used on line 114 to check for `spyOn` is stale — it doesn't include the `mock` that was just added.

**Fix:** Re-fetch the import line after each modification, or operate on a structured AST representation rather than string patterns.

---

### SHOULD-FIX-2: `find_vertz_test_import` matches lines containing `@vertz/test` in non-import contexts

**File:** `codemod.rs`, lines 128-135
**Severity:** Should-fix

```rust
fn find_vertz_test_import(source: &str) -> Option<String> {
    for line in source.lines() {
        if line.contains("@vertz/test") && line.contains("import") {
            return Some(line.to_string());
        }
    }
    None
}
```

This matches any line containing both `"@vertz/test"` and `"import"`. A comment like `// We import from @vertz/test` would match. More critically, it only matches single-line imports. Multi-line imports like:

```ts
import {
  describe,
  it,
  expect,
} from '@vertz/test';
```

would not be found (the line with `@vertz/test` doesn't contain `import`, and the line with `import` doesn't contain `@vertz/test`).

**Fix:** Use a regex pattern that handles multi-line imports, or at minimum document this as a known limitation.

---

### SHOULD-FIX-3: `migrate_source` uses `result.contains("mock(")` which matches `mockImplementation(` and other words

**File:** `codemod.rs`, lines 69-71, 102-104
**Severity:** Should-fix

`result.contains("vi.fn(")` and `result.contains("mock(")` are substring checks that can produce false positives:
- `vi.fn(` is reasonable as a pattern.
- `mock(` matches `mockImplementation(`, `mockResolvedValue(`, or any identifier ending in `mock(`.
- `spyOn(` is less likely to false-positive but could match `inspyOn(`.

After the rewrite, `result.contains("mock(")` on line 102 will be true for any occurrence of `mock(` in the file, including calls like `fn.mockImplementation(...)` which aren't the `mock()` factory.

**Fix:** Use word-boundary-aware matching (regex `\bmock\(` or check the character before `mock(` is not alphanumeric).

---

### SHOULD-FIX-4: Config loading uses the parent directory as `root_dir` for executor — breaks relative imports in test files

**File:** `executor.rs`, lines 131-135
**Severity:** Should-fix

```rust
let root_dir = file_path
    .parent()
    .unwrap_or(Path::new("."))
    .to_string_lossy()
    .to_string();
```

When executing a test file, `root_dir` is set to the file's parent directory. This is used by the module loader for resolving bare specifiers (node_modules lookups). If a test file is at `src/__tests__/math.test.ts`, the root_dir becomes `src/__tests__/`, and node_modules resolution walks up from there — which works. But if a preload script has relative imports, they resolve relative to the test file's directory, not the project root. This could cause different behavior for the same preload script depending on which test file it's loaded alongside.

This is a pre-existing issue (not introduced in this phase), but the preload feature amplifies it since preload scripts are expected to be loaded identically for every test file.

**Fix:** Pass the project root directory down to `execute_test_file_with_options` instead of computing it from the file path. The runner already has `config.root_dir` — thread it through.

---

### SHOULD-FIX-5: Config CLI merging treats defaults as non-overrides, but can't distinguish "user passed 5000" from "default is 5000"

**File:** `main.rs`, lines 51-54, 58-59
**Severity:** Should-fix

```rust
timeout_ms: if args.timeout != 5000 {
    args.timeout
} else {
    file_config.timeout_ms.unwrap_or(5000)
},
```

The merging logic compares against default values to decide whether the CLI arg was explicitly provided. If a user explicitly runs `vertz test --timeout 5000`, it's treated as "not provided" and the config file value wins. Same for `--coverage-threshold 95`.

This is a known limitation of using clap default values. The workaround is to make `timeout` and `coverage_threshold` `Option<u64>` in `TestArgs` so `None` means "not provided."

**Fix:** Change `timeout` and `coverage_threshold` in `TestArgs` to `Option<u64>` / `Option<u32>`, and only fall back to config/default when `None`.

---

### SHOULD-FIX-6: Preload scripts executed as scripts, not modules — can't use `import` statements

**File:** `executor.rs`, line 209
**Severity:** Should-fix

```rust
runtime.execute_script_void("[vertz:preload]", &code)?;
```

Preload scripts are compiled and then executed via `execute_script_void`, which runs them as classic scripts (not ES modules). This means preload scripts cannot contain `import`/`export` statements. Users who write:

```ts
// test-setup.ts
import { someHelper } from './helpers';
globalThis.helper = someHelper;
```

will get a syntax error because `import` is not valid in classic script context. The doc comment in `config.rs` says "preload script paths" but doesn't document this limitation.

**Fix:** Either (a) load preload scripts as modules (using the module loader, which would also handle `@vertz/test` imports), or (b) document the limitation and strip/transform `import`/`export` statements. Option (a) is better for DX.

---

### SHOULD-FIX-7: `add_to_import` adds trailing newline when original file doesn't end with newline

**File:** `codemod.rs`, lines 138-155
**Severity:** Should-fix (minor)

```rust
fn add_to_import(source: &str, name: &str) -> String {
    let mut result = String::new();
    for line in source.lines() {
        // ...
        result.push('\n');
    }
    if !source.ends_with('\n') {
        result.pop();
    }
    result
}
```

The `lines()` iterator strips line endings. The function rebuilds with `\n` after every line, then pops the last one if the original didn't end with `\n`. However, `lines()` also strips `\r\n` (CRLF), so Windows line endings get converted to `\n`. This corrupts files using CRLF line endings. Additionally, if a file has a trailing `\n` followed by an empty line, `lines()` won't produce the empty trailing line, so the function would lose it.

**Fix:** Use `split('\n')` instead of `lines()` to preserve line ending behavior, or use a more robust line-by-line processing approach.

---

### SHOULD-FIX-8: No test for config file with `import` statements (e.g., importing from another config)

**File:** `config.rs`
**Severity:** Should-fix (test gap)

The config loading compiles TS but then executes it as a script via `execute_script_void`. If a user writes:

```ts
import { baseConfig } from './base-config';
export default { ...baseConfig, test: { timeout: 5000 } };
```

This would fail silently because the compiled output still has `import` statements that aren't valid in script context. There's no test covering this scenario, and no error message guiding users.

**Fix:** Add a test for config files with imports, and either support them (by loading as a module) or produce a clear error message.

---

### NIT-1: `VERTZ_TEST_MODULE` has a leading newline

**File:** `module_loader.rs`, line 349
**Severity:** Nit

```rust
const VERTZ_TEST_MODULE: &str = r#"
const { describe, ...
```

The raw string starts with a newline. This means the synthetic module source has an unnecessary leading blank line. Not harmful but slightly untidy.

---

### NIT-2: `vi` is exported from the synthetic module but not documented

**File:** `module_loader.rs`, line 351
**Severity:** Nit

The synthetic module exports `vi` alongside `describe`, `it`, `mock`, etc. Since the codemod rewrites `vi.fn()` to `mock()`, users who import `vi` after migration would get a working `vi` object from `@vertz/test`. This is fine for backward compatibility, but it's worth documenting that `vi` is available but deprecated in favor of `mock()`/`spyOn()`.

---

### NIT-3: Dead code branch in `migrate_source` — unreachable `else if`

**File:** `codemod.rs`, lines 102-104
**Severity:** Nit

```rust
if result.contains("mock(") && !result.contains("import") {
    // File uses globals — no import needed
} else if result.contains("mock(") {
```

The first branch does nothing (empty body). This could be simplified to:

```rust
if result.contains("mock(") && result.contains("import") {
    // ... add to import logic
}
```

---

### NIT-4: Inconsistent comment numbering in `executor.rs`

**File:** `executor.rs`, lines 212-243
**Severity:** Nit

Comments say "4. Load the test file" then "4. Create inspector session" then "5. Start coverage". Step 4 is used twice. Should be renumbered (4, 5, 6, 7, 8, 9).

---

## Summary

**Blockers: 1** (BLOCKER-1 — `transform_default_export` naive string replace)

**Should-fix: 8** — The most impactful are:
- SHOULD-FIX-1 (fragile vi removal patterns)
- SHOULD-FIX-3 (false positive `mock(` matching)
- SHOULD-FIX-5 (CLI default vs explicit argument ambiguity)
- SHOULD-FIX-6 (preload scripts can't use imports)

**Nits: 4**

The overall design is sound. The synthetic module approach for `@vertz/test`/`bun:test` interception is clean and well-tested. The config loading architecture (compile TS, run in V8, extract JSON) is appropriate. The codemod string manipulation is the weakest area — it works for the common cases tested but will break on less conventional formatting patterns. For a pre-v1 migration tool, some of these are acceptable as known limitations, but BLOCKER-1 (the config `export default` replace) needs a fix since it can corrupt valid config files.

## Resolution

_Pending author response._
