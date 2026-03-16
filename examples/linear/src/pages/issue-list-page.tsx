import { css, Link, query, useDialogStack, useParams } from '@vertz/ui';
import { api } from '../api/client';
import { Button } from '../components/button';
import { CreateIssueDialog } from '../components/create-issue-dialog';
import { IssueRow } from '../components/issue-row';
import { IssueListSkeleton } from '../components/loading-skeleton';
import { StatusFilter } from '../components/status-filter';
import { ViewToggle } from '../components/view-toggle';
import type { Issue } from '../lib/types';
import { emptyStateStyles } from '../styles/components';

const styles = css({
  container: ['p:6'],
  header: ['flex', 'items:center', 'justify:between', 'mb:4'],
  title: ['font:lg', 'font:semibold', 'text:foreground'],
  list: ['border:1', 'border:border', 'rounded:lg', 'overflow-hidden'],
  error: ['text:sm', 'text:destructive', 'py:8', 'text:center'],
});

export function IssueListPage() {
  const { projectId } = useParams<'/projects/:projectId'>();
  const issues = query(api.issues.list({ projectId }));
  const project = query(api.projects.get(projectId));
  const stack = useDialogStack();

  let statusFilter = 'all';

  const filtered =
    statusFilter === 'all'
      ? issues.data?.items
      : issues.data?.items.filter((i) => i.status === statusFilter);

  const handleNewIssue = async () => {
    try {
      const created = await stack.open(CreateIssueDialog, { projectId });
      if (created) issues.refetch();
    } catch {
      // Dialog dismissed — no action needed
    }
  };

  return (
    <div className={styles.container}>
      <ViewToggle projectId={projectId} />
      <header className={styles.header}>
        <h2 className={styles.title}>Issues</h2>
        <Button intent="primary" size="sm" onClick={handleNewIssue}>
          New Issue
        </Button>
      </header>

      <StatusFilter
        value={statusFilter}
        onChange={(v) => {
          statusFilter = v;
        }}
      />

      {issues.loading && <IssueListSkeleton />}
      {issues.error && (
        <div className={styles.error}>Failed to load issues: {issues.error.message}</div>
      )}

      {!issues.loading && !issues.error && issues.data?.items.length === 0 && (
        <div className={emptyStateStyles.container} data-testid="issues-empty">
          <h3 className={emptyStateStyles.title}>No issues yet</h3>
          <p className={emptyStateStyles.description}>Create your first issue to get started.</p>
        </div>
      )}

      {!issues.loading &&
        !issues.error &&
        filtered &&
        filtered.length === 0 &&
        issues.data?.items.length !== 0 && (
          <div className={emptyStateStyles.container} data-testid="filter-empty">
            <p className={emptyStateStyles.description}>No issues match the selected filter.</p>
          </div>
        )}

      {filtered && filtered.length > 0 && (
        <div className={styles.list}>
          {filtered.map((issue) => (
            <Link href={`/projects/${projectId}/issues/${issue.id}`} key={issue.id}>
              <IssueRow issue={issue as Issue} projectKey={project.data?.key} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
