// @vertz/core — public API

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
