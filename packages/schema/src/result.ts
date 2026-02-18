/**
 * Result type and utilities for errors-as-values pattern.
 *
 * This module provides a type-safe alternative to throwing exceptions.
 * Every operation that can fail returns a Result<T, E> instead of throwing.
 *
 * @example
 * import { ok, err, unwrap, map, flatMap, match, matchErr } from '@vertz/schema';
 *
 * // Creating results
 * const success = ok({ name: 'Alice' });
 * const failure = err(new Error('validation failed'));
 *
 * // Transforming
 * const doubled = map(ok(5), x => x * 2);
 *
 * // Chaining
 * const result = await flatMap(ok(5), async x => ok(x * 2));
 *
 * // Pattern matching
 * const message = match(result, {
 *   ok: (data) => `Success: ${data}`,
 *   err: (error) => `Error: ${error.message}`
 * });
 */

/**
 * Represents a successful result.
 *
 * @example
 * { ok: true, data: { name: 'Alice' } }
 */
export interface Ok<T> {
  /** Always true for successful results */
  readonly ok: true;
  /** The successful value */
  readonly data: T;
}

/**
 * Represents an erroneous result.
 *
 * @example
 * { ok: false, error: new Error('validation failed') }
 */
export interface Err<E> {
  /** Always false for error results */
  readonly ok: false;
  /** The error value */
  readonly error: E;
}

/**
 * A discriminated union representing success or failure.
 *
 * @example
 * type UserResult = Result<User, SchemaError>;
 * type UsersResult = Result<User[], ReadError>;
 *
 * @example
 * const result: Result<string, Error> = ok('hello');
 * if (result.ok) {
 *   console.log(result.data); // TypeScript knows this is string
 * } else {
 *   console.log(result.error); // TypeScript knows this is Error
 * }
 */
export type Result<T, E = unknown> = Ok<T> | Err<E>;

/**
 * Creates a successful Result.
 *
 * @example
 * const result = ok({ name: 'Alice' });
 * // { ok: true, data: { name: 'Alice' } }
 *
 * @example
 * // With type inference
 * const result = ok(42); // Ok<number>
 */
export const ok = <T>(data: T): Ok<T> => ({ ok: true, data });

/**
 * Creates an error Result.
 *
 * @example
 * const result = err(new ValidationError({ email: ['Invalid format'] }));
 * // { ok: false, error: ValidationError(...) }
 *
 * @example
 * // With simple string errors
 * const result = err('Something went wrong');
 * // { ok: false, error: 'Something went wrong' }
 */
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

/**
 * Unwraps a Result, throwing if error.
 *
 * Use only in tests, scripts, or when failure is truly exceptional.
 *
 * @example
 * // Tests
 * const user = unwrap(await repo.findOneRequired(id));
 *
 * @example
 * // Scripts
 * const config = unwrap(parseConfig());
 *
 * @throws The error value if the Result is an error
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.data;
  }
  throw result.error;
}

/**
 * Maps the success value to a new type.
 *
 * @example
 * const userName = map(userResult, u => u.name);
 * // Result<string, Error> if userResult was Result<User, Error>
 *
 * @example
 * // Transform while preserving error type
 * const id = map(ok({ userId: 5 }), u => u.userId);
 * // Ok<number>
 */
export function map<T, E, U>(result: Result<T, E>, fn: (data: T) => U): Result<U, E> {
  if (result.ok) {
    return { ok: true, data: fn(result.data) };
  }
  return result;
}

/**
 * Chains Result-returning functions.
 *
 * Allows chaining operations that can fail without nested try/catch.
 *
 * @example
 * // Synchronous
 * const profile = flatMap(
 *   await repo.findOne(userId),
 *   (user) => profileRepo.findOne(user.profileId)
 * );
 *
 * @example
 * // Asynchronous
 * const finalResult = await flatMap(
 *   await repo.findOne(userId),
 *   async (user) => await profileRepo.findOne(user.profileId)
 * );
 */
export function flatMap<T, E, U, F>(
  result: Result<T, E>,
  fn: (data: T) => Result<U, F>
): Result<U, E | F>;

export function flatMap<T, E, U, F>(
  result: Result<T, E>,
  fn: (data: T) => Promise<Result<U, F>>
): Promise<Result<U, E | F>>;

export function flatMap<T, E, U, F>(
  result: Result<T, E>,
  fn: (data: T) => Result<U, F> | Promise<Result<U, F>>
): Result<U, E | F> | Promise<Result<U, E | F>> {
  if (result.ok) {
    return fn(result.data);
  }
  return result as Result<U, E | F>;
}

/**
 * Pattern matching on Result.
 *
 * @example
 * const message = match(result, {
 *   ok: (user) => `Hello, ${user.name}!`,
 *   err: (e) => `Error: ${e.message}`
 * });
 */
export function match<T, E, Ok, Err>(
  result: Result<T, E>,
  handlers: { ok: (data: T) => Ok; err: (error: E) => Err }
): Ok | Err {
  return result.ok ? handlers.ok(result.data) : handlers.err(result.error);
}

/**
 * Type for error handlers in matchErr.
 * Extracts error codes from an error union and creates a handler map.
 */
type ErrorHandlers<E, R> = {
  [K in E as K extends { readonly code: infer C extends string } ? C : never]: (
    error: K
  ) => R;
};

/**
 * Exhaustive pattern matching on Result errors.
 *
 * Unlike `match()` which gives you a single `err` handler,
 * `matchErr` requires a handler for every error type in the union.
 * The compiler enforces exhaustiveness — add a new error type to the union
 * and every callsite lights up until you handle it.
 *
 * Errors are discriminated by their `code` string literal field.
 *
 * @example
 * const response = matchErr(result, {
 *   ok: (user) => json({ data: user }, 201),
 *   UNIQUE_CONSTRAINT: (e) => json({ error: 'EMAIL_EXISTS', field: e.column }, 409),
 *   NOT_NULL: (e) => json({ error: 'REQUIRED', field: e.column }, 422),
 *   CHECK_CONSTRAINT: (e) => json({ error: 'INVALID' }, 422),
 * });
 * // ^ Compile error if WriteError adds a new member you didn't handle
 *
 * @throws Error if an error code is not handled
 */
export function matchErr<T, E extends { readonly code: string }, R>(
  result: Result<T, E>,
  handlers: { ok: (data: T) => R } & ErrorHandlers<E, R>
): R {
  if (result.ok) {
    return handlers.ok(result.data);
  }
  const errorCode = result.error.code as string;
  const handlersRecord = handlers as unknown as Record<string, (error: E) => R>;
  const handler = handlersRecord[errorCode];
  if (!handler) {
    throw new Error(`Unhandled error code: ${errorCode}`);
  }
  return handler(result.error);
}
