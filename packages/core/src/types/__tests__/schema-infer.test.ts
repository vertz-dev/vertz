import { describe, expectTypeOf, it } from '@vertz/test';
import type { Schema } from '@vertz/schema';
import type { InferSchema } from '../schema-infer';

describe('InferSchema', () => {
  it('extracts output type from a Schema', () => {
    type TestSchema = Schema<{ name: string; age: number }>;
    type Result = InferSchema<TestSchema>;
    expectTypeOf<Result>().toEqualTypeOf<{ name: string; age: number }>();
  });
});
