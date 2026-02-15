import type { ServiceDef } from './module';

export type ServiceFactory<
  TDeps = unknown,
  TState = unknown,
  TMethods = unknown,
  TOptions extends Record<string, unknown> = Record<string, unknown>,
  TEnv extends Record<string, unknown> = Record<string, unknown>,
> = ServiceDef<TDeps, TState, TMethods, TOptions, TEnv>;

export interface ServiceBootInstruction {
  type: 'service';
  id: string;
  deps: string[];
  factory: ServiceFactory;
  options?: Record<string, unknown>;
  env?: Record<string, unknown>;
}

export interface ModuleBootInstruction {
  type: 'module';
  id: string;
  services: string[];
  options?: Record<string, unknown>;
}

export type BootInstruction = ServiceBootInstruction | ModuleBootInstruction;

export interface BootSequence {
  instructions: BootInstruction[];
  shutdownOrder: string[];
}
