import type { ServiceDef } from './module';

export type ServiceFactory<TDeps = any, TState = any, TMethods = any> = ServiceDef<
  TDeps,
  TState,
  TMethods
>;

export interface ServiceBootInstruction {
  type: 'service';
  id: string;
  deps: string[];
  factory: ServiceFactory;
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
