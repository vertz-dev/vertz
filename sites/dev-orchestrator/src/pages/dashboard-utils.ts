export type StatusFilter = 'all' | 'running' | 'completed' | 'failed' | 'cancelled';

export const STATUS_FILTERS: readonly StatusFilter[] = ['all', 'running', 'completed', 'failed', 'cancelled'];

export function filterLabel(filter: StatusFilter): string {
  switch (filter) {
    case 'all': return 'All';
    case 'running': return 'Running';
    case 'completed': return 'Completed';
    case 'failed': return 'Failed';
    case 'cancelled': return 'Cancelled';
  }
}
