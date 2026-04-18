import { css, token } from '@vertz/ui';

const styles = css({
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: token.spacing[1],
    paddingInline: token.spacing['1.5'],
    paddingBlock: token.spacing['0.5'],
    borderRadius: token.radius.full,
    fontSize: token.font.size.xs,
    backgroundColor: token.color.muted,
    color: token.color.foreground,
  },
  dot: {
    width: token.spacing[2],
    height: token.spacing[2],
    borderRadius: token.radius.full,
    flexShrink: '0',
  },
});

interface LabelBadgeProps {
  name: string;
  color: string;
}

export function LabelBadge({ name, color }: LabelBadgeProps) {
  return (
    <span className={styles.badge} data-testid="label-badge">
      <span className={styles.dot} style={{ backgroundColor: color }} />
      {name}
    </span>
  );
}
