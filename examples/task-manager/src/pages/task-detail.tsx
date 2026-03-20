/**
 * Task Detail page — view and manage a single task.
 *
 * Demonstrates:
 * - JSX for page layout and dynamic content
 * - query() with QueryDescriptor for zero-boilerplate data fetching
 * - queryMatch() for exclusive-state pattern matching (loading/error/data)
 * - queryMatch data handler parameter — reactive-by-default JSX makes
 *   handler parameters work without workarounds (#927)
 * - Compiler `const` → computed transform for derived values
 * - Dialog primitive for delete confirmation (<ConfirmDialog /> in JSX)
 * - Declarative tab switching with `let` signal state
 */

import { ArrowLeftIcon } from '@vertz/icons';
import { css, query, queryMatch, useParams, useRouter } from '@vertz/ui';
import { api } from '../api/mock-data';
import { ConfirmDialog } from '../components/confirm-dialog';
import type { TaskStatus } from '../lib/types';
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
 * Navigation is accessed via useRouter() for typed navigate().
 */
export function TaskDetailPage() {
  const { navigate } = useRouter();
  const { id: taskId } = useParams<'/tasks/:id'>();
  // ── Data fetching ──────────────────────────────────

  // query() with QueryDescriptor — key auto-derived: "GET:/tasks/<id>"
  const taskQuery = query(api.tasks.get(taskId));

  // Tab state — compiler transforms `let` to signal()
  let activeTab = 'details';

  // Derived value — top-level so the compiler wraps in computed().
  // Guard for when data hasn't loaded yet.
  const transitions: Array<{ label: string; status: TaskStatus }> = !taskQuery.data
    ? []
    : taskQuery.data.status === 'todo'
      ? [{ label: 'Start', status: 'in-progress' }]
      : taskQuery.data.status === 'in-progress'
        ? [
            { label: 'Complete', status: 'done' },
            { label: 'Back to Todo', status: 'todo' },
          ]
        : taskQuery.data.status === 'done'
          ? [{ label: 'Reopen', status: 'in-progress' }]
          : [];

  // ── queryMatch for exclusive-state rendering ───────

  const taskContent = queryMatch(taskQuery, {
    loading: () => <div data-testid="loading">Loading task...</div>,
    error: (err) => (
      <div style={{ color: 'var(--color-destructive)' }} data-testid="error">
        {`Failed to load task: ${err instanceof Error ? err.message : String(err)}`}
      </div>
    ),
    data: (task) => (
      <div data-testid="task-content" style={{ viewTransitionName: `task-${taskId}` }}>
        <button
          type="button"
          className={button({ intent: 'ghost', size: 'sm' })}
          style={{ marginBottom: '1rem' }}
          onClick={() => navigate({ to: '/' })}
        >
          <ArrowLeftIcon size={14} />
          Back to Tasks
        </button>
        <div className={detailStyles.header}>
          <div className={detailStyles.titleArea}>
            <h1 className={detailStyles.title} data-testid="task-title">
              {task.title}
            </h1>
            <div className={detailStyles.meta}>
              {`Created ${new Date(task.createdAt).toLocaleDateString()} · Updated ${new Date(task.updatedAt).toLocaleDateString()}`}
            </div>
          </div>
          <div className={detailStyles.actions}>
            <ConfirmDialog
              triggerLabel="Delete"
              title="Delete Task"
              description={`Are you sure you want to delete "${task.title}"? This action cannot be undone.`}
              confirmLabel="Delete Task"
              onConfirm={async () => {
                const result = await api.tasks.delete(taskId);
                if (!result.ok) {
                  console.error('Failed to delete task:', result.error.message);
                  return;
                }
                navigate({ to: '/' });
              }}
            />
          </div>
        </div>
        <div className={detailStyles.statusBar} data-testid="status-bar">
          <span
            className={badge({
              color:
                task.status === 'done' ? 'green' : task.status === 'in-progress' ? 'blue' : 'gray',
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
              type="button"
              key={tr.status}
              className={button({ intent: 'secondary', size: 'sm' })}
              onClick={async () => {
                const result = await api.tasks.update(taskId, { status: tr.status });
                if (!result.ok) {
                  console.error('Failed to update task:', result.error.message);
                  return;
                }
                taskQuery.refetch();
              }}
            >
              {tr.label}
            </button>
          ))}
        </div>
        <div style={{ marginTop: '1.5rem' }}>
          <div
            role="tablist"
            style={{
              display: 'flex',
              gap: '0.5rem',
              borderBottom: '1px solid var(--color-border)',
              paddingBottom: '0.5rem',
              marginBottom: '1rem',
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'details' ? 'true' : 'false'}
              className={button({
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
              className={button({
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
            <div className={detailStyles.section}>
              <h3 className={detailStyles.sectionTitle}>Description</h3>
              <div className={detailStyles.description} data-testid="task-description">
                {task.description}
              </div>
            </div>
          )}
          {activeTab === 'activity' && (
            <div className={detailStyles.timeline}>
              No activity yet. Status changes and comments will appear here.
            </div>
          )}
        </div>
      </div>
    ),
  });

  return (
    <div className={detailStyles.page} data-testid="task-detail-page">
      {taskContent}
    </div>
  );
}
