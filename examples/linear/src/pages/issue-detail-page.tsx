import { css, query, token, useParams } from '@vertz/ui';
import { api } from '../api/client';
import { CommentSection } from '../components/comment-section';
import { IssueDetailSkeleton } from '../components/loading-skeleton';
import { PrioritySelect } from '../components/priority-select';
import { StatusSelect } from '../components/status-select';
import type { IssuePriority, IssueStatus } from '../lib/types';

const styles = css({
  container: { padding: token.spacing[6] },
  error: {
    fontSize: token.font.size.sm,
    color: token.color.destructive,
    paddingBlock: token.spacing[8],
  },
  layout: { display: 'flex', gap: token.spacing[8] },
  main: { flex: '1 1 0%' },
  identifier: {
    fontSize: token.font.size.sm,
    color: token.color['muted-foreground'],
    marginBottom: token.spacing[2],
  },
  title: {
    fontSize: token.font.size.xl,
    fontWeight: token.font.weight.bold,
    color: token.color.foreground,
    marginBottom: token.spacing[4],
  },
  description: {
    fontSize: token.font.size.sm,
    color: token.color.foreground,
    lineHeight: token.font.lineHeight.relaxed,
  },
  noDescription: {
    fontSize: token.font.size.sm,
    color: token.color['muted-foreground'],
    fontStyle: 'italic',
  },
  sidebar: {
    width: token.spacing[56],
    flexShrink: '0',
    display: 'flex',
    flexDirection: 'column',
    gap: token.spacing[4],
    backgroundColor: token.color.card,
    borderRadius: token.radius.lg,
    borderWidth: '1px',
    borderColor: token.color.border,
    padding: token.spacing[4],
  },
  meta: {
    fontSize: token.font.size.xs,
    color: token.color['muted-foreground'],
    marginTop: token.spacing[6],
  },
});

export function IssueDetailPage() {
  const { projectId, issueId } = useParams<'/projects/:projectId/issues/:issueId'>();
  const issue = query(api.issues.get(issueId));
  const project = query(api.projects.get(projectId));
  const comments = query(api.comments.list({ issueId }));
  const users = query(api.users.list());

  let updateError = '';

  // Build user lookup map for author resolution.
  // Must be a single declarative expression so the compiler wraps it in computed()
  // and re-evaluates when users.data loads.
  const userMap: Record<string, { name: string; avatarUrl: string | null }> = users.data?.items
    ? Object.fromEntries(
        users.data.items.map((u) => [
          u.id,
          { name: u.name, avatarUrl: u.avatarUrl as string | null },
        ]),
      )
    : {};

  const handleStatusChange = async (status: IssueStatus) => {
    const res = await api.issues.update(issueId, { status });
    if (!res.ok) {
      updateError = 'Failed to update status';
      return;
    }
    updateError = '';
    issue.refetch();
  };

  const handlePriorityChange = async (priority: IssuePriority) => {
    const res = await api.issues.update(issueId, { priority });
    if (!res.ok) {
      updateError = 'Failed to update priority';
      return;
    }
    updateError = '';
    issue.refetch();
  };

  return (
    <div className={styles.container} data-testid="issue-detail">
      {issue.loading && <IssueDetailSkeleton />}

      {issue.error && <div className={styles.error}>Failed to load issue. Please try again.</div>}

      {updateError && <div className={styles.error}>{updateError}</div>}

      {issue.data && (
        <div className={styles.layout}>
          <div className={styles.main}>
            <div className={styles.identifier}>
              {`${project.data?.key ?? '...'}-${issue.data.number}`}
            </div>
            <h2 className={styles.title}>{issue.data.title}</h2>
            {issue.data.description ? (
              <p className={styles.description}>{issue.data.description}</p>
            ) : (
              <p className={styles.noDescription}>No description provided.</p>
            )}
            <div className={styles.meta}>
              {`Created ${new Date(issue.data.createdAt).toLocaleDateString()}`}
            </div>

            <CommentSection
              comments={comments.data?.items ?? []}
              loading={comments.loading}
              issueId={issueId}
              userMap={userMap}
              onCommentAdded={() => comments.refetch()}
            />
          </div>

          <aside className={styles.sidebar} data-testid="issue-sidebar">
            <StatusSelect value={issue.data.status as IssueStatus} onChange={handleStatusChange} />
            <PrioritySelect
              value={issue.data.priority as IssuePriority}
              onChange={handlePriorityChange}
            />
          </aside>
        </div>
      )}
    </div>
  );
}
