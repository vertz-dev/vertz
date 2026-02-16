import type { NamedServiceDef } from '@vertz/core';
import type { DeepPartial } from './types';
export interface TestServiceBuilder<
  TDeps,
  TState,
  TMethods,
  TOptions extends Record<string, unknown> = Record<string, unknown>,
  TEnv extends Record<string, unknown> = Record<string, unknown>,
> extends PromiseLike<TMethods> {
  mock<TDep, TDepState, TMock>(
    service: NamedServiceDef<TDep, TDepState, TMock>,
    impl: DeepPartial<TMock>,
  ): TestServiceBuilder<TDeps, TState, TMethods, TOptions, TEnv>;
  options(opts: Partial<TOptions>): TestServiceBuilder<TDeps, TState, TMethods, TOptions, TEnv>;
  env(env: Partial<TEnv>): TestServiceBuilder<TDeps, TState, TMethods, TOptions, TEnv>;
}
export declare function createTestService<
  TDeps,
  TState,
  TMethods,
  TOptions extends Record<string, unknown> = Record<string, unknown>,
  TEnv extends Record<string, unknown> = Record<string, unknown>,
>(
  serviceDef: NamedServiceDef<TDeps, TState, TMethods, TOptions, TEnv>,
): TestServiceBuilder<TDeps, TState, TMethods, TOptions, TEnv>;
//# sourceMappingURL=test-service.d.ts.map
