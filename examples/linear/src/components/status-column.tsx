import { Link, css, token } from '@vertz/ui';
import type { Issue } from '../lib/types';
import { IssueCard } from './issue-card';

const styles = css({
  column: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: token.spacing[64],
    width: token.spacing[64],
    flexShrink: '0',
  },
  columnHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: token.spacing[2],
    paddingInline: token.spacing[2],
    paddingBlock: token.spacing[2],
    marginBottom: token.spacing[2],
  },
  columnTitle: {
    fontSize: token.font.size.xs,
    fontWeight: token.font.weight.semibold,
    color: token.color['muted-foreground'],
    textTransform: 'uppercase',
    letterSpacing: 'wide',
  },
  columnCount: {
    fontSize: token.font.size.xs,
    color: token.color['muted-foreground'],
    backgroundColor: token.color.muted,
    borderRadius: token.radius.full,
    paddingInline: token.spacing[2],
    paddingBlock: token.spacing['0.5'],
  },
  columnBody: { display: 'flex', flexDirection: 'column', gap: token.spacing[2], flex: '1 1 0%' },
  empty: {
    fontSize: token.font.size.xs,
    color: token.color['muted-foreground'],
    paddingInline: token.spacing[2],
    paddingBlock: token.spacing[4],
    textAlign: 'center',
  },
});

interface StatusColumnProps {
  label: string;
  issues: Issue[];
  projectKey?: string;
  projectId: string;
}

export function StatusColumn({ label, issues, projectKey, projectId }: StatusColumnProps) {
  return (
    <div
      className={styles.column}
      data-testid={`column-${label.toLowerCase().replace(/\s+/g, '_')}`}
    >
      <div className={styles.columnHeader}>
        <span className={styles.columnTitle}>{label}</span>
        <span className={styles.columnCount}>{issues.length}</span>
      </div>
      <div className={styles.columnBody}>
        {issues.length === 0 && <div className={styles.empty}>No issues</div>}
        {issues.map((issue: Issue) => (
          <Link key={issue.id} href={`/projects/${projectId}/issues/${issue.id}`}>
            <IssueCard issue={issue} projectKey={projectKey} />
          </Link>
        ))}
      </div>
    </div>
  );
}
