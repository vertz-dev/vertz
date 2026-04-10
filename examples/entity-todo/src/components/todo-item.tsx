/**
 * TodoItem - Single todo item component with toggle and delete actions.
 *
 * Demonstrates:
 * - Automatic optimistic updates — no manual state management needed
 * - Generated SDK mutations with auto-wired optimistic handler
 * - useDialogStack().confirm() for delete confirmation
 */

import { useDialogStack } from '@vertz/ui';
import { api } from '../api/client';
import { button, todoItemStyles } from '../styles/components';

export interface TodoItemProps {
  id: string;
  title: string;
  completed: boolean;
}

export function TodoItem({ id, title, completed }: TodoItemProps) {
  const dialogs = useDialogStack();

  const handleToggle = async () => {
    // Automatic optimistic update: the framework applies the patch to EntityStore
    // immediately, and rolls back if the server returns an error.
    const result = await api.todos.update(id, { completed: !completed });
    if (!result.ok) {
      console.error('Failed to update todo:', result.error.message);
    }
  };

  const handleDelete = async () => {
    const confirmed = await dialogs.confirm({
      title: 'Delete todo?',
      description: `This will permanently delete "${title}". This action cannot be undone.`,
      confirm: 'Delete',
      cancel: 'Cancel',
      intent: 'danger',
    });
    if (!confirmed) return;

    const result = await api.todos.delete(id);
    if (!result.ok) {
      console.error('Failed to delete todo:', result.error.message);
    }
  };

  return (
    <div className={todoItemStyles.item} data-testid={`todo-item-${id}`}>
      <input
        type="checkbox"
        className={todoItemStyles.checkbox}
        checked={completed}
        onChange={handleToggle}
        data-testid={`todo-checkbox-${id}`}
      />
      <span
        className={completed ? todoItemStyles.labelCompleted : todoItemStyles.label}
        data-testid={`todo-title-${id}`}
      >
        {title}
      </span>
      <button
        type="button"
        className={button({ intent: 'ghost', size: 'sm' })}
        onClick={handleDelete}
        data-testid={`todo-delete-${id}`}
      >
        Delete
      </button>
    </div>
  );
}
