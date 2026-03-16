import { css } from '@vertz/ui';
import {
  PRIORITIES,
  PRIORITY_CONFIG,
  STATUS_COLORS,
  STATUS_LABELS,
  STATUSES,
} from '../lib/issue-config';
import type { Issue, IssuePriority, IssueStatus } from '../lib/types';

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
  inlineSelect: [
    'text:xs',
    'bg:transparent',
    'border:0',
    'cursor:pointer',
    'text:muted-foreground',
    'outline:none',
    'shrink-0',
    'p:0',
  ],
  status: ['text:xs', 'px:2', 'py:0.5', 'rounded:full', 'shrink-0'],
  priority: ['text:xs', 'shrink-0', 'font:medium'],
});

interface IssueRowProps {
  issue: Issue;
  projectKey?: string;
  onStatusChange?: (issueId: string, status: IssueStatus) => void;
  onPriorityChange?: (issueId: string, priority: IssuePriority) => void;
}

export function IssueRow({ issue, projectKey, onStatusChange, onPriorityChange }: IssueRowProps) {
  const identifier = projectKey ? `${projectKey}-${issue.number}` : `#${issue.number}`;

  const stopPropagation = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <div className={styles.row}>
      <span className={styles.identifier}>{identifier}</span>
      <span className={styles.title}>{issue.title}</span>
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
      ) : (
        <span className={`${styles.status} ${STATUS_COLORS[issue.status] ?? ''}`}>
          {STATUS_LABELS[issue.status] ?? issue.status}
        </span>
      )}
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
  );
}
