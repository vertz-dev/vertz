/**
 * Task Detail page — view and manage a single task.
 *
 * Demonstrates:
 * - query() with reactive params (task ID from route)
 * - signal() for edit state
 * - Dialog primitive for delete confirmation
 * - Tabs primitive for content sections
 * - watch() for reacting to data changes
 */

import { Tabs } from '@vertz/primitives';
import { css, effect, onCleanup, query, signal, watch } from '@vertz/ui';
import { deleteTask, fetchTask, updateTask } from '../api/mock-data';
import { ConfirmDialog } from '../components/confirm-dialog';
import type { Task, TaskStatus } from '../lib/types';
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

  // ── DOM construction ───────────────────────────────

  const page = document.createElement('div');
  page.className = detailStyles.classNames.page;
  page.setAttribute('data-testid', 'task-detail-page');

  // Loading state
  const loadingEl = document.createElement('div');
  loadingEl.textContent = 'Loading task...';
  loadingEl.setAttribute('data-testid', 'loading');
  page.appendChild(loadingEl);

  // Error state
  const errorEl = document.createElement('div');
  errorEl.style.color = 'var(--color-danger-500)';
  errorEl.style.display = 'none';
  errorEl.setAttribute('data-testid', 'error');
  page.appendChild(errorEl);

  // Content container (hidden while loading)
  const content = document.createElement('div');
  content.style.display = 'none';
  content.setAttribute('data-testid', 'task-content');

  // Back button
  const backBtn = document.createElement('button');
  backBtn.className = button({ intent: 'ghost', size: 'sm' });
  backBtn.textContent = 'Back to Tasks';
  backBtn.style.marginBottom = '1rem';
  backBtn.addEventListener('click', () => navigate('/'));
  content.appendChild(backBtn);

  // Header: title + actions
  const header = document.createElement('div');
  header.className = detailStyles.classNames.header;

  const titleArea = document.createElement('div');
  titleArea.className = detailStyles.classNames.titleArea;
  const titleEl = document.createElement('h1');
  titleEl.className = detailStyles.classNames.title;
  titleEl.setAttribute('data-testid', 'task-title');
  const metaEl = document.createElement('div');
  metaEl.className = detailStyles.classNames.meta;
  titleArea.appendChild(titleEl);
  titleArea.appendChild(metaEl);

  const actionsEl = document.createElement('div');
  actionsEl.className = detailStyles.classNames.actions;
  header.appendChild(titleArea);
  header.appendChild(actionsEl);
  content.appendChild(header);

  // Status bar with status transition buttons
  const statusBar = document.createElement('div');
  statusBar.className = detailStyles.classNames.statusBar;
  statusBar.setAttribute('data-testid', 'status-bar');
  content.appendChild(statusBar);

  // ── Tabs (Details / Activity) ───────────────────

  const tabs = Tabs.Root({ defaultValue: 'details' });

  const detailsTab = tabs.Tab('details', 'Details');
  const activityTab = tabs.Tab('activity', 'Activity');

  // Details panel content
  const descSection = document.createElement('div');
  descSection.className = detailStyles.classNames.section;
  const descTitle = document.createElement('h3');
  descTitle.className = detailStyles.classNames.sectionTitle;
  descTitle.textContent = 'Description';
  const descBody = document.createElement('div');
  descBody.className = detailStyles.classNames.description;
  descBody.setAttribute('data-testid', 'task-description');
  descSection.appendChild(descTitle);
  descSection.appendChild(descBody);
  detailsTab.panel.appendChild(descSection);

  // Activity panel content (placeholder)
  const activityContent = document.createElement('div');
  activityContent.className = detailStyles.classNames.timeline;
  activityContent.textContent = 'No activity yet. Status changes and comments will appear here.';
  activityTab.panel.appendChild(activityContent);

  // Add tabs to content, with some spacing
  tabs.root.style.marginTop = '1.5rem';
  content.appendChild(tabs.root);

  page.appendChild(content);

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

    // Build status bar
    statusBar.innerHTML = '';
    const currentStatus = document.createElement('span');
    currentStatus.className = badge({
      color: task.status === 'done' ? 'green' : task.status === 'in-progress' ? 'blue' : 'gray',
    });
    currentStatus.textContent = task.status === 'in-progress' ? 'In Progress' : task.status === 'done' ? 'Done' : 'To Do';
    statusBar.appendChild(currentStatus);

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
      const btn = document.createElement('button');
      btn.className = button({ intent: 'secondary', size: 'sm' });
      btn.textContent = transition.label;
      btn.addEventListener('click', async () => {
        await updateTask(taskId, { status: transition.status });
        taskQuery.revalidate();
      });
      statusBar.appendChild(btn);
    }

    // Actions (delete)
    actionsEl.innerHTML = '';
    const deleteDialog = ConfirmDialog({
      triggerLabel: 'Delete',
      title: 'Delete Task',
      description: `Are you sure you want to delete "${task.title}"? This action cannot be undone.`,
      confirmLabel: 'Delete Task',
      onConfirm: async () => {
        await deleteTask(taskId);
        navigate('/');
      },
    });
    actionsEl.appendChild(deleteDialog);
  });

  // ── Cleanup ────────────────────────────────────────

  onCleanup(() => {
    taskQuery.dispose();
  });

  return page;
}
