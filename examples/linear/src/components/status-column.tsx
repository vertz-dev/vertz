import { css, Link } from '@vertz/ui';
import type { Issue } from '../lib/types';
import { IssueCard } from './issue-card';

const styles = css({
  column: ['flex', 'flex-col', 'min-w:64', 'w:64', 'shrink:0'],
  columnHeader: ['flex', 'items:center', 'gap:2', 'px:2', 'py:2', 'mb:2'],
  columnTitle: ['text:xs', 'font:semibold', 'text:muted-foreground', 'uppercase', 'tracking:wide'],
  columnCount: ['text:xs', 'text:muted-foreground', 'bg:muted', 'rounded:full', 'px:2', 'py:0.5'],
  columnBody: ['flex', 'flex-col', 'gap:2', 'flex-1'],
  empty: ['text:xs', 'text:muted-foreground', 'px:2', 'py:4', 'text:center'],
});

interface StatusColumnProps {
  label: string;
  issues: Issue[];
  projectKey?: string;
  projectId: string;
}

export function StatusColumn({ label, issues, projectKey, projectId }: StatusColumnProps) {
  return (
    <div class={styles.column}>
      <div class={styles.columnHeader}>
        <span class={styles.columnTitle}>{label}</span>
        <span class={styles.columnCount}>{issues.length}</span>
      </div>
      <div class={styles.columnBody}>
        {issues.length === 0 && <div class={styles.empty}>No issues</div>}
        {issues.map((issue) => (
          <Link href={`/projects/${projectId}/issues/${issue.id}`} key={issue.id}>
            <IssueCard issue={issue} projectKey={projectKey} />
          </Link>
        ))}
      </div>
    </div>
  );
}
