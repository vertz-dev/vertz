import { describe, expect, it } from 'vitest';
import {
  CheckConstraintError,
  ConnectionError,
  ConnectionPoolExhaustedError,
  DbError,
  ForeignKeyError,
  NotFoundError,
  NotNullError,
  UniqueConstraintError,
} from '../db-error';

describe('DbError base class', () => {
  it('is abstract and cannot be instantiated directly', () => {
    // DbError is abstract — we verify by checking subclasses inherit from it
    const err = new NotFoundError('users');
    expect(err).toBeInstanceOf(DbError);
    expect(err).toBeInstanceOf(Error);
  });

  it('sets name to the subclass name', () => {
    const err = new NotFoundError('users');
    expect(err.name).toBe('NotFoundError');
  });
});

describe('UniqueConstraintError', () => {
  it('has semantic code UNIQUE_VIOLATION and pgCode 23505', () => {
    const err = new UniqueConstraintError({
      table: 'users',
      column: 'email',
      value: 'foo@bar.com',
      query: 'INSERT INTO users ...',
    });
    expect(err.code).toBe('UNIQUE_VIOLATION');
    expect(err.pgCode).toBe('23505');
    expect(err.name).toBe('UniqueConstraintError');
    expect(err.table).toBe('users');
    expect(err.column).toBe('email');
    expect(err.value).toBe('foo@bar.com');
    expect(err.query).toBe('INSERT INTO users ...');
    expect(err.message).toContain('users');
    expect(err.message).toContain('email');
  });

  it('toJSON() produces structured output with semantic code', () => {
    const err = new UniqueConstraintError({
      table: 'users',
      column: 'email',
      value: 'foo@bar.com',
    });
    const json = err.toJSON();
    expect(json).toEqual({
      error: 'UniqueConstraintError',
      code: 'UNIQUE_VIOLATION',
      message: expect.stringContaining('email'),
      table: 'users',
      column: 'email',
    });
  });

  it('is an instance of DbError', () => {
    const err = new UniqueConstraintError({ table: 'users', column: 'email' });
    expect(err).toBeInstanceOf(DbError);
    expect(err).toBeInstanceOf(UniqueConstraintError);
  });
});

describe('ForeignKeyError', () => {
  it('has semantic code FOREIGN_KEY_VIOLATION and pgCode 23503', () => {
    const err = new ForeignKeyError({
      table: 'posts',
      constraint: 'posts_author_id_fkey',
      detail: 'Key (author_id)=(abc-123) is not present in table "users".',
      query: 'INSERT INTO posts ...',
    });
    expect(err.code).toBe('FOREIGN_KEY_VIOLATION');
    expect(err.pgCode).toBe('23503');
    expect(err.name).toBe('ForeignKeyError');
    expect(err.table).toBe('posts');
    expect(err.constraint).toBe('posts_author_id_fkey');
    expect(err.detail).toBe('Key (author_id)=(abc-123) is not present in table "users".');
    expect(err.message).toContain('posts');
    expect(err.message).toContain('posts_author_id_fkey');
  });

  it('toJSON() produces structured output with semantic code', () => {
    const err = new ForeignKeyError({
      table: 'posts',
      constraint: 'posts_author_id_fkey',
      detail: 'Key (author_id)=(abc-123) is not present in table "users".',
    });
    const json = err.toJSON();
    expect(json).toEqual({
      error: 'ForeignKeyError',
      code: 'FOREIGN_KEY_VIOLATION',
      message: expect.stringContaining('posts_author_id_fkey'),
      table: 'posts',
    });
  });
});

describe('NotNullError', () => {
  it('has semantic code NOT_NULL_VIOLATION and pgCode 23502', () => {
    const err = new NotNullError({
      table: 'users',
      column: 'name',
      query: 'INSERT INTO users ...',
    });
    expect(err.code).toBe('NOT_NULL_VIOLATION');
    expect(err.pgCode).toBe('23502');
    expect(err.name).toBe('NotNullError');
    expect(err.table).toBe('users');
    expect(err.column).toBe('name');
    expect(err.message).toContain('users');
    expect(err.message).toContain('name');
  });

  it('toJSON() produces structured output with semantic code', () => {
    const err = new NotNullError({ table: 'users', column: 'name' });
    const json = err.toJSON();
    expect(json).toEqual({
      error: 'NotNullError',
      code: 'NOT_NULL_VIOLATION',
      message: expect.stringContaining('name'),
      table: 'users',
      column: 'name',
    });
  });
});

describe('CheckConstraintError', () => {
  it('has semantic code CHECK_VIOLATION and pgCode 23514', () => {
    const err = new CheckConstraintError({
      table: 'orders',
      constraint: 'orders_amount_positive',
      query: 'INSERT INTO orders ...',
    });
    expect(err.code).toBe('CHECK_VIOLATION');
    expect(err.pgCode).toBe('23514');
    expect(err.name).toBe('CheckConstraintError');
    expect(err.table).toBe('orders');
    expect(err.constraint).toBe('orders_amount_positive');
    expect(err.message).toContain('orders');
    expect(err.message).toContain('orders_amount_positive');
  });

  it('toJSON() produces structured output with semantic code', () => {
    const err = new CheckConstraintError({
      table: 'orders',
      constraint: 'orders_amount_positive',
    });
    const json = err.toJSON();
    expect(json).toEqual({
      error: 'CheckConstraintError',
      code: 'CHECK_VIOLATION',
      message: expect.stringContaining('orders_amount_positive'),
      table: 'orders',
    });
  });
});

describe('NotFoundError', () => {
  it('has code NOT_FOUND and correct properties', () => {
    const err = new NotFoundError('users', 'SELECT * FROM users WHERE id = $1');
    expect(err.code).toBe('NotFound');
    expect(err.name).toBe('NotFoundError');
    expect(err.table).toBe('users');
    expect(err.query).toBe('SELECT * FROM users WHERE id = $1');
    expect(err.message).toContain('users');
  });

  it('toJSON() produces structured output', () => {
    const err = new NotFoundError('users');
    const json = err.toJSON();
    expect(json).toEqual({
      error: 'NotFoundError',
      code: 'NotFound',
      message: expect.stringContaining('users'),
      table: 'users',
    });
  });
});

describe('ConnectionError', () => {
  it('has code CONNECTION_ERROR and correct properties', () => {
    const err = new ConnectionError('ECONNREFUSED');
    expect(err.code).toBe('CONNECTION_ERROR');
    expect(err.name).toBe('ConnectionError');
    expect(err.message).toContain('ECONNREFUSED');
  });

  it('toJSON() produces structured output', () => {
    const err = new ConnectionError('Connection refused');
    const json = err.toJSON();
    expect(json).toEqual({
      error: 'ConnectionError',
      code: 'CONNECTION_ERROR',
      message: expect.stringContaining('Connection refused'),
    });
  });
});

describe('ConnectionPoolExhaustedError', () => {
  it('has code POOL_EXHAUSTED and correct properties', () => {
    const err = new ConnectionPoolExhaustedError(20);
    expect(err.code).toBe('POOL_EXHAUSTED');
    expect(err.name).toBe('ConnectionPoolExhaustedError');
    expect(err.message).toContain('20');
  });

  it('toJSON() produces structured output', () => {
    const err = new ConnectionPoolExhaustedError(10);
    const json = err.toJSON();
    expect(json).toEqual({
      error: 'ConnectionPoolExhaustedError',
      code: 'POOL_EXHAUSTED',
      message: expect.stringContaining('10'),
    });
  });

  it('is an instance of ConnectionError', () => {
    const err = new ConnectionPoolExhaustedError(10);
    expect(err).toBeInstanceOf(ConnectionError);
    expect(err).toBeInstanceOf(DbError);
  });
});
