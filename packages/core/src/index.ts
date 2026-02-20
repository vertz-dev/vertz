// @vertz/core — public API

export type { AppBuilder } from './app';
export type { RouteInfo } from './app/app-builder';

import type { AppBuilder } from './app';
import { createApp as _createApp } from './app';
// App / Server
import type { AppConfig } from './types';

/**
 * Creates an HTTP server. Preferred entry point for building Vertz services.
 * @since 0.2.0
 */
export const createServer: (config: AppConfig) => AppBuilder = _createApp;

/**
 * @deprecated Use `createServer` instead. `createApp` will be removed in v0.3.0.
 */
export const createApp: (config: AppConfig) => AppBuilder = (...args) => {
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
export type { AccumulateProvides, NamedMiddlewareDef } from './middleware';
// Middleware
export { createMiddleware } from './middleware';
export type {
  ExtractMethods,
  NamedModule,
  NamedModuleDef,
  NamedRouterDef,
  NamedServiceDef,
  ResolveInjectMap,
} from './module';
// Module
export { createModule, createModuleDef } from './module';
export type { Err, Ok, Result } from './result';
// Result type for errors-as-values pattern
export { err, isErr, isOk, ok } from './result';
// Types
export type {
  AppConfig,
  EntityRouteEntry,
  BootInstruction,
  BootSequence,
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
  Module,
  ModuleBootInstruction,
  ModuleDef,
  RawRequest,
  RouterDef,
  ServerAdapter,
  ServerHandle,
  ServiceBootInstruction,
  ServiceDef,
  ServiceFactory,
} from './types';
// Namespace
export { vertz } from './vertz';
