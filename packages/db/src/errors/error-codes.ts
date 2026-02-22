// ---------------------------------------------------------------------------
// DbErrorCode — semantic error code enum
// ---------------------------------------------------------------------------
// Maps developer-friendly names to raw PostgreSQL error codes.
// Use the semantic key (e.g., 'UNIQUE_VIOLATION') as the `.code` on error
// classes for switch/case exhaustiveness checking. The raw PG numeric code
// is available via `.pgCode` for advanced users.
// ---------------------------------------------------------------------------

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
export const DbErrorCode = {
  // Integrity constraint violations (Class 23)
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502',
  CHECK_VIOLATION: '23514',
  EXCLUSION_VIOLATION: '23P01',

  // Transaction rollback (Class 40)
  SERIALIZATION_FAILURE: '40001',
  DEADLOCK_DETECTED: '40P01',

  // Connection exception (Class 08)
  CONNECTION_EXCEPTION: '08000',
  CONNECTION_DOES_NOT_EXIST: '08003',
  CONNECTION_FAILURE: '08006',

  // Application-level codes (not PG SQLSTATE)
  NotFound: 'NotFound',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  POOL_EXHAUSTED: 'POOL_EXHAUSTED',
} as const;

/** Union of all semantic error code keys (e.g., `'UNIQUE_VIOLATION' | 'FOREIGN_KEY_VIOLATION' | ...`). */
export type DbErrorCodeName = keyof typeof DbErrorCode;

/** Union of all raw PG error code values (e.g., `'23505' | '23503' | ...`). */
export type DbErrorCodeValue = (typeof DbErrorCode)[keyof typeof DbErrorCode];

/**
 * Reverse map: raw PG code -> semantic name.
 * Built at module load time from DbErrorCode.
 */
export const PgCodeToName: Readonly<Record<string, DbErrorCodeName | undefined>> =
  Object.fromEntries(Object.entries(DbErrorCode).map(([name, pgCode]) => [pgCode, name])) as Record<
    string,
    DbErrorCodeName | undefined
  >;

/**
 * Look up the semantic name for a raw PG error code.
 * Returns the key (e.g., `'UNIQUE_VIOLATION'`) or `undefined` if unmapped.
 */
export function resolveErrorCode(pgCode: string): DbErrorCodeName | undefined {
  return PgCodeToName[pgCode];
}
