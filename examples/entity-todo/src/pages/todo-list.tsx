/**
 * Todo List page — displays all todos with create form.
 *
 * Demonstrates:
 * - JSX for page layout and component composition
 * - query() for reactive data fetching
 * - Compiler `let` → signal transform for local state
 * - Compiler conditional transform: {show && <el/>} → __conditional()
 * - Compiler list transform: {items.map(...)} → __list()
 */

import { effect, onCleanup, onMount, query } from '@vertz/ui';
import { fetchTodos } from '../api/mock-data';
import type { Todo } from '../api/mock-data';
import { TodoForm } from '../components/todo-form';
import { TodoItem } from '../components/todo-item';
import { button, emptyStateStyles, layoutStyles } from '../styles/components';

export function TodoListPage(): HTMLElement {
  // query() returns external signals
  const todosQuery = query(() => fetchTodos(), {
    key: 'todo-list',
  });

  // Bridge external signals into local signals
  let isLoading = true;
  let hasError = false;
  let errorMsg = '';
  let todoList: Todo[] = [];

  effect(() => {
    isLoading = todosQuery.loading.value;
    const err = todosQuery.error.value;
    hasError = !!err;
    errorMsg = err
      ? `Failed to load todos: ${err instanceof Error ? err.message : String(err)}`
      : '';

    const result = todosQuery.data.value;
    todoList = result ? result.todos : [];
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
    <div class={layoutStyles.classNames.container} data-testid="todo-list-page">
      <div class={layoutStyles.classNames.header}>
        <h1 style="font-size: 1.5rem; font-weight: 700">Entity Todo</h1>
        <span style="font-size: 0.75rem; color: var(--color-muted)">
          schema → entity → SDK → UI → SSR
        </span>
      </div>

      <TodoForm onSuccess={handleCreate} />

      <div style="margin-top: 1.5rem">
        {isLoading && <div data-testid="loading">Loading todos...</div>}
        {hasError && (
          <div style="color: var(--color-danger-500)" data-testid="error">
            {errorMsg}
          </div>
        )}
        {!isLoading && !hasError && todoList.length === 0 && (
          <div class={emptyStateStyles.classNames.container}>
            <h3 class={emptyStateStyles.classNames.title}>No todos yet</h3>
            <p class={emptyStateStyles.classNames.description}>
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
  ) as HTMLElement;
}
