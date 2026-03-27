# Native Compiler Parity Audit

## Problem

The Rust native compiler (`native/vertz-compiler`) produces functionally different output from the TypeScript ts-morph compiler (`packages/ui-compiler`) for real-world application files. These differences cause runtime behavior changes — specifically, reactive updates don't work correctly when using the native compiler.

## Root Cause

The native compiler uses **text-based reactivity detection** (`is_expr_reactive_in_scope`) that scans the transformed source for signal variable names. This misses:

1. **Props expressions** (`__props.foo`) — after props destructuring, the original prop names are replaced with `__props.propName`, but `__props` isn't in the reactive names set.
2. **Non-JSX conditional branches** — the conditional classifier only wraps ternaries where at least one branch is JSX, missing string-literal ternaries that reference reactive variables.
3. **Spurious `effect` import** — the import scanner finds `effect(` pattern in the output even when no `effect()` calls were generated.

## Bugs Found & Fixed

### Bug 1: `__child()` vs `__insert()` for prop/reactive expressions — FIXED
- **Files affected**: confirm-dialog.tsx (4→0), task-form.tsx (3→1), task-card.tsx (4→0)
- **Example**: `__append(el, __child(() => __props.triggerLabel))` → `__insert(el, __props.triggerLabel)`
- **Impact**: Dynamic content from props won't update reactively
- **Fix**: In `jsx_transformer.rs`, treat `__props.*` access as reactive in `is_expr_reactive_in_scope()`

### Bug 2: `__attr()` vs `setAttribute()` for reactive prop expressions — FIXED
- **Files affected**: task-card.tsx, app.tsx
- **Example**: `__attr(el, "data-testid", () => \`task-card-${__props.task.id}\`)` → direct `setAttribute()`
- **Impact**: Attributes referencing props won't update reactively
- **Fix**: Same as Bug 1 — recognize `__props.*` as reactive

### Bug 3: Missing `__conditional()` for non-JSX ternaries — FIXED
- **Files affected**: app.tsx (2→1)
- **Example**: `settings.theme === 'light' ? 'Dark Mode' : 'Light Mode'` not wrapped
- **Impact**: Conditional text won't toggle when the reactive condition changes
- **Fix**: In `classify_inner_expression()`, also wrap ternaries where the condition is reactive, even if branches aren't JSX. Also added nested ternary handling in `transform_branch()`.

### Bug 4: Spurious `effect` import — FIXED (pre-existing)
- **Files affected**: settings.tsx, confirm-dialog.tsx
- **Impact**: Unnecessary import (functionally harmless but wrong)
- **Status**: Already passes — no false `effect` import detected in current native output

### Bug 5: Double `.value` on signal properties with explicit `.value` — FIXED
- **Files affected**: task-form.tsx
- **Example**: `taskForm.submitting.value` → `taskForm.submitting.value.value`
- **Impact**: Runtime error — `.value.value` on a signal returns undefined
- **Root cause**: Two issues:
  1. The 3-level field signal chain check incorrectly matched `taskForm.submitting.value` (where `submitting` is a signal property, not a field name) because `value` exists in `field_signal_properties`.
  2. The 2-level check didn't verify that `.value` was already present in source.
- **Fix**: In `signal_transformer.rs`:
  1. Skip 3-level check when the middle property is a known signal property (not a field name)
  2. In 2-level check, verify original source doesn't already have `.value` after the span

## Known Acceptable Differences

### ts-morph false positive: `dialogStyles.description` wrapped in `__attr()`
- **File**: confirm-dialog.tsx (`__attr` count: ts-morph=6, native=5)
- **Cause**: ts-morph's `containsReactiveSourceAccess()` matches the property name `description` in `dialogStyles.description` against the destructured prop `description`, causing a spurious `__attr()` wrap on a static member expression.
- **Impact**: None — both produce identical DOM. The extra `__attr()` just creates an unnecessary effect for a static value.
- **Decision**: Native compiler is more correct. Documented in test as `KNOWN_TS_MORPH_FALSE_POSITIVES`.

## Non-Goals

- Whitespace/formatting parity — acceptable to have different formatting
- CSS build-time extraction parity — the native CSS transform is an intentional optimization
- TypeScript stripping parity — different approaches both valid

## Final Results

- **14 initial app-level parity failures** → **0 real failures** (1 documented ts-morph false positive)
- **448 total native compiler tests passing** (including 16 app-level parity tests)
- **All 17 cross-compiler equivalence tests passing**
- **All task manager .tsx files compile with matching helper counts and imports**

## Files Modified

### Rust source
- `native/vertz-compiler/src/jsx_transformer.rs` — Props reactivity detection, non-JSX ternary/logical-and conditionals, nested ternary handling, field signal API vars in ReactivityContext
- `native/vertz-compiler/src/signal_transformer.rs` — Double `.value` prevention for signal properties with explicit `.value`, skip 3-level check when mid is a signal property
- `native/vertz-compiler/src/magic_string.rs` — Added `len()` method

### Tests
- `native/vertz-compiler/__tests__/jsx-transform.test.ts` — 7 new tests: props reactivity (4), non-JSX ternary (2), double .value prevention (1)
- `native/vertz-compiler/__tests__/app-file-parity.test.ts` — New comprehensive parity test suite compiling all task manager .tsx files through both compilers
