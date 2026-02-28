/**
 * Type-level tests for QueryDescriptor.
 *
 * Validates that the error type generic flows correctly through
 * createDescriptor and QueryDescriptor. Checked by `tsc --noEmit`.
 */

import type { FetchError, Result } from '@vertz/errors';
import type { QueryDescriptor } from './descriptor';
import { createDescriptor } from './descriptor';
import type { FetchResponse } from './types';

// ─── createDescriptor infers QueryDescriptor<T, FetchError> ─────

declare const fetchFn: () => Promise<FetchResponse<string>>;
const descriptor = createDescriptor('GET', '/test', fetchFn);

// Await resolves to Result<string, FetchError>
const _awaitResult: Promise<Result<string, FetchError>> = descriptor.then((v) => v);
void _awaitResult;

// Error type defaults to FetchError (from @vertz/errors)
type DescriptorError = NonNullable<(typeof descriptor)['_error']>;

const _err: DescriptorError = {} as FetchError;
void _err;

// FetchError from @vertz/errors has .code
declare const fetchErr: DescriptorError;
const _code: string = fetchErr.code;
void _code;

// @ts-expect-error - @vertz/errors FetchError does not have 'status' (that's the local FetchError)
const _status: number = fetchErr.status;
void _status;

// ─── QueryDescriptor with custom error type ─────────────────────

interface CustomError {
  code: string;
  detail: string;
}

declare const customDescriptor: QueryDescriptor<number, CustomError>;

// Custom error type is preserved
type CustomErr = NonNullable<(typeof customDescriptor)['_error']>;

const _customErr: CustomErr = {} as CustomError;
void _customErr;

// @ts-expect-error - CustomError does not have 'status'
const _customStatus: number = ({} as CustomErr).status;
void _customStatus;

// ─── Default error type is FetchError, not never or unknown ─────

declare const defaultDescriptor: QueryDescriptor<string>;

// E defaults to FetchError — verify it's not never
type DefaultErr = NonNullable<(typeof defaultDescriptor)['_error']>;
const _defaultErr: DefaultErr = {} as FetchError;
void _defaultErr;

// Verify it's assignable from FetchError (same type)
const _assignCheck: FetchError = {} as DefaultErr;
void _assignCheck;

// ─── _fetch returns Promise<Result<T, E>> ───────────────────────

const _fetchResult: Promise<Result<string, FetchError>> = descriptor._fetch();
void _fetchResult;

// ─── then returns PromiseLike<Result<T, E>> ─────────────────────

const _thenResult: PromiseLike<Result<string, FetchError>> = descriptor;
void _thenResult;
