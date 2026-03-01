/**
 * TodoListPage - Main page component for displaying and managing todos.
 *
 * Demonstrates:
 * - query() with descriptor-based data fetching
 * - queryMatch() for exclusive-state pattern matching (loading/error/data)
 * - Compiler `const` → computed transform for derived values from query()
 * - Compiler list transform: {items.map(...)} → __list()
 */

import { css, query, queryMatch } from '@vertz/ui';
import type { TodosResponse } from '../api/client';
import { api } from '../api/client';
import { TodoForm } from '../components/todo-form';
import { TodoItem } from '../components/todo-item';
import { emptyStateStyles } from '../styles/components';

const pageStyles = css({
  container: ['py:2'],
  listContainer: ['flex', 'flex-col', 'gap:2', 'mt:6'],
});

export function TodoListPage() {
  const todosQuery = query(api.todos.list());

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
    <div class={pageStyles.container} data-testid="todo-list-page">
      <TodoForm onSuccess={handleCreate} />

      <div class={pageStyles.listContainer}>
        {queryMatch(todosQuery, {
          loading: () => (
            <div data-testid="loading" style="color: var(--color-muted-foreground)">
              Loading todos...
            </div>
          ),
          error: (err) => (
            <div style="color: var(--color-destructive)" data-testid="error">
              {err instanceof Error ? err.message : String(err)}
            </div>
          ),
          data: (todos) => (
            <>
              {todos.length === 0 && (
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
                {todos.map((todo: TodosResponse) => (
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
