import type { ServiceDef } from '../types/module';
import { deepFreeze } from '../immutability';

export interface NamedServiceDef<TDeps = unknown, TState = unknown, TMethods = unknown>
  extends ServiceDef<TDeps, TState, TMethods> {
  moduleName: string;
}

export function createServiceDef<TDeps = unknown, TState = unknown, TMethods = unknown>(
  moduleName: string,
  config: ServiceDef<TDeps, TState, TMethods>,
): NamedServiceDef<TDeps, TState, TMethods> {
  return deepFreeze({
    ...config,
    moduleName,
  });
}
