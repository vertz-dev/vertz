# Phase 1: Process Global Bootstrap Extensions

- **Author:** implementation agent
- **Reviewer:** adversarial review agent
- **Date:** 2026-04-14

## Changes

- `native/vtz/src/runtime/ops/env.rs` (modified) -- extended `ENV_BOOTSTRAP_JS` with `argv`, `exit`, `nextTick`, `stdout`, `stderr`, `stdin`; added 7 Rust tests

## CI Status

- [ ] Quality gates passed (pending)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests alongside implementation)
- [ ] No type gaps or missing edge cases (see findings)
- [x] No security issues
- [ ] Public API changes match design doc (N/A -- internal runtime)

## Findings

### BLOCKER-1: `node:process` module does not export `exit`

The `NODE_PROCESS_MODULE` in `module_loader.rs` (line 2611-2621) exports named bindings for `env`, `cwd`, `argv`, `platform`, `version`, `versions`, `nextTick`, `stdout`, `stderr`, `stdin` -- but **not** `exit`. Any code doing `import { exit } from 'node:process'` would fail at runtime.

This is not strictly required by the 4 failing TUI tests (they use `process.exit` on the global, not a named import), but it is an inconsistency between the bootstrap and the module, and it will bite someone eventually.

**Recommendation:** Add `export const exit = proc.exit;` to `NODE_PROCESS_MODULE` in `module_loader.rs`.

### SHOULD-FIX-1: `process.stdout.write` return type mismatch

In the bootstrap (line 128), `stdout.write` calls `Deno.core.ops.op_write_stdout(String(data))`. Looking at the Rust op `op_write_stdout` in `process.rs` (line 55), it returns `Result<bool, AnyError>`, which in JS becomes a `boolean` (`true`).

Node.js's `Writable.write()` returns `boolean` indicating backpressure, so this is technically correct. However, the current implementation always returns `true` (no backpressure simulation). The tests in `prompt.test.ts` and `wizard.test.ts` use `spyOn(process.stdout, 'write').mockImplementation(() => true)`, so they replace the implementation entirely -- this works fine.

But `device-code-auth.test.ts` (line 289) and `task-runner.test.ts` (line 82) directly reassign `process.stdout.write`:
```ts
process.stdout.write = ((chunk: string) => { ... }) as typeof process.stdout.write;
```

This works because `stdout` is a plain object with writable properties. No issue here, just noting the pattern is compatible.

**Verdict:** No action needed. The return type is correct.

### SHOULD-FIX-2: `process.stdin` missing `off` method

The bootstrap `stdin` object (line 147-158) provides `on`, `once`, `removeListener`, `resume`, `pause` -- but not `off`. Node's `EventEmitter` provides `off` as an alias for `removeListener`.

Looking at `stdin-reader.ts` line 51: `this._stdin.off('data', this._onData)`. This call goes to the *real* stdin (or a mock `EventEmitter`) passed via constructor, NOT to the bootstrap `process.stdin` shim. So it does not cause a runtime error in the current TUI code.

However, any code that uses `process.stdin.off(...)` directly (without a custom stdin) would fail with "off is not a function". The same gap exists on `stdout` and `stderr`.

**Recommendation:** Add `off` as an alias for `removeListener` on all three stream shims in the bootstrap:
```js
off: function(_event, _cb) { return this; },
```
And do the same in `NODE_PROCESS_MODULE`.

### SHOULD-FIX-3: `process.stdout`/`stderr` missing `off` method (same as above)

Same issue as SHOULD-FIX-2, applied to `stdout` and `stderr`. Both are missing `off`.

### NITS

#### NIT-1: `nextTick` uses `arguments` object instead of rest params

Bootstrap line 117-121:
```js
globalThis.process.nextTick = function(fn) {
  var args = [];
  for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
  queueMicrotask(function() { fn.apply(null, args); });
};
```

The `NODE_PROCESS_MODULE` version (line 2572) uses modern syntax:
```js
proc.nextTick = (fn, ...args) => queueMicrotask(() => fn(...args));
```

The bootstrap version is functionally equivalent but unnecessarily verbose. The bootstrap already uses arrow functions elsewhere (`process.cwd = () => ...`), so there's no ES5 constraint.

**Recommendation:** Align with the module version for consistency:
```js
globalThis.process.nextTick = function(fn, ...args) {
  queueMicrotask(function() { fn.apply(null, args); });
};
```
(Using `function` keyword is fine to preserve `this` behavior, but the rest params syntax is cleaner than manual `arguments` iteration.)

#### NIT-2: `columns` and `rows` are hardcoded to 80x24

Both bootstrap and module hardcode `columns: 80, rows: 24`. This is a reasonable default. The TUI tests that need actual terminal size use the `TestAdapter` with explicit dimensions, so this is fine for now.

If a future feature needs dynamic terminal size, this will need `op_terminal_size()` or similar. Not blocking.

## Does This Fix All 4 Test Files?

Analyzing each error against the change:

1. **`input.test.ts`** -- `spyOn: exit is not a function on the target object`
   - Line 142: `spyOn(process, 'exit').mockImplementation(...)`
   - The bootstrap now sets `process.exit = function(code) { throw ... }` (line 112).
   - `spyOn` needs the target object to have the property as a function. **FIXED.**

2. **`interactive.test.ts`** -- `Cannot read properties of undefined (reading 'isTTY')`
   - Line 87: `process.stdin.isTTY`
   - The bootstrap now sets `process.stdin = { isTTY: ..., ... }` (line 148).
   - **FIXED.**

3. **`prompt.test.ts`** -- `Cannot read properties of undefined (reading 'write')`
   - Line 9: `spyOn(process.stdout, 'write').mockImplementation(() => true)`
   - The bootstrap now sets `process.stdout = { write: function(data) { ... }, ... }` (line 128).
   - **FIXED.**

4. **`wizard.test.ts`** -- `Cannot read properties of undefined (reading 'write')`
   - Line 34: `spyOn(process.stdout, 'write').mockImplementation(() => true)`
   - Same as prompt.test.ts. **FIXED.**

**All 4 test failures are addressed by this change.**

## Guard Safety (`if (!globalThis.process.X)`)

The guards are reasonable. The bootstrap runs before user code, but after the `process` object shell is created (line 84). The guards ensure:
- If `node:process` module is imported first (which sets properties on `globalThis.process = proc`), bootstrap won't clobber.
- If bootstrap runs first (normal path), it sets the properties.

One edge case: if something sets `process.stdout` to a *partial* object (e.g., `process.stdout = { isTTY: true }` without `write`), the bootstrap's guard `if (!globalThis.process.stdout)` would skip it entirely because `stdout` is truthy. The partial object would remain, missing `write`. This is unlikely in practice but worth noting. The same applies to `stderr` and `stdin`.

## Rust Test Adequacy

7 new tests were added (lines 291-349):
- `test_process_exit_is_a_function` -- checks `typeof process.exit === 'function'`
- `test_process_stdout_write_is_a_function` -- checks `typeof process.stdout.write === 'function'`
- `test_process_stderr_write_is_a_function` -- checks `typeof process.stderr.write === 'function'`
- `test_process_stdin_has_is_tty` -- checks `typeof process.stdin.isTTY === 'boolean'`
- `test_process_stdout_has_is_tty` -- checks `typeof process.stdout.isTTY === 'boolean'`
- `test_process_next_tick_is_a_function` -- checks `typeof process.nextTick === 'function'`
- `test_process_argv_is_an_array` -- checks `Array.isArray(process.argv)`

**Missing coverage:**
- No test that `process.exit()` actually throws (just checks it exists)
- No test that `process.nextTick(fn)` actually calls `fn` (just checks it exists)
- No test that `process.stdout.write(data)` actually writes (just checks it exists)
- No test for `process.stdin.setRawMode`, `on`, `once`, etc.

The tests verify existence/type but not behavior. For a minimal fix this is acceptable, but behavioral tests would be stronger.

## Security

No concerns. The change:
- Does not expose new file system access
- Does not expose new network access
- `process.exit()` throws instead of exiting (safe)
- `process.stdin.setRawMode` is a no-op (safe)
- `op_write_stdout`/`op_write_stderr` were already registered ops

## Summary

**Approved with should-fix items.**

The change correctly fixes all 4 TUI test failures. The implementation is consistent with the `NODE_PROCESS_MODULE` in `module_loader.rs` with minor divergences.

### Items to address before merge:

| ID | Severity | Description |
|----|----------|-------------|
| BLOCKER-1 | Blocker | `node:process` module missing `export const exit = proc.exit` |
| SHOULD-FIX-1 | -- | No action needed (verified correct) |
| SHOULD-FIX-2 | Should-fix | `stdin` missing `off()` method |
| SHOULD-FIX-3 | Should-fix | `stdout`/`stderr` missing `off()` method |
| NIT-1 | Nit | `nextTick` bootstrap uses `arguments` instead of rest params |
| NIT-2 | Nit | Hardcoded 80x24 (acceptable for now) |

## Resolution

_Pending author response._
