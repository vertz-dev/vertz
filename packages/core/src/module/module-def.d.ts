import type { ModuleDef, RouterDef, ServiceDef } from '../types/module';
import { type NamedRouterDef } from './router-def';
import { type NamedServiceDef } from './service';
export interface NamedModuleDef<
  TImports extends Record<string, unknown> = Record<string, unknown>,
  TOptions extends Record<string, unknown> = Record<string, unknown>,
  TMiddleware extends Record<string, unknown> = Record<string, unknown>,
> extends ModuleDef<TImports, TOptions> {
  service: <TDeps, TState, TMethods>(
    config: ServiceDef<TDeps, TState, TMethods>,
  ) => NamedServiceDef<TDeps, TState, TMethods>;
  router: <TInject extends Record<string, unknown> = Record<string, unknown>>(
    config: RouterDef<TInject>,
  ) => NamedRouterDef<TMiddleware, TInject>;
}
export declare function createModuleDef<
  TImports extends Record<string, unknown> = Record<string, unknown>,
  TOptions extends Record<string, unknown> = Record<string, unknown>,
  TMiddleware extends Record<string, unknown> = Record<string, unknown>,
>(config: ModuleDef<TImports, TOptions>): NamedModuleDef<TImports, TOptions, TMiddleware>;
//# sourceMappingURL=module-def.d.ts.map
