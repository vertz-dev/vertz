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
import type { Issue, IssueLabel, IssueStatus, Label } from '../lib/types';

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
  const issues = query(api.issues.list({ projectId }));
  const project = query(api.projects.get(projectId));
  const labelsQuery = query(api.labels.list({ projectId }));
  const issueLabelsQuery = query(api.issueLabels.list());
  const stack = useDialogStack();

  let selectedLabelIds: string[] = [];

  // Filter issues by selected labels, then group by status
  const columns: { status: IssueStatus; label: string; items: Issue[] }[] = STATUSES.map((s) => {
    let items = (issues.data?.items.filter((i) => i.status === s.value) ?? []) as Issue[];
    if (selectedLabelIds.length > 0) {
      const allIssueLabels = (issueLabelsQuery.data?.items ?? []) as IssueLabel[];
      items = items.filter((issue) => {
        const issueLabelIds = allIssueLabels
          .filter((il) => il.issueId === issue.id)
          .map((il) => il.labelId);
        return selectedLabelIds.some((id) => issueLabelIds.includes(id));
      });
    }
    return { status: s.value, label: s.label, items };
  });

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
              allLabels={(labelsQuery.data?.items ?? []) as Label[]}
              issueLabels={(issueLabelsQuery.data?.items ?? []) as IssueLabel[]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
