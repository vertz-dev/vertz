import type { Schema } from '@vertz/schema';
export interface ModuleDef<
  TImports extends Record<string, unknown> = Record<string, unknown>,
  TOptions extends Record<string, unknown> = Record<string, unknown>,
> {
  name: string;
  imports?: TImports;
  options?: Schema<TOptions>;
}
export interface ServiceDef<
  TDeps = unknown,
  TState = unknown,
  TMethods = unknown,
  TOptions extends Record<string, unknown> = Record<string, unknown>,
  TEnv extends Record<string, unknown> = Record<string, unknown>,
> {
  inject?: Record<string, unknown>;
  options?: Schema<TOptions>;
  env?: Schema<TEnv>;
  onInit?: (deps: TDeps, opts: TOptions, env: TEnv) => Promise<TState> | TState;
  methods: (deps: TDeps, state: TState, opts: TOptions, env: TEnv) => TMethods;
  onDestroy?: (deps: TDeps, state: TState) => Promise<void> | void;
}
export interface RouterDef<TInject extends Record<string, unknown> = Record<string, unknown>> {
  prefix: string;
  inject?: TInject;
}
export interface Module<TDef extends ModuleDef = ModuleDef> {
  definition: TDef;
  services: ServiceDef[];
  routers: RouterDef[];
  exports: ServiceDef[];
}
//# sourceMappingURL=module.d.ts.map
