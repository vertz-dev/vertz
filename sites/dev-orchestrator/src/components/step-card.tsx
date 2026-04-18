import { css, token } from '@vertz/ui';
import type { StepCardProps } from './step-card-types';
import { badgeLabel, formatDuration } from './step-card-utils';

export type { StepCardProps } from './step-card-types';
export { badgeLabel, formatDuration } from './step-card-utils';

const s = css({
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: token.spacing[3],
    paddingBlock: token.spacing[3],
    paddingInline: token.spacing[4],
    cursor: 'pointer',
    transition: 'background 0.15s',
    '&': { borderLeft: '3px solid var(--color-border)' },
  },
  content: { flex: '1 1 0%' },
  name: {
    fontSize: token.font.size.sm,
    fontWeight: token.font.weight.medium,
    color: token.color.foreground,
    flex: '1 1 0%',
  },
  agent: { fontSize: token.font.size.xs, color: token.color['muted-foreground'] },
  badge: {
    fontSize: token.font.size.xs,
    paddingInline: token.spacing[2],
    borderRadius: token.radius.full,
    fontWeight: token.font.weight.medium,
    '&': { padding: '2px 8px' },
  },
  meta: {
    fontSize: token.font.size.xs,
    color: token.color['muted-foreground'],
    display: 'flex',
    gap: token.spacing[2],
  },
});

function cardDynamicStyle(status: StepCardProps['status']) {
  if (status === 'active')
    return { borderLeftColor: 'var(--color-primary)', background: 'var(--color-accent)' };
  if (status === 'completed') return { borderLeftColor: 'hsl(142, 76%, 36%)' };
  if (status === 'failed') return { borderLeftColor: 'hsl(0, 84%, 60%)' };
  return {};
}

function badgeDynamicStyle(status: StepCardProps['status']) {
  if (status === 'pending')
    return { background: 'var(--color-secondary)', color: 'var(--color-secondary-foreground)' };
  if (status === 'active') return { background: 'hsl(217, 91%, 60%)', color: 'white' };
  if (status === 'completed') return { background: 'hsl(142, 76%, 36%)', color: 'white' };
  if (status === 'failed') return { background: 'hsl(0, 84%, 60%)', color: 'white' };
  return {};
}

export default function StepCard({ name, status, agent, detail, onClick }: StepCardProps) {
  return (
    <div
      className={s.card}
      style={cardDynamicStyle(status)}
      onClick={onClick}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') onClick?.();
      }}
      role="button"
      tabIndex={0}
    >
      <div className={s.content}>
        <div className={s.name}>{name}</div>
        {agent && <div className={s.agent}>{agent}</div>}
        {detail && (detail.iterations || detail.duration) && (
          <div className={s.meta}>
            {detail.iterations && <span>{detail.iterations} iterations</span>}
            {detail.duration !== undefined && <span>{formatDuration(detail.duration)}</span>}
          </div>
        )}
      </div>
      <span className={s.badge} style={badgeDynamicStyle(status)}>
        {badgeLabel(status)}
      </span>
    </div>
  );
}
