/**
 * TodoItem - Single todo item component with toggle and delete actions.
 *
 * Demonstrates:
 * - Generated SDK mutations returning Result (error-as-values)
 * - Optimistic updates with rollback on error
 * - Result-based error handling for SDK calls
 */

import { api } from '../api/client';
import { button, todoItemStyles } from '../styles/components';

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

    const result = await api.todos.update(id, { completed: isCompleted });
    if (!result.ok) {
      isCompleted = previousValue;
      console.error('Failed to update todo:', result.error.message);
      return;
    }
    onToggle(id, isCompleted);
  };

  const handleDelete = async () => {
    const result = await api.todos.delete(id);
    if (!result.ok) {
      console.error('Failed to delete todo:', result.error.message);
      return;
    }

    onDelete(id);
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
        class={button({ intent: 'ghost', size: 'sm' })}
        onClick={handleDelete}
        data-testid={`todo-delete-${id}`}
      >
        Delete
      </button>
    </div>
  );
}
