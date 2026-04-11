import { describe, expect, it, beforeEach, afterEach, mock } from '@vertz/test';
import { createGitHubProvider, readIssue, ghPrChecks, createPr, commentOnIssue } from '../github';
import { createGitHubClient } from '../../lib/github-client';

describe('Feature: GitHub tools', () => {
  const originalFetch = globalThis.fetch;
  const mockFetch = mock();

  beforeEach(() => {
    mockFetch.mockReset();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('Given GitHub tool declarations', () => {
    it('Then readIssue has kind "tool" and parallel enabled', () => {
      expect(readIssue.kind).toBe('tool');
      expect(readIssue.parallel).toBe(true);
    });

    it('Then ghPrChecks has kind "tool" and parallel enabled', () => {
      expect(ghPrChecks.kind).toBe('tool');
      expect(ghPrChecks.parallel).toBe(true);
    });

    it('Then createPr has kind "tool"', () => {
      expect(createPr.kind).toBe('tool');
    });

    it('Then commentOnIssue has kind "tool"', () => {
      expect(commentOnIssue.kind).toBe('tool');
    });
  });

  describe('Given a GitHub provider created with a client', () => {
    const client = createGitHubClient('test-token');
    const provider = createGitHubProvider(client);

    describe('When readIssue handler is called', () => {
      it('Then returns the issue title, body, and labels', async () => {
        mockFetch.mockResolvedValueOnce(
          new Response(JSON.stringify({
            title: 'Add auth',
            body: 'Implement OAuth',
            labels: [{ name: 'feature' }],
          })),
        );

        const result = await provider.readIssue(
          { repo: 'vertz-dev/vertz', number: 1 },
        );

        expect(result.title).toBe('Add auth');
        expect(result.body).toBe('Implement OAuth');
        expect(result.labels).toEqual(['feature']);
      });
    });

    describe('When ghPrChecks handler is called', () => {
      it('Then returns the check status', async () => {
        // First call: PR details (head SHA)
        mockFetch.mockResolvedValueOnce(
          new Response(JSON.stringify({
            head: { sha: 'abc123' },
          })),
        );
        // Second call: check runs
        mockFetch.mockResolvedValueOnce(
          new Response(JSON.stringify({
            check_runs: [
              { name: 'test', status: 'completed', conclusion: 'success' },
            ],
          })),
        );

        const result = await provider.ghPrChecks(
          { repo: 'vertz-dev/vertz', prNumber: 5 },
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

        const result = await provider.createPr({
          repo: 'vertz-dev/vertz',
          title: 'feat: auth',
          body: 'Auth PR',
          head: 'feat/auth',
          base: 'main',
        });

        expect(result.number).toBe(42);
        expect(result.url).toBe('https://github.com/vertz-dev/vertz/pull/42');
      });
    });

    describe('When commentOnIssue handler is called', () => {
      it('Then posts the comment and returns the comment ID', async () => {
        mockFetch.mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 999 })),
        );

        const result = await provider.commentOnIssue(
          { repo: 'vertz-dev/vertz', issueNumber: 1, body: 'Done!' },
        );

        expect(result.commentId).toBe(999);
      });
    });
  });
});
