import type { Schema } from '@vertz/schema';

export interface EnvConfig<T = unknown> {
  load?: string[];
  schema: Schema<T>;
  env?: Record<string, string | undefined>;
}
