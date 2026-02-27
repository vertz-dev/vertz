/**
 * TodoListPage - Main page component for displaying and managing todos.
 *
 * Demonstrates:
 * - query() with Result<T, FetchError> return types
 * - queryMatch() for exclusive-state pattern matching (loading/error/data)
 * - matchError for compile-time exhaustiveness on Result error handling
 */

import { type FetchErrorType, isOk, matchError, type Result } from '@vertz/fetch';
import { query, queryMatch } from '@vertz/ui';
import type { Todo } from '../api/client';
import { fetchTodos } from '../api/client';
import { TodoForm } from '../components/todo-form';
import { TodoItem } from '../components/todo-item';
import { emptyStateStyles, layoutStyles } from '../styles/components';

export function TodoListPage() {
  // query() must be called directly (not wrapped) so the compiler recognizes
  // the return value as a signal API and properly transforms property accesses
  // like todosQuery.loading → todosQuery.loading.value
  const todosQuery = query(
    async (): Promise<Result<{ todos: Todo[]; total: number }, FetchErrorType>> => {
      return fetchTodos();
    },
    { key: 'todo-list' },
  );

  const handleToggle = (_id: string, _completed: boolean) => {
    todosQuery.refetch();
  };

  const handleDelete = (_id: string) => {
    todosQuery.refetch();
  };

  const handleCreate = (_todo: Todo) => {
    todosQuery.refetch();
  };

  // queryMatch handles loading/error/data exclusively.
  // The data handler further matches the Result<T, FetchError> via matchError.
  const todoContent = queryMatch(todosQuery, {
    loading: () => <div data-testid="loading">Loading todos...</div>,
    error: (err) => (
      <div style="color: var(--color-danger-500)" data-testid="error">
        {`Failed to load todos: ${err instanceof Error ? err.message : String(err)}`}
      </div>
    ),
    data: (result) => {
      if (!result) return <div data-testid="loading">Loading todos...</div>;

      if (!isOk(result)) {
        const errorMsg = result.error
          ? matchError(result.error, {
              NetworkError: (e) => `Network error: ${e.message}. Please check your connection.`,
              HttpError: (e) => {
                if (e.serverCode === 'NOT_FOUND') {
                  return 'Todos not found (404)';
                }
                if (e.status === 500) {
                  return 'Server error. Please try again later.';
                }
                return `Error ${e.status}: ${e.message}`;
              },
              TimeoutError: (e) => `Request timed out: ${e.message}`,
              ParseError: (e) => `Failed to parse response: ${e.path || 'unknown'}`,
              ValidationError: (e) => `Validation error: ${e.errors?.join(', ') || e.message}`,
            })
          : 'Unknown error';

        return (
          <div style="color: var(--color-danger-500)" data-testid="error">
            {errorMsg}
          </div>
        );
      }

      const todoList: Todo[] = result.data.todos;

      return (
        <>
          {todoList.length === 0 && (
            <div class={emptyStateStyles.container}>
              <h3 class={emptyStateStyles.title}>No todos yet</h3>
              <p class={emptyStateStyles.description}>Add your first todo above to get started.</p>
            </div>
          )}
          <div data-testid="todo-list" style="display: flex; flex-direction: column; gap: 0.5rem">
            {todoList.map((todo) => (
              <TodoItem
                key={todo.id}
                id={todo.id}
                title={todo.title}
                completed={todo.completed}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </>
      );
    },
  });

  return (
    <div class={layoutStyles.container} data-testid="todo-list-page">
      <div class={layoutStyles.header}>
        <h1 style="font-size: 1.5rem; font-weight: 700">Entity Todo</h1>
        <span style="font-size: 0.75rem; color: var(--color-muted)">
          schema → entity → SDK → UI → SSR
        </span>
      </div>

      <TodoForm onSuccess={handleCreate} />

      <div style="margin-top: 1.5rem">{todoContent}</div>
    </div>
  );
}
