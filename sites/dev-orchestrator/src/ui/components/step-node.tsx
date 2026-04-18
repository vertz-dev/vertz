import { css, token } from '@vertz/ui';
import { statusBadge, statusBadgeColor } from './live-overlay-utils';
import type { StepNodeProps } from './step-node-utils';
import { stepNodeBackground, stepNodeBorderColor } from './step-node-utils';

export type { StepNodeProps } from './step-node-utils';

const s = css({
  node: {
    display: 'flex',
    alignItems: 'center',
    gap: token.spacing[2],
    borderRadius: token.radius.lg,
    position: 'relative',
    cursor: 'pointer',
    transition: 'border-color 0.15s, background 0.15s',
    '&': { padding: '10px 14px', border: '2px solid', minWidth: '140px' },
  },
  name: {
    fontSize: token.font.size.sm,
    fontWeight: token.font.weight.semibold,
    color: token.color.foreground,
  },
  agent: { fontSize: token.font.size.xs, color: token.color['muted-foreground'] },
  icon: { textAlign: 'center', '&': { fontSize: '16px', width: '20px' } },
  badge: {
    position: 'absolute',
    display: 'flex',
    alignItems: 'center',
    fontWeight: token.font.weight.bold,
    '&': {
      top: '-6px',
      right: '-6px',
      width: '18px',
      height: '18px',
      borderRadius: '50%',
      justifyContent: 'center',
      fontSize: '11px',
      color: 'white',
    },
  },
});

export default function StepNode({ name, type, agent, selected, status, onClick }: StepNodeProps) {
  const dynamicStyle = {
    ...(type === 'approval' ? { borderStyle: 'dashed' } : {}),
    borderColor: stepNodeBorderColor(status, selected),
    background: stepNodeBackground(status, selected),
    ...(status === 'active' ? { boxShadow: '0 0 0 3px hsla(217, 91%, 60%, 0.2)' } : {}),
  };

  const badge = status ? statusBadge(status) : '';
  const badgeColor = status ? statusBadgeColor(status) : 'transparent';

  return (
    <div
      className={s.node}
      style={dynamicStyle}
      onClick={onClick}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <span className={s.icon}>{type === 'approval' ? '\u23F8' : '\u25B6'}</span>
      <div>
        <div className={s.name}>{name}</div>
        {agent && <div className={s.agent}>{agent}</div>}
      </div>
      {badge && (
        <span className={s.badge} style={{ background: badgeColor }}>
          {badge}
        </span>
      )}
    </div>
  );
}
