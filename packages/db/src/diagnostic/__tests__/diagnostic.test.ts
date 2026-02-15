import { describe, expect, it } from 'vitest';
import {
  CheckConstraintError,
  ForeignKeyError,
  NotFoundError,
  NotNullError,
  UniqueConstraintError,
} from '../../errors/db-error';
import { diagnoseError, explainError, formatDiagnostic } from '../index';

// ---------------------------------------------------------------------------
// diagnoseError — pattern matching
// ---------------------------------------------------------------------------

describe('diagnoseError', () => {
  it('diagnoses InvalidColumn error messages', () => {
    const result = diagnoseError("ERROR: Column 'bogus' does not exist on table 'users'.");
    expect(result).not.toBeNull();
    expect(result?.code).toBe('INVALID_COLUMN');
    expect(result?.explanation).toContain('column name');
    expect(result?.suggestion).toContain('camelCase');
  });

  it('diagnoses InvalidRelation error messages', () => {
    const result = diagnoseError(
      "ERROR: Relation 'bogus' does not exist. Available relations: author.",
    );
    expect(result).not.toBeNull();
    expect(result?.code).toBe('INVALID_RELATION');
    expect(result?.explanation).toContain('relation name');
  });

  it('diagnoses InvalidFilterType error messages', () => {
    const result = diagnoseError("ERROR: Filter on 'age' expects type 'number', got 'string'.");
    expect(result).not.toBeNull();
    expect(result?.code).toBe('INVALID_FILTER_TYPE');
    expect(result?.explanation).toContain('column type');
  });

  it('diagnoses MixedSelect error messages', () => {
    const result = diagnoseError(
      "ERROR: Cannot combine 'not' with explicit field selection in select.",
    );
    expect(result).not.toBeNull();
    expect(result?.code).toBe('MIXED_SELECT');
    expect(result?.suggestion).toContain('not both');
  });

  it('diagnoses UniqueConstraintError messages', () => {
    const err = new UniqueConstraintError({
      table: 'users',
      column: 'email',
      value: 'alice@acme.com',
    });
    const result = diagnoseError(err.message);
    expect(result).not.toBeNull();
    expect(result?.code).toBe('UNIQUE_VIOLATION');
    expect(result?.suggestion).toContain('upsert');
  });

  it('diagnoses ForeignKeyError messages', () => {
    const err = new ForeignKeyError({
      table: 'posts',
      constraint: 'posts_author_id_fkey',
    });
    const result = diagnoseError(err.message);
    expect(result).not.toBeNull();
    expect(result?.code).toBe('FK_VIOLATION');
    expect(result?.suggestion).toContain('referenced row');
  });

  it('diagnoses NotNullError messages', () => {
    const err = new NotNullError({
      table: 'users',
      column: 'email',
    });
    const result = diagnoseError(err.message);
    expect(result).not.toBeNull();
    expect(result?.code).toBe('NOT_NULL_VIOLATION');
    expect(result?.suggestion).toContain('nullable');
  });

  it('diagnoses NotFoundError messages', () => {
    const err = new NotFoundError('users');
    const result = diagnoseError(err.message);
    expect(result).not.toBeNull();
    expect(result?.code).toBe('NOT_FOUND');
    expect(result?.suggestion).toContain('get');
  });

  it('diagnoses unregistered table messages', () => {
    const result = diagnoseError('Table "bogus" is not registered in the database.');
    expect(result).not.toBeNull();
    expect(result?.code).toBe('UNREGISTERED_TABLE');
    expect(result?.suggestion).toContain('createDb');
  });

  it('returns null for unknown error messages', () => {
    const result = diagnoseError('Some completely unknown error.');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// formatDiagnostic
// ---------------------------------------------------------------------------

describe('formatDiagnostic', () => {
  it('formats a diagnostic result as a multi-line string', () => {
    const diag = {
      code: 'UNIQUE_VIOLATION',
      explanation: 'A unique constraint was violated.',
      suggestion: 'Use upsert or a different value.',
    };

    const formatted = formatDiagnostic(diag);
    expect(formatted).toContain('[UNIQUE_VIOLATION]');
    expect(formatted).toContain('Explanation:');
    expect(formatted).toContain('Suggestion:');
  });
});

// ---------------------------------------------------------------------------
// explainError
// ---------------------------------------------------------------------------

describe('explainError', () => {
  it('returns formatted diagnostic for known errors', () => {
    const err = new UniqueConstraintError({
      table: 'users',
      column: 'email',
    });
    const explained = explainError(err.message);
    expect(explained).toContain('[UNIQUE_VIOLATION]');
    expect(explained).toContain('Explanation:');
  });

  it('returns fallback message for unknown errors', () => {
    const explained = explainError('totally unknown');
    expect(explained).toContain('[UNKNOWN]');
    expect(explained).toContain('totally unknown');
  });
});

// ---------------------------------------------------------------------------
// Runtime error quality — DbError subclasses include table/column context
// ---------------------------------------------------------------------------

describe('Runtime error quality', () => {
  it('UniqueConstraintError includes table and column in message', () => {
    const err = new UniqueConstraintError({
      table: 'users',
      column: 'email',
      value: 'alice@acme.com',
    });
    expect(err.message).toContain('users');
    expect(err.message).toContain('email');
    expect(err.message).toContain('alice@acme.com');
    expect(err.table).toBe('users');
    expect(err.column).toBe('email');
    expect(err.value).toBe('alice@acme.com');
  });

  it('ForeignKeyError includes table and constraint in message', () => {
    const err = new ForeignKeyError({
      table: 'posts',
      constraint: 'posts_author_id_fkey',
      detail: 'Key (author_id)=(00000000) is not present in table "users".',
    });
    expect(err.message).toContain('posts');
    expect(err.message).toContain('posts_author_id_fkey');
    expect(err.table).toBe('posts');
    expect(err.constraint).toBe('posts_author_id_fkey');
    expect(err.detail).toContain('is not present');
  });

  it('NotNullError includes table and column in message', () => {
    const err = new NotNullError({
      table: 'users',
      column: 'name',
    });
    expect(err.message).toContain('users');
    expect(err.message).toContain('name');
    expect(err.table).toBe('users');
    expect(err.column).toBe('name');
  });

  it('CheckConstraintError includes table and constraint in message', () => {
    const err = new CheckConstraintError({
      table: 'users',
      constraint: 'users_age_check',
    });
    expect(err.message).toContain('users');
    expect(err.message).toContain('users_age_check');
    expect(err.table).toBe('users');
    expect(err.constraint).toBe('users_age_check');
  });

  it('NotFoundError includes table name in message', () => {
    const err = new NotFoundError('posts');
    expect(err.message).toContain('posts');
    expect(err.table).toBe('posts');
  });

  it('all errors serialize to JSON with table context', () => {
    const unique = new UniqueConstraintError({
      table: 'users',
      column: 'email',
    });
    const json = unique.toJSON();
    expect(json.table).toBe('users');
    expect(json.column).toBe('email');
    expect(json.code).toBe('UNIQUE_VIOLATION');
    expect(json.error).toBe('UniqueConstraintError');

    const fk = new ForeignKeyError({
      table: 'posts',
      constraint: 'posts_author_id_fkey',
    });
    const fkJson = fk.toJSON();
    expect(fkJson.table).toBe('posts');
    expect(fkJson.code).toBe('FOREIGN_KEY_VIOLATION');

    const notFound = new NotFoundError('users');
    const nfJson = notFound.toJSON();
    expect(nfJson.table).toBe('users');
    expect(nfJson.code).toBe('NOT_FOUND');
  });
});
