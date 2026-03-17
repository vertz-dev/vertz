import { css } from '@vertz/ui';
import { PRIORITY_CONFIG, STATUS_COLORS, STATUS_LABELS } from '../lib/issue-config';
import type { Issue, Label } from '../lib/types';
import { LabelBadge } from './label-badge';

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
    'transition:colors',
    'hover:bg:accent',
  ],
  identifier: ['text:xs', 'text:muted-foreground', 'w:20', 'shrink-0'],
  title: ['text:sm', 'text:foreground', 'flex-1', 'overflow-hidden', 'whitespace-nowrap'],
  labels: ['flex', 'gap:1', 'shrink-0'],
  status: ['text:xs', 'px:2', 'py:0.5', 'rounded:full', 'shrink-0'],
  priority: ['text:xs', 'shrink-0', 'font:medium'],
});

interface IssueRowProps {
  issue: Issue;
  projectKey?: string;
  labels?: Label[];
}

export function IssueRow({ issue, projectKey, labels }: IssueRowProps) {
  const identifier = projectKey ? `${projectKey}-${issue.number}` : `#${issue.number}`;

  return (
    <div className={styles.row} data-testid={`issue-card-${issue.id}`}>
      <span className={styles.identifier}>{identifier}</span>
      <span className={styles.title} data-testid="issue-title">
        {issue.title}
      </span>
      {labels && labels.length > 0 && (
        <span className={styles.labels}>
          {labels.map((label) => (
            <LabelBadge key={label.id} name={label.name} color={label.color} />
          ))}
        </span>
      )}
      <span className={`${styles.status} ${STATUS_COLORS[issue.status] ?? ''}`}>
        {STATUS_LABELS[issue.status] ?? issue.status}
      </span>
      {issue.priority !== 'none' && PRIORITY_CONFIG[issue.priority] && (
        <span className={styles.priority} style={`color: ${PRIORITY_CONFIG[issue.priority].color}`}>
          {PRIORITY_CONFIG[issue.priority].label}
        </span>
      )}
    </div>
  );
}
