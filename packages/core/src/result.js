/**
 * Symbol used to brand Result objects to prevent accidental matches with user data.
 * Using a Symbol makes it impossible for user objects to accidentally match isResult().
 */
const RESULT_BRAND = Symbol.for('vertz.result');
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
export function ok(data) {
  return { ok: true, data, [RESULT_BRAND]: true };
}
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
export function err(status, body) {
  return { ok: false, status, body, [RESULT_BRAND]: true };
}
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
export function isOk(result) {
  return result.ok === true;
}
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
export function isErr(result) {
  return result.ok === false;
}
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
export function isResult(value) {
  if (value === null || typeof value !== 'object') return false;
  const obj = value;
  return obj[RESULT_BRAND] === true;
}
//# sourceMappingURL=result.js.map
