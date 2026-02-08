import { describe, expect, it } from 'vitest';
import { toKebabCase, toPascalCase } from '../naming';

describe('toKebabCase', () => {
  it('converts PascalCase to kebab-case', () => {
    expect(toKebabCase('UserAuth')).toBe('user-auth');
  });

  it('converts camelCase to kebab-case', () => {
    expect(toKebabCase('userAuth')).toBe('user-auth');
  });

  it('preserves already-kebab-case', () => {
    expect(toKebabCase('user-auth')).toBe('user-auth');
  });

  it('handles single word', () => {
    expect(toKebabCase('Order')).toBe('order');
  });
});

describe('toPascalCase', () => {
  it('converts kebab-case to PascalCase', () => {
    expect(toPascalCase('user-auth')).toBe('UserAuth');
  });

  it('converts snake_case to PascalCase', () => {
    expect(toPascalCase('user_auth')).toBe('UserAuth');
  });

  it('capitalizes single-token input', () => {
    expect(toPascalCase('UserAuth')).toBe('Userauth');
  });

  it('handles single word', () => {
    expect(toPascalCase('order')).toBe('Order');
  });
});
