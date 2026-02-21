/**
 * Task List page — displays all tasks with filtering.
 *
 * Demonstrates:
 * - JSX for page layout and component composition
 * - query() for reactive data fetching with auto-unwrapped signal properties
 * - Reactive JSX conditionals: {tasksQuery.loading && <el/>}
 * - Compiler `let` → signal transform for local filter state
 * - Compiler conditional transform: {show && <el/>} → __conditional()
 * - Compiler list transform: {items.map(...)} → __list()
 * - <TaskCard /> JSX component embedding
 */

import { effect, onCleanup, onMount, query } from '@vertz/ui';
import { fetchTasks } from '../api/mock-data';
import { TaskCard } from '../components/task-card';
import type { Task, TaskStatus } from '../lib/types';
import { button, emptyStateStyles, layoutStyles } from '../styles/components';

export interface TaskListPageProps {
  navigate: (url: string) => void;
}

/**
 * Render the task list page.
 *
 * Uses query() to fetch tasks reactively. Signal properties like
 * tasksQuery.loading and tasksQuery.error are used directly in JSX —
 * the compiler auto-unwraps them and generates reactive subscriptions.
 * Computed values (errorMsg, filteredTasks) still use effect() bridges
 * since they derive from multiple signals.
 */
export function TaskListPage(props: TaskListPageProps): HTMLElement {
  const { navigate } = props;

  // ── Reactive state ─────────────────────────────────

  // Local state: compiler transforms `let` to signal()
  let statusFilter: TaskStatus | 'all' = 'all';

  // query() returns auto-unwrapped signal properties (.data, .loading, .error)
  const tasksQuery = query(() => fetchTasks(), {
    key: 'task-list',
  });

  // Computed values still need effect() bridges with explicit .value access.
  // In JSX, signal properties (loading, error) are used directly —
  // the compiler auto-unwraps them and generates reactive subscriptions.
  let errorMsg = '';
  let filteredTasks: Task[] = [];

  effect(() => {
    const err = tasksQuery.error.value;
    errorMsg = err
      ? `Failed to load tasks: ${err instanceof Error ? err.message : String(err)}`
      : '';

    const result = tasksQuery.data.value;
    const filter = statusFilter;

    if (!result) {
      filteredTasks = [];
    } else if (filter === 'all') {
      filteredTasks = result.tasks;
    } else {
      filteredTasks = result.tasks.filter((t) => t.status === filter);
    }
  });

  // ── Filter bar with reactive active state ───────────

  const filterBar = <div style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem" />;

  const filters: Array<{ label: string; value: TaskStatus | 'all' }> = [
    { label: 'All', value: 'all' },
    { label: 'To Do', value: 'todo' },
    { label: 'In Progress', value: 'in-progress' },
    { label: 'Done', value: 'done' },
  ];

  for (const filter of filters) {
    const btn = (
      <button
        data-testid={`filter-${filter.value}`}
        onClick={() => {
          statusFilter = filter.value;
        }}
      >
        {filter.label}
      </button>
    );

    // Reactive className — statusFilter is a local signal (compiler adds .value).
    // Keep effect() for imperative className assignment on loop-created elements.
    effect(() => {
      const isActive = statusFilter === filter.value;
      btn.className = button({
        intent: isActive ? 'primary' : 'ghost',
        size: 'sm',
      });
    });

    filterBar.appendChild(btn);
  }

  // ── Lifecycle ──────────────────────────────────────

  onMount(() => {
    console.log('TaskListPage mounted');

    onCleanup(() => {
      tasksQuery.dispose();
      console.log('TaskListPage cleaned up');
    });
  });

  // ── Page layout with declarative conditionals and list rendering ──

  return (
    <div data-testid="task-list-page">
      <div class={layoutStyles.classNames.header}>
        <h1 style="font-size: 1.5rem; font-weight: 700">Tasks</h1>
        <button
          class={button({ intent: 'primary', size: 'md' })}
          data-testid="create-task-btn"
          onClick={() => navigate('/tasks/new')}
        >
          + New Task
        </button>
      </div>
      {filterBar}
      {tasksQuery.loading && <div data-testid="loading">Loading tasks...</div>}
      {tasksQuery.error && (
        <div style="color: var(--color-danger-500)" data-testid="error">
          {errorMsg}
        </div>
      )}
      {!tasksQuery.loading && !tasksQuery.error && filteredTasks.length === 0 && (
        <div class={emptyStateStyles.classNames.container}>
          <h3 class={emptyStateStyles.classNames.title}>No tasks found</h3>
          <p class={emptyStateStyles.classNames.description}>
            Create your first task to get started.
          </p>
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
