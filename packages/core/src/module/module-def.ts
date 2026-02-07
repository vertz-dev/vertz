import type { ModuleDef, RouterDef, ServiceDef } from '../types/module';
import { deepFreeze } from '../immutability';
import { createRouterDef, type NamedRouterDef } from './router-def';
import { createServiceDef, type NamedServiceDef } from './service';

export interface NamedModuleDef<
  TImports extends Record<string, unknown> = Record<string, unknown>,
  TOptions extends Record<string, unknown> = Record<string, unknown>,
> extends ModuleDef<TImports, TOptions> {
  service: <TDeps, TState, TMethods>(
    config: ServiceDef<TDeps, TState, TMethods>,
  ) => NamedServiceDef<TDeps, TState, TMethods>;
  router: (config: RouterDef) => NamedRouterDef;
}

export function createModuleDef<
  TImports extends Record<string, unknown> = Record<string, unknown>,
  TOptions extends Record<string, unknown> = Record<string, unknown>,
>(config: ModuleDef<TImports, TOptions>): NamedModuleDef<TImports, TOptions> {
  const def: NamedModuleDef<TImports, TOptions> = {
    ...config,
    service: (serviceConfig) => createServiceDef(config.name, serviceConfig),
    router: (routerConfig) => createRouterDef(config.name, routerConfig),
  };

  return deepFreeze(def);
}
