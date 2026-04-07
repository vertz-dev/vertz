const GITHUB_API = 'https://api.github.com';

export interface GitHubIssue {
  readonly title: string;
  readonly body: string;
  readonly labels: string[];
}

export interface GitHubCheckResult {
  readonly name: string;
  readonly status: string;
  readonly conclusion: string;
}

export interface GitHubChecks {
  readonly status: 'pending' | 'success' | 'failure';
  readonly checks: GitHubCheckResult[];
}

export interface GitHubPr {
  readonly number: number;
  readonly url: string;
}

export interface CreatePrInput {
  readonly title: string;
  readonly body: string;
  readonly head: string;
  readonly base: string;
}

export interface GitHubClient {
  getIssue(repo: string, issueNumber: number): Promise<GitHubIssue>;
  getPrChecks(repo: string, prNumber: number): Promise<GitHubChecks>;
  createPr(repo: string, input: CreatePrInput): Promise<GitHubPr>;
  commentOnIssue(repo: string, issueNumber: number, body: string): Promise<{ commentId: number }>;
}

export function createGitHubClient(token: string): GitHubClient {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };

  async function apiRequest(path: string, options?: RequestInit): Promise<Response> {
    const response = await fetch(`${GITHUB_API}${path}`, {
      ...options,
      headers: { ...headers, ...options?.headers },
    });
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    return response;
  }

  return {
    async getIssue(repo, issueNumber) {
      const response = await apiRequest(`/repos/${repo}/issues/${issueNumber}`);
      const data = await response.json() as {
        title: string;
        body: string;
        labels: Array<{ name: string }>;
      };
      return {
        title: data.title,
        body: data.body,
        labels: data.labels.map((l) => l.name),
      };
    },

    async getPrChecks(repo, prNumber) {
      const response = await apiRequest(
        `/repos/${repo}/commits/heads/pr-${prNumber}/check-runs`,
      );
      const data = await response.json() as {
        check_runs: Array<{ name: string; status: string; conclusion: string }>;
      };

      const checks = data.check_runs.map((c) => ({
        name: c.name,
        status: c.status,
        conclusion: c.conclusion,
      }));

      const allCompleted = checks.every((c) => c.status === 'completed');
      const allSuccess = checks.every((c) => c.conclusion === 'success');

      let status: 'pending' | 'success' | 'failure';
      if (!allCompleted) {
        status = 'pending';
      } else if (allSuccess) {
        status = 'success';
      } else {
        status = 'failure';
      }

      return { status, checks };
    },

    async createPr(repo, input) {
      const response = await apiRequest(`/repos/${repo}/pulls`, {
        method: 'POST',
        body: JSON.stringify({
          title: input.title,
          body: input.body,
          head: input.head,
          base: input.base,
        }),
      });
      const data = await response.json() as { number: number; html_url: string };
      return { number: data.number, url: data.html_url };
    },

    async commentOnIssue(repo, issueNumber, body) {
      const response = await apiRequest(`/repos/${repo}/issues/${issueNumber}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
      const data = await response.json() as { id: number };
      return { commentId: data.id };
    },
  };
}
