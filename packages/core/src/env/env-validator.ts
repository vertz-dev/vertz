import { deepFreeze } from '../immutability';
import type { EnvConfig } from '../types/env';
import { loadEnvFiles } from './load-env-files';

export function createEnv<T>(config: EnvConfig<T>): T {
  const processEnv = typeof process !== 'undefined' ? process.env : {};
  const fileEnv = config.load?.length ? loadEnvFiles(config.load) : {};
  const envRecord = config.env
    ? { ...processEnv, ...fileEnv, ...config.env }
    : { ...processEnv, ...fileEnv };
  const result = config.schema.safeParse(envRecord);
  if (!result.ok) {
    throw new Error(`Environment validation failed:\n${result.error.message}`);
  }
  return deepFreeze(result.data);
}
