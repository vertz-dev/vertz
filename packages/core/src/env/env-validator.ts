import type { EnvConfig } from '../types/env';
import { deepFreeze } from '../immutability';

export function createEnv<T>(config: EnvConfig<T>): T {
  const result = config.schema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Environment validation failed:\n${result.error.message}`);
  }
  return deepFreeze(result.data);
}
