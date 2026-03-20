import { css, Link, query, useDialogStack, useParams } from '@vertz/ui';
import { Button } from '@vertz/ui/components';
import { api } from '../api/client';
import { CreateIssueDialog } from '../components/create-issue-dialog';
import { IssueRow } from '../components/issue-row';
import { LabelFilter } from '../components/label-filter';
import { IssueListSkeleton } from '../components/loading-skeleton';
import { ManageLabelsDialog } from '../components/manage-labels-dialog';
import { StatusFilter } from '../components/status-filter';
import { ViewToggle } from '../components/view-toggle';
import type { Issue, IssueLabel, Label } from '../lib/types';
import { emptyStateStyles } from '../styles/components';

const styles = css({
  container: ['p:6'],
  header: ['flex', 'items:center', 'justify:between', 'mb:4'],
  headerActions: ['flex', 'gap:2'],
  title: ['font:lg', 'font:semibold', 'text:foreground'],
  list: ['border:1', 'border:border', 'rounded:lg', 'overflow-hidden'],
  error: ['text:sm', 'text:destructive', 'py:8', 'text:center'],
});

export function IssueListPage() {
  const { projectId } = useParams<'/projects/:projectId'>();
  const issues = query(
    api.issues.list({
      where: { projectId },
      select: { id: true, number: true, title: true, status: true, priority: true },
    }),
  );
  const project = query(api.projects.get(projectId));
  const labelsQuery = query(
    api.labels.list({ where: { projectId }, select: { id: true, name: true, color: true } }),
  );
  const issueLabelsQuery = query(
    api.issueLabels.list({ select: { id: true, issueId: true, labelId: true } }),
  );
  const stack = useDialogStack();

  let statusFilter = 'all';
  let selectedLabelIds: string[] = [];

  const getLabelsForIssue = (issueId: string): Label[] => {
    const allLabels = (labelsQuery.data?.items ?? []) as Label[];
    const allIssueLabels = (issueLabelsQuery.data?.items ?? []) as IssueLabel[];
    const labelIds = allIssueLabels.filter((il) => il.issueId === issueId).map((il) => il.labelId);
    return allLabels.filter((l) => labelIds.includes(l.id));
  };

  const filtered = (() => {
    let items = issues.data?.items;
    if (!items) return items;
    if (statusFilter !== 'all') {
      items = items.filter((i) => i.status === statusFilter);
    }
    if (selectedLabelIds.length > 0) {
      const allIssueLabels = (issueLabelsQuery.data?.items ?? []) as IssueLabel[];
      items = items.filter((issue) => {
        const issueLabelIds = allIssueLabels
          .filter((il) => il.issueId === issue.id)
          .map((il) => il.labelId);
        return selectedLabelIds.some((id) => issueLabelIds.includes(id));
      });
    }
    return items;
  })();

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
        <h2 className={styles.title}>Issues</h2>
        <div className={styles.headerActions}>
          <Button intent="outline" size="sm" onClick={handleManageLabels}>
            Labels
          </Button>
          <Button intent="primary" size="sm" onClick={handleNewIssue}>
            New Issue
          </Button>
        </div>
      </header>

      <StatusFilter
        value={statusFilter}
        onChange={(v) => {
          statusFilter = v;
        }}
      />

      <LabelFilter
        labels={(labelsQuery.data?.items ?? []) as Label[]}
        selected={selectedLabelIds}
        onChange={(ids) => {
          selectedLabelIds = ids;
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
              <IssueRow
                issue={issue as Issue}
                projectKey={project.data?.key}
                labels={getLabelsForIssue(issue.id)}
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
