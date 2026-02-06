import type { EnvConfig } from '../types/env';

export function createEnv<T>(config: EnvConfig<T>): T {
  const result = config.schema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Environment validation failed:\n${result.error.message}`);
  }
  Object.freeze(result.data);
  return result.data;
}
