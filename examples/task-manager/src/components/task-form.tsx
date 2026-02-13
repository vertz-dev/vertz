/**
 * TaskForm component — create-task form with validation.
 *
 * Demonstrates:
 * - JSX for form layout with multiple fields
 * - form() with schema validation (external signals — still use .value)
 * - SdkMethod metadata for progressive enhancement
 * - effect() for reactive updates driven by external signals (form state)
 *
 * Note: All reactive state here comes from form() (external signals),
 * so effect() is still needed. No local `let` → signal transform applies.
 */

import type { FormSchema } from '@vertz/ui';
import { effect, form } from '@vertz/ui';
import { taskApi } from '../api/mock-data';
import type { CreateTaskBody, Task, TaskPriority } from '../lib/types';
import { button, formStyles } from '../styles/components';

/**
 * Schema for task creation.
 *
 * In a real app this would be a @vertz/schema type shared between
 * client and server. Here we inline a minimal parse() implementation.
 */
const createTaskSchema: FormSchema<CreateTaskBody> = {
  parse(data: unknown): CreateTaskBody {
    const obj = data as Record<string, unknown>;
    const errors: Record<string, string> = {};

    if (!obj.title || typeof obj.title !== 'string' || obj.title.trim().length === 0) {
      errors.title = 'Title is required';
    } else if (obj.title.length > 200) {
      errors.title = 'Title must be 200 characters or fewer';
    }

    if (!obj.description || typeof obj.description !== 'string') {
      errors.description = 'Description is required';
    }

    const validPriorities = ['low', 'medium', 'high', 'urgent'];
    if (!obj.priority || !validPriorities.includes(obj.priority as string)) {
      errors.priority = 'Priority must be low, medium, high, or urgent';
    }

    if (Object.keys(errors).length > 0) {
      const err = new Error('Validation failed');
      (err as Error & { fieldErrors: Record<string, string> }).fieldErrors = errors;
      throw err;
    }

    return {
      title: (obj.title as string).trim(),
      description: (obj.description as string).trim(),
      priority: obj.priority as TaskPriority,
    };
  },
};

export interface TaskFormProps {
  onSuccess: (task: Task) => void;
  onCancel: () => void;
}

/**
 * Render the create-task form.
 *
 * Uses form() to bind to the taskApi.create SDK method with schema validation.
 */
export function TaskForm(props: TaskFormProps): HTMLFormElement {
  const { onSuccess, onCancel } = props;

  // Create the form instance bound to the SDK method
  const taskForm = form(taskApi.create, {
    schema: createTaskSchema,
  });

  // Get progressive enhancement attributes
  const formAttrs = taskForm.attrs();

  // Error display elements — referenced by effect() for reactive updates
  const titleError = (
    <span class={formStyles.classNames.error} data-testid="title-error" />
  ) as HTMLElement;
  const descError = (
    <span class={formStyles.classNames.error} data-testid="description-error" />
  ) as HTMLElement;
  const priorityError = (
    <span class={formStyles.classNames.error} data-testid="priority-error" />
  ) as HTMLElement;

  // Submit button — referenced by effect() for reactive submitting state
  const submitBtn = (
    <button
      type="submit"
      class={button({ intent: 'primary', size: 'md' })}
      data-testid="submit-task"
    >
      Create Task
    </button>
  ) as HTMLButtonElement;

  // Reactive error display — re-runs whenever form error signals change
  effect(() => {
    titleError.textContent = taskForm.error('title') ?? '';
    descError.textContent = taskForm.error('description') ?? '';
    priorityError.textContent = taskForm.error('priority') ?? '';
  });

  // Reactive submitting state — disable button while submitting
  effect(() => {
    const isSubmitting = taskForm.submitting.value;
    submitBtn.disabled = isSubmitting;
    submitBtn.textContent = isSubmitting ? 'Creating...' : 'Create Task';
  });

  // Build the form with JSX
  const formEl = (
    <form action={formAttrs.action} method={formAttrs.method} data-testid="create-task-form">
      <div class={formStyles.classNames.formGroup}>
        <label class={formStyles.classNames.label} for="task-title">
          Title
        </label>
        <input
          class={formStyles.classNames.input}
          id="task-title"
          name="title"
          type="text"
          placeholder="What needs to be done?"
        />
        {titleError}
      </div>

      <div class={formStyles.classNames.formGroup}>
        <label class={formStyles.classNames.label} for="task-description">
          Description
        </label>
        <textarea
          class={formStyles.classNames.textarea}
          id="task-description"
          name="description"
          placeholder="Describe the task in detail..."
        />
        {descError}
      </div>

      <div class={formStyles.classNames.formGroup}>
        <label class={formStyles.classNames.label} for="task-priority">
          Priority
        </label>
        <select class={formStyles.classNames.select} id="task-priority" name="priority">
          <option value="low">Low</option>
          <option value="medium" selected>
            Medium
          </option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
        {priorityError}
      </div>

      <div style="display: flex; gap: 0.5rem; justify-content: flex-end">
        <button
          type="button"
          class={button({ intent: 'secondary', size: 'md' })}
          onClick={onCancel}
        >
          Cancel
        </button>
        {submitBtn}
      </div>
    </form>
  ) as HTMLFormElement;

  // Submit handler
  formEl.addEventListener(
    'submit',
    taskForm.handleSubmit({
      onSuccess: (task) => {
        onSuccess(task);
      },
      onError: (errors) => {
        // Errors are already displayed reactively via effect() above.
        // This callback is useful for analytics/logging.
        console.warn('Form validation failed:', errors);
      },
    }),
  );

  return formEl;
}
