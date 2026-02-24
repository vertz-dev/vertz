import { describe, test } from 'bun:test';
import type { ExtractParams } from '../params';

describe('ExtractParams type utility', () => {
  test('extracts single param from path', () => {
    type Result = ExtractParams<'/users/:id'>;
    const _check: Result = { id: 'abc' };
    void _check;
    // @ts-expect-error — missing id property
    const _bad: Result = {};
    void _bad;
  });

  test('extracts multiple params from path', () => {
    type Result = ExtractParams<'/users/:id/posts/:postId'>;
    const _check: Result = { id: 'abc', postId: '123' };
    void _check;
    // @ts-expect-error — missing postId property
    const _bad: Result = { id: 'abc' };
    void _bad;
  });

  test('returns empty object for path with no params', () => {
    type Result = ExtractParams<'/users'>;
    const _check: Result = {} as Record<string, never>;
    void _check;
  });

  test('handles root path', () => {
    type Result = ExtractParams<'/'>;
    const _check: Result = {} as Record<string, never>;
    void _check;
  });

  test('handles wildcard path', () => {
    type Result = ExtractParams<'/files/*'>;
    const _check: Result = { '*': 'rest' };
    void _check;
    // @ts-expect-error — missing wildcard property
    const _bad: Result = {};
    void _bad;
  });

  test('handles mixed params and wildcard', () => {
    type Result = ExtractParams<'/users/:id/*'>;
    const _check: Result = { id: 'abc', '*': 'rest' };
    void _check;
    // @ts-expect-error — missing wildcard property
    const _bad: Result = { id: 'abc' };
    void _bad;
  });
});
