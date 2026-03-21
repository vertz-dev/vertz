import { describe, expect, it } from 'bun:test';
import { cn } from '../cn';

describe('cn', () => {
  it('joins multiple class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('filters out undefined values', () => {
    expect(cn('foo', undefined, 'bar')).toBe('foo bar');
  });

  it('filters out null values', () => {
    expect(cn('foo', null, 'bar')).toBe('foo bar');
  });

  it('filters out false values', () => {
    expect(cn('foo', false, 'bar')).toBe('foo bar');
  });

  it('filters out empty strings', () => {
    expect(cn('foo', '', 'bar')).toBe('foo bar');
  });

  it('returns undefined when all values are falsy', () => {
    expect(cn(undefined, null, false, '')).toBeUndefined();
  });

  it('returns undefined when called with no arguments', () => {
    expect(cn()).toBeUndefined();
  });

  it('returns the single class when only one is provided', () => {
    expect(cn('foo')).toBe('foo');
  });
});
