/**
 * TodoItem - Single todo item component with toggle and delete actions.
 *
 * Demonstrates:
 * - Result-returning mutations with isOk + matchError
 * - matchError for compile-time exhaustive error handling
 * - Optimistic updates with rollback on error
 */

import { isOk, matchError } from '@vertz/fetch';
import { deleteTodo, updateTodo } from '../api/client';
import { todoItemStyles } from '../styles/components';

export interface TodoItemProps {
  id: string;
  title: string;
  completed: boolean;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
}

export function TodoItem({ id, title, completed, onToggle, onDelete }: TodoItemProps) {
  let isCompleted = completed;

  const handleToggle = async () => {
    const previousValue = isCompleted;
    isCompleted = !isCompleted;

    const result = await updateTodo(id, { completed: isCompleted });

    if (isOk(result)) {
      onToggle(id, isCompleted);
    } else {
      isCompleted = previousValue;
      const errorMessage = matchError(result.error, {
        NetworkError: (e) => `Network error: ${e.message}`,
        HttpError: (e) => {
          if (e.serverCode === 'NOT_FOUND') {
            return 'Todo not found';
          }
          return `Error: ${e.message}`;
        },
        TimeoutError: (e) => `Request timed out: ${e.message}`,
        ParseError: (e) => `Parse error: ${e.path || 'unknown'}`,
        ValidationError: (e) => `Validation error: ${e.message}`,
      });
      console.error('Failed to update todo:', errorMessage);
    }
  };

  const handleDelete = async () => {
    const result = await deleteTodo(id);

    if (isOk(result)) {
      onDelete(id);
    } else {
      const errorMessage = matchError(result.error, {
        NetworkError: (e) => `Network error: ${e.message}`,
        HttpError: (e) => {
          if (e.serverCode === 'NOT_FOUND') {
            return 'Todo not found';
          }
          return `Error: ${e.message}`;
        },
        TimeoutError: (e) => `Request timed out: ${e.message}`,
        ParseError: (e) => `Parse error: ${e.path || 'unknown'}`,
        ValidationError: (e) => `Validation error: ${e.message}`,
      });
      console.error('Failed to delete todo:', errorMessage);
    }
  };

  return (
    <div class={todoItemStyles.item} data-testid={`todo-item-${id}`}>
      <input
        type="checkbox"
        class={todoItemStyles.checkbox}
        checked={isCompleted}
        onChange={handleToggle}
        data-testid={`todo-checkbox-${id}`}
      />
      <span
        class={isCompleted ? todoItemStyles.titleCompleted : todoItemStyles.title}
        style={isCompleted ? 'text-decoration: line-through' : ''}
        data-testid={`todo-title-${id}`}
      >
        {title}
      </span>
      <button
        type="button"
        class={todoItemStyles.deleteBtn}
        onClick={handleDelete}
        data-testid={`todo-delete-${id}`}
      >
        Delete
      </button>
    </div>
  );
}
