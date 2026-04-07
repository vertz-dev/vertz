import type { StepNodeProps } from './step-node-utils';
import { stepNodeBackground, stepNodeBorderColor } from './step-node-utils';

export type { StepNodeProps } from './step-node-utils';

const styles = {
  node: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 14px',
    borderRadius: '8px',
    border: '2px solid',
    cursor: 'pointer',
    transition: 'border-color 0.15s, background 0.15s',
    minWidth: '140px',
  },
  approval: {
    borderStyle: 'dashed',
  },
  name: {
    fontSize: '13px',
    fontWeight: '600' as const,
    color: 'var(--color-foreground)',
  },
  agent: {
    fontSize: '11px',
    color: 'var(--color-muted-foreground)',
  },
  icon: {
    fontSize: '16px',
    width: '20px',
    textAlign: 'center' as const,
  },
};

export default function StepNode({ name, type, agent, selected, status, onClick }: StepNodeProps) {
  const nodeStyle = {
    ...styles.node,
    ...(type === 'approval' ? styles.approval : {}),
    borderColor: stepNodeBorderColor(status, selected),
    background: stepNodeBackground(status, selected),
  };

  return (
    <div
      style={nodeStyle}
      onClick={onClick}
      onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}
      role="button"
      tabIndex={0}
    >
      <span style={styles.icon}>{type === 'approval' ? '\u23F8' : '\u25B6'}</span>
      <div>
        <div style={styles.name}>{name}</div>
        {agent && <div style={styles.agent}>{agent}</div>}
      </div>
    </div>
  );
}
