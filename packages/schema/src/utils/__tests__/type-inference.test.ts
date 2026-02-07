import { describe, it, expectTypeOf } from 'vitest';
import type { Infer, Output, Input } from '../type-inference';
import { Schema } from '../../core/schema';
import type { ParseContext } from '../../core/parse-context';
import { ErrorCode } from '../../core/errors';
import { SchemaType } from '../../core/types';

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
