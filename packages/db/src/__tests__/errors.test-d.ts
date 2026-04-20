import type { DbJsonbValidationError, WriteError } from '../errors';

// DbJsonbValidationError is assignable to WriteError (union widened for #2867).
const _assignable = {
  code: 'JSONB_VALIDATION_ERROR' as const,
  message: 'test',
  table: 't',
  column: 'c',
  value: { x: 1 },
} satisfies WriteError;

// Exhaustive-switch check: a `never` default over WriteError['code'] must list
// every case, including the new 'JSONB_VALIDATION_ERROR' arm. Removing any arm
// breaks this file at the `const _never: never = err` assignment.
function exhaustive(err: WriteError): string {
  switch (err.code) {
    case 'CONNECTION_ERROR':
      return 'connection';
    case 'QUERY_ERROR':
      return 'query';
    case 'CONSTRAINT_ERROR':
      return 'constraint';
    case 'JSONB_VALIDATION_ERROR':
      return 'jsonb';
    default: {
      const _never: never = err;
      return _never;
    }
  }
}

// Locks the DbJsonbValidationError shape so later refactors don't quietly
// drop a field.
type _ShapeCheck = {
  readonly code: 'JSONB_VALIDATION_ERROR';
  readonly message: string;
  readonly table: string;
  readonly column: string;
  readonly value: unknown;
  readonly cause?: unknown;
};
type _ShapeEquiv = DbJsonbValidationError extends _ShapeCheck
  ? _ShapeCheck extends DbJsonbValidationError
    ? true
    : false
  : false;
const _shapeOk: _ShapeEquiv = true;

// Reference the helpers so TypeScript doesn't strip them.
export { exhaustive, _assignable, _shapeOk };
