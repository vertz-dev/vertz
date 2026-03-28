# Phase 1: Core Test Runner

- **Author:** claude-opus
- **Reviewer:** claude-opus (adversarial)
- **Commits:** 5a1a9e15d
- **Date:** 2026-03-28

## Changes

- native/vertz-runtime/Cargo.toml (modified — added glob, crossbeam-channel)
- native/vertz-runtime/src/cli.rs (modified — added TestArgs, Test command)
- native/vertz-runtime/src/lib.rs (modified — added pub mod test)
- native/vertz-runtime/src/main.rs (modified — wired Command::Test)
- native/vertz-runtime/src/test/mod.rs (new)
- native/vertz-runtime/src/test/collector.rs (new)
- native/vertz-runtime/src/test/globals.rs (new)
- native/vertz-runtime/src/test/executor.rs (new)
- native/vertz-runtime/src/test/reporter/mod.rs (new)
- native/vertz-runtime/src/test/reporter/terminal.rs (new)
- native/vertz-runtime/src/test/runner.rs (new)
- native/vertz-runtime/tests/test_runner.rs (new)

## CI Status

- [x] Quality gates passed at 5a1a9e15d (729 tests, 0 failures, 0 warnings)

## Review Checklist

- [x] Delivers what the ticket asks for
- [ ] TDD compliance (tests before/alongside implementation)
- [ ] No type gaps or missing edge cases
- [x] No security issues (injection, XSS, etc.)
- [x] Public API changes match design doc

## Findings

### BLOCKERS

**BLOCKER-1: `--filter` flag accepted but never used.**
`TestArgs.filter` is parsed from CLI and stored in `TestRunConfig.filter`, but `run_tests()` never reads it. `vertz test --filter math` silently runs ALL tests.

**BLOCKER-2: `--timeout` flag accepted but never enforced.**
`TestArgs.timeout` defaults to 5000ms but is never passed to `TestRunConfig` (no `timeout` field). An infinite loop in a test hangs the worker thread forever.

**BLOCKER-3: `@vertz/test` virtual module interception is missing.**
The comment in `globals.rs` mentions a virtual module for `import { describe, it, expect } from '@vertz/test'`, but no module loader interception exists. Tests only work via implicit globals. (Note: This is deferred to Phase 2 per design doc — the comment is misleading.)

### SHOULD-FIX

**SHOULD-FIX-1: Nested `beforeEach` hooks don't compose across describe levels.**
`runSuite()` only runs `suite.beforeEach` for the immediate suite. Parent hooks are NOT inherited. Violates vitest/jest semantics.

**SHOULD-FIX-2: `deepEqual` mishandles Date, RegExp, NaN.**
`deepEqual(new Date(0), new Date(1))` returns `true` (no enumerable keys). `deepEqual(NaN, NaN)` returns `false`.

**SHOULD-FIX-3: `is_excluded` uses substring match, not path-component match.**
Exclude pattern `"test"` accidentally excludes `test-utils.test.ts`.

**SHOULD-FIX-4: Top-level hooks silently dropped.**
`beforeEach`/`afterEach` outside `describe` go to `currentSuite()` which returns the suite stack top — but if no suite exists, they're lost.

**SHOULD-FIX-5: `toThrow` negation may fail for message matching.**
The four-way matrix (throw/no-throw x negated/not-negated x with-message/without-message) needs verification.

### NICE-TO-HAVE (deferred)

1. No ANSI colors in terminal reporter (owo-colors available)
2. `--watch`, `--coverage` flags accepted but unimplemented with no warning
3. No async test cases tested
4. `execute_test_file` uses file's parent as `root_dir` instead of project root

## Resolution

All blockers and should-fixes addressed in follow-up commit. See details below.

- BLOCKER-1: Filter wired through runner → executor → JS harness
- BLOCKER-2: Timeout added to TestRunConfig, enforced via tokio timeout on V8 execution
- BLOCKER-3: Comment clarified — virtual module is Phase 2, globals work for Phase 1
- SHOULD-FIX-1: Hook inheritance implemented — parent beforeEach/afterEach compose
- SHOULD-FIX-2: deepEqual handles Date, RegExp, NaN correctly
- SHOULD-FIX-3: is_excluded uses path-component match
- SHOULD-FIX-4: Implicit root suite created for top-level hooks
- SHOULD-FIX-5: toThrow negation with message matching verified and fixed
