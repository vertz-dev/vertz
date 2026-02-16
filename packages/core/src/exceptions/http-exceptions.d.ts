import { VertzException } from './vertz-exception';
export declare class BadRequestException extends VertzException {
  constructor(message: string, details?: unknown);
}
export declare class UnauthorizedException extends VertzException {
  constructor(message: string, details?: unknown);
}
export declare class ForbiddenException extends VertzException {
  constructor(message: string, details?: unknown);
}
export declare class NotFoundException extends VertzException {
  constructor(message: string, details?: unknown);
}
export declare class ConflictException extends VertzException {
  constructor(message: string, details?: unknown);
}
export declare class ValidationException extends VertzException {
  readonly errors: ReadonlyArray<{
    path: string;
    message: string;
  }>;
  constructor(
    errors: Array<{
      path: string;
      message: string;
    }>,
  );
  toJSON(): Record<string, unknown>;
}
export declare class InternalServerErrorException extends VertzException {
  constructor(message: string, details?: unknown);
}
export declare class ServiceUnavailableException extends VertzException {
  constructor(message: string, details?: unknown);
}
//# sourceMappingURL=http-exceptions.d.ts.map
