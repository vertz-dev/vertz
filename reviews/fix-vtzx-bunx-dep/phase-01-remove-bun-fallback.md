# Phase 1: Remove Bun Dependency from vtzx/vtz Fallback Paths

- **Author:** implementation-agent
- **Reviewer:** adversarial-reviewer (Claude Opus 4.6)
- **Commits:** uncommitted working tree changes on top of fe6d9567b
- **Date:** 2026-04-07

## Changes

- `packages/runtime/cli-exec.js` (modified) -- rewrote vtzx fallback to resolve from node_modules/.bin via PATH prepending
- `packages/runtime/cli.js` (modified) -- rewrote vtz fallback: `run` reads package.json scripts, `exec` uses PATH prepending, removed `bun test` fallback
- `scripts/link-runtime.sh` (modified) -- updated shell shims to delegate to Node.js scripts instead of bunx/bun
- `packages/runtime/index.test.ts` (modified) -- updated tests to assert no bunx/bun references, added new behavior assertions

## CI Status

- [ ] Quality gates passed (not yet run as of review time)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests updated alongside implementation)
- [ ] No type gaps or missing edge cases (see findings below)
- [x] No security issues (see notes on shell injection below)
- [x] Public API changes match design doc (N/A -- internal tooling)

## Findings

### BLOCKER: Control flow bug in `cli-exec.js` -- unreachable code after catch block

In `cli-exec.js`, the catch block at line 18-28 calls `run()` which calls `process.exit()`. This means the catch block never returns. However, if `getBinaryPath()` **succeeds** (no exception), execution falls through to line 30:

```js
run(binary, ['exec', ...process.argv.slice(2)]);
```

This is correct for the happy path. But the problem is that the catch block does NOT have a `return` or explicit control flow termination visible to a human reader -- it relies on the fact that `run()` calls `process.exit()`. This is **fragile**: if `run()` is ever refactored to not exit (e.g., returning the status code), the catch block would fall through to line 30 where `binary` is `undefined`, causing `spawnSync(undefined, ...)`.

The original code had the same pattern with `run('bunx', ...)`, so this is a pre-existing design issue, not introduced by this PR. **Not a blocker for this PR, downgraded to should-fix.**

### BLOCKER: Shell injection vulnerability in `runScript()` (`cli.js` line 45-46)

```js
const fullCmd = extraArgs.length > 0 ? `${scriptCmd} ${extraArgs.join(' ')}` : scriptCmd;
run(fullCmd, [], { shell: true, env: binEnv() });
```

`scriptCmd` comes from `package.json` scripts, which is developer-controlled (trusted). But `extraArgs` comes from `process.argv` -- user input. The `extraArgs.join(' ')` is passed to a shell via `{ shell: true }`. This means:

```bash
vtz run build "; rm -rf /"
```

would execute `rm -rf /` because the extra args are interpolated directly into a shell command string.

However: this is **the exact same behavior as `npm run`, `yarn run`, and `bun run`**. All package managers pass extra arguments to shell-evaluated scripts in the same way. The user running `vtz run` already has full shell access -- they ARE the shell. This is not a privilege escalation.

**Downgraded from blocker to informational.** This matches standard package manager behavior. No action needed unless the threat model changes.

### SHOULD-FIX: Stale comment in `link-runtime.sh` header (line 14-15)

Line 14-15 still reads:
```
# When the native binary isn't available (e.g. CI), creates lightweight shell
# shims that delegate to bun so package scripts still work.
```

This should say "delegate to Node.js" since the shims now call `node` instead of `bun`/`bunx`. The implementation body was updated correctly, but the header comment was missed.

### SHOULD-FIX: `cli.js` fallback does not handle `vtz test` at all

The old code had:
```js
if (sub === 'test') run('bun', ['test', ...rest]);
```

The new code removes this entirely. The issue acceptance criteria says:
> `vtz test`: errors clearly when native binary unavailable (no `bun test` fallback)

The current behavior: if you run `vtz test` without the native binary, it falls through to the generic error message:
```
vtz: native binary not available and 'test' has no fallback.
Build the native runtime: cd native && cargo build --release
```

This technically meets the criterion ("errors clearly"), but the error message is generic -- it does not mention `test` specifically or explain why test has no fallback. This is acceptable but could be improved. **Not blocking.**

### SHOULD-FIX: `cli.js` missing early return / else-if chain (lines 54-56)

```js
if (sub === 'run') runScript(rest[0], rest.slice(1));
if (sub === 'exec') execCommand(rest[0], rest.slice(1));
console.error(...)
```

Both `runScript()` and `execCommand()` call `run()` which calls `process.exit()`, so they never return. But as written, these are two separate `if` statements, not `if/else if/else`. If `runScript` or `execCommand` were ever refactored to return instead of exiting, the error message would print for `run` and `exec` subcommands too.

This should use `else if` or explicit `return`/`process.exit()` after each branch:

```js
if (sub === 'run') runScript(rest[0], rest.slice(1));
else if (sub === 'exec') execCommand(rest[0], rest.slice(1));
else {
  console.error(...);
  process.exit(1);
}
```

Same pattern exists in the old code, so this is pre-existing, but the rewrite was an opportunity to fix it.

### SHOULD-FIX: `vtz` with no arguments and no native binary shows confusing error

If you run `vtz` with no arguments when the native binary is not available:
```js
const [sub, ...rest] = process.argv.slice(2);
// sub is undefined
if (sub === 'run') ...   // false
if (sub === 'exec') ...  // false
console.error(`vtz: native binary not available and '' has no fallback.\n...`);
```

This prints `and '' has no fallback` which is not helpful. The old code had the same issue (`sub ?? ''`). A better UX would be to show a usage message when no subcommand is given.

### INFORMATIONAL: Tests are string-content-based, not behavioral

All the new tests for the fallback behavior (`index.test.ts` lines 190-244) read the file as a string and check for substring presence/absence (`toContain`, `not.toContain`). These tests verify the source code text, not actual runtime behavior.

For example, the test "Then handles run/exec subcommands without Bun dependency" just checks that the string `'bunx'` does not appear in the file. It does NOT actually test that running `vtz run <script>` works correctly without Bun.

True behavioral tests (spawning the CLI with a mock package.json and verifying it runs the correct command) would be more robust but would also be integration tests that need `.local.ts` treatment. The string-content approach is pragmatic for this scope but leaves behavioral correctness untested.

**No action required** -- behavioral testing is out of scope for this issue and would require integration test infrastructure.

### INFORMATIONAL: `binEnv()` uses `process.cwd()` which may not be the project root

Both `cli-exec.js` and `cli.js` use `process.cwd()` to locate `node_modules/.bin`. This works when the user runs `vtz` from the project root, but fails if they run it from a subdirectory (e.g., `cd packages/server && vtz run build`).

The native `vtz` binary likely handles this by walking up to find the nearest `node_modules/.bin`. The Node.js fallback does not.

This is a **pre-existing limitation** (the old `bun run` fallback had the same behavior -- `bun run` resolves from cwd). Not introduced by this PR.

### INFORMATIONAL: link-runtime.sh heredoc quoting change is correct but subtle

The old shims used `<< 'SHIM'` (single-quoted delimiter, no variable expansion). The new shims use `<< SHIM` (unquoted delimiter, variable expansion enabled). This is intentional: `$RUNTIME_PKG` needs to expand at script-write time, while `$@` needs to be literal in the generated shim (escaped as `\$@`).

The quoting is correct: `"\$@"` produces literal `"$@"` in the output file. Verified.

## Summary

| Severity | Count | Details |
|----------|-------|---------|
| Blocker | 0 | -- |
| Should-fix | 3 | Stale comment in link-runtime.sh header; if/else-if chain in cli.js; `vtz` with no args message |
| Informational | 4 | Shell injection matches npm/yarn/bun behavior; tests are string-based not behavioral; cwd limitation is pre-existing; heredoc quoting is correct |

## Resolution

Changes requested. Three should-fix items:

1. **link-runtime.sh line 14-15**: Update comment from "delegate to bun" to "delegate to Node.js"
2. **cli.js lines 54-56**: Convert to `if/else if/else` chain for defensive control flow
3. **cli.js no-subcommand case**: Show usage hint when `sub` is undefined (low priority, can be deferred)

Items 1 and 2 are straightforward one-line fixes. Item 3 is a UX polish that can be deferred to a follow-up if desired.
