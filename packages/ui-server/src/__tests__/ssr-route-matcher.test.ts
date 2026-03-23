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
