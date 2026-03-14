import { css, Link, query, useParams } from '@vertz/ui';
import { issueApi, projectApi } from '../api/client';
import { CreateIssueDialog } from '../components/create-issue-dialog';
import { IssueRow } from '../components/issue-row';
import { StatusFilter } from '../components/status-filter';

const styles = css({
  container: ['p:6'],
  header: ['flex', 'items:center', 'justify:between', 'mb:4'],
  title: ['font:lg', 'font:semibold', 'text:foreground'],
  newBtn: [
    'px:4',
    'py:2',
    'text:sm',
    'rounded:md',
    'bg:primary.600',
    'text:white',
    'border:0',
    'cursor:pointer',
  ],
  list: ['border:1', 'border:border', 'rounded:lg', 'overflow:hidden'],
  empty: ['flex', 'flex-col', 'items:center', 'justify:center', 'py:12', 'text:center'],
  emptyTitle: ['font:md', 'font:semibold', 'text:foreground', 'mb:2'],
  emptyDescription: ['text:sm', 'text:muted-foreground'],
  loading: ['text:sm', 'text:muted-foreground', 'py:8', 'text:center'],
});

export function IssueListPage() {
  const { projectId } = useParams<'/projects/:projectId'>();
  const issues = query(issueApi.list(projectId));
  const project = query(projectApi.get(projectId));

  let statusFilter = 'all';
  let showCreateDialog = false;

  const filtered =
    statusFilter === 'all'
      ? issues.data?.items
      : issues.data?.items.filter((i) => i.status === statusFilter);

  return (
    <div class={styles.container}>
      <header class={styles.header}>
        <h2 class={styles.title}>Issues</h2>
        <button
          type="button"
          class={styles.newBtn}
          onClick={() => {
            showCreateDialog = true;
          }}
        >
          New Issue
        </button>
      </header>

      <StatusFilter
        value={statusFilter}
        onChange={(v) => {
          statusFilter = v;
        }}
      />

      {issues.loading && <div class={styles.loading}>Loading issues...</div>}

      {!issues.loading && issues.data?.items.length === 0 && (
        <div class={styles.empty}>
          <h3 class={styles.emptyTitle}>No issues yet</h3>
          <p class={styles.emptyDescription}>Create your first issue to get started.</p>
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

      {showCreateDialog && (
        <CreateIssueDialog
          projectId={projectId}
          onClose={() => {
            showCreateDialog = false;
          }}
          onSuccess={() => {
            showCreateDialog = false;
            issues.refetch();
          }}
        />
      )}
    </div>
  );
}
