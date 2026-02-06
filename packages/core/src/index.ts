// @vertz/core — public API

// Namespace
export { vertz } from './vertz';

// Types
export type {
  DeepReadonly,
  RawRequest,
  Deps,
  Ctx,
  Infer,
  InferSchema,
  HttpMethod,
  HttpStatusCode,
  ModuleDef,
  Module,
  ServiceDef,
  RouterDef,
  MiddlewareDef,
  AppConfig,
  CorsConfig,
  EnvConfig,
  ServerAdapter,
  ServerHandle,
  ListenOptions,
  BootSequence,
  BootInstruction,
  ServiceBootInstruction,
  ModuleBootInstruction,
  ServiceFactory,
} from './types';

// Exceptions
export {
  VertzException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  ValidationException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from './exceptions';

// Immutability
export { makeImmutable, deepFreeze, createImmutableProxy } from './immutability';

// Environment
export { createEnv } from './env';

// Middleware
export { createMiddleware } from './middleware';
export type { NamedMiddlewareDef } from './middleware';

// Module
export { createModuleDef, createModule } from './module';
export type { NamedModuleDef, NamedServiceDef, NamedRouterDef, NamedModule } from './module';

// App
export { createApp } from './app';
export type { AppBuilder } from './app';
