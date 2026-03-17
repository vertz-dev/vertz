import { css } from '@vertz/ui';

const styles = css({
  badge: [
    'inline-flex',
    'items:center',
    'gap:1',
    'px:1.5',
    'py:0.5',
    'rounded:full',
    'text:xs',
    'bg:muted',
    'text:foreground',
  ],
  dot: ['w:2', 'h:2', 'rounded:full', 'shrink-0'],
});

interface LabelBadgeProps {
  name: string;
  color: string;
}

export function LabelBadge({ name, color }: LabelBadgeProps) {
  return (
    <span className={styles.badge} data-testid="label-badge">
      <span className={styles.dot} style={`background-color: ${color}`} />
      {name}
    </span>
  );
}
