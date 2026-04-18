import { describe, expect, test } from '@vertz/test';
import { trusted } from '../trusted-html';

describe('trusted()', () => {
  test('returns the input string unchanged at runtime', () => {
    expect(trusted('<b>hi</b>')).toBe('<b>hi</b>');
  });

  test('returns the empty string when given an empty string', () => {
    expect(trusted('')).toBe('');
  });
});
