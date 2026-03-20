import { css, query, useParams } from '@vertz/ui';
import { api } from '../api/client';
import { CommentSection } from '../components/comment-section';
import { LabelPicker } from '../components/label-picker';
import { IssueDetailSkeleton } from '../components/loading-skeleton';
import { PrioritySelect } from '../components/priority-select';
import { StatusSelect } from '../components/status-select';
import type { IssueLabel, IssuePriority, IssueStatus, Label } from '../lib/types';

const styles = css({
  container: ['p:6'],
  error: ['text:sm', 'text:destructive', 'py:8'],
  layout: ['flex', 'gap:8'],
  main: ['flex-1'],
  identifier: ['text:sm', 'text:muted-foreground', 'mb:2'],
  title: ['font:xl', 'font:bold', 'text:foreground', 'mb:4'],
  description: ['text:sm', 'text:foreground', 'leading:relaxed'],
  noDescription: ['text:sm', 'text:muted-foreground', 'italic'],
  sidebar: [
    'w:56',
    'shrink-0',
    'flex',
    'flex-col',
    'gap:4',
    'bg:card',
    'rounded:lg',
    'border:1',
    'border:border',
    'p:4',
  ],
  meta: ['text:xs', 'text:muted-foreground', 'mt:6'],
});

export function IssueDetailPage() {
  const { projectId, issueId } = useParams<'/projects/:projectId/issues/:issueId'>();
  const issue = query(api.issues.get(issueId));
  const project = query(api.projects.get(projectId));
  const comments = query(
    api.comments.list({
      where: { issueId },
      select: { id: true, body: true, authorId: true, createdAt: true },
    }),
  );
  const users = query(api.users.list({ select: { id: true, name: true, avatarUrl: true } }));
  const labelsQuery = query(
    api.labels.list({ where: { projectId }, select: { id: true, name: true, color: true } }),
  );
  const issueLabelsQuery = query(
    api.issueLabels.list({
      where: { issueId },
      select: { id: true, issueId: true, labelId: true },
    }),
  );

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
  };

  const handlePriorityChange = async (priority: IssuePriority) => {
    const res = await api.issues.update(issueId, { priority });
    if (!res.ok) {
      updateError = 'Failed to update priority';
      return;
    }
    updateError = '';
  };

  const handleAddLabel = async (labelId: string) => {
    await api.issueLabels.create({ issueId, labelId });
  };

  const handleRemoveLabel = async (issueLabelId: string) => {
    await api.issueLabels.delete(issueLabelId);
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
              onCommentAdded={() => {}}
            />
          </div>

          <aside className={styles.sidebar} data-testid="issue-sidebar">
            <StatusSelect value={issue.data.status as IssueStatus} onChange={handleStatusChange} />
            <PrioritySelect
              value={issue.data.priority as IssuePriority}
              onChange={handlePriorityChange}
            />
            <LabelPicker
              labels={(labelsQuery.data?.items ?? []) as Label[]}
              issueLabels={(issueLabelsQuery.data?.items ?? []) as IssueLabel[]}
              onAdd={handleAddLabel}
              onRemove={handleRemoveLabel}
            />
          </aside>
        </div>
      )}
    </div>
  );
}
