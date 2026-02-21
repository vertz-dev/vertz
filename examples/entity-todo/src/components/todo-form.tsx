/**
 * TodoForm component — create-todo form with validation.
 *
 * Demonstrates:
 * - form() with explicit schema override for client-side constraint validation
 * - Generated SDK carries type-only schema via .meta.bodySchema automatically
 * - Override with { schema } when you need constraints (min length, format, etc.)
 * - Reactive error display and submitting state via effect() bridge
 * - SdkMethod metadata for progressive enhancement
 * - No addEventListener — onSubmit in JSX, compiled to __on()
 *
 * Note: form() returns external signals (submitting, errors), so effect()
 * is needed to bridge them into local `let` variables for the compiler's
 * reactivity system. This is the same pattern as query() in todo-list.tsx.
 */

import { s } from '@vertz/schema';
import { effect, form } from '@vertz/ui';
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

export function TodoForm(props: TodoFormProps): HTMLFormElement {
  const { onSuccess } = props;

  const todoForm = form(todoApi.create, { schema: createTodoSchema });

  const { action, method, onSubmit } = todoForm.attrs({
    onSuccess,
    resetOnSuccess: true,
  });

  // Bridge external signals into local `let` for compiler reactivity
  let titleError = '';
  let isSubmitting = false;
  let submitLabel = 'Add Todo';

  effect(() => {
    titleError = todoForm.error('title') ?? '';
    isSubmitting = todoForm.submitting.value;
    submitLabel = isSubmitting ? 'Adding...' : 'Add Todo';
  });

  return (
    <form action={action} method={method} onSubmit={onSubmit} data-testid="create-todo-form">
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
            {titleError}
          </span>
        </div>
        <button
          type="submit"
          class={button({ intent: 'primary', size: 'md' })}
          data-testid="submit-todo"
          disabled={isSubmitting}
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
