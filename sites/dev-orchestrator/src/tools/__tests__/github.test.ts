import { describe, expect, it, vi, beforeEach, afterEach } from 'bun:test';
import { createGitHubTools } from '../github';
import { createGitHubClient } from '../../lib/github-client';

describe('Feature: GitHub tools', () => {
  const originalFetch = globalThis.fetch;
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('Given GitHub tools created with a client', () => {
    const client = createGitHubClient('test-token');
    const tools = createGitHubTools(client);

    describe('When readIssue handler is called', () => {
      it('Then returns the issue title, body, and labels', async () => {
        mockFetch.mockResolvedValueOnce(
          new Response(JSON.stringify({
            title: 'Add auth',
            body: 'Implement OAuth',
            labels: [{ name: 'feature' }],
          })),
        );

        const result = await tools.readIssue.handler!(
          { repo: 'vertz-dev/vertz', number: 1 },
          {} as any,
        );

        expect(result.title).toBe('Add auth');
        expect(result.body).toBe('Implement OAuth');
        expect(result.labels).toEqual(['feature']);
      });
    });

    describe('When ghPrChecks handler is called', () => {
      it('Then returns the check status', async () => {
        mockFetch.mockResolvedValueOnce(
          new Response(JSON.stringify({
            check_runs: [
              { name: 'test', status: 'completed', conclusion: 'success' },
            ],
          })),
        );

        const result = await tools.ghPrChecks.handler!(
          { repo: 'vertz-dev/vertz', prNumber: 5 },
          {} as any,
        );

        expect(result.status).toBe('success');
        expect(result.checks).toHaveLength(1);
      });
    });

    describe('When createPr handler is called', () => {
      it('Then creates the PR and returns number and URL', async () => {
        mockFetch.mockResolvedValueOnce(
          new Response(JSON.stringify({
            number: 42,
            html_url: 'https://github.com/vertz-dev/vertz/pull/42',
          })),
        );

        const result = await tools.createPr.handler!(
          {
            repo: 'vertz-dev/vertz',
            title: 'feat: auth',
            body: 'Auth PR',
            head: 'feat/auth',
            base: 'main',
          },
          {} as any,
        );

        expect(result.number).toBe(42);
        expect(result.url).toBe('https://github.com/vertz-dev/vertz/pull/42');
      });
    });

    describe('When commentOnIssue handler is called', () => {
      it('Then posts the comment and returns the comment ID', async () => {
        mockFetch.mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 999 })),
        );

        const result = await tools.commentOnIssue.handler!(
          { repo: 'vertz-dev/vertz', issueNumber: 1, body: 'Done!' },
          {} as any,
        );

        expect(result.commentId).toBe(999);
      });
    });
  });

  describe('Given the readIssue tool definition', () => {
    const tools = createGitHubTools(createGitHubClient('t'));

    it('Then has kind "tool" and parallel enabled', () => {
      expect(tools.readIssue.kind).toBe('tool');
      expect(tools.readIssue.parallel).toBe(true);
    });
  });
});
