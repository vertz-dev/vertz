/**
 * TaskCard component — displays a single task in the list view.
 *
 * Demonstrates:
 * - css() for scoped styling
 * - variants() for priority badges
 * - ref() for DOM element access
 * - effect() for reactive class updates
 */

import { effect, ref } from '@vertz/ui';
import type { Ref } from '@vertz/ui';
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
  const cardRef: Ref<HTMLElement> = ref<HTMLElement>();

  // Build the card DOM
  const card = document.createElement('article');
  card.className = cardStyles.classNames.card;
  card.setAttribute('data-testid', `task-card-${task.id}`);
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  cardRef.current = card;

  // Header: title + priority badge
  const header = document.createElement('div');
  header.className = cardStyles.classNames.cardHeader;

  const title = document.createElement('h3');
  title.className = cardStyles.classNames.cardTitle;
  title.textContent = task.title;

  const priorityBadge = document.createElement('span');
  priorityBadge.className = badge({ color: priorityColor(task.priority) });
  priorityBadge.textContent = task.priority;

  header.appendChild(title);
  header.appendChild(priorityBadge);

  // Body: description
  const body = document.createElement('p');
  body.className = cardStyles.classNames.cardBody;
  body.textContent = task.description.length > 120
    ? `${task.description.slice(0, 120)}...`
    : task.description;

  // Footer: status + date
  const footer = document.createElement('div');
  footer.className = cardStyles.classNames.cardFooter;

  const statusBadge = document.createElement('span');
  statusBadge.className = badge({ color: statusColor(task.status) });
  statusBadge.textContent = statusLabel(task.status);

  const dateEl = document.createElement('span');
  dateEl.style.fontSize = '0.75rem';
  dateEl.style.color = 'var(--color-muted)';
  dateEl.textContent = new Date(task.updatedAt).toLocaleDateString();

  footer.appendChild(statusBadge);
  footer.appendChild(dateEl);

  card.appendChild(header);
  card.appendChild(body);
  card.appendChild(footer);

  // Click handler
  card.addEventListener('click', () => onClick(task.id));
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(task.id);
    }
  });

  return card;
}
