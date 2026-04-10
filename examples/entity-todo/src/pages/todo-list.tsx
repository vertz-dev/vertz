/**
 * TodoListPage - Main page component for displaying and managing todos.
 *
 * Demonstrates:
 * - query() with descriptor-based data fetching
 * - Direct conditional rendering for loading/error/data states
 * - Automatic optimistic updates — no refetch callbacks needed for any CRUD operation
 * - <List animate> for animated list item enter/exit
 */

import {
  ANIMATION_DURATION,
  ANIMATION_EASING,
  css,
  fadeOut,
  globalCss,
  query,
  slideInFromTop,
} from '@vertz/ui';
import { List } from '@vertz/ui/components';
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
            <div data-testid="todo-list" className={pageStyles.todoList}>
              <List animate>
                {todosQuery.data.items.map((todo: TodosResponse) => (
                  <List.Item key={todo.id}>
                    <TodoItem id={todo.id} title={todo.title} completed={todo.completed} />
                  </List.Item>
                ))}
              </List>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
