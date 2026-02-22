import { VertzException } from './vertz-exception';

export class BadRequestException extends VertzException {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'BadRequest', details);
  }
}

export class UnauthorizedException extends VertzException {
  constructor(message: string, details?: unknown) {
    super(message, 401, 'Unauthorized', details);
  }
}

export class ForbiddenException extends VertzException {
  constructor(message: string, details?: unknown) {
    super(message, 403, 'Forbidden', details);
  }
}

export class NotFoundException extends VertzException {
  constructor(message: string, details?: unknown) {
    super(message, 404, 'NotFound', details);
  }
}

export class ConflictException extends VertzException {
  constructor(message: string, details?: unknown) {
    super(message, 409, 'Conflict', details);
  }
}

export class ValidationException extends VertzException {
  public readonly errors: ReadonlyArray<{ path: string; message: string }>;

  constructor(errors: Array<{ path: string; message: string }>) {
    super('Validation failed', 422, 'ValidationError', undefined);
    this.errors = errors;
  }

  override toJSON(): {
    error: {
      code: string;
      message: string;
      details?: ReadonlyArray<{ path: string; message: string }>;
    };
  } {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.errors,
      },
    };
  }
}

export class InternalServerErrorException extends VertzException {
  constructor(message: string, details?: unknown) {
    super(message, 500, 'InternalError', details);
  }
}

export class ServiceUnavailableException extends VertzException {
  constructor(message: string, details?: unknown) {
    super(message, 503, 'ServiceUnavailable', details);
  }
}
