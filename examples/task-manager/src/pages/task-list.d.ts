/**
 * Task List page — displays all tasks with filtering.
 *
 * Demonstrates:
 * - JSX for page layout and component composition
 * - query() for reactive data fetching (external signals — still use .value)
 * - Compiler `let` → signal transform for local filter state
 * - Compiler conditional transform: {show && <el/>} → __conditional()
 * - Compiler list transform: {items.map(...)} → __list()
 * - <TaskCard /> JSX component embedding
 */
export interface TaskListPageProps {
    navigate: (url: string) => void;
}
/**
 * Render the task list page.
 *
 * Uses query() to fetch tasks reactively. Local `let` signals bridge external
 * query signals into the compiler's reactive system, enabling declarative
 * conditional rendering and list transforms in JSX.
 */
export declare function TaskListPage(props: TaskListPageProps): HTMLElement;
//# sourceMappingURL=task-list.d.ts.map