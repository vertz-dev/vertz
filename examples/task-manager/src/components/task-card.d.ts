/**
 * TaskCard component — displays a single task in the list view.
 *
 * Demonstrates:
 * - JSX for declarative DOM construction
 * - css() for scoped styling
 * - variants() for priority badges
 */
import type { Task } from '../lib/types';
export interface TaskCardProps {
    task: Task;
    onClick: (id: string) => void;
}
/**
 * Render a task card.
 *
 * Returns an HTMLElement that acts as a clickable card linking to the task detail.
 */
export declare function TaskCard(props: TaskCardProps): HTMLElement;
//# sourceMappingURL=task-card.d.ts.map