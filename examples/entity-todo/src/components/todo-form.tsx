/**
 * TodoForm - Form component for creating new todos.
 *
 * Demonstrates:
 * - form() with SDK method and schema validation
 * - Per-field error signals for inline error display
 * - Reactive disabled state during submission
 */

import { form } from '@vertz/ui';
import type { TodosResponse } from '../api/client';
import { api } from '../api/client';
import { button, formStyles, inputStyles } from '../styles/components';

export interface TodoFormProps {
  onSuccess: (todo: TodosResponse) => void;
}

export function TodoForm({ onSuccess }: TodoFormProps) {
  const todoForm = form(api.todos.create, {
    onSuccess,
    resetOnSuccess: true,
  });

  return (
    <form
      action={todoForm.action}
      method={todoForm.method}
      onSubmit={todoForm.onSubmit}
      data-testid="create-todo-form"
    >
      <div style="display: flex; gap: 0.5rem; align-items: flex-start; width: 100%">
        <div style="flex: 1">
          <input
            class={inputStyles.base}
            name="title"
            type="text"
            placeholder="What needs to be done?"
            data-testid="todo-title-input"
          />
          <span class={formStyles.error} data-testid="title-error">
            {todoForm.title.error}
          </span>
        </div>
        <button
          type="submit"
          class={button({ intent: 'primary', size: 'md' })}
          data-testid="submit-todo"
          disabled={todoForm.submitting}
        >
          {todoForm.submitting.value ? 'Adding...' : 'Add Todo'}
        </button>
      </div>
    </form>
  );
}
