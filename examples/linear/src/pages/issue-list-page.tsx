import { css, Link, query, useDialogStack, useParams } from '@vertz/ui';
import { issueApi, projectApi } from '../api/client';
import { Button } from '../components/button';
import { CreateIssueDialog } from '../components/create-issue-dialog';
import { IssueRow } from '../components/issue-row';
import { StatusFilter } from '../components/status-filter';
import { ViewToggle } from '../components/view-toggle';
import { emptyStateStyles } from '../styles/components';

const styles = css({
  container: ['p:6'],
  header: ['flex', 'items:center', 'justify:between', 'mb:4'],
  title: ['font:lg', 'font:semibold', 'text:foreground'],
  list: ['border:1', 'border:border', 'rounded:lg', 'overflow-hidden'],
  loading: ['text:sm', 'text:muted-foreground', 'py:8', 'text:center'],
});

export function IssueListPage() {
  const { projectId } = useParams<'/projects/:projectId'>();
  const issues = query(issueApi.list(projectId));
  const project = query(projectApi.get(projectId));
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
    <div class={styles.container}>
      <ViewToggle projectId={projectId} />
      <header class={styles.header}>
        <h2 class={styles.title}>Issues</h2>
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

      {issues.loading && <div class={styles.loading}>Loading issues...</div>}

      {!issues.loading && issues.data?.items.length === 0 && (
        <div class={emptyStateStyles.container}>
          <h3 class={emptyStateStyles.title}>No issues yet</h3>
          <p class={emptyStateStyles.description}>Create your first issue to get started.</p>
        </div>
      )}

      {!issues.loading && filtered && filtered.length === 0 && issues.data?.items.length !== 0 && (
        <div class={emptyStateStyles.container}>
          <p class={emptyStateStyles.description}>No issues match the selected filter.</p>
        </div>
      )}

      {filtered && filtered.length > 0 && (
        <div class={styles.list}>
          {filtered.map((issue) => (
            <Link href={`/projects/${projectId}/issues/${issue.id}`} key={issue.id}>
              <IssueRow issue={issue} projectKey={project.data?.key} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
