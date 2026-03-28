/**
 * TaskCard component — displays a single task in the list view.
 *
 * Demonstrates:
 * - JSX for declarative DOM construction
 * - Theme styles from @vertz/theme-shadcn (card, badge)
 * - variants() for priority badges
 */

import type { Task, TaskPriority, TaskStatus } from "../lib/types";
import { badge, cardStyles } from "../styles/components";

/** Map priority to badge color. */
function priorityColor(
  priority: TaskPriority,
): "blue" | "green" | "yellow" | "red" {
  const map: Record<TaskPriority, "blue" | "green" | "yellow" | "red"> = {
    low: "blue",
    medium: "yellow",
    high: "red",
    urgent: "red",
  };
  return map[priority];
}

/** Map status to display label. */
function statusLabel(status: TaskStatus): string {
  const map: Record<TaskStatus, string> = {
    todo: "To Do",
    "in-progress": "In Progress",
    done: "Done",
  };
  return map[status];
}

/** Map status to badge color. */
function statusColor(status: TaskStatus): "gray" | "blue" | "green" {
  const map: Record<TaskStatus, "gray" | "blue" | "green"> = {
    todo: "gray",
    "in-progress": "blue",
    done: "green",
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
export function TaskCard({ task, onClick }: TaskCardProps) {
  return (
    <article
      className={cardStyles.root}
      data-testid={`task-card-${task.id}`}
      role="button"
      tabindex="0"
      style={{
        cursor: "pointer",
        transition: "box-shadow 150ms, border-color 150ms",
        viewTransitionName: `task-${task.id}`,
      }}
      onClick={() => onClick(task.id)}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(task.id);
        }
      }}
    >
      <div
        className={cardStyles.header}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <h3 className={cardStyles.title} style={{ fontSize: "1rem" }}>
          {task.title}
        </h3>
        <span className={badge({ color: priorityColor(task.priority) })}>
          {task.priority}
        </span>
      </div>
      <div className={cardStyles.content}>
        <p className={cardStyles.description}>
          {task.description.length > 120
            ? `${task.description.slice(0, 120)}...`
            : task.description}
        </p>
      </div>
      <div
        className={cardStyles.footer}
        style={{ justifyContent: "space-between" }}
      >
        <span className={badge({ color: statusColor(task.status) })}>
          {statusLabel(task.status)}
        </span>
        <span
          style={{
            fontSize: "0.75rem",
            color: "var(--color-muted-foreground)",
          }}
        >
          {new Date(task.updatedAt).toLocaleDateString()}
        </span>
      </div>
    </article>
  );
}
