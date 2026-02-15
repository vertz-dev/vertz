import { deepFreeze } from '../immutability';
import type { ServiceDef } from '../types/module';

export interface NamedServiceDef<
  TDeps = unknown,
  TState = unknown,
  TMethods = unknown,
  TOptions extends Record<string, unknown> = Record<string, unknown>,
  TEnv extends Record<string, unknown> = Record<string, unknown>,
> extends ServiceDef<TDeps, TState, TMethods, TOptions, TEnv> {
  moduleName: string;
}

export function createServiceDef<
  TDeps = unknown,
  TState = unknown,
  TMethods = unknown,
  TOptions extends Record<string, unknown> = Record<string, unknown>,
  TEnv extends Record<string, unknown> = Record<string, unknown>,
>(
  moduleName: string,
  config: ServiceDef<TDeps, TState, TMethods, TOptions, TEnv>,
): NamedServiceDef<TDeps, TState, TMethods, TOptions, TEnv> {
  return deepFreeze({
    ...config,
    moduleName,
  });
}
