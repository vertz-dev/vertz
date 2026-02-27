/**
 * Task Detail page — view and manage a single task.
 *
 * Demonstrates:
 * - JSX for page layout and dynamic content
 * - query() with QueryDescriptor for zero-boilerplate data fetching
 * - queryMatch() for exclusive-state pattern matching (loading/error/data)
 * - Compiler `const` → computed transform for derived values
 * - Dialog primitive for delete confirmation (<ConfirmDialog /> in JSX)
 * - Declarative tab switching with `let` signal state
 */

import { css, query, queryMatch, useParams } from '@vertz/ui';
import { api } from '../api/mock-data';
import { ConfirmDialog } from '../components/confirm-dialog';
import { Icon } from '../components/icon';
import type { TaskStatus } from '../lib/types';
import { useAppRouter } from '../router';
import { badge, button } from '../styles/components';

const detailStyles = css({
  page: ['max-w:2xl', 'mx:auto'],
  header: ['flex', 'justify:between', 'items:start', 'mb:6'],
  titleArea: ['flex-1'],
  title: ['font:2xl', 'font:bold', 'text:foreground', 'mb:1'],
  meta: ['text:sm', 'text:muted-foreground'],
  actions: ['flex', 'gap:2', 'items:start'],
  section: ['mb:6'],
  sectionTitle: [
    'font:sm',
    'font:semibold',
    'text:muted-foreground',
    'uppercase',
    'tracking:wide',
    'mb:2',
  ],
  description: ['text:foreground', 'leading:relaxed'],
  statusBar: [
    'flex',
    'gap:2',
    'items:center',
    'p:3',
    'bg:card',
    'rounded:lg',
    'border:1',
    'border:border',
  ],
  timeline: ['text:sm', 'text:muted-foreground'],
});

/**
 * Render the task detail page.
 *
 * Fetches a single task by ID using query() and renders the result
 * via queryMatch() — exclusive-state pattern matching replaces manual
 * {loading && ...} / {error && ...} / {!loading && !error && ...} guards.
 *
 * Task ID is accessed via useParams<TPath>() for typed params.
 * Navigation is accessed via useAppRouter() for typed navigate().
 */
export function TaskDetailPage() {
  const { navigate } = useAppRouter();
  const { id: taskId } = useParams<'/tasks/:id'>();
  // ── Data fetching ──────────────────────────────────

  // query() with QueryDescriptor — key auto-derived: "GET:/tasks/<id>"
  const taskQuery = query(api.tasks.get(taskId));

  // Tab state — compiler transforms `let` to signal()
  let activeTab = 'details';

  // ── queryMatch for exclusive-state rendering ───────

  const taskContent = queryMatch(taskQuery, {
    loading: () => <div data-testid="loading">Loading task...</div>,
    error: (err) => (
      <div style="color: var(--color-destructive)" data-testid="error">
        {`Failed to load task: ${err instanceof Error ? err.message : String(err)}`}
      </div>
    ),
    data: (task) => {
      const transitions: Array<{ label: string; status: TaskStatus }> =
        task.status === 'todo'
          ? [{ label: 'Start', status: 'in-progress' }]
          : task.status === 'in-progress'
            ? [
                { label: 'Complete', status: 'done' },
                { label: 'Back to Todo', status: 'todo' },
              ]
            : task.status === 'done'
              ? [{ label: 'Reopen', status: 'in-progress' }]
              : [];

      return (
        <div data-testid="task-content">
          <button
            class={button({ intent: 'ghost', size: 'sm' })}
            style="margin-bottom: 1rem"
            onClick={() => navigate('/')}
          >
            <Icon name="ArrowLeft" size={16} />
            Back to Tasks
          </button>
          <div class={detailStyles.header}>
            <div class={detailStyles.titleArea}>
              <h1 class={detailStyles.title} data-testid="task-title">
                {task.title}
              </h1>
              <div class={detailStyles.meta}>
                {`Created ${new Date(task.createdAt).toLocaleDateString()} · Updated ${new Date(task.updatedAt).toLocaleDateString()}`}
              </div>
            </div>
            <div class={detailStyles.actions}>
              <ConfirmDialog
                triggerLabel="Delete"
                title="Delete Task"
                description={`Are you sure you want to delete "${task.title}"? This action cannot be undone.`}
                confirmLabel="Delete Task"
                onConfirm={async () => {
                  await api.tasks.delete(taskId);
                  navigate('/');
                }}
              />
            </div>
          </div>
          <div class={detailStyles.statusBar} data-testid="status-bar">
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
                  await api.tasks.update(taskId, { status: tr.status });
                  taskQuery.revalidate();
                }}
              >
                {tr.label}
              </button>
            ))}
          </div>
          <div style="margin-top: 1.5rem">
            <div
              role="tablist"
              style="display: flex; gap: 0.5rem; border-bottom: 1px solid var(--color-border); padding-bottom: 0.5rem; margin-bottom: 1rem"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'details' ? 'true' : 'false'}
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
                type="button"
                role="tab"
                aria-selected={activeTab === 'activity' ? 'true' : 'false'}
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
              <div class={detailStyles.section}>
                <h3 class={detailStyles.sectionTitle}>Description</h3>
                <div class={detailStyles.description} data-testid="task-description">
                  {task.description}
                </div>
              </div>
            )}
            {activeTab === 'activity' && (
              <div class={detailStyles.timeline}>
                No activity yet. Status changes and comments will appear here.
              </div>
            )}
          </div>
        </div>
      );
    },
  });

  return (
    <div class={detailStyles.page} data-testid="task-detail-page">
      {taskContent}
    </div>
  );
}
