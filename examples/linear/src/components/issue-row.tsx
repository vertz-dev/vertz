import { css } from '@vertz/ui';
import { PRIORITY_CONFIG, STATUS_COLORS, STATUS_LABELS } from '../lib/issue-config';
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
      <span class={`${styles.status} ${STATUS_COLORS[issue.status] ?? ''}`}>
        {STATUS_LABELS[issue.status] ?? issue.status}
      </span>
      {issue.priority !== 'none' && PRIORITY_CONFIG[issue.priority] && (
        <span class={styles.priority} style={`color: ${PRIORITY_CONFIG[issue.priority].color}`}>
          {PRIORITY_CONFIG[issue.priority].label}
        </span>
      )}
    </div>
  );
}
