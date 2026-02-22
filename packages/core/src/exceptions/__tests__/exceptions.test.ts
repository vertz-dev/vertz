import { describe, expect, it } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  ValidationException,
} from '../http-exceptions';
import { VertzException } from '../vertz-exception';

describe('VertzException', () => {
  it('creates exception with message and default status 500', () => {
    const error = new VertzException('something went wrong');
    expect(error.message).toBe('something went wrong');
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('VertzException');
    expect(error.details).toBeUndefined();
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(VertzException);
    expect(error.name).toBe('VertzException');
  });

  it('accepts custom statusCode, code, and details', () => {
    const error = new VertzException('bad input', 400, 'BAD_INPUT', { field: 'email' });
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('BAD_INPUT');
    expect(error.details).toEqual({ field: 'email' });
  });

  it('serializes to JSON with toJSON()', () => {
    const error = new VertzException('not found', 404, 'NOT_FOUND');
    expect(error.toJSON()).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'not found',
      },
    });
  });

  it('includes details in JSON when present', () => {
    const error = new VertzException('bad', 400, 'BAD', { fields: ['email'] });
    const json = error.toJSON();
    expect(json.error.details).toEqual({ fields: ['email'] });
  });

  it('excludes details from JSON when undefined', () => {
    const error = new VertzException('fail');
    const json = error.toJSON();
    expect('details' in json.error).toBe(false);
  });
});

describe('HTTP Exceptions', () => {
  it.each([
    { Cls: BadRequestException, status: 400, name: 'BadRequestException', code: 'BadRequest' },
    {
      Cls: UnauthorizedException,
      status: 401,
      name: 'UnauthorizedException',
      code: 'Unauthorized',
    },
    { Cls: ForbiddenException, status: 403, name: 'ForbiddenException', code: 'Forbidden' },
    { Cls: NotFoundException, status: 404, name: 'NotFoundException', code: 'NotFound' },
    { Cls: ConflictException, status: 409, name: 'ConflictException', code: 'Conflict' },
    {
      Cls: InternalServerErrorException,
      status: 500,
      name: 'InternalServerErrorException',
      code: 'InternalError',
    },
    {
      Cls: ServiceUnavailableException,
      status: 503,
      name: 'ServiceUnavailableException',
      code: 'ServiceUnavailable',
    },
  ])('$name has status $status and extends VertzException', ({ Cls, status, name, code }) => {
    const error = new Cls('test message');
    expect(error.statusCode).toBe(status);
    expect(error.name).toBe(name);
    expect(error.code).toBe(code);
    expect(error.message).toBe('test message');
    expect(error).toBeInstanceOf(VertzException);
    expect(error).toBeInstanceOf(Error);
  });

  it('HTTP exception passes details and serializes via toJSON', () => {
    const error = new BadRequestException('invalid email', { field: 'email' });
    expect(error.details).toEqual({ field: 'email' });
    const json = error.toJSON();
    expect(json).toEqual({
      error: {
        code: 'BadRequest',
        message: 'invalid email',
        details: { field: 'email' },
      },
    });
  });
});

describe('ValidationException', () => {
  it('has status 422 and carries errors array', () => {
    const errors = [
      { path: 'email', message: 'Invalid email' },
      { path: 'age', message: 'Must be positive' },
    ];
    const error = new ValidationException(errors);
    expect(error.statusCode).toBe(422);
    expect(error.name).toBe('ValidationException');
    expect(error.message).toBe('Validation failed');
    expect(error.errors).toEqual(errors);
    expect(error).toBeInstanceOf(VertzException);
  });

  it('includes errors as details in toJSON output', () => {
    const errors = [{ path: 'name', message: 'Required' }];
    const error = new ValidationException(errors);
    const json = error.toJSON();
    expect(json.error.details).toEqual(errors);
    expect(json.error.code).toBe('ValidationError');
  });
});
