import { makeImmutable } from '../immutability';

const RESERVED_KEYS = ['options', 'env'];
export function buildDeps(config) {
  if (process.env.NODE_ENV === 'development') {
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
//# sourceMappingURL=deps-builder.js.map
