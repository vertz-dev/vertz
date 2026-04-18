import { css, token } from '@vertz/ui';
import { PRIORITY_CONFIG, STATUS_COLORS, STATUS_LABELS } from '../lib/issue-config';
import type { Issue } from '../lib/types';

const styles = css({
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: token.spacing[3],
    paddingInline: token.spacing[4],
    paddingBlock: token.spacing[3],
    borderBottomWidth: '1px',
    borderColor: token.color.border,
    cursor: 'pointer',
    transition:
      'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
    '&:hover': { backgroundColor: token.color.accent },
  },
  identifier: {
    fontSize: token.font.size.xs,
    color: token.color['muted-foreground'],
    width: token.spacing[20],
    flexShrink: '0',
  },
  title: {
    fontSize: token.font.size.sm,
    color: token.color.foreground,
    flex: '1 1 0%',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
  },
  status: {
    fontSize: token.font.size.xs,
    paddingInline: token.spacing[2],
    paddingBlock: token.spacing['0.5'],
    borderRadius: token.radius.full,
    flexShrink: '0',
  },
  priority: { fontSize: token.font.size.xs, flexShrink: '0', fontWeight: token.font.weight.medium },
});

interface IssueRowProps {
  issue: Issue;
  projectKey?: string;
}

export function IssueRow({ issue, projectKey }: IssueRowProps) {
  const identifier = projectKey ? `${projectKey}-${issue.number}` : `#${issue.number}`;

  return (
    <div className={styles.row} data-testid={`issue-card-${issue.id}`}>
      <span className={styles.identifier}>{identifier}</span>
      <span className={styles.title} data-testid="issue-title">
        {issue.title}
      </span>
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
