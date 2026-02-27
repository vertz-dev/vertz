import { deepFreeze } from '../immutability';
import type { EnvConfig } from '../types/env';

export function createEnv<T>(config: EnvConfig<T>): T {
  const envRecord = config.env ?? (typeof process !== 'undefined' ? process.env : {});
  const result = config.schema.safeParse(envRecord);
  if (!result.success) {
    throw new Error(`Environment validation failed:\n${result.error.message}`);
  }
  return deepFreeze(result.data);
}
