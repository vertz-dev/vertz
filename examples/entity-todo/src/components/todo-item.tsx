/**
 * TodoItem - Single todo item component with toggle and delete actions.
 *
 * Demonstrates:
 * - Using SDK methods for mutations (update, delete)
 * - Handling Result<T, FetchError> from SDK calls
 * - Using matchError for proper error handling
 * - Optimistic updates with rollback on error
 */

import { matchError, isOk, type Result, type FetchErrorType } from '@vertz/fetch';
import { updateTodo, deleteTodo } from '../api/client';
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
    
    const result: Result<any, FetchErrorType> = await updateTodo(id, { completed: isCompleted });
    
    if (isOk(result)) {
      onToggle(id, isCompleted);
    } else {
      // Revert on failure
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
    const result: Result<any, FetchErrorType> = await deleteTodo(id);
    
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
    <div class={todoItemStyles.classNames.item} data-testid={`todo-item-${id}`}>
      <input
        type="checkbox"
        class={todoItemStyles.classNames.checkbox}
        checked={isCompleted}
        onChange={handleToggle}
        data-testid={`todo-checkbox-${id}`}
      />
      <span
        class={
          isCompleted ? todoItemStyles.classNames.titleCompleted : todoItemStyles.classNames.title
        }
        style={isCompleted ? 'text-decoration: line-through' : ''}
        data-testid={`todo-title-${id}`}
      >
        {title}
      </span>
      <button
        class={todoItemStyles.classNames.deleteBtn}
        onClick={handleDelete}
        data-testid={`todo-delete-${id}`}
      >
        Delete
      </button>
    </div>
  );
}
