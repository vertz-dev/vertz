/**
 * @vertz/errors - Unified error taxonomy for Vertz
 *
 * This package provides:
 * - Result<T, E> type and utilities (ok, err, unwrap, map, flatMap, match, matchErr)
 * - AppError base class for custom domain errors
 * - Domain error types (schema, db, auth, client)
 * - Infrastructure error classes (thrown, not Result)
 * - Error mapping functions (db-to-http, http-to-client)
 *
 * @example
 * import { ok, err, Result, AppError } from '@vertz/errors';
 *
 * // Using Result
 * const result = ok({ name: 'Alice' });
 * const failed = err({ code: 'NOT_FOUND', message: 'User not found' });
 *
 * // Using AppError
 * class InsufficientBalanceError extends AppError<'INSUFFICIENT_BALANCE'> {
 *   constructor(public readonly required: number, public readonly available: number) {
 *     super('INSUFFICIENT_BALANCE', `Need ${required}, have ${available}`);
 *   }
 * }
 */

// AppError base class
export * from './app-error.js';
// Domain errors
export * from './domain/index.js';
// Infrastructure errors
export * from './infra/index.js';
// Mapping functions
export * from './mapping/index.js';
// Result type and utilities
export * from './result.js';
