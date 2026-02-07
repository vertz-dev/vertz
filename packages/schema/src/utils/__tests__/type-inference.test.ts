import { describe, expectTypeOf, it } from 'vitest';
import { ErrorCode } from '../../core/errors';
import type { ParseContext } from '../../core/parse-context';
import { Schema } from '../../core/schema';
import { SchemaType } from '../../core/types';
import type { Infer, Input, Output } from '../type-inference';

class TestStringSchema extends Schema<string> {
  _parse(value: unknown, ctx: ParseContext): string {
    if (typeof value !== 'string') {
      ctx.addIssue({ code: ErrorCode.InvalidType, message: 'Expected string' });
      return value as string;
    }
    return value;
  }
  _schemaType(): SchemaType {
    return SchemaType.String;
  }
  _toJSONSchema(): Record<string, unknown> {
    return { type: 'string' };
  }
  _clone(): TestStringSchema {
    return this._cloneBase(new TestStringSchema());
  }
}

describe('Type inference utilities', () => {
  it('Infer extracts the output type of a schema', () => {
    const schema = new TestStringSchema();
    expectTypeOf<Infer<typeof schema>>().toEqualTypeOf<string>();
  });

  it('Output extracts the output type', () => {
    const schema = new TestStringSchema();
    expectTypeOf<Output<typeof schema>>().toEqualTypeOf<string>();
  });

  it('Input extracts the input type', () => {
    const schema = new TestStringSchema();
    expectTypeOf<Input<typeof schema>>().toEqualTypeOf<string>();
  });
});
