import { VertzException } from './vertz-exception';

export class BadRequestException extends VertzException {
  constructor(message: string, details?: unknown) {
    super(message, 400, undefined, details);
  }
}

export class UnauthorizedException extends VertzException {
  constructor(message: string, details?: unknown) {
    super(message, 401, undefined, details);
  }
}

export class ForbiddenException extends VertzException {
  constructor(message: string, details?: unknown) {
    super(message, 403, undefined, details);
  }
}

export class NotFoundException extends VertzException {
  constructor(message: string, details?: unknown) {
    super(message, 404, undefined, details);
  }
}

export class ConflictException extends VertzException {
  constructor(message: string, details?: unknown) {
    super(message, 409, undefined, details);
  }
}

export class ValidationException extends VertzException {
  public readonly errors: ReadonlyArray<{ path: string; message: string }>;

  constructor(errors: Array<{ path: string; message: string }>) {
    super('Validation failed', 422, undefined, undefined);
    this.errors = errors;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      errors: this.errors,
    };
  }
}

export class InternalServerErrorException extends VertzException {
  constructor(message: string, details?: unknown) {
    super(message, 500, undefined, details);
  }
}

export class ServiceUnavailableException extends VertzException {
  constructor(message: string, details?: unknown) {
    super(message, 503, undefined, details);
  }
}
