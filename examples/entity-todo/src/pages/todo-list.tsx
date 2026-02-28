/**
 * TodoListPage - Main page component for displaying and managing todos.
 *
 * Demonstrates:
 * - query() with descriptor-based data fetching
 * - queryMatch() for exclusive-state pattern matching (loading/error/data)
 * - Compiler `const` → computed transform for derived values from query()
 * - Compiler list transform: {items.map(...)} → __list()
 */

import { query, queryMatch } from '@vertz/ui';
import type { TodoListResponse } from '../api/client';
import { api } from '../api/client';
import type { TodosResponse } from '#generated/types';
import { TodoForm } from '../components/todo-form';
import { TodoItem } from '../components/todo-item';
import { emptyStateStyles, layoutStyles } from '../styles/components';

export function TodoListPage() {
  // Cast needed: codegen types list() as TodosResponse[] but the server
  // returns { data: TodosResponse[], total } — tracked as a known codegen issue.
  const todosQuery = query(
    api.todos.list() as unknown as import('@vertz/fetch').QueryDescriptor<TodoListResponse>,
  );

  const handleToggle = (_id: string, _completed: boolean) => {
    todosQuery.refetch();
  };

  const handleDelete = (_id: string) => {
    todosQuery.refetch();
  };

  const handleCreate = (_todo: TodosResponse) => {
    todosQuery.refetch();
  };

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
        {queryMatch(todosQuery, {
          loading: () => <div data-testid="loading">Loading todos...</div>,
          error: (err) => (
            <div style="color: var(--color-danger-500)" data-testid="error">
              {err instanceof Error ? err.message : String(err)}
            </div>
          ),
          data: (result) => (
            <>
              {result.data.length === 0 && (
                <div class={emptyStateStyles.container}>
                  <h3 class={emptyStateStyles.title}>No todos yet</h3>
                  <p class={emptyStateStyles.description}>
                    Add your first todo above to get started.
                  </p>
                </div>
              )}
              <div
                data-testid="todo-list"
                style="display: flex; flex-direction: column; gap: 0.5rem"
              >
                {result.data.map((todo: TodosResponse) => (
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
          ),
        })}
      </div>
    </div>
  );
}
