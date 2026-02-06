export interface ServiceFactory<TDeps = any, TState = any, TMethods = any> {
  inject?: Record<string, unknown>;
  onInit?: (deps: TDeps) => Promise<TState> | TState;
  methods: (deps: TDeps, state: TState) => TMethods;
  onDestroy?: (deps: TDeps, state: TState) => Promise<void> | void;
}

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
