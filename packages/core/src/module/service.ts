import type { ServiceDef } from '../types/module';
import { deepFreeze } from '../immutability';

export interface NamedServiceDef<TDeps = any, TState = any, TMethods = any>
  extends ServiceDef<TDeps, TState, TMethods> {
  moduleName: string;
}

export function createServiceDef<TDeps = any, TState = any, TMethods = any>(
  moduleName: string,
  config: ServiceDef<TDeps, TState, TMethods>,
): NamedServiceDef<TDeps, TState, TMethods> {
  return deepFreeze({
    ...config,
    moduleName,
  });
}
