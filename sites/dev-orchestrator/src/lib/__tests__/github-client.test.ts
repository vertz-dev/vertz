import { describe, expect, it, vi, beforeEach, afterEach } from 'bun:test';
import { createGitHubClient, type GitHubClient } from '../github-client';

describe('Feature: GitHub API client', () => {
  let client: GitHubClient;
  const originalFetch = globalThis.fetch;

  const mockFetch = vi.fn();

  beforeEach(() => {
    client = createGitHubClient('test-token');
    mockFetch.mockReset();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('Given a GitHub client', () => {
    describe('When getIssue is called with a valid repo and issue number', () => {
      it('Then returns the issue title, body, and labels', async () => {
        mockFetch.mockResolvedValueOnce(
          new Response(JSON.stringify({
            title: 'Add user auth',
            body: '## Description\nImplement auth flow',
            labels: [{ name: 'feature' }, { name: 'P0' }],
          })),
        );

        const issue = await client.getIssue('vertz-dev/vertz', 42);

        expect(issue.title).toBe('Add user auth');
        expect(issue.body).toBe('## Description\nImplement auth flow');
        expect(issue.labels).toEqual(['feature', 'P0']);
      });
    });

    describe('When getIssue is called with a non-existent issue', () => {
      it('Then throws an error', async () => {
        mockFetch.mockResolvedValueOnce(
          new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 }),
        );

        await expect(client.getIssue('vertz-dev/vertz', 99999)).rejects.toThrow();
      });
    });

    describe('When getPrChecks is called', () => {
      it('Then returns the check status and individual results', async () => {
        mockFetch.mockResolvedValueOnce(
          new Response(JSON.stringify({
            check_runs: [
              { name: 'test', status: 'completed', conclusion: 'success' },
              { name: 'lint', status: 'completed', conclusion: 'success' },
            ],
          })),
        );

        const checks = await client.getPrChecks('vertz-dev/vertz', 10);

        expect(checks.status).toBe('success');
        expect(checks.checks).toHaveLength(2);
        expect(checks.checks[0]).toEqual({
          name: 'test',
          status: 'completed',
          conclusion: 'success',
        });
      });
    });

    describe('When createPr is called', () => {
      it('Then creates a PR and returns its number and URL', async () => {
        mockFetch.mockResolvedValueOnce(
          new Response(JSON.stringify({
            number: 15,
            html_url: 'https://github.com/vertz-dev/vertz/pull/15',
          })),
        );

        const pr = await client.createPr('vertz-dev/vertz', {
          title: 'feat: add auth',
          body: 'Implements auth',
          head: 'feat/auth',
          base: 'main',
        });

        expect(pr.number).toBe(15);
        expect(pr.url).toBe('https://github.com/vertz-dev/vertz/pull/15');
      });
    });

    describe('When commentOnIssue is called', () => {
      it('Then posts a comment and returns the comment ID', async () => {
        mockFetch.mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 12345 })),
        );

        const result = await client.commentOnIssue('vertz-dev/vertz', 42, 'LGTM');

        expect(result.commentId).toBe(12345);
        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.github.com/repos/vertz-dev/vertz/issues/42/comments',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ body: 'LGTM' }),
          }),
        );
      });
    });
  });
});
