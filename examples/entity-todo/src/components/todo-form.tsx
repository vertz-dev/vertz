/**
 * TodoForm - Form component for creating new todos.
 *
 * Demonstrates:
 * - Using form() with SDK methods
 * - Schema-based validation with s.string().min(1)
 * - Proper error handling with matchError for form submission
 * - Reactive state for form fields and submission status
 */

import { s } from '@vertz/schema';
import { form } from '@vertz/ui';
import { matchError, isOk, type Result, type FetchErrorType } from '@vertz/fetch';
import type { Todo, CreateTodoInput } from '../api/client';
import { createTodo } from '../api/client';
import { button, formStyles } from '../styles/components';

// Schema for client-side validation
const createTodoSchema = s.object({
  title: s.string().min(1),
});

export interface TodoFormProps {
  onSuccess: (todo: Todo) => void;
}

// Create a simple SDK method wrapper that handles the Result
const createTodoAction = async (body: CreateTodoInput): Promise<{ success: boolean; data?: Todo; error?: string }> => {
  const result: Result<Todo, FetchErrorType> = await createTodo(body);
  
  if (isOk(result)) {
    return { success: true, data: result.data };
  }

  // Handle errors with matchError for compile-time exhaustiveness
  const errorMessage = matchError(result.error, {
    NetworkError: (e) => `Network error: ${e.message}`,
    HttpError: (e) => {
      if (e.serverCode === 'BAD_REQUEST') {
        return `Invalid input: ${e.message}`;
      }
      if (e.serverCode === 'VALIDATION_ERROR') {
        return `Validation failed: ${e.message}`;
      }
      if (e.status === 401) {
        return 'Unauthorized. Please log in.';
      }
      if (e.status === 403) {
        return 'Forbidden. You do not have permission.';
      }
      return `Error ${e.status}: ${e.message}`;
    },
    TimeoutError: (e) => `Request timed out. Please try again.`,
    ParseError: (e) => `Failed to parse response: ${e.path || 'unknown'}`,
    ValidationError: (e) => `Validation error: ${e.errors?.join(', ') || e.message}`,
  });

  return { success: false, error: errorMessage };
};

// Attach metadata for progressive enhancement
Object.assign(createTodoAction, {
  url: '/todos',
  method: 'POST' as const,
});

export function TodoForm({ onSuccess }: TodoFormProps) {
  const todoForm = form(createTodoAction as any, {
    schema: createTodoSchema,
    onSuccess: (data: any) => {
      if (data?.success && data?.data) {
        onSuccess(data.data);
      }
    },
    resetOnSuccess: true,
  });

  return (
    <form
      action={(createTodoAction as any).url}
      method={(createTodoAction as any).method}
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
