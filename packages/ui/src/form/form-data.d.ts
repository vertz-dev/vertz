/** Options for formDataToObject conversion. */
export interface FormDataOptions {
  /** When true, coerces numeric strings to numbers and "true"/"false" to booleans. */
  coerce?: boolean;
}
/**
 * Convert FormData to a plain object.
 *
 * - File entries are skipped (only string values are included).
 * - Duplicate keys use the last value.
 * - When `coerce` is true, numeric strings become numbers and
 *   "true"/"false" become booleans.
 */
export declare function formDataToObject(
  formData: FormData,
  options?: FormDataOptions,
): Record<string, unknown>;
//# sourceMappingURL=form-data.d.ts.map
