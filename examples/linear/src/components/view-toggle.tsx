import { Link, css, token } from '@vertz/ui';

const styles = css({
  container: { display: 'flex', gap: token.spacing[1], marginBottom: token.spacing[4] },
  tab: {
    paddingInline: token.spacing[3],
    paddingBlock: token.spacing[1],
    fontSize: token.font.size.sm,
    borderRadius: token.radius.md,
    color: token.color['muted-foreground'],
    cursor: 'pointer',
    transition: 'colors',
    '&:hover': { color: token.color.foreground, backgroundColor: token.color.muted },
  },
  activeTab: {
    paddingInline: token.spacing[3],
    paddingBlock: token.spacing[1],
    fontSize: token.font.size.sm,
    borderRadius: token.radius.md,
    backgroundColor: token.color.muted,
    color: token.color.foreground,
    fontWeight: token.font.weight.medium,
    cursor: 'pointer',
  },
});

interface ViewToggleProps {
  projectId: string;
}

export function ViewToggle({ projectId }: ViewToggleProps) {
  return (
    <div className={styles.container}>
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
