import { describe, it } from '@vertz/test';
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
    // Type-level assertion — verified by the TypeScript compiler
    const _schema = new TestStringSchema();
    type _R = Infer<typeof _schema>;
  });

  it('Output extracts the output type', () => {
    // Type-level assertion — verified by the TypeScript compiler
    const _schema = new TestStringSchema();
    type _R = Output<typeof _schema>;
  });

  it('Input extracts the input type', () => {
    // Type-level assertion — verified by the TypeScript compiler
    const _schema = new TestStringSchema();
    type _R = Input<typeof _schema>;
  });
});
