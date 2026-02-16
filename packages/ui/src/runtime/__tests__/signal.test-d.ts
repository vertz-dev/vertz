/**
 * Type-level tests for Signal, ReadonlySignal, and Computed.
 *
 * These tests verify that generic type parameters flow correctly
 * through the reactive primitives. They are checked by `tsc --noEmit`
 * (typecheck), not by vitest at runtime.
 */

import { computed, effect, signal } from '../signal';
import type { DisposeFn, ReadonlySignal, Signal } from '../signal-types';

// ─── Signal<T> — basic generic parameter flow ─────────────────────

// signal() infers T from the initial value
const count = signal(0);
const _countValue: number = count.value;
void _countValue;

const name = signal('hello');
const _nameValue: string = name.value;
void _nameValue;

// Explicit generic parameter
const explicit = signal<number | null>(null);
const _explicitValue: number | null = explicit.value;
void _explicitValue;

// peek() returns the same type as value
const _peekNum: number = count.peek();
void _peekNum;

const _peekStr: string = name.peek();
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
const _notifyResult: undefined = count.notify();
void _notifyResult;

// ─── Signal<T> — complex types ────────────────────────────────────

interface User {
  id: number;
  name: string;
}

const userSignal = signal<User>({ id: 1, name: 'Alice' });
const _userId: number = userSignal.value.id;
const _userName: string = userSignal.value.name;
void _userId;
void _userName;

// @ts-expect-error - missing required property 'name'
const _badUser = signal<User>({ id: 1 });
void _badUser;

// Array type
const items = signal<string[]>([]);
const _itemsArr: string[] = items.value;
void _itemsArr;

// ─── Signal<T> — structural conformance ───────────────────────────

// A Signal<number> should be assignable to Signal<number>
const _signalRef: Signal<number> = count;
void _signalRef;

// @ts-expect-error - Signal<string> is not assignable to Signal<number>
const _wrongSignalRef: Signal<number> = name;
void _wrongSignalRef;

// ─── ReadonlySignal<T> — read-only property ───────────────────────

// ReadonlySignal.value is read-only
declare const readonlySig: ReadonlySignal<number>;
const _roValue: number = readonlySig.value;
void _roValue;

const _roPeek: number = readonlySig.peek();
void _roPeek;

// ReadonlySignal should not have notify()
// @ts-expect-error - 'notify' does not exist on ReadonlySignal
readonlySig.notify();

// ─── Computed<T> — derives type from function return ──────────────

const doubled = computed(() => count.value * 2);
const _doubledValue: number = doubled.value;
void _doubledValue;

const _doubledPeek: number = doubled.peek();
void _doubledPeek;

// Computed derives string type
const greeting = computed(() => `Hello, ${name.value}!`);
const _greetingValue: string = greeting.value;
void _greetingValue;

// Computed with explicit generic
const maybeNull = computed<string | null>(() => {
  const val = name.value;
  return val.length > 0 ? val : null;
});
const _maybeNullValue: string | null = maybeNull.value;
void _maybeNullValue;

// ─── Computed<T> extends ReadonlySignal<T> ────────────────────────

// Computed should be assignable to ReadonlySignal
const _asReadonly: ReadonlySignal<number> = doubled;
void _asReadonly;

// @ts-expect-error - Computed<string> is not assignable to ReadonlySignal<number>
const _wrongReadonly: ReadonlySignal<number> = greeting;
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
const _disposeFn: DisposeFn = dispose;
void _disposeFn;

// DisposeFn returns void
const _disposeResult: undefined = dispose();
void _disposeResult;

// Note: effect(() => 42) is valid TypeScript — () => number is assignable to () => void.
// This is by design in TypeScript and not an error to test against.
