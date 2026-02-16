/**
 * Task List page — displays all tasks with filtering.
 *
 * Demonstrates:
 * - JSX for page layout and component composition
 * - query() for reactive data fetching (external signals — still use .value)
 * - Compiler `let` → signal transform for local filter state
 * - Compiler conditional transform: {show && <el/>} → __conditional()
 * - Compiler list transform: {items.map(...)} → __list()
 * - <TaskCard /> JSX component embedding
 */
import { effect, onCleanup, onMount, query } from '@vertz/ui';
import { fetchTasks } from '../api/mock-data';
import { TaskCard } from '../components/task-card';
import { button, emptyStateStyles, layoutStyles } from '../styles/components';
/**
 * Render the task list page.
 *
 * Uses query() to fetch tasks reactively. Local `let` signals bridge external
 * query signals into the compiler's reactive system, enabling declarative
 * conditional rendering and list transforms in JSX.
 */
export function TaskListPage(props) {
    const { navigate } = props;
    // ── Reactive state ─────────────────────────────────
    // Local state: compiler transforms `let` to signal()
    let statusFilter = 'all';
    // query() returns external signals — .data, .loading, .error still need .value
    const tasksQuery = query(() => fetchTasks(), {
        key: 'task-list',
    });
    // Bridge external signals into local signals so the compiler can track them.
    // The sync effect reads external .value and writes to local `let` signals.
    // JSX conditionals and list transforms reference these local signals,
    // which the compiler transforms to __conditional() and __list().
    let isLoading = true;
    let hasError = false;
    let errorMsg = '';
    let filteredTasks = [];
    effect(() => {
        isLoading = tasksQuery.loading.value;
        const err = tasksQuery.error.value;
        hasError = !!err;
        errorMsg = err
            ? `Failed to load tasks: ${err instanceof Error ? err.message : String(err)}`
            : '';
        const result = tasksQuery.data.value;
        const filter = statusFilter;
        if (!result) {
            filteredTasks = [];
        }
        else if (filter === 'all') {
            filteredTasks = result.tasks;
        }
        else {
            filteredTasks = result.tasks.filter((t) => t.status === filter);
        }
    });
    // ── Filter bar with reactive active state ───────────
    const filterBar = (<div style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem"/>);
    const filters = [
        { label: 'All', value: 'all' },
        { label: 'To Do', value: 'todo' },
        { label: 'In Progress', value: 'in-progress' },
        { label: 'Done', value: 'done' },
    ];
    for (const filter of filters) {
        const btn = (<button data-testid={`filter-${filter.value}`} onClick={() => {
                statusFilter = filter.value;
            }}>
        {filter.label}
      </button>);
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
    return (<div data-testid="task-list-page">
      <div class={layoutStyles.classNames.header}>
        <h1 style="font-size: 1.5rem; font-weight: 700">Tasks</h1>
        <button class={button({ intent: 'primary', size: 'md' })} data-testid="create-task-btn" onClick={() => navigate('/tasks/new')}>
          + New Task
        </button>
      </div>
      {filterBar}
      {isLoading && <div data-testid="loading">Loading tasks...</div>}
      {hasError && (<div style="color: var(--color-danger-500)" data-testid="error">
          {errorMsg}
        </div>)}
      {!isLoading && !hasError && filteredTasks.length === 0 && (<div class={emptyStateStyles.classNames.container}>
          <h3 class={emptyStateStyles.classNames.title}>No tasks found</h3>
          <p class={emptyStateStyles.classNames.description}>
            Create your first task to get started.
          </p>
          <button class={button({ intent: 'primary', size: 'md' })} onClick={() => navigate('/tasks/new')}>
            Create Task
          </button>
        </div>)}
      <div data-testid="task-list" style="display: flex; flex-direction: column; gap: 0.75rem">
        {filteredTasks.map((task) => (<TaskCard key={task.id} task={task} onClick={(id) => navigate(`/tasks/${id}`)}/>))}
      </div>
    </div>);
}
//# sourceMappingURL=task-list.js.map