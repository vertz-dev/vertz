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
  priority: ['text:xs', 'shrink:0', 'font:medium'],
});

const statusColors: Record<string, string> = {
  backlog: 'bg:muted text:muted-foreground',
  todo: 'bg:secondary text:foreground',
  in_progress: 'bg:accent text:accent-foreground',
  done: 'bg:primary text:primary-foreground',
  cancelled: 'bg:muted text:muted-foreground',
};

const statusLabels: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In Progress',
  done: 'Done',
  cancelled: 'Cancelled',
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  urgent: { label: 'Urgent', color: '#ef4444' },
  high: { label: 'High', color: '#f97316' },
  medium: { label: 'Medium', color: '#eab308' },
  low: { label: 'Low', color: '#3b82f6' },
  none: { label: '', color: '' },
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
      {issue.priority !== 'none' && priorityConfig[issue.priority] && (
        <span class={styles.priority} style={`color: ${priorityConfig[issue.priority].color}`}>
          {priorityConfig[issue.priority].label}
        </span>
      )}
    </div>
  );
}
