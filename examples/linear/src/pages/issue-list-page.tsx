import { css, Link, query, useDialogStack, useParams } from '@vertz/ui';
import { Button, EmptyState } from '@vertz/ui/components';
import { api } from '../api/client';
import { CreateIssueDialog } from '../components/create-issue-dialog';
import { IssueRow } from '../components/issue-row';
import { LabelFilter } from '../components/label-filter';
import { IssueListSkeleton } from '../components/loading-skeleton';
import { ManageLabelsDialog } from '../components/manage-labels-dialog';
import { StatusFilter } from '../components/status-filter';
import { ViewToggle } from '../components/view-toggle';
import type { Issue, Label } from '../lib/types';

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
      include: { labels: true },
    }),
  );
  const project = query(api.projects.get(projectId));
  const labelsQuery = query(
    api.labels.list({ where: { projectId }, select: { id: true, name: true, color: true } }),
  );
  const stack = useDialogStack();

  let statusFilter = 'all';
  let selectedLabelIds: string[] = [];

  const filtered = (() => {
    let items = issues.data?.items;
    if (!items) return items;
    if (statusFilter !== 'all') {
      items = items.filter((i) => i.status === statusFilter);
    }
    if (selectedLabelIds.length > 0) {
      items = items.filter((issue) => {
        const issueLabels = ((issue as Issue & { labels?: Label[] }).labels ?? []) as Label[];
        return issueLabels.some((l) => selectedLabelIds.includes(l.id));
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
        <EmptyState data-testid="issues-empty">
          <EmptyState.Title>No issues yet</EmptyState.Title>
          <EmptyState.Description>Create your first issue to get started.</EmptyState.Description>
        </EmptyState>
      )}

      {!issues.loading &&
        !issues.error &&
        filtered &&
        filtered.length === 0 &&
        issues.data?.items.length !== 0 && (
          <EmptyState data-testid="filter-empty">
            <EmptyState.Description>No issues match the selected filter.</EmptyState.Description>
          </EmptyState>
        )}

      {filtered && filtered.length > 0 && (
        <div className={styles.list}>
          {filtered.map((issue) => (
            <Link href={`/projects/${projectId}/issues/${issue.id}`} key={issue.id}>
              <IssueRow
                issue={issue as Issue}
                projectKey={project.data?.key}
                labels={((issue as Issue & { labels?: Label[] }).labels ?? []) as Label[]}
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
