import { css, query, useParams } from '@vertz/ui';
import { issueApi, projectApi } from '../api/client';
import { CreateIssueDialog } from '../components/create-issue-dialog';
import { StatusColumn } from '../components/status-column';
import { ViewToggle } from '../components/view-toggle';
import { STATUSES } from '../lib/issue-config';
import type { Issue, IssueStatus } from '../lib/types';

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
  board: ['flex', 'gap:4', 'overflow-x:auto', 'pb:4'],
  loading: ['text:sm', 'text:muted-foreground', 'py:8', 'text:center'],
  error: ['text:sm', 'text:destructive', 'py:8', 'text:center'],
});

export function ProjectBoardPage() {
  const { projectId } = useParams<'/projects/:projectId'>();
  const issues = query(issueApi.list(projectId));
  const project = query(projectApi.get(projectId));

  let showCreateDialog = false;

  // Group issues by status — declarative single-expression for compiler reactivity.
  // collectDeps() walks into the .map() callback body and finds issues.data,
  // so the compiler correctly classifies `columns` as computed.
  const columns: { status: IssueStatus; label: string; items: Issue[] }[] = STATUSES.map((s) => ({
    status: s.value,
    label: s.label,
    items: issues.data?.items.filter((i) => i.status === s.value) ?? [],
  }));

  return (
    <div class={styles.container}>
      <ViewToggle projectId={projectId} />
      <header class={styles.header}>
        <h2 class={styles.title}>Board</h2>
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

      {issues.loading && <div class={styles.loading}>Loading issues...</div>}
      {issues.error && (
        <div class={styles.error}>Failed to load issues: {issues.error.message}</div>
      )}

      {!issues.loading && !issues.error && (
        <div class={styles.board}>
          {columns.map((col) => (
            <StatusColumn
              key={col.status}
              label={col.label}
              issues={col.items}
              projectKey={project.data?.key}
              projectId={projectId}
            />
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
