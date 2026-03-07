/**
 * TodoItem - Single todo item component with toggle and delete actions.
 *
 * Demonstrates:
 * - Automatic optimistic updates — no manual state management needed
 * - Generated SDK mutations with auto-wired optimistic handler
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
}

export function TodoItem({ id, title, completed }: TodoItemProps) {
  let isConfirmOpen = false;

  const handleToggle = async () => {
    // Automatic optimistic update: the framework applies the patch to EntityStore
    // immediately, and rolls back if the server returns an error.
    const result = await api.todos.update(id, { completed: !completed });
    if (!result.ok) {
      console.error('Failed to update todo:', result.error.message);
    }
  };

  const handleDelete = async () => {
    isConfirmOpen = false;

    const result = await api.todos.delete(id);
    if (!result.ok) {
      console.error('Failed to delete todo:', result.error.message);
    }
  };

  return (
    <div class={todoItemStyles.item} data-testid={`todo-item-${id}`}>
      <input
        type="checkbox"
        class={todoItemStyles.checkbox}
        checked={completed}
        onChange={handleToggle}
        data-testid={`todo-checkbox-${id}`}
      />
      <span
        class={completed ? todoItemStyles.labelCompleted : todoItemStyles.label}
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
