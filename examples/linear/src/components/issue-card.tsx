import { css, token } from '@vertz/ui';
import { PRIORITY_CONFIG } from '../lib/issue-config';
import type { Issue } from '../lib/types';

const styles = css({
  card: {
    backgroundColor: token.color.card,
    borderWidth: '1px',
    borderColor: token.color.border,
    borderRadius: token.radius.md,
    padding: token.spacing[3],
    cursor: 'pointer',
    transition:
      'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
    '&:hover': { backgroundColor: token.color.accent },
  },
  identifier: {
    fontSize: token.font.size.xs,
    color: token.color['muted-foreground'],
    marginBottom: token.spacing[1],
  },
  title: {
    fontSize: token.font.size.sm,
    color: token.color.foreground,
    fontWeight: token.font.weight.medium,
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: token.spacing[2],
    marginTop: token.spacing[2],
  },
  priority: { fontSize: token.font.size.xs, fontWeight: token.font.weight.medium },
});

interface IssueCardProps {
  issue: Issue;
  projectKey?: string;
}

export function IssueCard({ issue, projectKey }: IssueCardProps) {
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
    </div>
  );
}
