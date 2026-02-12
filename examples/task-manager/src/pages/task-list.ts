/**
 * Task List page — displays all tasks with filtering.
 *
 * Demonstrates:
 * - query() for reactive data fetching
 * - signal() + computed() for filter state
 * - effect() for DOM updates when data changes
 * - onMount() for initial setup
 * - onCleanup() for teardown
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

  // ── DOM construction ───────────────────────────────

  const page = document.createElement('div');
  page.setAttribute('data-testid', 'task-list-page');

  // Header
  const header = document.createElement('div');
  header.className = layoutStyles.classNames.header;

  const heading = document.createElement('h1');
  heading.textContent = 'Tasks';
  heading.style.fontSize = '1.5rem';
  heading.style.fontWeight = '700';

  const createBtn = document.createElement('button');
  createBtn.className = button({ intent: 'primary', size: 'md' });
  createBtn.textContent = '+ New Task';
  createBtn.setAttribute('data-testid', 'create-task-btn');
  createBtn.addEventListener('click', () => navigate('/tasks/new'));

  header.appendChild(heading);
  header.appendChild(createBtn);

  // Filter bar
  const filterBar = document.createElement('div');
  filterBar.style.display = 'flex';
  filterBar.style.gap = '0.5rem';
  filterBar.style.marginBottom = '1.5rem';

  const filters: Array<{ label: string; value: TaskStatus | 'all' }> = [
    { label: 'All', value: 'all' },
    { label: 'To Do', value: 'todo' },
    { label: 'In Progress', value: 'in-progress' },
    { label: 'Done', value: 'done' },
  ];

  for (const filter of filters) {
    const btn = document.createElement('button');
    btn.textContent = filter.label;
    btn.setAttribute('data-testid', `filter-${filter.value}`);
    btn.addEventListener('click', () => {
      statusFilter.value = filter.value;
    });

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

  // Task list container
  const listContainer = document.createElement('div');
  listContainer.setAttribute('data-testid', 'task-list');
  listContainer.style.display = 'flex';
  listContainer.style.flexDirection = 'column';
  listContainer.style.gap = '0.75rem';

  // Loading indicator
  const loadingEl = document.createElement('div');
  loadingEl.textContent = 'Loading tasks...';
  loadingEl.setAttribute('data-testid', 'loading');

  // Empty state
  const emptyEl = document.createElement('div');
  emptyEl.className = emptyStateStyles.classNames.container;
  const emptyTitle = document.createElement('h3');
  emptyTitle.className = emptyStateStyles.classNames.title;
  emptyTitle.textContent = 'No tasks found';
  const emptyDesc = document.createElement('p');
  emptyDesc.className = emptyStateStyles.classNames.description;
  emptyDesc.textContent = 'Create your first task to get started.';
  const emptyAction = document.createElement('button');
  emptyAction.className = button({ intent: 'primary', size: 'md' });
  emptyAction.textContent = 'Create Task';
  emptyAction.addEventListener('click', () => navigate('/tasks/new'));
  emptyEl.appendChild(emptyTitle);
  emptyEl.appendChild(emptyDesc);
  emptyEl.appendChild(emptyAction);

  // Error state
  const errorEl = document.createElement('div');
  errorEl.style.color = 'var(--color-danger-500)';
  errorEl.setAttribute('data-testid', 'error');

  page.appendChild(header);
  page.appendChild(filterBar);
  page.appendChild(loadingEl);
  page.appendChild(listContainer);
  page.appendChild(emptyEl);
  page.appendChild(errorEl);

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

    // Clear and rebuild the task list
    listContainer.innerHTML = '';
    for (const task of tasks) {
      const card = TaskCard({
        task,
        onClick: (id) => navigate(`/tasks/${id}`),
      });
      listContainer.appendChild(card);
    }
  });

  // ── Lifecycle ──────────────────────────────────────

  onMount(() => {
    // Could set up keyboard shortcuts, analytics, etc.
    console.log('TaskListPage mounted');
  });

  onCleanup(() => {
    // Dispose the query when the page unmounts
    tasksQuery.dispose();
    console.log('TaskListPage cleaned up');
  });

  return page;
}
