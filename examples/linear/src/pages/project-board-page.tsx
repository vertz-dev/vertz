import { css, query, useDialogStack, useParams } from '@vertz/ui';
import { Button } from '@vertz/ui/components';
import { api } from '../api/client';
import { CreateIssueDialog } from '../components/create-issue-dialog';
import { LabelFilter } from '../components/label-filter';
import { BoardSkeleton } from '../components/loading-skeleton';
import { ManageLabelsDialog } from '../components/manage-labels-dialog';
import { StatusColumn } from '../components/status-column';
import { ViewToggle } from '../components/view-toggle';
import { STATUSES } from '../lib/issue-config';
import type { Issue, IssueStatus, Label } from '../lib/types';

const styles = css({
  container: ['p:6'],
  header: ['flex', 'items:center', 'justify:between', 'mb:4'],
  headerActions: ['flex', 'gap:2'],
  title: ['font:lg', 'font:semibold', 'text:foreground'],
  board: ['flex', 'gap:4', 'pb:4', 'overflow-hidden'],
  error: ['text:sm', 'text:destructive', 'py:8', 'text:center'],
});

export function ProjectBoardPage() {
  const { projectId } = useParams<'/projects/:projectId'>();
  const issues = query(
    api.issues.list({
      where: { projectId },
      select: { id: true, number: true, title: true, status: true, priority: true },
      include: { labels: true },
    }),
  );
  const project = query(api.projects.get(projectId));
  const labelsQuery = query(
    api.labels.list({ where: { projectId }, select: { id: true, name: true, color: true } }),
  );
  const stack = useDialogStack();

  let selectedLabelIds: string[] = [];

  type IssueWithLabels = Issue & { labels?: Label[] };

  // Filter issues by selected labels, then group by status
  const columns: { status: IssueStatus; label: string; items: IssueWithLabels[] }[] = STATUSES.map(
    (s) => {
      let items = (issues.data?.items.filter((i) => i.status === s.value) ??
        []) as IssueWithLabels[];
      if (selectedLabelIds.length > 0) {
        items = items.filter((issue) => {
          const issueLabels = (issue.labels ?? []) as Label[];
          return issueLabels.some((l) => selectedLabelIds.includes(l.id));
        });
      }
      return { status: s.value, label: s.label, items };
    },
  );

  const handleNewIssue = async () => {
    await stack.open(CreateIssueDialog, { projectId });
  };

  const handleManageLabels = async () => {
    await stack.open(ManageLabelsDialog, { projectId });
  };

  return (
    <div className={styles.container}>
      <ViewToggle projectId={projectId} />
      <header className={styles.header}>
        <h2 className={styles.title}>Board</h2>
        <div className={styles.headerActions}>
          <Button intent="outline" size="sm" onClick={handleManageLabels}>
            Labels
          </Button>
          <Button intent="primary" size="sm" onClick={handleNewIssue}>
            New Issue
          </Button>
        </div>
      </header>

      <LabelFilter
        labels={(labelsQuery.data?.items ?? []) as Label[]}
        selected={selectedLabelIds}
        onChange={(ids) => {
          selectedLabelIds = ids;
        }}
      />

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
