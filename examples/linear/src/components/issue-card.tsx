import { css } from '@vertz/ui';
import { PRIORITIES, PRIORITY_CONFIG, STATUSES } from '../lib/issue-config';
import type { Issue, IssuePriority, IssueStatus } from '../lib/types';

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
  inlineSelect: [
    'text:xs',
    'bg:transparent',
    'border:0',
    'cursor:pointer',
    'text:muted-foreground',
    'outline:none',
    'p:0',
  ],
  priority: ['text:xs', 'font:medium'],
});

interface IssueCardProps {
  issue: Issue;
  projectKey?: string;
  onStatusChange?: (issueId: string, status: IssueStatus) => void;
  onPriorityChange?: (issueId: string, priority: IssuePriority) => void;
}

export function IssueCard({ issue, projectKey, onStatusChange, onPriorityChange }: IssueCardProps) {
  const identifier = projectKey ? `${projectKey}-${issue.number}` : `#${issue.number}`;

  const stopPropagation = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <div className={styles.card}>
      <div className={styles.identifier}>{identifier}</div>
      <div className={styles.title}>{issue.title}</div>
      <div className={styles.meta}>
        {onStatusChange ? (
          <select
            className={styles.inlineSelect}
            value={issue.status}
            onClick={stopPropagation}
            onChange={(e: Event) => {
              e.stopPropagation();
              onStatusChange(issue.id, (e.target as HTMLSelectElement).value as IssueStatus);
            }}
          >
            {STATUSES.map((s) => (
              <option value={s.value} key={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        ) : null}
        {onPriorityChange ? (
          <select
            className={styles.inlineSelect}
            value={issue.priority}
            onClick={stopPropagation}
            onChange={(e: Event) => {
              e.stopPropagation();
              onPriorityChange(issue.id, (e.target as HTMLSelectElement).value as IssuePriority);
            }}
            style={
              issue.priority !== 'none' && PRIORITY_CONFIG[issue.priority]
                ? `color: ${PRIORITY_CONFIG[issue.priority].color}`
                : ''
            }
          >
            {PRIORITIES.map((p) => (
              <option value={p.value} key={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        ) : (
          issue.priority !== 'none' &&
          PRIORITY_CONFIG[issue.priority] && (
            <span
              className={styles.priority}
              style={`color: ${PRIORITY_CONFIG[issue.priority].color}`}
            >
              {PRIORITY_CONFIG[issue.priority].label}
            </span>
          )
        )}
      </div>
    </div>
  );
}
