import { css } from '@vertz/ui';
import { PRIORITY_CONFIG } from '../lib/issue-config';
import type { Issue } from '../lib/types';

const styles = css({
  card: ['bg:card', 'border:1', 'border:border', 'rounded:md', 'p:3', 'cursor:pointer'],
  identifier: ['text:xs', 'text:muted-foreground', 'font:mono', 'mb:1'],
  title: ['text:sm', 'text:foreground', 'font:medium'],
  meta: ['flex', 'items:center', 'gap:2', 'mt:2'],
  priority: ['text:xs', 'font:medium'],
});

interface IssueCardProps {
  issue: Issue;
  projectKey?: string;
}

export function IssueCard({ issue, projectKey }: IssueCardProps) {
  const identifier = projectKey ? `${projectKey}-${issue.number}` : `#${issue.number}`;

  return (
    <div class={styles.card}>
      <div class={styles.identifier}>{identifier}</div>
      <div class={styles.title}>{issue.title}</div>
      {issue.priority !== 'none' && PRIORITY_CONFIG[issue.priority] && (
        <div class={styles.meta}>
          <span class={styles.priority} style={`color: ${PRIORITY_CONFIG[issue.priority].color}`}>
            {PRIORITY_CONFIG[issue.priority].label}
          </span>
        </div>
      )}
    </div>
  );
}
