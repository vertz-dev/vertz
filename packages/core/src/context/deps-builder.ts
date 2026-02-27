import { makeImmutable } from '../immutability';

export interface DepsConfig {
  options: Record<string, unknown>;
  env: Record<string, unknown>;
  services: Record<string, unknown>;
}

const RESERVED_KEYS = ['options', 'env'];

export function buildDeps(config: DepsConfig): Record<string, unknown> {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
    for (const key of Object.keys(config.services)) {
      if (RESERVED_KEYS.includes(key)) {
        throw new Error(`Service name cannot shadow reserved deps key: "${key}"`);
      }
    }
  }

  return makeImmutable(
    {
      options: config.options,
      env: config.env,
      ...config.services,
    },
    'deps',
  );
}
