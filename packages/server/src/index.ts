// @vertz/server — the preferred public API for Vertz HTTP servers.
// Re-exports everything from @vertz/core except the deprecated createApp.

// Re-export all types
export type {
  AccumulateProvides,
  AppBuilder,
  AppConfig,
  CorsConfig,
  Ctx,
  DeepReadonly,
  Deps,
  EnvConfig,
  HandlerCtx,
  HttpMethod,
  HttpStatusCode,
  Infer,
  InferSchema,
  ListenOptions,
  MiddlewareDef,
  NamedMiddlewareDef,
  RawRequest,
  ServerAdapter,
  ServerHandle,
} from '@vertz/core';
export {
  // Exceptions
  BadRequestException,
  ConflictException,
  createEnv,
  // Immutability
  createImmutableProxy,
  createMiddleware,
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
export type {
  AccessConfig,
  AccessInstance,
  AuthApi,
  AuthConfig,
  AuthContext,
  AuthInstance,
  AuthUser,
  CookieConfig,
  EmailPasswordConfig,
  Entitlement,
  EntitlementDefinition,
  PasswordRequirements,
  RateLimitConfig,
  RateLimitResult,
  Resource,
  Session,
  SessionConfig,
  SessionPayload,
  SessionStrategy,
  SignInInput,
  SignUpInput,
} from './auth';
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
// Server — wraps core's createServer with entity route generation
export type { ServerConfig } from './create-server';
export { createServer } from './create-server';
// Entity API
export type {
  AccessRule,
  BaseContext,
  CrudHandlers,
  CrudResult,
  EntityActionDef,
  EntityConfig,
  EntityContext,
  EntityDbAdapter,
  EntityDefinition,
  EntityErrorResult,
  EntityOperations,
  EntityRelationsConfig,
  EntityRouteOptions,
  ListOptions,
  ListResult,
  RequestInfo,
} from './entity';
export {
  createCrudHandlers,
  createEntityContext,
  EntityRegistry,
  enforceAccess,
  entity,
  entityErrorHandler,
  generateEntityRoutes,
  stripHiddenFields,
  stripReadOnlyFields,
} from './entity';
// Service API
export type { ServiceActionDef, ServiceConfig, ServiceContext, ServiceDefinition } from './service';
export { service } from './service';
