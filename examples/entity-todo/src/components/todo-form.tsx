/**
 * TodoForm component — create-todo form with validation.
 *
 * Demonstrates:
 * - form() with direct properties: action, method, onSubmit
 * - Per-field reactive state: todoForm.title.error for inline error display
 * - Generated SDK carries type-only schema via .meta.bodySchema automatically
 * - Override with { schema } when you need constraints (min length, format, etc.)
 * - Reactive JSX attributes: disabled={todoForm.submitting}
 * - SdkMethod metadata for progressive enhancement
 * - No effect() needed — per-field signals replace error() and computed bridges
 */

import { s } from '@vertz/schema';
import { form } from '@vertz/ui';
import type { Todo } from '../api/mock-data';
import { todoApi } from '../api/mock-data';
import { button, formStyles } from '../styles/components';

// The generated SDK auto-carries a type-only schema (s.string(), s.boolean()).
// Override with a stricter schema to add client-side constraints like min length.
const createTodoSchema = s.object({
  title: s.string().min(1),
});

export interface TodoFormProps {
  onSuccess: (todo: Todo) => void;
}

export function TodoForm({ onSuccess }: TodoFormProps) {
  const todoForm = form(todoApi.create, {
    schema: createTodoSchema,
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
      <div style="display: flex; gap: 0.5rem; align-items: flex-start">
        <div style="flex: 1">
          <input
            class={formStyles.classNames.input}
            name="title"
            type="text"
            placeholder="What needs to be done?"
            data-testid="todo-title-input"
          />
          <span class={formStyles.classNames.error} data-testid="title-error">
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
