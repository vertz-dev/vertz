/**
 * Tests for SSR route matcher — matches URLs to manifest route patterns.
 */
import { describe, expect, it } from 'bun:test';
import { matchUrlToPatterns } from '../ssr-route-matcher';

const PATTERNS = [
  '/',
  '/login',
  '/projects',
  '/projects/:projectId',
  '/projects/:projectId/board',
  '/projects/:projectId/issues/:issueId',
];

describe('Feature: Exact URL to route pattern matching', () => {
  const AOT_PATTERNS = ['/', '/games', '/sellers', '/cart', '/games/:id'];

  describe('Given AOT patterns and exact mode', () => {
    it('Then / only matches the root URL, not /games or /cards/abc', () => {
      expect(
        matchUrlToPatterns('/games/pokemon', AOT_PATTERNS, { exact: true }).map((m) => m.pattern),
      ).toEqual(['/games/:id']);

      expect(
        matchUrlToPatterns('/cards/pokemon-set-01-001', AOT_PATTERNS, { exact: true }),
      ).toEqual([]);

      expect(matchUrlToPatterns('/', AOT_PATTERNS, { exact: true }).map((m) => m.pattern)).toEqual([
        '/',
      ]);
    });

    it('Then /games matches exactly, not /games/pokemon', () => {
      const matches = matchUrlToPatterns('/games', AOT_PATTERNS, { exact: true });
      expect(matches.map((m) => m.pattern)).toEqual(['/games']);
    });

    it('Then /sellers does not match /sellers/some-seller', () => {
      expect(matchUrlToPatterns('/sellers/some-seller', AOT_PATTERNS, { exact: true })).toEqual([]);
    });

    it('Then parameterized patterns still extract params in exact mode', () => {
      const matches = matchUrlToPatterns('/games/pokemon', AOT_PATTERNS, { exact: true });
      expect(matches).toHaveLength(1);
      expect(matches[0]?.pattern).toBe('/games/:id');
      expect(matches[0]?.params).toEqual({ id: 'pokemon' });
    });
  });
});

describe('Feature: URL to route pattern matching', () => {
  describe('Given /projects/abc123/board', () => {
    it('Then matches layout and page patterns with extracted params', () => {
      const matches = matchUrlToPatterns('/projects/abc123/board', PATTERNS);
      const patterns = matches.map((m) => m.pattern);

      expect(patterns).toContain('/');
      expect(patterns).toContain('/projects/:projectId');
      expect(patterns).toContain('/projects/:projectId/board');
    });

    it('Then extracts projectId param', () => {
      const matches = matchUrlToPatterns('/projects/abc123/board', PATTERNS);
      const boardMatch = matches.find((m) => m.pattern === '/projects/:projectId/board');

      expect(boardMatch?.params).toEqual({ projectId: 'abc123' });
    });
  });

  describe('Given /projects/abc123/issues/issue-1', () => {
    it('Then matches nested patterns with multiple params', () => {
      const matches = matchUrlToPatterns('/projects/abc123/issues/issue-1', PATTERNS);
      const detail = matches.find((m) => m.pattern === '/projects/:projectId/issues/:issueId');

      expect(detail).toBeDefined();
      expect(detail?.params).toEqual({ projectId: 'abc123', issueId: 'issue-1' });
    });
  });

  describe('Given /login', () => {
    it('Then matches exact leaf route', () => {
      const matches = matchUrlToPatterns('/login', PATTERNS);
      const patterns = matches.map((m) => m.pattern);

      expect(patterns).toContain('/login');
      expect(patterns).toContain('/');
    });
  });

  describe('Given /unknown-route', () => {
    it('Then only matches root layout', () => {
      const matches = matchUrlToPatterns('/unknown-route', PATTERNS);
      const patterns = matches.map((m) => m.pattern);

      // Root '/' matches as prefix, but no specific page matches
      expect(patterns).toContain('/');
      expect(patterns).not.toContain('/projects');
    });
  });

  describe('Given URL with query string', () => {
    it('Then strips query string before matching', () => {
      const matches = matchUrlToPatterns('/projects?sort=name', PATTERNS);
      const patterns = matches.map((m) => m.pattern);

      expect(patterns).toContain('/projects');
    });
  });
});
