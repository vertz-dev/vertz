/**
 * Internal Result type for @vertz/core HTTP layer.
 *
 * This is a private module used internally by the core package.
 * For the public Result type, use @vertz/errors instead.
 *
 * This version has a brand symbol for reliable type guards and
 * uses status/body for HTTP response mapping.
 */

const RESULT_BRAND: unique symbol = Symbol.for('vertz.result');

export interface Ok<T> {
  readonly ok: true;
  readonly data: T;
  readonly [RESULT_BRAND]: true;
}

export interface Err<E> {
  readonly ok: false;
  readonly status: number;
  readonly body: E;
  readonly [RESULT_BRAND]: true;
}

export type Result<T, E = unknown> = Ok<T> | Err<E>;

export function ok<T>(data: T): Ok<T> {
  return { ok: true, data, [RESULT_BRAND]: true };
}

export function err<E>(status: number, body: E): Err<E> {
  return { ok: false, status, body, [RESULT_BRAND]: true };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok === true;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result.ok === false;
}

export function isResult(value: unknown): value is Result<unknown, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const obj = value as Record<string | symbol, unknown>;
  return obj[RESULT_BRAND] === true;
}
