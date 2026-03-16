import { css, query, useDialogStack, useParams } from '@vertz/ui';
import { api } from '../api/client';
import { Button } from '../components/button';
import { CreateIssueDialog } from '../components/create-issue-dialog';
import { StatusColumn } from '../components/status-column';
import { ViewToggle } from '../components/view-toggle';
import { STATUSES } from '../lib/issue-config';
import type { Issue, IssuePriority, IssueStatus } from '../lib/types';

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

  // Optimistic overrides for immediate column movement on status change.
  // Reassigning the whole object triggers reactivity via compiler signal transform.
  let optimisticStatuses: Record<string, IssueStatus> = {};
  let optimisticPriorities: Record<string, IssuePriority> = {};

  // Group issues by status — uses optimistic overrides for immediate column movement.
  // collectDeps() walks into the .map() callback body and finds issues.data,
  // optimisticStatuses, and optimisticPriorities, so the compiler correctly
  // classifies `columns` as computed.
  const columns: { status: IssueStatus; label: string; items: Issue[] }[] = STATUSES.map((s) => ({
    status: s.value,
    label: s.label,
    items: (issues.data?.items
      .filter((i) => (optimisticStatuses[i.id] ?? i.status) === s.value)
      .map((i) => ({
        ...i,
        status: (optimisticStatuses[i.id] ?? i.status) as Issue['status'],
        priority: (optimisticPriorities[i.id] ?? i.priority) as Issue['priority'],
      })) ?? []) as Issue[],
  }));

  const handleStatusChange = async (issueId: string, status: IssueStatus) => {
    // Apply optimistic override — card moves to new column immediately
    optimisticStatuses = { ...optimisticStatuses, [issueId]: status };

    const res = await api.issues.update(issueId, { status });

    // Clear optimistic override — let query data take over
    const next = { ...optimisticStatuses };
    delete next[issueId];
    optimisticStatuses = next;

    if (!res.ok) {
      // Query data still has old value, so card reverts to original column
      return;
    }

    // MutationEventBus auto-triggers revalidation for entity-backed queries
  };

  const handlePriorityChange = async (issueId: string, priority: IssuePriority) => {
    optimisticPriorities = { ...optimisticPriorities, [issueId]: priority };

    const res = await api.issues.update(issueId, { priority });

    const next = { ...optimisticPriorities };
    delete next[issueId];
    optimisticPriorities = next;

    if (!res.ok) {
      return;
    }
  };

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

      {issues.loading && <div className={styles.loading}>Loading issues...</div>}
      {issues.error && (
        <div className={styles.error}>Failed to load issues: {issues.error.message}</div>
      )}

      {!issues.loading && !issues.error && (
        <div className={styles.board}>
          {columns.map((col) => (
            <StatusColumn
              key={col.status}
              label={col.label}
              issues={col.items}
              projectKey={project.data?.key}
              projectId={projectId}
              onStatusChange={handleStatusChange}
              onPriorityChange={handlePriorityChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}
