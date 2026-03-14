import { css } from '@vertz/ui';
import type { Issue } from '../lib/types';

const styles = css({
  row: [
    'flex',
    'items:center',
    'gap:3',
    'px:4',
    'py:3',
    'border-b:1',
    'border:border',
    'cursor:pointer',
  ],
  identifier: ['text:xs', 'text:muted-foreground', 'font:mono', 'w:20', 'shrink:0'],
  title: ['text:sm', 'text:foreground', 'flex-1', 'truncate'],
  status: ['text:xs', 'px:2', 'py:0.5', 'rounded:full', 'shrink:0'],
  priority: ['text:xs', 'text:muted-foreground', 'shrink:0'],
});

const statusColors: Record<string, string> = {
  backlog: 'bg:muted text:muted-foreground',
  todo: 'bg:primary.100 text:primary.700',
  in_progress: 'bg:warning.100 text:warning.700',
  done: 'bg:success.100 text:success.700',
  cancelled: 'bg:muted text:muted-foreground',
};

const statusLabels: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In Progress',
  done: 'Done',
  cancelled: 'Cancelled',
};

const priorityLabels: Record<string, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: '',
};

interface IssueRowProps {
  issue: Issue;
  projectKey?: string;
}

export function IssueRow({ issue, projectKey }: IssueRowProps) {
  const identifier = projectKey ? `${projectKey}-${issue.number}` : `#${issue.number}`;

  return (
    <div class={styles.row}>
      <span class={styles.identifier}>{identifier}</span>
      <span class={styles.title}>{issue.title}</span>
      <span class={`${styles.status} ${statusColors[issue.status] ?? ''}`}>
        {statusLabels[issue.status] ?? issue.status}
      </span>
      {issue.priority !== 'none' && (
        <span class={styles.priority}>{priorityLabels[issue.priority]}</span>
      )}
    </div>
  );
}
