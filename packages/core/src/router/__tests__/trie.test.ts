import { describe, expect, it } from 'vitest';
import { Trie } from '../trie';

describe('Trie', () => {
  it('matches a static route', () => {
    const trie = new Trie();
    const handler = () => 'hello';
    trie.add('GET', '/hello', handler);

    const result = trie.match('GET', '/hello');

    expect(result).not.toBeNull();
    expect(result?.handler).toBe(handler);
    expect(result?.params).toEqual({});
  });

  it('matches a param route and extracts params', () => {
    const trie = new Trie();
    const handler = () => 'user';
    trie.add('GET', '/users/:id', handler);

    const result = trie.match('GET', '/users/123');

    expect(result).not.toBeNull();
    expect(result?.handler).toBe(handler);
    expect(result?.params).toEqual({ id: '123' });
  });

  it('matches a wildcard route and captures rest path', () => {
    const trie = new Trie();
    const handler = () => 'files';
    trie.add('GET', '/files/*', handler);

    const result = trie.match('GET', '/files/docs/readme.md');

    expect(result).not.toBeNull();
    expect(result?.handler).toBe(handler);
    expect(result?.params).toEqual({ '*': 'docs/readme.md' });
  });

  it('prioritizes static over param over wildcard', () => {
    const trie = new Trie();
    const staticHandler = () => 'static';
    const paramHandler = () => 'param';
    const wildcardHandler = () => 'wildcard';

    trie.add('GET', '/items/*', wildcardHandler);
    trie.add('GET', '/items/:id', paramHandler);
    trie.add('GET', '/items/special', staticHandler);

    const staticResult = trie.match('GET', '/items/special');
    expect(staticResult?.handler).toBe(staticHandler);

    const paramResult = trie.match('GET', '/items/123');
    expect(paramResult?.handler).toBe(paramHandler);

    const wildcardResult = trie.match('GET', '/items/a/b/c');
    expect(wildcardResult?.handler).toBe(wildcardHandler);
  });

  it('extracts multiple nested params', () => {
    const trie = new Trie();
    const handler = () => 'post';
    trie.add('GET', '/users/:userId/posts/:postId', handler);

    const result = trie.match('GET', '/users/42/posts/99');

    expect(result).not.toBeNull();
    expect(result?.handler).toBe(handler);
    expect(result?.params).toEqual({ userId: '42', postId: '99' });
  });

  it('returns null when no route matches', () => {
    const trie = new Trie();
    trie.add('GET', '/hello', () => 'hello');

    expect(trie.match('GET', '/world')).toBeNull();
    expect(trie.match('GET', '/hello/extra')).toBeNull();
  });

  it('routes different methods to different handlers on the same path', () => {
    const trie = new Trie();
    const getHandler = () => 'get';
    const postHandler = () => 'post';
    trie.add('GET', '/users', getHandler);
    trie.add('POST', '/users', postHandler);

    expect(trie.match('GET', '/users')?.handler).toBe(getHandler);
    expect(trie.match('POST', '/users')?.handler).toBe(postHandler);
    expect(trie.match('DELETE', '/users')).toBeNull();
  });

  it('matches the root path', () => {
    const trie = new Trie();
    const handler = () => 'root';
    trie.add('GET', '/', handler);

    const result = trie.match('GET', '/');

    expect(result).not.toBeNull();
    expect(result?.handler).toBe(handler);
    expect(result?.params).toEqual({});
  });

  it('returns allowed methods for a matched path', () => {
    const trie = new Trie();
    trie.add('GET', '/users', () => 'get');
    trie.add('POST', '/users', () => 'post');
    trie.add('DELETE', '/users', () => 'delete');

    const methods = trie.getAllowedMethods('/users');

    expect(methods).toEqual(expect.arrayContaining(['GET', 'POST', 'DELETE']));
    expect(methods).toHaveLength(3);
  });

  it('returns empty array for unmatched path', () => {
    const trie = new Trie();
    trie.add('GET', '/users', () => 'get');

    expect(trie.getAllowedMethods('/nope')).toEqual([]);
  });

  it('handles multiple methods on wildcard routes', () => {
    const trie = new Trie();
    const getHandler = () => 'get';
    const postHandler = () => 'post';
    trie.add('GET', '/files/*', getHandler);
    trie.add('POST', '/files/*', postHandler);

    expect(trie.match('GET', '/files/a/b/c')?.handler).toBe(getHandler);
    expect(trie.match('POST', '/files/a/b/c')?.handler).toBe(postHandler);
  });

  it('throws when param names conflict at the same position', () => {
    const trie = new Trie();
    trie.add('GET', '/users/:id', () => 'first');

    expect(() => {
      trie.add('POST', '/users/:userId', () => 'second');
    }).toThrow(/param name mismatch/i);
  });

  describe('getRoutes', () => {
    it('returns an empty array when no routes are registered', () => {
      const trie = new Trie();
      expect(trie.getRoutes()).toEqual([]);
    });

    it('returns all registered routes with method and path', () => {
      const trie = new Trie();
      trie.add('GET', '/users', () => 'get');
      trie.add('POST', '/users', () => 'post');
      trie.add('GET', '/users/:id', () => 'getById');

      const routes = trie.getRoutes();

      expect(routes).toEqual(
        expect.arrayContaining([
          { method: 'GET', path: '/users' },
          { method: 'POST', path: '/users' },
          { method: 'GET', path: '/users/:id' },
        ]),
      );
      expect(routes).toHaveLength(3);
    });

    it('reconstructs param segments with colon prefix', () => {
      const trie = new Trie();
      trie.add('GET', '/users/:userId/posts/:postId', () => 'nested');

      const routes = trie.getRoutes();

      expect(routes).toEqual([{ method: 'GET', path: '/users/:userId/posts/:postId' }]);
    });

    it('reconstructs wildcard segments with asterisk', () => {
      const trie = new Trie();
      trie.add('GET', '/files/*', () => 'files');

      const routes = trie.getRoutes();

      expect(routes).toEqual([{ method: 'GET', path: '/files/*' }]);
    });

    it('returns routes sorted by path then method', () => {
      const trie = new Trie();
      trie.add('POST', '/users', () => 'post');
      trie.add('GET', '/tasks', () => 'tasks');
      trie.add('GET', '/users', () => 'get');
      trie.add('DELETE', '/users/:id', () => 'delete');

      const routes = trie.getRoutes();

      expect(routes).toEqual([
        { method: 'GET', path: '/tasks' },
        { method: 'GET', path: '/users' },
        { method: 'POST', path: '/users' },
        { method: 'DELETE', path: '/users/:id' },
      ]);
    });
  });
});
