/**
 * Symbol used to brand Result objects to prevent accidental matches with user data.
 * Using a Symbol makes it impossible for user objects to accidentally match isResult().
 */
declare const RESULT_BRAND: unique symbol;
/**
 * Result type for explicit error handling in route handlers.
 *
 * This provides an alternative to exception-based error handling,
 * making error cases visible in type signatures.
 *
 * @example
 * ```typescript
 * router.get('/:id', {
 *   handler: async (ctx) => {
 *     const user = await ctx.userService.find(ctx.params.id);
 *     if (!user) {
 *       return err(404, { message: 'User not found' });
 *     }
 *     return ok({ id: user.id, name: user.name });
 *   }
 * });
 * ```
 */
/**
 * Represents a successful result containing data.
 */
export interface Ok<T> {
  readonly ok: true;
  readonly data: T;
  readonly [RESULT_BRAND]: true;
}
/**
 * Represents an error result containing status code and error body.
 */
export interface Err<E> {
  readonly ok: false;
  readonly status: number;
  readonly body: E;
  readonly [RESULT_BRAND]: true;
}
/**
 * A discriminated union type representing either a success (Ok) or failure (Err).
 *
 * @typeParam T - The type of the success data
 * @typeParam E - The type of the error body
 *
 * @example
 * ```typescript
 * type UserResult = Result<{ id: number; name: string }, { message: string }>;
 * ```
 */
export type Result<T, E = unknown> = Ok<T> | Err<E>;
/**
 * Creates a successful Result containing the given data.
 *
 * @param data - The success data
 * @returns An Ok result with the data
 *
 * @example
 * ```typescript
 * return ok({ id: 1, name: 'John' });
 * ```
 */
export declare function ok<T>(data: T): Ok<T>;
/**
 * Creates an error Result with the given status code and body.
 *
 * @param status - HTTP status code for the error
 * @param body - Error body/response
 * @returns An Err result with status and body
 *
 * @example
 * ```typescript
 * return err(404, { message: 'Not found' });
 * ```
 */
export declare function err<E>(status: number, body: E): Err<E>;
/**
 * Type guard to check if a Result is Ok.
 *
 * @param result - The result to check
 * @returns True if the result is Ok
 *
 * @example
 * ```typescript
 * if (isOk(result)) {
 *   console.log(result.data);
 * }
 * ```
 */
export declare function isOk<T, E>(result: Result<T, E>): result is Ok<T>;
/**
 * Type guard to check if a Result is Err.
 *
 * @param result - The result to check
 * @returns True if the result is Err
 *
 * @example
 * ```typescript
 * if (isErr(result)) {
 *   console.log(result.status, result.body);
 * }
 * ```
 */
export declare function isErr<T, E>(result: Result<T, E>): result is Err<E>;
/**
 * Type guard to check if a value is a Result type (Ok or Err).
 * Uses Symbol brand for reliable detection that won't match user objects.
 *
 * @param value - The value to check
 * @returns True if the value is a Result
 *
 * @example
 * ```typescript
 * if (isResult(value)) {
 *   // value is Result<unknown, unknown>
 * }
 * ```
 */
export declare function isResult(value: unknown): value is Result<unknown, unknown>;
//# sourceMappingURL=result.d.ts.map
