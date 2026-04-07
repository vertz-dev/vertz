export interface StepNodeProps {
  readonly name: string;
  readonly type: 'agent' | 'approval';
  readonly agent?: string;
  readonly selected: boolean;
  readonly status?: 'pending' | 'active' | 'completed' | 'failed';
  readonly onClick?: () => void;
}

export function stepNodeBorderColor(status?: string, selected?: boolean): string {
  if (selected) return 'var(--color-primary)';
  switch (status) {
    case 'active': return 'hsl(217, 91%, 60%)';
    case 'completed': return 'hsl(142, 76%, 36%)';
    case 'failed': return 'hsl(0, 84%, 60%)';
    default: return 'var(--color-border)';
  }
}

export function stepNodeBackground(status?: string, selected?: boolean): string {
  if (selected) return 'var(--color-accent)';
  if (status === 'active') return 'hsl(217, 91%, 60%, 0.08)';
  return 'var(--color-card)';
}
