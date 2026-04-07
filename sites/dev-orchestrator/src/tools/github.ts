import { tool } from '@vertz/agents';
import type { InferToolProvider } from '@vertz/agents';
import { s } from '@vertz/schema';
import type { GitHubClient } from '../lib/github-client';

// ---------------------------------------------------------------------------
// Tool declarations
// ---------------------------------------------------------------------------

export const readIssue = tool({
  description: 'Read a GitHub issue by number',
  input: s.object({ repo: s.string(), number: s.number() }),
  output: s.object({
    title: s.string(),
    body: s.string(),
    labels: s.array(s.string()),
  }),
  parallel: true,
});

export const ghPrChecks = tool({
  description: 'Get CI check status for a pull request',
  input: s.object({ repo: s.string(), prNumber: s.number() }),
  output: s.object({
    status: s.enum(['pending', 'success', 'failure']),
    checks: s.array(s.object({
      name: s.string(),
      status: s.string(),
      conclusion: s.string(),
    })),
  }),
  parallel: true,
});

export const createPr = tool({
  description: 'Create a pull request on GitHub',
  input: s.object({
    repo: s.string(),
    title: s.string(),
    body: s.string(),
    head: s.string(),
    base: s.string(),
  }),
  output: s.object({ number: s.number(), url: s.string() }),
});

export const commentOnIssue = tool({
  description: 'Post a comment on a GitHub issue',
  input: s.object({
    repo: s.string(),
    issueNumber: s.number(),
    body: s.string(),
  }),
  output: s.object({ commentId: s.number() }),
});

// ---------------------------------------------------------------------------
// Tool provider
// ---------------------------------------------------------------------------

const githubTools = { readIssue, ghPrChecks, createPr, commentOnIssue };

export function createGitHubProvider(client: GitHubClient): InferToolProvider<typeof githubTools> {
  return {
    readIssue: async ({ repo, number }) => {
      return client.getIssue(repo, number);
    },
    ghPrChecks: async ({ repo, prNumber }) => {
      return client.getPrChecks(repo, prNumber);
    },
    createPr: async ({ repo, title, body, head, base }) => {
      return client.createPr(repo, { title, body, head, base });
    },
    commentOnIssue: async ({ repo, issueNumber, body }) => {
      return client.commentOnIssue(repo, issueNumber, body);
    },
  };
}
