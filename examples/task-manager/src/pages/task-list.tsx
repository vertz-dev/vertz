/**
 * Task List page — displays all tasks with filtering.
 *
 * Demonstrates:
 * - JSX for page layout and component composition
 * - query() with QueryDescriptor for zero-boilerplate data fetching
 * - Reactive JSX conditionals: {tasksQuery.loading && <el/>}
 * - Compiler `let` → signal transform for local filter state
 * - Compiler `const` → computed transform for derived values from query()
 * - Compiler conditional transform: {show && <el/>} → __conditional()
 * - Compiler list transform: {items.map(...)} → __list()
 * - <TaskCard /> JSX component embedding
 */

import { query } from '@vertz/ui';
import { api } from '../api/mock-data';
import { Icon } from '../components/icon';
import { TaskCard } from '../components/task-card';
import type { Task, TaskStatus } from '../lib/types';
import { useAppRouter } from '../router';
import { button, emptyStateStyles, layoutStyles } from '../styles/components';

/**
 * Render the task list page.
 *
 * Uses query() to fetch tasks reactively. Signal properties like
 * tasksQuery.loading and tasksQuery.error are used directly in JSX —
 * the compiler auto-unwraps them and generates reactive subscriptions.
 * Derived values (errorMsg, filteredTasks) use const declarations —
 * the compiler classifies them as computed and wraps them automatically.
 *
 * Navigation is accessed via useAppRouter() context — no props needed.
 */
export function TaskListPage() {
  const { navigate } = useAppRouter();
  // ── Reactive state ─────────────────────────────────

  // Local state: compiler transforms `let` to signal()
  let statusFilter: TaskStatus | 'all' = 'all';

  // query() with QueryDescriptor — key is auto-derived from the descriptor
  const tasksQuery = query(api.tasks.list());

  // Derived values — the compiler classifies these as computed (they depend on
  // signal API properties) and wraps them in computed() automatically.
  const errorMsg = tasksQuery.error
    ? `Failed to load tasks: ${tasksQuery.error instanceof Error ? tasksQuery.error.message : String(tasksQuery.error)}`
    : '';

  const filteredTasks = !tasksQuery.data
    ? []
    : statusFilter === 'all'
      ? tasksQuery.data.tasks
      : tasksQuery.data.tasks.filter((t: Task) => t.status === statusFilter);

  // ── Filter options ──────────────────────────────────

  const filters: Array<{ label: string; value: TaskStatus | 'all' }> = [
    { label: 'All', value: 'all' },
    { label: 'To Do', value: 'todo' },
    { label: 'In Progress', value: 'in-progress' },
    { label: 'Done', value: 'done' },
  ];

  // ── Page layout with declarative conditionals and list rendering ──

  return (
    <div data-testid="task-list-page">
      <div class={layoutStyles.header}>
        <h1 style="font-size: 1.5rem; font-weight: 700">Tasks</h1>
        <button
          class={button({ intent: 'primary', size: 'md' })}
          data-testid="create-task-btn"
          onClick={() => navigate('/tasks/new')}
        >
          <Icon name="Plus" size={16} />
          New Task
        </button>
      </div>
      <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem">
        {filters.map((filter) => (
          <button
            class={button({
              intent: statusFilter === filter.value ? 'primary' : 'ghost',
              size: 'sm',
            })}
            data-testid={`filter-${filter.value}`}
            onClick={() => {
              statusFilter = filter.value;
            }}
          >
            {filter.label}
          </button>
        ))}
      </div>
      {tasksQuery.loading && <div data-testid="loading">Loading tasks...</div>}
      {tasksQuery.error && (
        <div style="color: var(--color-destructive)" data-testid="error">
          {errorMsg}
        </div>
      )}
      {!tasksQuery.loading && !tasksQuery.error && filteredTasks.length === 0 && (
        <div class={emptyStateStyles.container}>
          <div class={emptyStateStyles.icon}>
            <Icon name="Inbox" size={48} />
          </div>
          <h3 class={emptyStateStyles.title}>No tasks found</h3>
          <p class={emptyStateStyles.description}>Create your first task to get started.</p>
          <button
            class={button({ intent: 'primary', size: 'md' })}
            onClick={() => navigate('/tasks/new')}
          >
            Create Task
          </button>
        </div>
      )}
      <div data-testid="task-list" style="display: flex; flex-direction: column; gap: 0.75rem">
        {filteredTasks.map((task) => (
          <TaskCard key={task.id} task={task} onClick={(id) => navigate(`/tasks/${id}`)} />
        ))}
      </div>
    </div>
  );
}
