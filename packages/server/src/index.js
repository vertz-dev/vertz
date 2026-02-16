// @vertz/server — the preferred public API for Vertz HTTP servers.
// Re-exports everything from @vertz/core except the deprecated createApp.
export {
  // Exceptions
  BadRequestException,
  ConflictException,
  createEnv,
  // Immutability
  createImmutableProxy,
  createMiddleware,
  createModule,
  createModuleDef,
  createServer,
  deepFreeze,
  ForbiddenException,
  InternalServerErrorException,
  makeImmutable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  ValidationException,
  VertzException,
  vertz,
} from '@vertz/core';
// Auth Module - Phase 1
export {
  AuthorizationError,
  createAccess,
  createAuth,
  defaultAccess,
  hashPassword,
  validatePassword,
  verifyPassword,
} from './auth';
// Domain API (STUB for TDD red phase)
export { domain } from './domain';
//# sourceMappingURL=index.js.map
