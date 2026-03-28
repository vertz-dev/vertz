import { StatusBadge } from './StatusBadge';

interface TaskCardProps {
  title: string;
  status: 'todo' | 'in-progress' | 'done';
  assignee?: string;
  onStatusChange?: (status: string) => void;
}

export function TaskCard({ title, status, assignee, onStatusChange }: TaskCardProps) {
  let isExpanded = false;

  const statusLabel = status === 'in-progress' ? 'In Progress' : status;

  return (
    <div class="task-card" data-status={status}>
      <div class="task-card-header">
        <h3>{title}</h3>
        <StatusBadge status={status} />
      </div>
      <div class="task-card-body" style={{ display: isExpanded ? 'block' : 'none' }}>
        {assignee && <span class="assignee">Assigned to: {assignee}</span>}
        <button onClick={() => onStatusChange?.('done')}>
          Mark Complete
        </button>
      </div>
      <button class="expand-btn" onClick={() => { isExpanded = !isExpanded; }}>
        {isExpanded ? 'Collapse' : 'Expand'}
      </button>
    </div>
  );
}
