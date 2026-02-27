/**
 * Type-level tests for QueryDescriptor.
 *
 * Validates that the error type generic flows correctly through
 * createDescriptor and QueryDescriptor. Checked by `tsc --noEmit`.
 */

import type { QueryDescriptor } from './descriptor';
import { createDescriptor } from './descriptor';
import type { FetchError } from './errors';
import type { FetchResponse } from './types';

// ─── createDescriptor infers QueryDescriptor<T, FetchError> ─────

declare const fetchFn: () => Promise<FetchResponse<string>>;
const descriptor = createDescriptor('GET', '/test', fetchFn);

// Data type is string
const _awaitResult: Promise<string> = descriptor.then((v) => v);
void _awaitResult;

// Error type defaults to FetchError
type DescriptorError = NonNullable<(typeof descriptor)['_error']>;

const _err: DescriptorError = {} as FetchError;
void _err;

// FetchError has status and body
declare const fetchErr: DescriptorError;
const _status: number = fetchErr.status;
void _status;

// @ts-expect-error - FetchError does not have 'code' (that's @vertz/errors FetchError)
const _code: string = fetchErr.code;
void _code;

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
