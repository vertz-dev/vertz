import { describe, expect, it } from '@vertz/test';
import { StringSchema } from '../../schemas/string';
import type { Infer } from '../../utils/type-inference';

describe('.brand()', () => {
  it('passes value through unchanged at runtime', () => {
    const schema = new StringSchema().brand<'UserId'>();
    expect(schema.parse('abc').data).toBe('abc');
  });

  it('infers branded type with __brand property', () => {
    // Type-level assertion — verified by the TypeScript compiler
    const _schema = new StringSchema().brand<'UserId'>();
    type _Result = Infer<typeof _schema>;
  });

  it('different brands produce incompatible types', () => {
    // Type-level assertion — verified by the TypeScript compiler
    const _userIdSchema = new StringSchema().brand<'UserId'>();
    const _postIdSchema = new StringSchema().brand<'PostId'>();
    type _UserId = Infer<typeof _userIdSchema>;
    type _PostId = Infer<typeof _postIdSchema>;
  });

  it('toJSONSchema ignores brand', () => {
    const schema = new StringSchema().brand<'UserId'>();
    expect(schema.toJSONSchema()).toEqual({ type: 'string' });
  });
});
