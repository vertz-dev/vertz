import { css, query, useDialogStack, useParams } from '@vertz/ui';
import { api } from '../api/client';
import { Button } from '../components/button';
import { CommentSection } from '../components/comment-section';
import { EditIssueDialog } from '../components/edit-issue-dialog';
import { PrioritySelect } from '../components/priority-select';
import { StatusSelect } from '../components/status-select';
import type { Issue, IssuePriority, IssueStatus } from '../lib/types';

const styles = css({
  container: ['p:6'],
  loading: ['text:sm', 'text:muted-foreground', 'py:8'],
  error: ['text:sm', 'text:destructive', 'py:8'],
  layout: ['flex', 'gap:8'],
  main: ['flex-1'],
  identifier: ['text:sm', 'text:muted-foreground', 'mb:2'],
  titleRow: ['flex', 'items:center', 'gap:3', 'mb:4'],
  title: ['font:xl', 'font:bold', 'text:foreground'],
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
  const comments = query(api.comments.list({ issueId }));
  const users = query(api.users.list());
  const stack = useDialogStack();

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

  const handleEdit = async () => {
    if (!issue.data) return;
    try {
      const updated = await stack.open(EditIssueDialog, {
        issue: issue.data as Issue,
      });
      if (updated) issue.refetch();
    } catch {
      // Dialog dismissed — no action needed
    }
  };

  return (
    <div className={styles.container}>
      {issue.loading && <div className={styles.loading}>Loading issue...</div>}

      {issue.error && <div className={styles.error}>Failed to load issue. Please try again.</div>}

      {updateError && <div className={styles.error}>{updateError}</div>}

      {issue.data && (
        <div className={styles.layout}>
          <div className={styles.main}>
            <div className={styles.identifier}>
              {`${project.data?.key ?? '...'}-${issue.data.number}`}
            </div>
            <div className={styles.titleRow}>
              <h2 className={styles.title}>{issue.data.title}</h2>
              <Button intent="outline" size="sm" onClick={handleEdit}>
                Edit
              </Button>
            </div>
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

          <aside className={styles.sidebar}>
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
