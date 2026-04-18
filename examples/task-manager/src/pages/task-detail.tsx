/**
 * Task Detail page — view and manage a single task.
 *
 * Demonstrates:
 * - JSX for page layout and dynamic content
 * - query() with QueryDescriptor for zero-boilerplate data fetching
 * - Direct conditional rendering for loading/error/data states
 * - Compiler `const` → computed transform for derived values
 * - Dialog primitive for delete confirmation (<ConfirmDialog /> in JSX)
 * - Declarative tab switching with `let` signal state
 */

import { ArrowLeftIcon } from '@vertz/icons';
import { css, query, token, useParams, useRouter } from '@vertz/ui';
import { api } from '../api/mock-data';
import { ConfirmDialog } from '../components/confirm-dialog';
import type { TaskStatus } from '../lib/types';
import { badge, button } from '../styles/components';

const detailStyles = css({
  page: { maxWidth: '42rem', marginInline: 'auto' },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: token.spacing[6],
  },
  titleArea: { flex: '1 1 0%' },
  title: {
    fontSize: token.font.size['2xl'],
    fontWeight: token.font.weight.bold,
    color: token.color.foreground,
    marginBottom: token.spacing[1],
  },
  meta: { fontSize: token.font.size.sm, color: token.color['muted-foreground'] },
  actions: { display: 'flex', gap: token.spacing[2], alignItems: 'flex-start' },
  section: { marginBottom: token.spacing[6] },
  sectionTitle: {
    fontSize: token.font.size.sm,
    fontWeight: token.font.weight.semibold,
    color: token.color['muted-foreground'],
    textTransform: 'uppercase',
    letterSpacing: 'wide',
    marginBottom: token.spacing[2],
  },
  description: { color: token.color.foreground, lineHeight: token.font.lineHeight.relaxed },
  statusBar: {
    display: 'flex',
    gap: token.spacing[2],
    alignItems: 'center',
    padding: token.spacing[3],
    backgroundColor: token.color.card,
    borderRadius: token.radius.lg,
    borderWidth: '1px',
    borderColor: token.color.border,
  },
  timeline: { fontSize: token.font.size.sm, color: token.color['muted-foreground'] },
});

/**
 * Render the task detail page.
 *
 * Fetches a single task by ID using query() and renders the result
 * via direct conditional rendering for loading/error/data states.
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

  return (
    <div className={detailStyles.page} data-testid="task-detail-page">
      {taskQuery.loading && <div data-testid="loading">Loading task...</div>}
      {taskQuery.error && (
        <div style={{ color: 'var(--color-destructive)' }} data-testid="error">
          {`Failed to load task: ${taskQuery.error instanceof Error ? taskQuery.error.message : String(taskQuery.error)}`}
        </div>
      )}
      {taskQuery.data && (
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
                {taskQuery.data.title}
              </h1>
              <div className={detailStyles.meta}>
                {`Created ${new Date(taskQuery.data.createdAt).toLocaleDateString()} · Updated ${new Date(taskQuery.data.updatedAt).toLocaleDateString()}`}
              </div>
            </div>
            <div className={detailStyles.actions}>
              <ConfirmDialog
                triggerLabel="Delete"
                title="Delete Task"
                description={`Are you sure you want to delete "${taskQuery.data.title}"? This action cannot be undone.`}
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
                  taskQuery.data.status === 'done'
                    ? 'green'
                    : taskQuery.data.status === 'in-progress'
                      ? 'blue'
                      : 'gray',
              })}
            >
              {taskQuery.data.status === 'in-progress'
                ? 'In Progress'
                : taskQuery.data.status === 'done'
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
                  {taskQuery.data.description}
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
      )}
    </div>
  );
}
