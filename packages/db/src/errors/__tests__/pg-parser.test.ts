import { describe, expect, it } from 'bun:test';
import {
  CheckConstraintError,
  ConnectionError,
  ForeignKeyError,
  NotNullError,
  UniqueConstraintError,
} from '../db-error';
import { parsePgError } from '../pg-parser';

describe('parsePgError', () => {
  it('maps PG error code 23505 to UniqueConstraintError with semantic code', () => {
    const pgError = {
      code: '23505',
      table: 'users',
      column: 'email',
      detail: 'Key (email)=(foo@bar.com) already exists.',
      message: 'duplicate key value violates unique constraint "users_email_unique"',
    };

    const err = parsePgError(pgError);
    expect(err).toBeInstanceOf(UniqueConstraintError);
    const typed = err as UniqueConstraintError;
    expect(typed.code).toBe('UNIQUE_VIOLATION');
    expect(typed.pgCode).toBe('23505');
    expect(typed.table).toBe('users');
    expect(typed.column).toBe('email');
    expect(typed.value).toBe('foo@bar.com');
  });

  it('extracts column name from detail when column is not provided', () => {
    const pgError = {
      code: '23505',
      table: 'users',
      detail: 'Key (username)=(admin) already exists.',
      message: 'duplicate key value violates unique constraint "users_username_key"',
    };

    const err = parsePgError(pgError) as UniqueConstraintError;
    expect(err.column).toBe('username');
    expect(err.value).toBe('admin');
  });

  it('handles 23505 when detail is not parseable', () => {
    const pgError = {
      code: '23505',
      table: 'users',
      detail: 'some unparseable detail',
      message: 'duplicate key value violates unique constraint "users_email_unique"',
    };

    const err = parsePgError(pgError) as UniqueConstraintError;
    expect(err).toBeInstanceOf(UniqueConstraintError);
    expect(err.column).toBe('unknown');
  });

  it('maps PG error code 23503 to ForeignKeyError with semantic code', () => {
    const pgError = {
      code: '23503',
      table: 'posts',
      constraint: 'posts_author_id_fkey',
      detail: 'Key (author_id)=(abc-123) is not present in table "users".',
      message: 'insert or update on table "posts" violates foreign key constraint',
    };

    const err = parsePgError(pgError);
    expect(err).toBeInstanceOf(ForeignKeyError);
    const typed = err as ForeignKeyError;
    expect(typed.code).toBe('FOREIGN_KEY_VIOLATION');
    expect(typed.pgCode).toBe('23503');
    expect(typed.table).toBe('posts');
    expect(typed.constraint).toBe('posts_author_id_fkey');
    expect(typed.detail).toBe('Key (author_id)=(abc-123) is not present in table "users".');
  });

  it('handles 23503 when constraint is not provided', () => {
    const pgError = {
      code: '23503',
      table: 'posts',
      detail: 'Key (author_id)=(abc-123) is not present in table "users".',
      message: 'insert or update on table "posts" violates foreign key constraint',
    };

    const err = parsePgError(pgError) as ForeignKeyError;
    expect(err).toBeInstanceOf(ForeignKeyError);
    expect(err.constraint).toBe('unknown');
  });

  it('maps PG error code 23502 to NotNullError with semantic code', () => {
    const pgError = {
      code: '23502',
      table: 'users',
      column: 'name',
      message: 'null value in column "name" of relation "users" violates not-null constraint',
    };

    const err = parsePgError(pgError);
    expect(err).toBeInstanceOf(NotNullError);
    const typed = err as NotNullError;
    expect(typed.code).toBe('NOT_NULL_VIOLATION');
    expect(typed.pgCode).toBe('23502');
    expect(typed.table).toBe('users');
    expect(typed.column).toBe('name');
  });

  it('extracts column name from message when column is not provided for 23502', () => {
    const pgError = {
      code: '23502',
      table: 'users',
      message: 'null value in column "email" of relation "users" violates not-null constraint',
    };

    const err = parsePgError(pgError) as NotNullError;
    expect(err.column).toBe('email');
  });

  it('maps PG error code 23514 to CheckConstraintError with semantic code', () => {
    const pgError = {
      code: '23514',
      table: 'orders',
      constraint: 'orders_amount_positive',
      message: 'new row for relation "orders" violates check constraint "orders_amount_positive"',
    };

    const err = parsePgError(pgError);
    expect(err).toBeInstanceOf(CheckConstraintError);
    const typed = err as CheckConstraintError;
    expect(typed.code).toBe('CHECK_VIOLATION');
    expect(typed.pgCode).toBe('23514');
    expect(typed.table).toBe('orders');
    expect(typed.constraint).toBe('orders_amount_positive');
  });

  it('handles 23514 when constraint is not provided', () => {
    const pgError = {
      code: '23514',
      table: 'orders',
      message: 'new row for relation "orders" violates check constraint "orders_amount_positive"',
    };

    const err = parsePgError(pgError) as CheckConstraintError;
    expect(err.constraint).toBe('orders_amount_positive');
  });

  it('extracts constraint from message when not provided for 23514', () => {
    const pgError = {
      code: '23514',
      table: 'orders',
      message: 'new row for relation "orders" violates check constraint "my_check"',
    };

    const err = parsePgError(pgError) as CheckConstraintError;
    expect(err.constraint).toBe('my_check');
  });

  it('passes through query to the parsed error', () => {
    const pgError = {
      code: '23505',
      table: 'users',
      column: 'email',
      detail: 'Key (email)=(foo@bar.com) already exists.',
      message: 'duplicate key',
    };

    const err = parsePgError(pgError, 'INSERT INTO users VALUES ($1)');
    expect(err.query).toBe('INSERT INTO users VALUES ($1)');
  });

  it('returns ConnectionError for connection-related error codes', () => {
    const pgError = {
      code: '08000',
      message: 'connection_exception',
    };

    const err = parsePgError(pgError);
    expect(err).toBeInstanceOf(ConnectionError);
  });

  it('returns ConnectionError for code 08003 (connection_does_not_exist)', () => {
    const pgError = {
      code: '08003',
      message: 'connection does not exist',
    };

    const err = parsePgError(pgError);
    expect(err).toBeInstanceOf(ConnectionError);
  });

  it('returns ConnectionError for code 08006 (connection_failure)', () => {
    const pgError = {
      code: '08006',
      message: 'connection failure',
    };

    const err = parsePgError(pgError);
    expect(err).toBeInstanceOf(ConnectionError);
  });

  it('returns a generic DbError for unknown PG error codes', () => {
    const pgError = {
      code: '42P01',
      table: 'nonexistent',
      message: 'relation "nonexistent" does not exist',
    };

    const err = parsePgError(pgError);
    expect(err.code).toBe('42P01');
    expect(err.message).toContain('relation "nonexistent" does not exist');
  });
});
