import type { Schema } from '@vertz/schema';

export interface ModuleDef<
  TImports extends Record<string, unknown> = Record<string, unknown>,
  TOptions extends Record<string, unknown> = Record<string, unknown>,
> {
  name: string;
  imports?: TImports;
  options?: Schema<TOptions>;
}

export interface ServiceDef<TDeps = unknown, TState = unknown, TMethods = unknown> {
  inject?: Record<string, unknown>;
  onInit?: (deps: TDeps) => Promise<TState> | TState;
  methods: (deps: TDeps, state: TState) => TMethods;
  onDestroy?: (deps: TDeps, state: TState) => Promise<void> | void;
}

export interface RouterDef {
  prefix: string;
  inject?: Record<string, unknown>;
}

export interface Module<TDef extends ModuleDef = ModuleDef> {
  definition: TDef;
  services: ServiceDef[];
  routers: RouterDef[];
  exports: ServiceDef[];
}
