/**
 * Task List page — displays tasks with filtering and URL-based pagination.
 *
 * Demonstrates:
 * - JSX for page layout and component composition
 * - query() for reactive data fetching with pagination
 * - useSearchParams() for URL-driven reactive state
 * - Compiler auto-thunk: query(api.tasks.list({ page: sp.page })) is
 *   auto-wrapped in a thunk so that search param changes re-fetch data
 * - Direct conditional rendering for loading/error/data states
 * - Compiler `let` → signal transform for local filter state
 * - Compiler `const` → computed transform for derived values from query()
 * - Compiler list transform: {items.map(...)} → __list()
 * - <TaskCard /> JSX component embedding
 */

import { ChevronLeftIcon, ChevronRightIcon, InboxIcon, PlusIcon } from '@vertz/icons';
import { query, useRouter, useSearchParams } from '@vertz/ui';
import { api } from '../api/mock-data';
import { TaskCard } from '../components/task-card';
import type { Task, TaskStatus } from '../lib/types';
import { button, emptyStateStyles, layoutStyles } from '../styles/components';

const PAGE_SIZE = 4;

/**
 * Render the task list page.
 *
 * Uses useSearchParams() for URL-based pagination and direct conditional
 * rendering for loading/error/data states. The filter bar and header
 * remain outside the conditionals. Navigation is accessed via useRouter()
 * context — no props needed.
 */
export function TaskListPage() {
  const { navigate } = useRouter();
  const sp = useSearchParams<{ page: number }>();

  // ── Reactive state ─────────────────────────────────
  // Schema on the route provides defaults: sp.page is always a number (1 when absent).
  // This ensures consistent dep hashes whether the URL has ?page=1 or no param at all.
  const pageNum = sp.page as number;

  // Local state: compiler transforms `let` to signal()
  let statusFilter: TaskStatus | 'all' = 'all';

  // query() with reactive search param — compiler auto-wraps in thunk
  const tasksQuery = query(api.tasks.list({ page: pageNum, limit: PAGE_SIZE }));

  // When switching pages, query has stale data from the previous page so it
  // sets `revalidating` (not `loading`).  We treat either as "fetching".
  const isFetching = tasksQuery.loading || tasksQuery.revalidating;

  // Derived value — the compiler classifies this as computed (depends on
  // signal API properties) and wraps in computed() automatically.
  const filteredTasks = !tasksQuery.data
    ? []
    : statusFilter === 'all'
      ? tasksQuery.data.items
      : tasksQuery.data.items.filter((t: Task) => t.status === statusFilter);

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
      <div className={layoutStyles.header}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '700' }}>Tasks</h1>

        <button
          type="button"
          className={button({ intent: 'primary', size: 'md' })}
          data-testid="create-task-btn"
          onClick={() => navigate({ to: '/tasks/new' })}
        >
          <PlusIcon size={14} />
          New Task
        </button>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {filters.map((filter) => (
          <button
            type="button"
            className={button({
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
      {!tasksQuery.data && tasksQuery.loading && <div data-testid="loading">Loading tasks...</div>}
      {tasksQuery.error && (
        <div style={{ color: 'var(--color-destructive)' }} data-testid="error">
          {`Failed to load tasks: ${tasksQuery.error instanceof Error ? tasksQuery.error.message : String(tasksQuery.error)}`}
        </div>
      )}
      {tasksQuery.data && (
        <>
          {filteredTasks.length === 0 && !isFetching && (
            <div className={emptyStateStyles.container}>
              <div className={emptyStateStyles.icon}>
                <InboxIcon size={48} />
              </div>
              <h3 className={emptyStateStyles.title}>No tasks found</h3>
              <p className={emptyStateStyles.description}>Create your first task to get started.</p>
              <button
                type="button"
                className={button({ intent: 'primary', size: 'md' })}
                onClick={() => navigate({ to: '/tasks/new' })}
              >
                Create Task
              </button>
            </div>
          )}
          <div
            data-testid="task-list"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              opacity: isFetching ? 0.6 : 1,
              pointerEvents: isFetching ? 'none' : undefined,
              transition: 'opacity 150ms ease',
            }}
          >
            {filteredTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onClick={(id) => navigate({ to: '/tasks/:id', params: { id } })}
              />
            ))}
          </div>
          {tasksQuery.data.totalPages > 1 && (
            <div
              data-testid="pagination"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                marginTop: '1.5rem',
              }}
            >
              <button
                type="button"
                className={button({ intent: 'ghost', size: 'sm' })}
                data-testid="pagination-prev"
                disabled={pageNum <= 1 || tasksQuery.loading}
                onClick={() => {
                  sp.page = pageNum - 1;
                }}
              >
                <ChevronLeftIcon size={14} />
                Previous
              </button>
              <span
                data-testid="pagination-info"
                style={{ fontSize: '0.875rem', color: 'var(--color-muted-foreground)' }}
              >
                {`Page ${tasksQuery.data.page} of ${tasksQuery.data.totalPages}`}
              </span>
              <button
                type="button"
                className={button({ intent: 'ghost', size: 'sm' })}
                data-testid="pagination-next"
                disabled={pageNum >= tasksQuery.data.totalPages || tasksQuery.loading}
                onClick={() => {
                  sp.page = pageNum + 1;
                }}
              >
                Next
                <ChevronRightIcon size={14} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
