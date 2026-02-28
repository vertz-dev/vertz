/**
 * TodoItem - Single todo item component with toggle and delete actions.
 *
 * Demonstrates:
 * - Generated SDK mutations (throw FetchError on failure)
 * - Optimistic updates with rollback on error
 * - try/catch error handling for SDK calls
 */

import { api } from '../api/client';
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

    try {
      await api.todos.update(id, { completed: isCompleted });
      onToggle(id, isCompleted);
    } catch (err) {
      isCompleted = previousValue;
      console.error('Failed to update todo:', err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async () => {
    try {
      await api.todos.delete(id);
      onDelete(id);
    } catch (err) {
      console.error('Failed to delete todo:', err instanceof Error ? err.message : String(err));
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
