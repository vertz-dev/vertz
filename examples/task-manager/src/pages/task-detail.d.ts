/**
 * Task Detail page — view and manage a single task.
 *
 * Demonstrates:
 * - JSX for page layout and dynamic content
 * - query() with reactive params (task ID from route)
 * - Dialog primitive for delete confirmation (<ConfirmDialog /> in JSX)
 * - Tabs primitive for content sections
 * - Compiler conditional transform for loading/error/content visibility
 * - Local `let` signals bridging external query signals for compiler reactivity
 */
export interface TaskDetailPageProps {
    taskId: string;
    navigate: (url: string) => void;
}
/**
 * Render the task detail page.
 *
 * Fetches a single task by ID using query() and displays it with
 * tabs for Details and Activity. Local `let` signals bridge the external
 * query signals into the compiler's reactive system for declarative
 * conditional rendering.
 */
export declare function TaskDetailPage(props: TaskDetailPageProps): HTMLElement;
//# sourceMappingURL=task-detail.d.ts.map