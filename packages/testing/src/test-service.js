export function createTestService(serviceDef) {
  const serviceMocks = new Map();
  let providedOptions = {};
  let providedEnv = {};
  async function resolve() {
    const deps = {};
    if (serviceDef.inject) {
      for (const [name, depDef] of Object.entries(serviceDef.inject)) {
        const mock = serviceMocks.get(depDef);
        if (mock === undefined) {
          throw new Error(
            `Missing mock for injected dependency "${name}". Call .mock(${name}Service, impl) before awaiting.`,
          );
        }
        deps[name] = mock;
      }
    }
    // Parse options with defaults
    let options = {};
    if (serviceDef.options) {
      const parsed = serviceDef.options.safeParse(providedOptions);
      if (parsed.success) {
        options = parsed.data;
      } else {
        throw new Error(`Invalid options: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
      }
    }
    // Parse env with defaults
    let env = {};
    if (serviceDef.env) {
      const parsed = serviceDef.env.safeParse(providedEnv);
      if (parsed.success) {
        env = parsed.data;
      } else {
        throw new Error(`Invalid env: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
      }
    }
    const state = serviceDef.onInit ? await serviceDef.onInit(deps, options, env) : undefined;
    return serviceDef.methods(deps, state, options, env);
  }
  const builder = {
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
//# sourceMappingURL=test-service.js.map
