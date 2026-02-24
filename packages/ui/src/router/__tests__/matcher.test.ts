import { describe, expect, test } from 'bun:test';
import { matchPath } from '../matcher';

describe('matchPath', () => {
  test('matches exact static path', () => {
    const result = matchPath('/users', '/users');
    expect(result).not.toBeNull();
    expect(result?.params).toEqual({});
  });

  test('matches root path', () => {
    const result = matchPath('/', '/');
    expect(result).not.toBeNull();
    expect(result?.params).toEqual({});
  });

  test('returns null for non-matching path', () => {
    const result = matchPath('/users', '/posts');
    expect(result).toBeNull();
  });

  test('extracts single param', () => {
    const result = matchPath('/users/:id', '/users/123');
    expect(result).not.toBeNull();
    expect(result?.params).toEqual({ id: '123' });
  });

  test('extracts multiple params', () => {
    const result = matchPath('/users/:id/posts/:postId', '/users/123/posts/456');
    expect(result).not.toBeNull();
    expect(result?.params).toEqual({ id: '123', postId: '456' });
  });

  test('does not match partial path (too few segments)', () => {
    const result = matchPath('/users/:id/posts', '/users/123');
    expect(result).toBeNull();
  });

  test('does not match path with extra segments (no wildcard)', () => {
    const result = matchPath('/users/:id', '/users/123/posts');
    expect(result).toBeNull();
  });

  test('matches wildcard catch-all', () => {
    const result = matchPath('/files/*', '/files/a/b/c');
    expect(result).not.toBeNull();
    expect(result?.params).toEqual({ '*': 'a/b/c' });
  });

  test('wildcard matches empty rest', () => {
    const result = matchPath('/files/*', '/files/');
    expect(result).not.toBeNull();
    expect(result?.params).toEqual({ '*': '' });
  });

  test('param does not match empty segment', () => {
    const result = matchPath('/users/:id', '/users/');
    expect(result).toBeNull();
  });

  test('handles trailing slash on pattern and path', () => {
    const result = matchPath('/users', '/users/');
    expect(result).not.toBeNull();
    expect(result?.params).toEqual({});
  });

  test('returns matched path portion', () => {
    const result = matchPath('/users/:id', '/users/42');
    expect(result).not.toBeNull();
    expect(result?.path).toBe('/users/42');
  });
});
