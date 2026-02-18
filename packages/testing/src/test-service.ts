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

export function createTestService<
  TDeps,
  TState,
  TMethods,
  TOptions extends Record<string, unknown> = Record<string, unknown>,
  TEnv extends Record<string, unknown> = Record<string, unknown>,
>(
  serviceDef: NamedServiceDef<TDeps, TState, TMethods, TOptions, TEnv>,
): TestServiceBuilder<TDeps, TState, TMethods, TOptions, TEnv> {
  const serviceMocks = new Map<object, unknown>();
  let providedOptions: Partial<TOptions> = {};
  let providedEnv: Partial<TEnv> = {};

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

    // Parse options with defaults
    let options: TOptions = {} as TOptions;
    if (serviceDef.options) {
      const parsed = serviceDef.options.safeParse(providedOptions);
      if (parsed.success) {
        options = parsed.data as TOptions;
      } else {
        throw new Error(`Invalid options: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
      }
    }

    // Parse env with defaults
    let env: TEnv = {} as TEnv;
    if (serviceDef.env) {
      const parsed = serviceDef.env.safeParse(providedEnv);
      if (parsed.success) {
        env = parsed.data as TEnv;
      } else {
        throw new Error(`Invalid env: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
      }
    }

    const state = serviceDef.onInit
      ? await serviceDef.onInit(deps as TDeps, options, env)
      : undefined;
    return serviceDef.methods(deps as TDeps, state as TState, options, env);
  }

  const builder: TestServiceBuilder<TDeps, TState, TMethods, TOptions, TEnv> = {
    mock(service, impl) {
      serviceMocks.set(service, impl);
      return builder;
    },
    options(opts) {
      providedOptions = opts;
      return builder;
    },
    env(envVars) {
      providedEnv = envVars;
      return builder;
    },
    // biome-ignore lint/suspicious/noThenProperty: intentional PromiseLike for await support
    then(onfulfilled, onrejected) {
      return resolve().then(onfulfilled, onrejected);
    },
  };

  return builder;
}
