/**
 * Maps semantic error names to their corresponding PostgreSQL SQLSTATE codes.
 *
 * Usage in switch statements:
 * ```ts
 * switch (error.code) {
 *   case 'UNIQUE_VIOLATION':   // ...
 *   case 'FOREIGN_KEY_VIOLATION': // ...
 * }
 * ```
 *
 * Reverse lookup (semantic name -> PG code):
 * ```ts
 * DbErrorCode.UNIQUE_VIOLATION // '23505'
 * ```
 */
export declare const DbErrorCode: {
  readonly UNIQUE_VIOLATION: '23505';
  readonly FOREIGN_KEY_VIOLATION: '23503';
  readonly NOT_NULL_VIOLATION: '23502';
  readonly CHECK_VIOLATION: '23514';
  readonly EXCLUSION_VIOLATION: '23P01';
  readonly SERIALIZATION_FAILURE: '40001';
  readonly DEADLOCK_DETECTED: '40P01';
  readonly CONNECTION_EXCEPTION: '08000';
  readonly CONNECTION_DOES_NOT_EXIST: '08003';
  readonly CONNECTION_FAILURE: '08006';
  readonly NOT_FOUND: 'NOT_FOUND';
  readonly CONNECTION_ERROR: 'CONNECTION_ERROR';
  readonly POOL_EXHAUSTED: 'POOL_EXHAUSTED';
};
/** Union of all semantic error code keys (e.g., `'UNIQUE_VIOLATION' | 'FOREIGN_KEY_VIOLATION' | ...`). */
export type DbErrorCodeName = keyof typeof DbErrorCode;
/** Union of all raw PG error code values (e.g., `'23505' | '23503' | ...`). */
export type DbErrorCodeValue = (typeof DbErrorCode)[keyof typeof DbErrorCode];
/**
 * Reverse map: raw PG code -> semantic name.
 * Built at module load time from DbErrorCode.
 */
export declare const PgCodeToName: Readonly<Record<string, DbErrorCodeName | undefined>>;
/**
 * Look up the semantic name for a raw PG error code.
 * Returns the key (e.g., `'UNIQUE_VIOLATION'`) or `undefined` if unmapped.
 */
export declare function resolveErrorCode(pgCode: string): DbErrorCodeName | undefined;
//# sourceMappingURL=error-codes.d.ts.map
