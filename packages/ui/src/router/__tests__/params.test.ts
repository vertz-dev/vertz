import { describe, expectTypeOf, test } from 'vitest';
import type { ExtractParams } from '../params';

describe('ExtractParams type utility', () => {
  test('extracts single param from path', () => {
    type Result = ExtractParams<'/users/:id'>;
    expectTypeOf<Result>().toEqualTypeOf<{ id: string }>();
  });

  test('extracts multiple params from path', () => {
    type Result = ExtractParams<'/users/:id/posts/:postId'>;
    expectTypeOf<Result>().toEqualTypeOf<{ id: string; postId: string }>();
  });

  test('returns empty object for path with no params', () => {
    type Result = ExtractParams<'/users'>;
    expectTypeOf<Result>().toEqualTypeOf<Record<string, never>>();
  });

  test('handles root path', () => {
    type Result = ExtractParams<'/'>;
    expectTypeOf<Result>().toEqualTypeOf<Record<string, never>>();
  });

  test('handles wildcard path', () => {
    type Result = ExtractParams<'/files/*'>;
    expectTypeOf<Result>().toEqualTypeOf<{ '*': string }>();
  });

  test('handles mixed params and wildcard', () => {
    type Result = ExtractParams<'/users/:id/*'>;
    expectTypeOf<Result>().toEqualTypeOf<{ id: string; '*': string }>();
  });
});
