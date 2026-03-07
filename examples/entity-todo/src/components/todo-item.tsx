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

export function TodoItem(props: TodoItemProps) {
  let isConfirmOpen = false;

  const handleToggle = async () => {
    // Automatic optimistic update: the framework applies the patch to EntityStore
    // immediately, and rolls back if the server returns an error.
    const result = await api.todos.update(props.id, { completed: !props.completed });
    if (!result.ok) {
      console.error('Failed to update todo:', result.error.message);
    }
  };

  const handleDelete = async () => {
    isConfirmOpen = false;

    const result = await api.todos.delete(props.id);
    if (!result.ok) {
      console.error('Failed to delete todo:', result.error.message);
    }
  };

  return (
    <div class={todoItemStyles.item} data-testid={`todo-item-${props.id}`}>
      <input
        type="checkbox"
        class={todoItemStyles.checkbox}
        checked={props.completed}
        onChange={handleToggle}
        data-testid={`todo-checkbox-${props.id}`}
      />
      <span
        class={props.completed ? todoItemStyles.labelCompleted : todoItemStyles.label}
        data-testid={`todo-title-${props.id}`}
      >
        {props.title}
      </span>
      <button
        type="button"
        class={button({ intent: 'ghost', size: 'sm' })}
        onClick={() => {
          isConfirmOpen = true;
        }}
        data-testid={`todo-delete-${props.id}`}
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
            This will permanently delete "{props.title}". This action cannot be undone.
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
