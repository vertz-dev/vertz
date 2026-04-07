import type { StepCardProps } from './step-card-types';
import { badgeLabel, formatDuration } from './step-card-utils';

export type { StepCardProps } from './step-card-types';
export { badgeLabel, formatDuration } from './step-card-utils';

const styles = {
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    borderLeft: '3px solid var(--color-border)',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  cardActive: {
    borderLeftColor: 'var(--color-primary)',
    background: 'var(--color-accent)',
  },
  cardCompleted: {
    borderLeftColor: 'hsl(142, 76%, 36%)',
  },
  cardFailed: {
    borderLeftColor: 'hsl(0, 84%, 60%)',
  },
  name: {
    fontSize: '13px',
    fontWeight: '500' as const,
    color: 'var(--color-foreground)',
    flex: '1',
  },
  agent: {
    fontSize: '11px',
    color: 'var(--color-muted-foreground)',
  },
  badge: {
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '9999px',
    fontWeight: '500' as const,
  },
  badgePending: {
    background: 'var(--color-secondary)',
    color: 'var(--color-secondary-foreground)',
  },
  badgeActive: {
    background: 'hsl(217, 91%, 60%)',
    color: 'white',
  },
  badgeCompleted: {
    background: 'hsl(142, 76%, 36%)',
    color: 'white',
  },
  badgeFailed: {
    background: 'hsl(0, 84%, 60%)',
    color: 'white',
  },
  meta: {
    fontSize: '11px',
    color: 'var(--color-muted-foreground)',
    display: 'flex',
    gap: '8px',
  },
};

export default function StepCard({ name, status, agent, detail, onClick }: StepCardProps) {
  const cardStyle = {
    ...styles.card,
    ...(status === 'active' ? styles.cardActive : {}),
    ...(status === 'completed' ? styles.cardCompleted : {}),
    ...(status === 'failed' ? styles.cardFailed : {}),
  };

  const badgeStyle = {
    ...styles.badge,
    ...(status === 'pending' ? styles.badgePending : {}),
    ...(status === 'active' ? styles.badgeActive : {}),
    ...(status === 'completed' ? styles.badgeCompleted : {}),
    ...(status === 'failed' ? styles.badgeFailed : {}),
  };

  return (
    <div style={cardStyle} onClick={onClick} role="button" tabIndex={0}>
      <div style={{ flex: '1' }}>
        <div style={styles.name}>{name}</div>
        {agent && <div style={styles.agent}>{agent}</div>}
        {detail && (detail.iterations || detail.duration) && (
          <div style={styles.meta}>
            {detail.iterations && <span>{detail.iterations} iterations</span>}
            {detail.duration !== undefined && <span>{formatDuration(detail.duration)}</span>}
          </div>
        )}
      </div>
      <span style={badgeStyle}>{badgeLabel(status)}</span>
    </div>
  );
}
