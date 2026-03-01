/**
 * TodoItem - Single todo item component with toggle and delete actions.
 *
 * Demonstrates:
 * - Generated SDK mutations returning Result (error-as-values)
 * - Optimistic toggle with rollback on error
 * - Declarative confirm dialog with `let` signal for open/close state
 */

import { css } from '@vertz/ui';
import { api } from '../api/client';
import { alertDialogStyles, button, todoItemStyles } from '../styles/components';

const dialogWrapperStyles = css({
  wrapper: ['fixed', 'inset:0', 'flex', 'items:center', 'justify:center', 'z:50'],
});

export interface TodoItemProps {
  id: string;
  title: string;
  completed: boolean;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
}

export function TodoItem({ id, title, completed, onToggle, onDelete }: TodoItemProps) {
  let isCompleted = completed;
  let isConfirmOpen = false;

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
    isConfirmOpen = false;

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
        style={isCompleted ? 'text-decoration: line-through; font-weight: 400' : 'font-weight: 400'}
        data-testid={`todo-title-${id}`}
      >
        {title}
      </span>
      <button
        type="button"
        class={button({ intent: 'ghost', size: 'sm' })}
        onClick={() => {
          isConfirmOpen = true;
        }}
        data-testid={`todo-delete-${id}`}
      >
        Delete
      </button>

      <div
        class={alertDialogStyles.overlay}
        aria-hidden={isConfirmOpen ? 'false' : 'true'}
        style={isConfirmOpen ? '' : 'display: none'}
      />
      <div class={dialogWrapperStyles.wrapper} style={isConfirmOpen ? '' : 'display: none'}>
        <div
          class={alertDialogStyles.panel}
          role="alertdialog"
          aria-modal="true"
          aria-hidden={isConfirmOpen ? 'false' : 'true'}
          data-state={isConfirmOpen ? 'open' : 'closed'}
        >
          <h2 class={alertDialogStyles.title}>Delete todo?</h2>
          <p class={alertDialogStyles.description}>
            This will permanently delete "{title}". This action cannot be undone.
          </p>
          <div class={alertDialogStyles.footer}>
            <button
              type="button"
              class={button({ intent: 'secondary', size: 'sm' })}
              onClick={() => {
                isConfirmOpen = false;
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              class={button({ intent: 'destructive', size: 'sm' })}
              onClick={handleDelete}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
