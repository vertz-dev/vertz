interface PriorityIconProps {
  priority: 0 | 1 | 2 | 3 | 4;
}

const PRIORITY_LABELS: Record<number, string> = {
  0: 'No Priority',
  1: 'Urgent',
  2: 'High',
  3: 'Medium',
  4: 'Low',
};

const PRIORITY_COLORS: Record<number, string> = {
  0: '#94a3b8',
  1: '#ef4444',
  2: '#f97316',
  3: '#eab308',
  4: '#3b82f6',
};

export function PriorityIcon({ priority }: PriorityIconProps) {
  const label = PRIORITY_LABELS[priority] || 'Unknown';
  const color = PRIORITY_COLORS[priority] || '#94a3b8';

  return (
    <span
      class="priority-icon"
      title={label}
      style={{ color }}
      aria-label={`Priority: ${label}`}
    >
      {priority === 1 ? '!!!' : priority === 0 ? '---' : '!'.repeat(4 - priority)}
    </span>
  );
}
