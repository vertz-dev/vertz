/**
 * TodoListPage - Main page component for displaying and managing todos.
 *
 * This component demonstrates:
 * - Using the generated SDK with Result<T, FetchError> return types
 * - Handling the Result type with isOk() check
 * - Using matchError for compile-time exhaustiveness checking on error handling
 * - Proper error message formatting for different error types (NetworkError, HttpError, TimeoutError, etc.)
 */

import { effect, onCleanup, onMount, query } from '@vertz/ui';
import { isOk, matchError, type Result, type FetchErrorType } from '@vertz/fetch';
import type { Todo } from '../api/client';
import { fetchTodos } from '../api/client';
import { TodoForm } from '../components/todo-form';
import { TodoItem } from '../components/todo-item';
import { emptyStateStyles, layoutStyles } from '../styles/components';

/**
 * Custom query that handles Result type from SDK.
 * Wraps the SDK call to work with the query() pattern.
 */
function createTodosQuery() {
  return query(async (): Promise<Result<{ todos: Todo[]; total: number }, FetchErrorType>> => {
    return fetchTodos();
  }, {
    key: 'todo-list',
  });
}

export function TodoListPage() {
  // query() returns external signals
  const todosQuery = createTodosQuery();

  // Computed values still need effect() bridges with explicit .value access.
  // In JSX, signal properties (loading, error) are used directly.
  let errorMsg = '';
  let todoList: Todo[] = [];

  effect(() => {
    const result = todosQuery.data.value;
    
    if (result) {
      if (isOk(result)) {
        todoList = result.data.todos;
        errorMsg = '';
      } else {
        // Handle error case using matchError for exhaustiveness
        // This ensures all error types are handled at compile time
        todoList = [];
        errorMsg = matchError(result.error, {
          NetworkError: (e) => `Network error: ${e.message}. Please check your connection.`,
          HttpError: (e) => {
            // Use serverCode for specific HTTP error handling
            // e.serverCode contains the semantic error code from the server
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
        });
      }
    }
  });

  const handleToggle = (_id: string, _completed: boolean) => {
    todosQuery.refetch();
  };

  const handleDelete = (_id: string) => {
    todosQuery.refetch();
  };

  const handleCreate = (_todo: Todo) => {
    todosQuery.refetch();
  };

  onMount(() => {
    onCleanup(() => {
      todosQuery.dispose();
    });
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

      <div style="margin-top: 1.5rem">
        {todosQuery.loading && <div data-testid="loading">Loading todos...</div>}
        {todosQuery.error && (
          <div style="color: var(--color-danger-500)" data-testid="error">
            {errorMsg}
          </div>
        )}
        {!todosQuery.loading && !todosQuery.error && todoList.length === 0 && (
          <div class={emptyStateStyles.container}>
            <h3 class={emptyStateStyles.title}>No todos yet</h3>
            <p class={emptyStateStyles.description}>
              Add your first todo above to get started.
            </p>
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
      </div>
    </div>
  );
}
