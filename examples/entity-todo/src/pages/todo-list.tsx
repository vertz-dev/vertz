/**
 * TodoListPage - Main page component for displaying and managing todos.
 *
 * Demonstrates:
 * - query() with descriptor-based data fetching
 * - queryMatch() for exclusive-state pattern matching (loading/error/data)
 * - Compiler `const` → computed transform for derived values from query()
 * - ListTransition for animated list item enter/exit
 */

import {
  ANIMATION_DURATION,
  ANIMATION_EASING,
  css,
  fadeOut,
  globalCss,
  ListTransition,
  query,
  queryMatch,
  slideInFromTop,
} from '@vertz/ui';
import type { TodosResponse } from '../api/client';
import { api } from '../api/client';
import { TodoForm } from '../components/todo-form';
import { TodoItem } from '../components/todo-item';
import { emptyStateStyles } from '../styles/components';

// Side-effect: injects global data-presence animation rules
void globalCss({
  '[data-presence="enter"]': {
    animation: `${slideInFromTop} ${ANIMATION_DURATION} ${ANIMATION_EASING}`,
  },
  '[data-presence="exit"]': {
    animation: `${fadeOut} ${ANIMATION_DURATION} ${ANIMATION_EASING}`,
    overflow: 'hidden',
  },
});

const pageStyles = css({
  container: ['py:2', 'w:full'],
  listContainer: ['flex', 'flex-col', 'gap:2', 'mt:6', 'w:full'],
  todoList: ['flex', 'flex-col', 'gap:2'],
  loading: ['text:muted-foreground'],
  error: ['text:destructive'],
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

      <div class={pageStyles.listContainer} style={todosQuery.revalidating ? 'opacity: 0.6' : ''}>
        {queryMatch(todosQuery, {
          loading: () => (
            <div data-testid="loading" class={pageStyles.loading}>
              Loading todos...
            </div>
          ),
          error: (err) => (
            <div class={pageStyles.error} data-testid="error">
              {err instanceof Error ? err.message : String(err)}
            </div>
          ),
          data: (response) => (
            <>
              {response.items.length === 0 && (
                <div class={emptyStateStyles.container}>
                  <h3 class={emptyStateStyles.heading}>No todos yet</h3>
                  <p class={emptyStateStyles.description}>
                    Add your first todo above to get started.
                  </p>
                </div>
              )}
              <div data-testid="todo-list" class={pageStyles.todoList}>
                <ListTransition
                  each={response.items}
                  keyFn={(todo: TodosResponse) => todo.id}
                  children={(todo: TodosResponse) => (
                    <TodoItem
                      id={todo.id}
                      title={todo.title}
                      completed={todo.completed}
                      onToggle={handleToggle}
                      onDelete={handleDelete}
                    />
                  )}
                />
              </div>
            </>
          ),
        })}
      </div>
    </div>
  );
}
