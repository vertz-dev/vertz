/**
 * TodoForm - Form component for creating new todos.
 *
 * Demonstrates:
 * - form() with SDK method and schema validation
 * - Per-field error signals for inline error display
 * - Reactive disabled state during submission
 */

import { css, form, token } from '@vertz/ui';
import type { TodosResponse } from '../api/client';
import { api } from '../api/client';
import { button, formStyles, inputStyles } from '../styles/components';

const styles = css({
  row: { display: 'flex', gap: token.spacing[2], alignItems: 'flex-start', width: '100%' },
  inputWrap: { flex: '1 1 0%' },
});

export interface TodoFormProps {
  onSuccess?: (todo: TodosResponse) => void;
}

export function TodoForm({ onSuccess }: TodoFormProps = {}) {
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
      <div className={styles.row}>
        <div className={styles.inputWrap}>
          <input
            className={inputStyles.base}
            name={todoForm.fields.title}
            type="text"
            placeholder="What needs to be done?"
            data-testid="todo-title-input"
          />
          <span className={formStyles.error} data-testid="title-error">
            {todoForm.title.error}
          </span>
        </div>
        <button
          type="submit"
          className={button({ intent: 'primary', size: 'md' })}
          data-testid="submit-todo"
          disabled={todoForm.submitting}
        >
          {todoForm.submitting.value ? 'Adding...' : 'Add Todo'}
        </button>
      </div>
    </form>
  );
}
