/**
 * TaskCard component — displays a single task in the list view.
 *
 * Demonstrates:
 * - JSX for declarative DOM construction
 * - css() for scoped styling
 * - variants() for priority badges
 */

import { badge, cardStyles } from '../styles/components';
import type { Task, TaskPriority, TaskStatus } from '../lib/types';

/** Map priority to badge color. */
function priorityColor(priority: TaskPriority): 'blue' | 'green' | 'yellow' | 'red' {
  const map: Record<TaskPriority, 'blue' | 'green' | 'yellow' | 'red'> = {
    low: 'blue',
    medium: 'yellow',
    high: 'red',
    urgent: 'red',
  };
  return map[priority];
}

/** Map status to display label. */
function statusLabel(status: TaskStatus): string {
  const map: Record<TaskStatus, string> = {
    'todo': 'To Do',
    'in-progress': 'In Progress',
    'done': 'Done',
  };
  return map[status];
}

/** Map status to badge color. */
function statusColor(status: TaskStatus): 'gray' | 'blue' | 'green' {
  const map: Record<TaskStatus, 'gray' | 'blue' | 'green'> = {
    'todo': 'gray',
    'in-progress': 'blue',
    'done': 'green',
  };
  return map[status];
}

export interface TaskCardProps {
  task: Task;
  onClick: (id: string) => void;
}

/**
 * Render a task card.
 *
 * Returns an HTMLElement that acts as a clickable card linking to the task detail.
 */
export function TaskCard(props: TaskCardProps): HTMLElement {
  const { task, onClick } = props;

  return (
    <article
      class={cardStyles.classNames.card}
      data-testid={`task-card-${task.id}`}
      role="button"
      tabindex="0"
      onClick={() => onClick(task.id)}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(task.id);
        }
      }}
    >
      <div class={cardStyles.classNames.cardHeader}>
        <h3 class={cardStyles.classNames.cardTitle}>{task.title}</h3>
        <span class={badge({ color: priorityColor(task.priority) })}>{task.priority}</span>
      </div>
      <p class={cardStyles.classNames.cardBody}>
        {task.description.length > 120 ? `${task.description.slice(0, 120)}...` : task.description}
      </p>
      <div class={cardStyles.classNames.cardFooter}>
        <span class={badge({ color: statusColor(task.status) })}>{statusLabel(task.status)}</span>
        <span style="font-size: 0.75rem; color: var(--color-muted)">
          {new Date(task.updatedAt).toLocaleDateString()}
        </span>
      </div>
    </article>
  ) as HTMLElement;
}
