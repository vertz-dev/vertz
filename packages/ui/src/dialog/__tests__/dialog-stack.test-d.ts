/**
 * Type-level tests for DialogResult discriminated union.
 *
 * Verifies that TypeScript narrows `data` correctly after checking `ok`,
 * and that the generic TResult flows from DialogComponent through to DialogResult.
 * Checked by `tsc --noEmit` (typecheck), not by vitest at runtime.
 */

import type { DialogComponent, DialogHandle, DialogResult, DialogStack } from '../dialog-stack';

// ─── DialogResult<T> — discriminated union narrowing ──────────────

declare const result: DialogResult<string>;

// Positive: after checking ok, data is string
if (result.ok) {
  const _data: string = result.data;
  void _data;
}

// Negative: data is not accessible on ok: false branch
if (!result.ok) {
  // @ts-expect-error — data does not exist on { ok: false }
  result.data;
}

// Negative: data is not accessible without narrowing
// @ts-expect-error — data does not exist on DialogResult<string> without narrowing
result.data;

// ─── DialogResult<void> — void result type ────────────────────────

declare const voidResult: DialogResult<void>;

// Positive: after checking ok, data exists (void at type level, undefined at runtime)
if (voidResult.ok) {
  const _data = voidResult.data;
  void _data;
}

// ─── DialogResult<boolean> — boolean result type ──────────────────

declare const boolResult: DialogResult<boolean>;

if (boolResult.ok) {
  const _data: boolean = boolResult.data;
  void _data;

  // @ts-expect-error — data is boolean, not string
  const _wrong: string = boolResult.data;
  void _wrong;
}

// ─── DialogStack.open() — return type matches DialogResult ────────

declare const stack: DialogStack;
declare const component: DialogComponent<string, { msg: string }>;

// Positive: open() returns Promise<DialogResult<string>>
const _promise: Promise<DialogResult<string>> = stack.open(component, { msg: 'hi' });
void _promise;

// ─── DialogHandle<T> — close argument flows to result data ────────

declare const handle: DialogHandle<number>;

// Positive: close accepts number
handle.close(42);

// @ts-expect-error — close requires number, not string
handle.close('wrong');

// ─── DialogHandle<void> — close with no arguments ─────────────────

declare const voidHandle: DialogHandle<void>;

// Positive: close accepts no arguments
voidHandle.close();

// ─── readonly fields ──────────────────────────────────────────────

if (result.ok) {
  // @ts-expect-error — ok is readonly
  result.ok = false;

  // @ts-expect-error — data is readonly
  result.data = 'mutated';
}
