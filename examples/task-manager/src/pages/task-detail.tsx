/**
 * Task Detail page — view and manage a single task.
 *
 * Demonstrates:
 * - JSX for page layout and dynamic content
 * - query() with reactive params (task ID from route)
 * - Dialog primitive for delete confirmation (<ConfirmDialog /> in JSX)
 * - Tabs primitive for content sections
 * - effect() for reactive state rendering
 */

import { Tabs } from '@vertz/primitives';
import { css, effect, onCleanup, query } from '@vertz/ui';
import { deleteTask, fetchTask, updateTask } from '../api/mock-data';
import { ConfirmDialog } from '../components/confirm-dialog';
import type { TaskStatus } from '../lib/types';
import { badge, button } from '../styles/components';

const detailStyles = css({
  page: ['max-w:2xl', 'mx:auto'],
  header: ['flex', 'justify:between', 'items:start', 'mb:6'],
  titleArea: ['flex-1'],
  title: ['font:2xl', 'font:bold', 'text:foreground', 'mb:1'],
  meta: ['text:sm', 'text:muted'],
  actions: ['flex', 'gap:2', 'items:start'],
  section: ['mb:6'],
  sectionTitle: ['font:sm', 'font:semibold', 'text:muted', 'uppercase', 'tracking:wide', 'mb:2'],
  description: ['text:foreground', 'leading:relaxed'],
  statusBar: ['flex', 'gap:2', 'items:center', 'p:3', 'bg:surface', 'rounded:lg', 'border:1', 'border:border'],
  timeline: ['text:sm', 'text:muted'],
});

export interface TaskDetailPageProps {
  taskId: string;
  navigate: (url: string) => void;
}

/**
 * Render the task detail page.
 *
 * Fetches a single task by ID using query() and displays it with
 * tabs for Details and Activity.
 */
export function TaskDetailPage(props: TaskDetailPageProps): HTMLElement {
  const { taskId, navigate } = props;

  // ── Data fetching ──────────────────────────────────

  const taskQuery = query(() => fetchTask(taskId), {
    key: `task-${taskId}`,
  });

  // ── Elements referenced by the reactive effect ─────

  const loadingEl = <div data-testid="loading">Loading task...</div> as HTMLElement;

  const errorEl = (
    <div style="color: var(--color-danger-500); display: none" data-testid="error" />
  ) as HTMLElement;

  const content = <div style="display: none" data-testid="task-content" /> as HTMLElement;

  const titleEl = <h1 class={detailStyles.classNames.title} data-testid="task-title" /> as HTMLElement;
  const metaEl = <div class={detailStyles.classNames.meta} /> as HTMLElement;
  const actionsEl = <div class={detailStyles.classNames.actions} /> as HTMLElement;
  const statusBar = <div class={detailStyles.classNames.statusBar} data-testid="status-bar" /> as HTMLElement;
  const descBody = <div class={detailStyles.classNames.description} data-testid="task-description" /> as HTMLElement;

  // ── Tabs (Details / Activity) — primitive stays imperative ──

  const tabs = Tabs.Root({ defaultValue: 'details' });
  const detailsTab = tabs.Tab('details', 'Details');
  const activityTab = tabs.Tab('activity', 'Activity');

  // Details panel content — uses JSX for the section layout
  detailsTab.panel.appendChild(
    <div class={detailStyles.classNames.section}>
      <h3 class={detailStyles.classNames.sectionTitle}>Description</h3>
      {descBody}
    </div> as Node,
  );

  // Activity panel content
  activityTab.panel.appendChild(
    <div class={detailStyles.classNames.timeline}>
      No activity yet. Status changes and comments will appear here.
    </div> as Node,
  );

  tabs.root.style.marginTop = '1.5rem';

  // ── Build content area with JSX ────────────────────

  content.append(
    <button
      class={button({ intent: 'ghost', size: 'sm' })}
      style="margin-bottom: 1rem"
      onClick={() => navigate('/')}
    >
      Back to Tasks
    </button> as Node,
    <div class={detailStyles.classNames.header}>
      <div class={detailStyles.classNames.titleArea}>
        {titleEl}
        {metaEl}
      </div>
      {actionsEl}
    </div> as Node,
    statusBar as Node,
    tabs.root as Node,
  );

  // ── Page layout ────────────────────────────────────

  const page = (
    <div class={detailStyles.classNames.page} data-testid="task-detail-page">
      {loadingEl}
      {errorEl}
      {content}
    </div>
  ) as HTMLElement;

  // ── Reactive rendering ─────────────────────────────

  effect(() => {
    const loading = taskQuery.loading.value;
    const error = taskQuery.error.value;
    const task = taskQuery.data.value;

    loadingEl.style.display = loading ? 'block' : 'none';
    errorEl.style.display = error ? 'block' : 'none';
    content.style.display = !loading && task ? 'block' : 'none';

    if (error) {
      errorEl.textContent = `Failed to load task: ${error instanceof Error ? error.message : String(error)}`;
      return;
    }

    if (!task) return;

    // Populate the detail view
    titleEl.textContent = task.title;
    metaEl.textContent = `Created ${new Date(task.createdAt).toLocaleDateString()} · Updated ${new Date(task.updatedAt).toLocaleDateString()}`;
    descBody.textContent = task.description;

    // Build status bar with JSX
    statusBar.innerHTML = '';
    statusBar.appendChild(
      <span class={badge({
        color: task.status === 'done' ? 'green' : task.status === 'in-progress' ? 'blue' : 'gray',
      })}>
        {task.status === 'in-progress' ? 'In Progress' : task.status === 'done' ? 'Done' : 'To Do'}
      </span> as Node,
    );

    // Status transition buttons
    const transitions: Array<{ label: string; status: TaskStatus }> = [];
    if (task.status === 'todo') {
      transitions.push({ label: 'Start', status: 'in-progress' });
    }
    if (task.status === 'in-progress') {
      transitions.push({ label: 'Complete', status: 'done' });
      transitions.push({ label: 'Back to Todo', status: 'todo' });
    }
    if (task.status === 'done') {
      transitions.push({ label: 'Reopen', status: 'in-progress' });
    }

    for (const transition of transitions) {
      statusBar.appendChild(
        <button
          class={button({ intent: 'secondary', size: 'sm' })}
          onClick={async () => {
            await updateTask(taskId, { status: transition.status });
            taskQuery.revalidate();
          }}
        >
          {transition.label}
        </button> as Node,
      );
    }

    // Actions (delete) — uses <ConfirmDialog /> JSX component
    actionsEl.innerHTML = '';
    actionsEl.appendChild(
      <ConfirmDialog
        triggerLabel="Delete"
        title="Delete Task"
        description={`Are you sure you want to delete "${task.title}"? This action cannot be undone.`}
        confirmLabel="Delete Task"
        onConfirm={async () => {
          await deleteTask(taskId);
          navigate('/');
        }}
      /> as Node,
    );
  });

  // ── Cleanup ────────────────────────────────────────

  onCleanup(() => {
    taskQuery.dispose();
  });

  return page;
}
