/**
 * TaskCard component — displays a single task in the list view.
 *
 * Demonstrates:
 * - JSX for declarative DOM construction
 * - css() for scoped styling
 * - variants() for priority badges
 */
import { badge, cardStyles } from '../styles/components';
/** Map priority to badge color. */
function priorityColor(priority) {
    const map = {
        low: 'blue',
        medium: 'yellow',
        high: 'red',
        urgent: 'red',
    };
    return map[priority];
}
/** Map status to display label. */
function statusLabel(status) {
    const map = {
        todo: 'To Do',
        'in-progress': 'In Progress',
        done: 'Done',
    };
    return map[status];
}
/** Map status to badge color. */
function statusColor(status) {
    const map = {
        todo: 'gray',
        'in-progress': 'blue',
        done: 'green',
    };
    return map[status];
}
/**
 * Render a task card.
 *
 * Returns an HTMLElement that acts as a clickable card linking to the task detail.
 */
export function TaskCard(props) {
    const { task, onClick } = props;
    return (<article class={cardStyles.classNames.card} data-testid={`task-card-${task.id}`} role="button" tabindex="0" onClick={() => onClick(task.id)} onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick(task.id);
            }
        }}>
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
    </article>);
}
//# sourceMappingURL=task-card.js.map