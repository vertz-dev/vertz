import { css, Link } from '@vertz/ui';

const styles = css({
  container: ['flex', 'gap:1', 'mb:4'],
  tab: ['px:3', 'py:1', 'text:sm', 'rounded:md', 'text:muted-foreground', 'cursor:pointer'],
  activeTab: [
    'px:3',
    'py:1',
    'text:sm',
    'rounded:md',
    'bg:muted',
    'text:foreground',
    'font:medium',
    'cursor:pointer',
  ],
});

interface ViewToggleProps {
  projectId: string;
}

export function ViewToggle({ projectId }: ViewToggleProps) {
  return (
    <div class={styles.container}>
      <Link href={`/projects/${projectId}`} className={styles.tab} activeClass={styles.activeTab}>
        List
      </Link>
      <Link
        href={`/projects/${projectId}/board`}
        className={styles.tab}
        activeClass={styles.activeTab}
      >
        Board
      </Link>
    </div>
  );
}
