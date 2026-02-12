/**
 * Task List page — displays all tasks with filtering.
 *
 * Demonstrates:
 * - JSX for page layout and component composition
 * - query() for reactive data fetching
 * - signal() + computed() for filter state
 * - effect() for DOM updates when data changes
 * - <TaskCard /> JSX component embedding
 */

import { computed, effect, onCleanup, onMount, query, signal } from '@vertz/ui';
import { fetchTasks } from '../api/mock-data';
import { TaskCard } from '../components/task-card';
import type { TaskStatus } from '../lib/types';
import { button, emptyStateStyles, layoutStyles } from '../styles/components';

export interface TaskListPageProps {
  navigate: (url: string) => void;
}

/**
 * Render the task list page.
 *
 * Uses query() to fetch tasks reactively. The filter signal drives
 * a computed() that narrows the displayed tasks.
 */
export function TaskListPage(props: TaskListPageProps): HTMLElement {
  const { navigate } = props;

  // ── Reactive state ─────────────────────────────────

  const statusFilter = signal<TaskStatus | 'all'>('all');

  // query() automatically fetches and provides reactive data/loading/error signals
  const tasksQuery = query(() => fetchTasks(), {
    key: 'task-list',
  });

  // Derived: filtered tasks based on the current filter
  const filteredTasks = computed(() => {
    const result = tasksQuery.data.value;
    if (!result) return [];

    const filter = statusFilter.value;
    if (filter === 'all') return result.tasks;
    return result.tasks.filter((t) => t.status === filter);
  });

  // ── Elements referenced by effects ──────────────────

  const loadingEl = <div data-testid="loading">Loading tasks...</div> as HTMLElement;

  const listContainer = (
    <div data-testid="task-list" style="display: flex; flex-direction: column; gap: 0.75rem" />
  ) as HTMLElement;

  const emptyEl = (
    <div class={emptyStateStyles.classNames.container}>
      <h3 class={emptyStateStyles.classNames.title}>No tasks found</h3>
      <p class={emptyStateStyles.classNames.description}>Create your first task to get started.</p>
      <button class={button({ intent: 'primary', size: 'md' })} onClick={() => navigate('/tasks/new')}>
        Create Task
      </button>
    </div>
  ) as HTMLElement;

  const errorEl = <div style="color: var(--color-danger-500)" data-testid="error" /> as HTMLElement;

  // ── Filter bar with reactive active state ───────────

  const filterBar = <div style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem" /> as HTMLElement;

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
        onClick={() => { statusFilter.value = filter.value; }}
      >
        {filter.label}
      </button>
    ) as HTMLElement;

    // Reactive active state for filter buttons
    effect(() => {
      const isActive = statusFilter.value === filter.value;
      btn.className = button({
        intent: isActive ? 'primary' : 'ghost',
        size: 'sm',
      });
    });

    filterBar.appendChild(btn);
  }

  // ── Page layout with JSX ────────────────────────────

  const page = (
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
      {loadingEl}
      {listContainer}
      {emptyEl}
      {errorEl}
    </div>
  ) as HTMLElement;

  // ── Reactive DOM updates ───────────────────────────

  effect(() => {
    const loading = tasksQuery.loading.value;
    const error = tasksQuery.error.value;
    const tasks = filteredTasks.value;

    // Toggle visibility
    loadingEl.style.display = loading ? 'block' : 'none';
    errorEl.style.display = error ? 'block' : 'none';
    emptyEl.style.display = !loading && !error && tasks.length === 0 ? 'flex' : 'none';
    listContainer.style.display = !loading && !error && tasks.length > 0 ? 'flex' : 'none';

    if (error) {
      errorEl.textContent = `Failed to load tasks: ${error instanceof Error ? error.message : String(error)}`;
      return;
    }

    // Clear and rebuild the task list using JSX component calls
    listContainer.innerHTML = '';
    for (const task of tasks) {
      listContainer.appendChild(
        <TaskCard task={task} onClick={(id) => navigate(`/tasks/${id}`)} /> as Node,
      );
    }
  });

  // ── Lifecycle ──────────────────────────────────────

  onMount(() => {
    console.log('TaskListPage mounted');
  });

  onCleanup(() => {
    tasksQuery.dispose();
    console.log('TaskListPage cleaned up');
  });

  return page;
}
