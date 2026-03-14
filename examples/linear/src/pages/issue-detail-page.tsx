import { css, query, useParams } from '@vertz/ui';
import { issueApi, projectApi } from '../api/client';
import { PrioritySelect } from '../components/priority-select';
import { StatusSelect } from '../components/status-select';
import type { IssuePriority, IssueStatus } from '../lib/types';

const styles = css({
  container: ['p:6'],
  loading: ['text:sm', 'text:muted-foreground', 'py:8'],
  error: ['text:sm', 'text:destructive', 'py:8'],
  layout: ['flex', 'gap:8'],
  main: ['flex-1'],
  identifier: ['text:sm', 'text:muted-foreground', 'font:mono', 'mb:2'],
  title: ['font:xl', 'font:bold', 'text:foreground', 'mb:4'],
  description: ['text:sm', 'text:foreground', 'leading:relaxed'],
  noDescription: ['text:sm', 'text:muted-foreground', 'italic'],
  sidebar: ['w:56', 'shrink:0', 'flex', 'flex-col', 'gap:4'],
  meta: ['text:xs', 'text:muted-foreground', 'mt:6'],
});

export function IssueDetailPage() {
  const { projectId, issueId } = useParams<'/projects/:projectId/issues/:issueId'>();
  const issue = query(issueApi.get(issueId));
  const project = query(projectApi.get(projectId));

  let updateError = '';

  const handleStatusChange = async (status: IssueStatus) => {
    const res = await issueApi.update(issueId, { status });
    if (!res.ok) {
      updateError = 'Failed to update status';
      return;
    }
    updateError = '';
    issue.refetch();
  };

  const handlePriorityChange = async (priority: IssuePriority) => {
    const res = await issueApi.update(issueId, { priority });
    if (!res.ok) {
      updateError = 'Failed to update priority';
      return;
    }
    updateError = '';
    issue.refetch();
  };

  return (
    <div class={styles.container}>
      {issue.loading && <div class={styles.loading}>Loading issue...</div>}

      {issue.error && <div class={styles.error}>Failed to load issue. Please try again.</div>}

      {updateError && <div class={styles.error}>{updateError}</div>}

      {issue.data && (
        <div class={styles.layout}>
          <div class={styles.main}>
            <div class={styles.identifier}>
              {`${project.data?.key ?? '...'}-${issue.data.number}`}
            </div>
            <h2 class={styles.title}>{issue.data.title}</h2>
            {issue.data.description ? (
              <p class={styles.description}>{issue.data.description}</p>
            ) : (
              <p class={styles.noDescription}>No description provided.</p>
            )}
            <div class={styles.meta}>
              {`Created ${new Date(issue.data.createdAt).toLocaleDateString()}`}
            </div>
          </div>

          <aside class={styles.sidebar}>
            <StatusSelect value={issue.data.status} onChange={handleStatusChange} />
            <PrioritySelect value={issue.data.priority} onChange={handlePriorityChange} />
          </aside>
        </div>
      )}
    </div>
  );
}
