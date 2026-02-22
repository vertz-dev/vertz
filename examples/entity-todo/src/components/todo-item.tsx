/**
 * TodoItem component — single todo row with toggle and delete.
 *
 * Demonstrates:
 * - JSX for declarative component layout
 * - Compiler `let` → signal transform for local reactive state
 * - Inline event handlers calling SDK methods
 */

import { deleteTodo, updateTodo } from '../api/mock-data';
import { todoItemStyles } from '../styles/components';

export interface TodoItemProps {
  id: string;
  title: string;
  completed: boolean;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
}

export function TodoItem({ id, title, completed, onToggle, onDelete }: TodoItemProps): HTMLElement {
  let isCompleted = completed;

  const handleToggle = async () => {
    isCompleted = !isCompleted;
    try {
      await updateTodo(id, { completed: isCompleted });
      onToggle(id, isCompleted);
    } catch {
      // Revert on failure
      isCompleted = !isCompleted;
    }
  };

  const handleDelete = async () => {
    try {
      await deleteTodo(id);
      onDelete(id);
    } catch (err) {
      console.error('Failed to delete todo:', err);
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
