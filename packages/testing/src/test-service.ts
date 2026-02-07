import type { NamedServiceDef } from '@vertz/core';

import type { DeepPartial } from './types';

export interface TestServiceBuilder<TMethods> extends PromiseLike<TMethods> {
  mock<TDep, TState, TMock>(
    service: NamedServiceDef<TDep, TState, TMock>,
    impl: DeepPartial<TMock>,
  ): TestServiceBuilder<TMethods>;
}

export function createTestService<TDeps, TState, TMethods>(
  serviceDef: NamedServiceDef<TDeps, TState, TMethods>,
): TestServiceBuilder<TMethods> {
  const serviceMocks = new Map<NamedServiceDef, unknown>();

  async function resolve(): Promise<TMethods> {
    const deps: Record<string, unknown> = {};

    if (serviceDef.inject) {
      for (const [name, depDef] of Object.entries(serviceDef.inject)) {
        const mock = serviceMocks.get(depDef as NamedServiceDef);
        if (mock === undefined) {
          throw new Error(
            `Missing mock for injected dependency "${name}". Call .mock(${name}Service, impl) before awaiting.`,
          );
        }
        deps[name] = mock;
      }
    }

    const state = serviceDef.onInit ? await serviceDef.onInit(deps as TDeps) : undefined;
    return serviceDef.methods(deps as TDeps, state as TState);
  }

  const builder: TestServiceBuilder<TMethods> = {
    mock(service, impl) {
      serviceMocks.set(service, impl);
      return builder;
    },
    // biome-ignore lint/suspicious/noThenProperty: intentional PromiseLike for await support
    then(onfulfilled, onrejected) {
      return resolve().then(onfulfilled, onrejected);
    },
  };

  return builder;
}
