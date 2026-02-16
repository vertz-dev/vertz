/**
 * Type-level tests for Signal, ReadonlySignal, and Computed.
 *
 * These tests verify that generic type parameters flow correctly
 * through the reactive primitives. They are checked by `tsc --noEmit`
 * (typecheck), not by vitest at runtime.
 */
import { computed, effect, signal } from '../signal';

// ─── Signal<T> — basic generic parameter flow ─────────────────────
// signal() infers T from the initial value
const count = signal(0);
const _countValue = count.value;
void _countValue;
const name = signal('hello');
const _nameValue = name.value;
void _nameValue;
// Explicit generic parameter
const explicit = signal(null);
const _explicitValue = explicit.value;
void _explicitValue;
// peek() returns the same type as value
const _peekNum = count.peek();
void _peekNum;
const _peekStr = name.peek();
void _peekStr;
// Setting value accepts the correct type
count.value = 42;
name.value = 'world';
explicit.value = 10;
explicit.value = null;
// @ts-expect-error - cannot assign string to Signal<number>
count.value = 'oops';
// @ts-expect-error - cannot assign number to Signal<string>
name.value = 123;
// @ts-expect-error - cannot assign undefined to Signal<number | null>
explicit.value = undefined;
// notify() returns void
const _notifyResult = count.notify();
void _notifyResult;
const userSignal = signal({ id: 1, name: 'Alice' });
const _userId = userSignal.value.id;
const _userName = userSignal.value.name;
void _userId;
void _userName;
// @ts-expect-error - missing required property 'name'
const _badUser = signal({ id: 1 });
void _badUser;
// Array type
const items = signal([]);
const _itemsArr = items.value;
void _itemsArr;
// ─── Signal<T> — structural conformance ───────────────────────────
// A Signal<number> should be assignable to Signal<number>
const _signalRef = count;
void _signalRef;
// @ts-expect-error - Signal<string> is not assignable to Signal<number>
const _wrongSignalRef = name;
void _wrongSignalRef;
const _roValue = readonlySig.value;
void _roValue;
const _roPeek = readonlySig.peek();
void _roPeek;
// ReadonlySignal should not have notify()
// @ts-expect-error - 'notify' does not exist on ReadonlySignal
readonlySig.notify();
// ─── Computed<T> — derives type from function return ──────────────
const doubled = computed(() => count.value * 2);
const _doubledValue = doubled.value;
void _doubledValue;
const _doubledPeek = doubled.peek();
void _doubledPeek;
// Computed derives string type
const greeting = computed(() => `Hello, ${name.value}!`);
const _greetingValue = greeting.value;
void _greetingValue;
// Computed with explicit generic
const maybeNull = computed(() => {
  const val = name.value;
  return val.length > 0 ? val : null;
});
const _maybeNullValue = maybeNull.value;
void _maybeNullValue;
// ─── Computed<T> extends ReadonlySignal<T> ────────────────────────
// Computed should be assignable to ReadonlySignal
const _asReadonly = doubled;
void _asReadonly;
// @ts-expect-error - Computed<string> is not assignable to ReadonlySignal<number>
const _wrongReadonly = greeting;
void _wrongReadonly;
// Computed should not have a setter
// @ts-expect-error - 'value' is read-only on Computed
doubled.value = 10;
// Computed should not have notify()
// @ts-expect-error - 'notify' does not exist on Computed
doubled.notify();
// ─── effect() return type ─────────────────────────────────────────
const dispose = effect(() => {
  void count.value;
});
const _disposeFn = dispose;
void _disposeFn;
// DisposeFn returns void
const _disposeResult = dispose();
void _disposeResult;
// Note: effect(() => 42) is valid TypeScript — () => number is assignable to () => void.
// This is by design in TypeScript and not an error to test against.
//# sourceMappingURL=signal.test-d.js.map
