import { css } from '@vertz/ui';
import { PRIORITY_CONFIG } from '../lib/issue-config';
import type { Issue, Label } from '../lib/types';
import { LabelBadge } from './label-badge';

const styles = css({
  card: [
    'bg:card',
    'border:1',
    'border:border',
    'rounded:md',
    'p:3',
    'cursor:pointer',
    'transition:colors',
    'hover:bg:accent',
  ],
  identifier: ['text:xs', 'text:muted-foreground', 'mb:1'],
  title: ['text:sm', 'text:foreground', 'font:medium'],
  meta: ['flex', 'items:center', 'gap:2', 'mt:2'],
  priority: ['text:xs', 'font:medium'],
  labels: ['flex', 'flex-wrap', 'gap:1', 'mt:2'],
});

interface IssueCardProps {
  issue: Issue;
  projectKey?: string;
  labels?: Label[];
}

export function IssueCard({ issue, projectKey, labels }: IssueCardProps) {
  const identifier = projectKey ? `${projectKey}-${issue.number}` : `#${issue.number}`;

  return (
    <div className={styles.card} data-testid={`issue-card-${issue.id}`}>
      <div className={styles.identifier}>{identifier}</div>
      <div className={styles.title} data-testid="issue-title">
        {issue.title}
      </div>
      {issue.priority !== 'none' && PRIORITY_CONFIG[issue.priority] && (
        <div className={styles.meta}>
          <span
            className={styles.priority}
            style={`color: ${PRIORITY_CONFIG[issue.priority].color}`}
          >
            {PRIORITY_CONFIG[issue.priority].label}
          </span>
        </div>
      )}
      {labels && labels.length > 0 && (
        <div className={styles.labels}>
          {labels.map((label) => (
            <LabelBadge key={label.id} name={label.name} color={label.color} />
          ))}
        </div>
      )}
    </div>
  );
}
