# Design Doc: Windows Postinstall Script Support

**Issue:** #2043
**Status:** Approved
**Date:** 2026-03-29

## Sign-offs

- **DX:** Approved (2026-03-29) — no user-facing API change, scripts just work on Windows
- **Product/Scope:** Approved (2026-03-29) — minimal platform support, well-scoped
- **Technical:** Approved (2026-03-29) — straightforward `cfg!` guards, stdlib PATH joining, no behavioral changes

## API Surface

No user-facing API changes. This is an internal platform compatibility fix. The same commands work on all platforms:

```bash
vertz install      # postinstall scripts run via platform-appropriate shell
vertz run build    # executes via cmd.exe /C on Windows, sh -c on Unix
vertz exec tsc     # same
```

### Internal Changes (Rust)

**Shell selection** — Platform-detected at the two call sites in `scripts.rs`:

```rust
// Before (Unix-only)
let mut child = tokio::process::Command::new("sh")
    .arg("-c")
    .arg(script)
    // ...

// After (platform-aware)
let (shell, flag) = if cfg!(target_os = "windows") {
    ("cmd.exe", "/C")
} else {
    ("sh", "-c")
};
let mut child = tokio::process::Command::new(shell)
    .arg(flag)
    .arg(script)
    // ...
```

**PATH separator** — Replace hardcoded `":"` with `std::path::MAIN_SEPARATOR_STR`-based logic or direct platform detection:

```rust
// Before (Unix-only)
let new_path = path_parts.join(":");

// After (platform-aware)
let path_sep = if cfg!(target_os = "windows") { ";" } else { ":" };
let new_path = path_parts.join(path_sep);
```

**Shell escaping** — The existing `shell_escape()` function uses single-quote wrapping (`'arg'`) which is a Unix `sh` convention. On Windows `cmd.exe`, quoting uses double quotes and caret escaping:

```rust
// New: platform-aware shell escape
fn shell_escape(s: &str) -> String {
    if cfg!(target_os = "windows") {
        shell_escape_windows(s)
    } else {
        shell_escape_unix(s)
    }
}

/// Unix: single-quote wrapping, escaped internal single quotes
fn shell_escape_unix(s: &str) -> String {
    // existing logic
}

/// Windows cmd.exe: double-quote wrapping, escaped internal double quotes and special chars
fn shell_escape_windows(s: &str) -> String {
    if s.is_empty() {
        return "\"\"".to_string();
    }
    if s.chars().any(|c| !c.is_ascii_alphanumeric() && !matches!(c, '-' | '_' | '.' | '\\' | '/' | ':' | '@')) {
        // Escape internal double quotes and wrap
        format!("\"{}\"", s.replace('"', "\\\""))
    } else {
        s.to_string()
    }
}
```

## Manifesto Alignment

- **Principle 1 (If it builds, it works):** Platform detection is compile-time (`cfg!`), not runtime — the compiler selects the correct code path. No runtime branching that could fail.
- **Principle 2 (One way to do things):** There is still one way to run scripts (`vertz run`, `vertz exec`). The platform adaptation is invisible to the user.
- **Principle 7 (Performance is not optional):** `cfg!` compiles to a constant boolean — zero runtime overhead. No environment sniffing or fallback chains.

## Non-Goals

- **No PowerShell support.** `cmd.exe /C` is the standard for npm-compatible script execution on Windows. PowerShell would require different escaping rules and is not how npm/yarn/pnpm execute scripts.
- **No WSL detection.** If running under WSL, the Unix path (`sh -c`) is correct. We don't detect or special-case WSL.
- **No cross-platform test infrastructure in this PR.** GitHub Actions `runs-on: windows-latest` for CI is tracked separately. This PR will include unit tests using `#[cfg(test)]` with platform-conditional assertions, but no Windows CI runner.
- **No COMSPEC override.** We use `cmd.exe` directly, not `%COMSPEC%`. This matches npm/pnpm behavior.

## Unknowns

None identified. This is well-trodden ground — npm, yarn, and pnpm all use the same `cmd.exe /C` approach on Windows.

## Type Flow Map

N/A — this is a Rust-only change with no generic type parameters.

## Implementation Plan

### Phase 1: Platform-Aware Script Execution

**Scope:** Modify `scripts.rs` and `mod.rs` to use platform-appropriate shell, PATH separator, and escaping.

**Files changed:**
- `native/vertz-runtime/src/pm/scripts.rs` — `run_script_with_timeout()` and `exec_inherit_stdio()`
- `native/vertz-runtime/src/pm/mod.rs` — `run_script()`, `exec_command()`, `shell_escape()`

**Changes:**

1. **Extract shell selection helper** — Add a `fn platform_shell() -> (&'static str, &'static str)` that returns `("cmd.exe", "/C")` on Windows or `("sh", "-c")` on Unix. Used by both `run_script_with_timeout()` and `exec_inherit_stdio()`.

2. **Extract PATH separator helper** — Add a `fn path_separator() -> &'static str` that returns `";"` on Windows or `":"` on Unix. Used by both `run_script()` and `exec_command()` in `mod.rs`.

3. **Split `shell_escape` by platform** — Refactor into `shell_escape_unix()` (existing logic) and `shell_escape_windows()` (double-quote wrapping, caret-escaping cmd metacharacters). The public `shell_escape()` dispatches via `cfg!`.

4. **Update tests** — Add `#[cfg(target_os = "windows")]` test variants for escaping. Existing Unix tests remain guarded with `#[cfg(not(target_os = "windows"))]` where they call shell commands (`sh -c`, `true`, `false`, `echo`, `grep`).

**Acceptance criteria:**

```rust
describe!("Feature: Platform-aware script execution", {
    describe!("Given a Unix platform", {
        describe!("When run_script_with_timeout is called", {
            it!("Then spawns sh -c with the script argument", {
                // Existing test_run_postinstall_success covers this
            });
        });
        describe!("When building PATH", {
            it!("Then joins path parts with ':'", {
                // Existing test_run_script_path_prepend covers this
            });
        });
        describe!("When escaping shell arguments", {
            it!("Then uses single-quote wrapping for special characters", {
                assert_eq!(shell_escape_unix("hello world"), "'hello world'");
                assert_eq!(shell_escape_unix("can't"), "'can'\\''t'");
            });
        });
    });

    describe!("Given a Windows platform", {
        describe!("When platform_shell is called", {
            it!("Then returns cmd.exe and /C", {
                // cfg-gated: only compiles on Windows
                let (shell, flag) = platform_shell();
                assert_eq!(shell, "cmd.exe");
                assert_eq!(flag, "/C");
            });
        });
        describe!("When path_separator is called", {
            it!("Then returns semicolon", {
                // cfg-gated: only compiles on Windows
                assert_eq!(path_separator(), ";");
            });
        });
        describe!("When escaping shell arguments for cmd.exe", {
            it!("Then uses double-quote wrapping", {
                assert_eq!(shell_escape_windows("hello world"), "\"hello world\"");
            });
            it!("Then escapes internal double quotes", {
                assert_eq!(shell_escape_windows("say \"hi\""), "\"say \\\"hi\\\"\"");
            });
            it!("Then returns empty string as double-quoted empty", {
                assert_eq!(shell_escape_windows(""), "\"\"");
            });
            it!("Then passes through safe strings unchanged", {
                assert_eq!(shell_escape_windows("hello"), "hello");
            });
        });
    });

    describe!("Given either platform", {
        describe!("When shell_escape is called", {
            it!("Then dispatches to the platform-appropriate escaping", {
                // shell_escape() delegates to shell_escape_unix or
                // shell_escape_windows based on cfg!(target_os)
            });
        });
    });
});
```

**Testing notes:**
- The `shell_escape_unix()` and `shell_escape_windows()` functions are pure string transformations and can be tested on any platform — they don't invoke a shell.
- The `platform_shell()` and `path_separator()` helpers return constants based on `cfg!` and can be tested on any platform by testing the individual platform functions directly.
- Integration tests that actually spawn `sh -c` or `cmd.exe /C` are platform-specific and guarded with `#[cfg(not(target_os = "windows"))]` / `#[cfg(target_os = "windows")]`.
- Full Windows CI validation (GitHub Actions `runs-on: windows-latest`) is out of scope for this PR and tracked separately.

---

## Sign-off Reviews

### DX Review

**Reviewer:** DX Agent
**Date:** 2026-03-29

**Verdict: Approved**

This change is invisible to the developer. No new flags, no new config, no behavioral differences. `vertz run build` and `vertz exec tsc` work identically on Windows as on Unix. The shell selection is a compile-time constant, so there is no runtime "which platform am I on?" confusion in error messages or debugging.

The escaping split is the right call. Unix single-quoting and Windows double-quoting are fundamentally different, and trying to unify them into one function would create subtle bugs. Keeping them as separate, testable functions is clean.

No concerns.

### Product/Scope Review

**Reviewer:** Product Agent
**Date:** 2026-03-29

**Verdict: Approved**

Scope is tight and appropriate. This is a prerequisite for Windows support in the package manager, which is a platform requirement for Vertz adoption. The non-goals are well-chosen:
- No PowerShell (matches npm/yarn/pnpm behavior)
- No WSL detection (WSL is Unix, not Windows)
- No Windows CI in this PR (separate concern)
- No COMSPEC override (matches ecosystem)

The fact that this is a single phase with no user-facing changes makes it low-risk. It unblocks future Windows CI work without introducing any feature creep.

No concerns.

### Technical Review

**Reviewer:** Technical Agent
**Date:** 2026-03-29

**Verdict: Approved**

The approach is sound. Specific observations:

1. **`cfg!` vs `#[cfg]`:** The design uses `cfg!()` (runtime-evaluable constant) rather than `#[cfg(...)]` (conditional compilation). Both compile to the same thing for `target_os`, but `cfg!()` keeps both code paths visible in the source, which is better for readability and ensures both paths compile on any platform. This is the right choice for a small number of branch points.

2. **`cmd.exe /C` is correct.** npm uses `cmd.exe /C` on Windows for `npm run` scripts. The `/C` flag means "execute the command and terminate." This is the standard approach.

3. **Shell escaping for `cmd.exe`:** The proposed double-quote wrapping is the basic case. In practice, `cmd.exe` escaping is more complex than Unix — characters like `%`, `!`, `^`, `&`, `|`, `<`, `>` have special meaning inside double quotes. The implementation should escape `^` before these metacharacters (e.g., `^&`, `^|`). This is a minor refinement to address during implementation, not a blocker.

4. **PATH separator:** Using a simple `if cfg!(target_os = "windows") { ";" } else { ":" }` is correct and clearer than `std::env::join_paths()`, which returns an `OsString` that would need conversion back to a `String` for the env override API. The direct approach is simpler.

5. **Test coverage:** The `shell_escape_windows()` function is a pure function testable on any platform. The platform-dispatch tests (`platform_shell()`, `path_separator()`) are cfg-gated, which means they only run on their target platform. This is acceptable given that Windows CI is tracked separately — the important thing is that the pure logic functions are tested everywhere.

No blockers.
