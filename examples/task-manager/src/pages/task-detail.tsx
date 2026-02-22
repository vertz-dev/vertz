/**
 * Task Detail page — view and manage a single task.
 *
 * Demonstrates:
 * - JSX for page layout and dynamic content
 * - query() with reactive params (task ID from route)
 * - Auto-unwrapped signal properties: taskQuery.loading, taskQuery.error
 * - Compiler `const` → computed transform for derived values from query()
 * - Dialog primitive for delete confirmation (<ConfirmDialog /> in JSX)
 * - Declarative tab switching with `let` signal state
 * - Compiler conditional transform for loading/error/content visibility
 */

import { css, onCleanup, onMount, query } from '@vertz/ui';
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
  statusBar: [
    'flex',
    'gap:2',
    'items:center',
    'p:3',
    'bg:surface',
    'rounded:lg',
    'border:1',
    'border:border',
  ],
  timeline: ['text:sm', 'text:muted'],
});

export interface TaskDetailPageProps {
  taskId: string;
  navigate: (url: string) => void;
}

/**
 * Render the task detail page.
 *
 * Fully declarative task detail page. Fetches a single task by ID
 * using query() and displays it with tabs for Details and Activity.
 * Signal properties (loading, error) are used directly in JSX —
 * the compiler auto-unwraps them. Derived values (errorMsg, task,
 * transitions) use const declarations — the compiler classifies them
 * as computed and wraps them automatically. No effect() needed.
 */
export function TaskDetailPage({ taskId, navigate }: TaskDetailPageProps): HTMLElement {
  // ── Data fetching ──────────────────────────────────

  const taskQuery = query(() => fetchTask(taskId), {
    key: `task-${taskId}`,
  });

  // Derived values — the compiler classifies these as computed (they depend on
  // signal API properties) and wraps them in computed() automatically.
  const errorMsg = taskQuery.error
    ? `Failed to load task: ${taskQuery.error instanceof Error ? taskQuery.error.message : String(taskQuery.error)}`
    : '';

  const task = taskQuery.data ?? null;

  // Status transitions — the compiler classifies this as computed since
  // it depends on `task` (which depends on the signal API variable).
  const transitions: Array<{ label: string; status: TaskStatus }> = !task
    ? []
    : task.status === 'todo'
      ? [{ label: 'Start', status: 'in-progress' }]
      : task.status === 'in-progress'
        ? [
            { label: 'Complete', status: 'done' },
            { label: 'Back to Todo', status: 'todo' },
          ]
        : task.status === 'done'
          ? [{ label: 'Reopen', status: 'in-progress' }]
          : [];

  // Tab state — compiler transforms `let` to signal()
  let activeTab = 'details';

  // ── Cleanup ────────────────────────────────────────

  onMount(() => {
    onCleanup(() => {
      taskQuery.dispose();
    });
  });

  // ── Page layout with declarative conditionals ──────

  return (
    <div class={detailStyles.classNames.page} data-testid="task-detail-page">
      {taskQuery.loading && <div data-testid="loading">Loading task...</div>}
      {taskQuery.error && (
        <div style="color: var(--color-danger-500)" data-testid="error">
          {errorMsg}
        </div>
      )}
      {!taskQuery.loading && !taskQuery.error && task && (
        <div data-testid="task-content">
          <button
            class={button({ intent: 'ghost', size: 'sm' })}
            style="margin-bottom: 1rem"
            onClick={() => navigate('/')}
          >
            Back to Tasks
          </button>
          <div class={detailStyles.classNames.header}>
            <div class={detailStyles.classNames.titleArea}>
              <h1 class={detailStyles.classNames.title} data-testid="task-title">
                {task.title}
              </h1>
              <div class={detailStyles.classNames.meta}>
                {`Created ${new Date(task.createdAt).toLocaleDateString()} · Updated ${new Date(task.updatedAt).toLocaleDateString()}`}
              </div>
            </div>
            <div class={detailStyles.classNames.actions}>
              <ConfirmDialog
                triggerLabel="Delete"
                title="Delete Task"
                description={`Are you sure you want to delete "${task.title}"? This action cannot be undone.`}
                confirmLabel="Delete Task"
                onConfirm={async () => {
                  await deleteTask(taskId);
                  navigate('/');
                }}
              />
            </div>
          </div>
          <div class={detailStyles.classNames.statusBar} data-testid="status-bar">
            <span
              class={badge({
                color:
                  task.status === 'done'
                    ? 'green'
                    : task.status === 'in-progress'
                      ? 'blue'
                      : 'gray',
              })}
            >
              {task.status === 'in-progress'
                ? 'In Progress'
                : task.status === 'done'
                  ? 'Done'
                  : 'To Do'}
            </span>
            {transitions.map((tr) => (
              <button
                class={button({ intent: 'secondary', size: 'sm' })}
                onClick={async () => {
                  await updateTask(taskId, { status: tr.status });
                  taskQuery.revalidate();
                }}
              >
                {tr.label}
              </button>
            ))}
          </div>
          <div style="margin-top: 1.5rem">
            <div style="display: flex; gap: 0.5rem; border-bottom: 1px solid var(--color-border-200); padding-bottom: 0.5rem; margin-bottom: 1rem">
              <button
                class={button({
                  intent: activeTab === 'details' ? 'primary' : 'ghost',
                  size: 'sm',
                })}
                onClick={() => {
                  activeTab = 'details';
                }}
              >
                Details
              </button>
              <button
                class={button({
                  intent: activeTab === 'activity' ? 'primary' : 'ghost',
                  size: 'sm',
                })}
                onClick={() => {
                  activeTab = 'activity';
                }}
              >
                Activity
              </button>
            </div>
            {activeTab === 'details' && (
              <div class={detailStyles.classNames.section}>
                <h3 class={detailStyles.classNames.sectionTitle}>Description</h3>
                <div class={detailStyles.classNames.description} data-testid="task-description">
                  {task.description}
                </div>
              </div>
            )}
            {activeTab === 'activity' && (
              <div class={detailStyles.classNames.timeline}>
                No activity yet. Status changes and comments will appear here.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
