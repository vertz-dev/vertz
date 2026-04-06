import { describe, expect, it } from 'bun:test';
import { queryKey } from './query-key';

describe('queryKey', () => {
  describe('Given a path with no params', () => {
    it('returns the path as a single-element array', () => {
      expect(queryKey({ path: '/tasks' })).toEqual(['/tasks']);
    });

    it('handles root path', () => {
      expect(queryKey({ path: '/health' })).toEqual(['/health']);
    });
  });

  describe('Given a path with params', () => {
    it('interleaves static segments and param values', () => {
      expect(queryKey({ path: '/tasks/{taskId}', params: { taskId: 'abc' } })).toEqual([
        '/tasks',
        'abc',
      ]);
    });

    it('strips trailing undefined param values', () => {
      expect(queryKey({ path: '/tasks/{taskId}', params: { taskId: undefined } })).toEqual([
        '/tasks',
      ]);
    });

    it('strips trailing null param values', () => {
      expect(queryKey({ path: '/tasks/{taskId}', params: { taskId: null } })).toEqual(['/tasks']);
    });
  });

  describe('Given nested resource paths', () => {
    it('produces the full key array when all params defined', () => {
      expect(
        queryKey({
          path: '/teams/{teamId}/members/{memberId}',
          params: { teamId: 't1', memberId: 'm1' },
        }),
      ).toEqual(['/teams', 't1', '/members', 'm1']);
    });

    it('strips from the last undefined param', () => {
      expect(
        queryKey({
          path: '/teams/{teamId}/members/{memberId}',
          params: { teamId: 't1', memberId: undefined },
        }),
      ).toEqual(['/teams', 't1', '/members']);
    });

    it('strips all when all params are undefined', () => {
      expect(
        queryKey({
          path: '/teams/{teamId}/members/{memberId}',
          params: { teamId: undefined, memberId: undefined },
        }),
      ).toEqual(['/teams']);
    });
  });

  describe('Given a path with trailing static segment after params', () => {
    it('includes the trailing segment', () => {
      expect(queryKey({ path: '/teams/{teamId}/members', params: { teamId: 't1' } })).toEqual([
        '/teams',
        't1',
        '/members',
      ]);
    });
  });

  describe('Given a query object', () => {
    it('appends it as the last element when defined', () => {
      expect(queryKey({ path: '/tasks', query: { status: 'active' } })).toEqual([
        '/tasks',
        { status: 'active' },
      ]);
    });

    it('omits it when undefined', () => {
      expect(queryKey({ path: '/tasks', query: undefined })).toEqual(['/tasks']);
    });

    it('places query after params', () => {
      expect(
        queryKey({
          path: '/tasks/{taskId}',
          params: { taskId: 'abc' },
          query: { include: 'comments' },
        }),
      ).toEqual(['/tasks', 'abc', { include: 'comments' }]);
    });

    it('does not append query when trailing param is undefined', () => {
      expect(
        queryKey({
          path: '/tasks/{taskId}',
          params: { taskId: undefined },
          query: { include: 'comments' },
        }),
      ).toEqual(['/tasks']);
    });
  });

  describe('Given an empty path', () => {
    it('returns an empty array', () => {
      expect(queryKey({ path: '' })).toEqual([]);
    });
  });

  describe('Given params not present in the path', () => {
    it('ignores params that do not match placeholders', () => {
      expect(queryKey({ path: '/tasks', params: { bogus: 'value' } })).toEqual(['/tasks']);
    });
  });

  describe('Given numeric param values', () => {
    it('preserves number types in the key', () => {
      expect(queryKey({ path: '/tasks/{taskId}', params: { taskId: 42 } })).toEqual([
        '/tasks',
        42,
      ]);
    });
  });
});
