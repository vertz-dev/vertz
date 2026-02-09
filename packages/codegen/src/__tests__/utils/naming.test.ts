import { describe, expect, it } from 'vitest';
import { toCamelCase, toKebabCase, toPascalCase, toSnakeCase } from '../../utils/naming';

describe('toPascalCase', () => {
  it('capitalizes a single lowercase word', () => {
    expect(toPascalCase('users')).toBe('Users');
  });

  it('converts kebab-case to PascalCase', () => {
    expect(toPascalCase('create-user')).toBe('CreateUser');
  });

  it('converts snake_case to PascalCase', () => {
    expect(toPascalCase('create_user')).toBe('CreateUser');
  });

  it('converts camelCase to PascalCase', () => {
    expect(toPascalCase('createUser')).toBe('CreateUser');
  });

  it('handles already PascalCase input', () => {
    expect(toPascalCase('CreateUser')).toBe('CreateUser');
  });

  it('handles empty string', () => {
    expect(toPascalCase('')).toBe('');
  });

  it('handles multi-word kebab-case', () => {
    expect(toPascalCase('get-user-by-id')).toBe('GetUserById');
  });
});

describe('toCamelCase', () => {
  it('converts kebab-case to camelCase', () => {
    expect(toCamelCase('list-users')).toBe('listUsers');
  });

  it('converts PascalCase to camelCase', () => {
    expect(toCamelCase('ListUsers')).toBe('listUsers');
  });

  it('converts snake_case to camelCase', () => {
    expect(toCamelCase('list_users')).toBe('listUsers');
  });

  it('handles single word', () => {
    expect(toCamelCase('users')).toBe('users');
  });
});

describe('toKebabCase', () => {
  it('converts PascalCase to kebab-case', () => {
    expect(toKebabCase('CreateUser')).toBe('create-user');
  });

  it('converts camelCase to kebab-case', () => {
    expect(toKebabCase('createUser')).toBe('create-user');
  });

  it('converts snake_case to kebab-case', () => {
    expect(toKebabCase('create_user')).toBe('create-user');
  });
});

describe('toSnakeCase', () => {
  it('converts camelCase to snake_case', () => {
    expect(toSnakeCase('createUser')).toBe('create_user');
  });

  it('converts PascalCase to snake_case', () => {
    expect(toSnakeCase('CreateUser')).toBe('create_user');
  });

  it('converts kebab-case to snake_case', () => {
    expect(toSnakeCase('create-user')).toBe('create_user');
  });
});
