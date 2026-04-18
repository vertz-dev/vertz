import { css, query, token, useDialogStack, useParams } from '@vertz/ui';
import { api } from '../api/client';
import { Button } from '../components/button';
import { CreateIssueDialog } from '../components/create-issue-dialog';
import { BoardSkeleton } from '../components/loading-skeleton';
import { StatusColumn } from '../components/status-column';
import { ViewToggle } from '../components/view-toggle';
import { STATUSES } from '../lib/issue-config';
import type { Issue, IssueStatus } from '../lib/types';

const styles = css({
  container: { padding: token.spacing[6] },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: token.spacing[4],
  },
  title: {
    fontSize: token.font.size.lg,
    fontWeight: token.font.weight.semibold,
    color: token.color.foreground,
  },
  board: {
    display: 'flex',
    gap: token.spacing[4],
    paddingBottom: token.spacing[4],
    overflow: 'hidden',
  },
  error: {
    fontSize: token.font.size.sm,
    color: token.color.destructive,
    paddingBlock: token.spacing[8],
    textAlign: 'center',
  },
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
    <div className={styles.container}>
      <ViewToggle projectId={projectId} />
      <header className={styles.header}>
        <h2 className={styles.title}>Board</h2>
        <Button intent="primary" size="sm" onClick={handleNewIssue}>
          New Issue
        </Button>
      </header>

      {issues.loading && <BoardSkeleton />}
      {issues.error && (
        <div className={styles.error}>Failed to load issues: {issues.error.message}</div>
      )}

      {!issues.loading && !issues.error && (
        <div className={styles.board} data-testid="board">
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
