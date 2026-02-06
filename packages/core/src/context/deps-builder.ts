import { makeImmutable } from '../immutability';

export interface DepsConfig {
  options: Record<string, unknown>;
  env: Record<string, unknown>;
  services: Record<string, unknown>;
}

export function buildDeps(config: DepsConfig): Record<string, unknown> {
  return makeImmutable(
    {
      options: config.options,
      env: config.env,
      ...config.services,
    },
    'deps',
  );
}
