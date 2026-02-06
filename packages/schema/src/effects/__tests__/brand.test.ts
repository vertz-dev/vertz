import { describe, it, expect, expectTypeOf } from 'vitest';
import { StringSchema } from '../../schemas/string';
import type { Infer } from '../../utils/type-inference';

describe('.brand()', () => {
  it('passes value through unchanged at runtime', () => {
    const schema = new StringSchema().brand<'UserId'>();
    expect(schema.parse('abc')).toBe('abc');
  });

  it('infers branded type with __brand property', () => {
    const schema = new StringSchema().brand<'UserId'>();
    type Result = Infer<typeof schema>;
    expectTypeOf<Result>().toMatchTypeOf<string & { readonly __brand: 'UserId' }>();
  });

  it('different brands produce incompatible types', () => {
    const userIdSchema = new StringSchema().brand<'UserId'>();
    const postIdSchema = new StringSchema().brand<'PostId'>();
    type UserId = Infer<typeof userIdSchema>;
    type PostId = Infer<typeof postIdSchema>;
    expectTypeOf<UserId>().not.toMatchTypeOf<PostId>();
  });

  it('toJSONSchema ignores brand', () => {
    const schema = new StringSchema().brand<'UserId'>();
    expect(schema.toJSONSchema()).toEqual({ type: 'string' });
  });
});
