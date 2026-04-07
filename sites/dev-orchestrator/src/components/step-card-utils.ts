import type { StepCardProps } from './step-card-types';

export function badgeLabel(status: StepCardProps['status']): string {
  switch (status) {
    case 'pending': return 'pending';
    case 'active': return 'running';
    case 'completed': return 'done';
    case 'failed': return 'failed';
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
