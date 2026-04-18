/**
 * TodoListPage - Main page component for displaying and managing todos.
 *
 * Demonstrates:
 * - query() with descriptor-based data fetching
 * - Direct conditional rendering for loading/error/data states
 * - Automatic optimistic updates — no refetch callbacks needed for any CRUD operation
 * - Plain <ul>/<li> for todo list (List component context bug with reactive .map())
 */

import { css, query, token } from '@vertz/ui';
import type { TodosResponse } from '../api/client';
import { api } from '../api/client';
import { TodoForm } from '../components/todo-form';
import { TodoItem } from '../components/todo-item';
import { emptyStateStyles } from '../styles/components';

const pageStyles = css({
  container: { paddingBlock: token.spacing[2], width: '100%' },
  listContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: token.spacing[2],
    marginTop: token.spacing[6],
    width: '100%',
  },
  todoList: {
    display: 'flex',
    flexDirection: 'column',
    gap: token.spacing[2],
    '&': { listStyle: 'none', margin: '0', padding: '0' },
  },
  loading: { color: token.color['muted-foreground'] },
  error: { color: token.color.destructive },
});

export function TodoListPage() {
  const todosQuery = query(api.todos.list());

  return (
    <div className={pageStyles.container} data-testid="todo-list-page">
      <TodoForm />

      <div
        className={pageStyles.listContainer}
        style={{ opacity: todosQuery.revalidating ? 0.6 : 1 }}
      >
        {todosQuery.loading && (
          <div data-testid="loading" className={pageStyles.loading}>
            Loading todos...
          </div>
        )}
        {todosQuery.error && (
          <div className={pageStyles.error} data-testid="error">
            {todosQuery.error instanceof Error
              ? todosQuery.error.message
              : String(todosQuery.error)}
          </div>
        )}
        {todosQuery.data && (
          <>
            {todosQuery.data.items.length === 0 && (
              <div className={emptyStateStyles.container}>
                <h3 className={emptyStateStyles.heading}>No todos yet</h3>
                <p className={emptyStateStyles.description}>
                  Add your first todo above to get started.
                </p>
              </div>
            )}
            <ul data-testid="todo-list" className={pageStyles.todoList}>
              {todosQuery.data.items.map((todo: TodosResponse) => (
                <li key={todo.id}>
                  <TodoItem id={todo.id} title={todo.title} completed={todo.completed} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
