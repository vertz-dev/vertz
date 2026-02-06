import { describe, it, expect, expectTypeOf } from 'vitest';
import { ObjectSchema } from '../../schemas/object';
import { StringSchema } from '../../schemas/string';
import { NumberSchema } from '../../schemas/number';
import { ArraySchema } from '../../schemas/array';
import type { Infer } from '../../utils/type-inference';

describe('.readonly()', () => {
  it('output is frozen (Object.isFrozen)', () => {
    const schema = new ObjectSchema({
      name: new StringSchema(),
      age: new NumberSchema(),
    }).readonly();
    const result = schema.parse({ name: 'Alice', age: 30 });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('properties are not writable', () => {
    const schema = new ObjectSchema({
      name: new StringSchema(),
    }).readonly();
    const result = schema.parse({ name: 'Alice' });
    expect(() => { (result as any).name = 'Bob'; }).toThrow();
  });

  it('infers Readonly<T> type', () => {
    const schema = new ObjectSchema({
      name: new StringSchema(),
      age: new NumberSchema(),
    }).readonly();
    type Result = Infer<typeof schema>;
    expectTypeOf<Result>().toMatchTypeOf<Readonly<{ name: string; age: number }>>();
  });

  it('freezes arrays', () => {
    const schema = new ArraySchema(new StringSchema()).readonly();
    const result = schema.parse(['a', 'b']);
    expect(Object.isFrozen(result)).toBe(true);
    expect(() => { (result as any).push('c'); }).toThrow();
  });

  it('passes primitives through unchanged', () => {
    const schema = new NumberSchema().readonly();
    expect(schema.parse(42)).toBe(42);
  });
});
