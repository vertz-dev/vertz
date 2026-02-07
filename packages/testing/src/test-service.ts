import type { NamedServiceDef } from '@vertz/core';

import type { DeepPartial } from './test-app';

export interface TestServiceBuilder<TMethods> {
  mock<TDeps, TState, TM>(service: NamedServiceDef<TDeps, TState, TM>, impl: DeepPartial<TM>): TestServiceBuilder<TMethods>;
  build(): Promise<TMethods>;
}

export function createTestService<TDeps, TState, TMethods>(
  serviceDef: NamedServiceDef<TDeps, TState, TMethods>,
): TestServiceBuilder<TMethods> {
  const serviceMocks = new Map<NamedServiceDef, unknown>();

  const builder: TestServiceBuilder<TMethods> = {
    mock(service, impl) {
      serviceMocks.set(service, impl);
      return builder;
    },
    async build(): Promise<TMethods> {
      const deps: Record<string, unknown> = {};

      if (serviceDef.inject) {
        for (const [name, depDef] of Object.entries(serviceDef.inject)) {
          const mock = serviceMocks.get(depDef as NamedServiceDef);
          if (mock !== undefined) {
            deps[name] = mock;
          }
        }
      }

      const state = serviceDef.onInit ? await serviceDef.onInit(deps as TDeps) : undefined;
      return serviceDef.methods(deps as TDeps, state as TState);
    },
  };

  return builder;
}
