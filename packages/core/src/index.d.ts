export type { AppBuilder } from './app';
export type { RouteInfo } from './app/app-builder';
import type { AppBuilder } from './app';
import type { AppConfig } from './types';
/**
 * Creates an HTTP server. Preferred entry point for building Vertz services.
 * @since 0.2.0
 */
export declare const createServer: (config: AppConfig) => AppBuilder;
/**
 * @deprecated Use `createServer` instead. `createApp` will be removed in v0.3.0.
 */
export declare const createApp: (config: AppConfig) => AppBuilder;
export { createEnv } from './env';
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
export { createImmutableProxy, deepFreeze, makeImmutable } from './immutability';
export type { AccumulateProvides, NamedMiddlewareDef } from './middleware';
export { createMiddleware } from './middleware';
export type {
  ExtractMethods,
  NamedModule,
  NamedModuleDef,
  NamedRouterDef,
  NamedServiceDef,
  ResolveInjectMap,
} from './module';
export { createModule, createModuleDef } from './module';
export type {
  AppConfig,
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
export { vertz } from './vertz';
export { ok, err, isOk, isErr } from './result';
export type { Ok, Err, Result } from './result';
//# sourceMappingURL=index.d.ts.map
