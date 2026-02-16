// @vertz/core — public API
import { createApp as _createApp } from './app';
/**
 * Creates an HTTP server. Preferred entry point for building Vertz services.
 * @since 0.2.0
 */
export const createServer = _createApp;
/**
 * @deprecated Use `createServer` instead. `createApp` will be removed in v0.3.0.
 */
export const createApp = (...args) => {
  console.warn('⚠️ createApp() is deprecated. Use createServer() from @vertz/server instead.');
  return _createApp(...args);
};
// Environment
export { createEnv } from './env';
// Exceptions
export {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  ValidationException,
  VertzException,
} from './exceptions';
// Immutability
export { createImmutableProxy, deepFreeze, makeImmutable } from './immutability';
// Middleware
export { createMiddleware } from './middleware';
// Module
export { createModule, createModuleDef } from './module';
// Result type for errors-as-values pattern
export { err, isErr, isOk, ok } from './result';
// Namespace
export { vertz } from './vertz';
//# sourceMappingURL=index.js.map
