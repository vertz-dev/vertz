import { css, query, useDialogStack, useParams } from '@vertz/ui';
import { api } from '../api/client';
import { Button } from '../components/button';
import { CreateIssueDialog } from '../components/create-issue-dialog';
import { StatusColumn } from '../components/status-column';
import { ViewToggle } from '../components/view-toggle';
import { STATUSES } from '../lib/issue-config';
import type { Issue, IssueStatus } from '../lib/types';

const styles = css({
  container: ['p:6'],
  header: ['flex', 'items:center', 'justify:between', 'mb:4'],
  title: ['font:lg', 'font:semibold', 'text:foreground'],
  board: ['flex', 'gap:4', 'pb:4', 'overflow-hidden'],
  loading: ['text:sm', 'text:muted-foreground', 'py:8', 'text:center'],
  error: ['text:sm', 'text:destructive', 'py:8', 'text:center'],
});

export function ProjectBoardPage() {
  const { projectId } = useParams<'/projects/:projectId'>();
  const issues = query(api.issues.list({ projectId }));
  const project = query(api.projects.get(projectId));
  const stack = useDialogStack();

  // Group issues by status — declarative single-expression for compiler reactivity.
  // collectDeps() walks into the .map() callback body and finds issues.data,
  // so the compiler correctly classifies `columns` as computed.
  const columns: { status: IssueStatus; label: string; items: Issue[] }[] = STATUSES.map((s) => ({
    status: s.value,
    label: s.label,
    items: (issues.data?.items.filter((i) => i.status === s.value) ?? []) as Issue[],
  }));

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
        <h2 class={styles.title}>Board</h2>
        <Button intent="primary" size="sm" onClick={handleNewIssue}>
          New Issue
        </Button>
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
    </div>
  );
}
