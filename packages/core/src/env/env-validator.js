import { deepFreeze } from '../immutability';
export function createEnv(config) {
  const result = config.schema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Environment validation failed:\n${result.error.message}`);
  }
  return deepFreeze(result.data);
}
//# sourceMappingURL=env-validator.js.map
