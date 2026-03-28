interface StatusBadgeProps {
  status: 'todo' | 'in-progress' | 'done';
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const colorMap: Record<string, string> = {
    'todo': 'badge-gray',
    'in-progress': 'badge-blue',
    'done': 'badge-green',
  };

  const className = colorMap[status] || 'badge-gray';

  return <span class={`status-badge ${className}`}>{status}</span>;
}
