export interface ApprovalCheck {
  readonly approved: boolean;
  readonly approvedBy?: string;
  readonly comment?: string;
}

const ALLOWED_APPROVERS = ['viniciusdacal'];
const APPROVAL_KEYWORDS = ['/approve', 'lgtm', '/lgtm'];

export async function checkApproval(
  repo: string,
  issueNumber: number,
  sinceCommentId: number,
  githubToken: string,
): Promise<ApprovalCheck> {
  const response = await fetch(
    `https://api.github.com/repos/${repo}/issues/${issueNumber}/comments?since_id=${sinceCommentId}`,
    {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/vnd.github+json',
      },
    },
  );
  const comments = (await response.json()) as Array<{
    id: number;
    user: { login: string };
    body: string;
  }>;

  for (const comment of comments) {
    if (!ALLOWED_APPROVERS.includes(comment.user.login)) continue;
    const body = comment.body.trim().toLowerCase();
    if (APPROVAL_KEYWORDS.some((kw) => body.startsWith(kw))) {
      return { approved: true, approvedBy: comment.user.login, comment: comment.body };
    }
  }

  return { approved: false };
}
