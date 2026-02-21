/**
 * TodoForm component — create-todo form with validation.
 *
 * Demonstrates:
 * - form() with schema validation and attrs() destructuring
 * - Reactive error display and submitting state via effect() bridge
 * - SdkMethod metadata for progressive enhancement
 * - No addEventListener — onSubmit in JSX, compiled to __on()
 *
 * Note: form() returns external signals (submitting, errors), so effect()
 * is needed to bridge them into local `let` variables for the compiler's
 * reactivity system. This is the same pattern as query() in todo-list.tsx.
 */

import type { FormSchema } from '@vertz/ui';
import { effect, form } from '@vertz/ui';
import { todoApi } from '../api/mock-data';
import type { CreateTodoInput, Todo } from '../api/mock-data';
import { button, formStyles } from '../styles/components';

const createTodoSchema: FormSchema<CreateTodoInput> = {
  parse(data: unknown): CreateTodoInput {
    const obj = data as Record<string, unknown>;
    const errors: Record<string, string> = {};

    if (!obj.title || typeof obj.title !== 'string' || obj.title.trim().length === 0) {
      errors.title = 'Title is required';
    }

    if (Object.keys(errors).length > 0) {
      const err = new Error('Validation failed');
      (err as Error & { fieldErrors: Record<string, string> }).fieldErrors = errors;
      throw err;
    }

    return {
      title: (obj.title as string).trim(),
    };
  },
};

export interface TodoFormProps {
  onSuccess: (todo: Todo) => void;
}

export function TodoForm(props: TodoFormProps): HTMLFormElement {
  const { onSuccess } = props;

  const todoForm = form(todoApi.create, {
    schema: createTodoSchema,
  });

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
    <form
      action={action}
      method={method}
      onSubmit={onSubmit}
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
  ) as HTMLFormElement;
}
