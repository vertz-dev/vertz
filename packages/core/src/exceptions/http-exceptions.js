import { VertzException } from './vertz-exception';
export class BadRequestException extends VertzException {
  constructor(message, details) {
    super(message, 400, undefined, details);
  }
}
export class UnauthorizedException extends VertzException {
  constructor(message, details) {
    super(message, 401, undefined, details);
  }
}
export class ForbiddenException extends VertzException {
  constructor(message, details) {
    super(message, 403, undefined, details);
  }
}
export class NotFoundException extends VertzException {
  constructor(message, details) {
    super(message, 404, undefined, details);
  }
}
export class ConflictException extends VertzException {
  constructor(message, details) {
    super(message, 409, undefined, details);
  }
}
export class ValidationException extends VertzException {
  errors;
  constructor(errors) {
    super('Validation failed', 422, undefined, undefined);
    this.errors = errors;
  }
  toJSON() {
    return {
      ...super.toJSON(),
      errors: this.errors,
    };
  }
}
export class InternalServerErrorException extends VertzException {
  constructor(message, details) {
    super(message, 500, undefined, details);
  }
}
export class ServiceUnavailableException extends VertzException {
  constructor(message, details) {
    super(message, 503, undefined, details);
  }
}
//# sourceMappingURL=http-exceptions.js.map
