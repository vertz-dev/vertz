import type { Schema } from '@vertz/schema';

export type InferSchema<T extends Schema<any>> = T extends Schema<infer O> ? O : never;
