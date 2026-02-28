/**
 * TaskForm component — create-task form with validation.
 *
 * Demonstrates:
 * - JSX for form layout with multiple fields
 * - form() with schema validation, direct properties, and per-field signals
 * - SdkMethod metadata for progressive enhancement
 * - Reactive JSX attributes: disabled={taskForm.submitting}
 * - Per-field error signals: taskForm.title.error for inline error display
 * - No effect() needed — signals drive reactivity directly in JSX
 */

import type { FormSchema } from '@vertz/ui';
import { form } from '@vertz/ui';
import { taskApi } from '../api/mock-data';
import type { CreateTaskBody, Task, TaskPriority } from '../lib/types';
import { button, formStyles, inputStyles, labelStyles } from '../styles/components';

/**
 * Schema for task creation.
 *
 * In a real app this would be a @vertz/schema type shared between
 * client and server. Here we inline a minimal parse() implementation.
 */
const createTaskSchema: FormSchema<CreateTaskBody> = {
  parse(data: unknown) {
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
      return { ok: false as const, error: err };
    }

    return {
      ok: true as const,
      data: {
        title: (obj.title as string).trim(),
        description: (obj.description as string).trim(),
        priority: obj.priority as TaskPriority,
      },
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
 * Callbacks (onSuccess, onError) are passed as form options.
 * Per-field error signals drive reactive error display directly in JSX.
 */
export function TaskForm({ onSuccess, onCancel }: TaskFormProps) {
  const taskForm = form(taskApi.create, {
    schema: createTaskSchema,
    onSuccess,
    onError: (errors) => {
      console.warn('Form validation failed:', errors);
    },
  });

  return (
    <form
      action={taskForm.action}
      method={taskForm.method}
      onSubmit={taskForm.onSubmit}
      data-testid="create-task-form"
    >
      <div class={formStyles.formGroup}>
        <label class={labelStyles.base} for="task-title">
          Title
        </label>
        <input
          class={inputStyles.base}
          id="task-title"
          name="title"
          type="text"
          placeholder="What needs to be done?"
        />
        <span class={formStyles.error} data-testid="title-error">
          {taskForm.title.error}
        </span>
      </div>

      <div class={formStyles.formGroup}>
        <label class={labelStyles.base} for="task-description">
          Description
        </label>
        <textarea
          class={formStyles.textarea}
          id="task-description"
          name="description"
          placeholder="Describe the task in detail..."
        />
        <span class={formStyles.error} data-testid="description-error">
          {taskForm.description.error}
        </span>
      </div>

      <div class={formStyles.formGroup}>
        <label class={labelStyles.base} for="task-priority">
          Priority
        </label>
        <select class={formStyles.select} id="task-priority" name="priority">
          <option value="low">Low</option>
          <option value="medium" selected>
            Medium
          </option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
        <span class={formStyles.error} data-testid="priority-error">
          {taskForm.priority.error}
        </span>
      </div>

      <div style="display: flex; gap: 0.5rem; justify-content: flex-end">
        <button
          type="button"
          class={button({ intent: 'secondary', size: 'md' })}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="submit"
          class={button({ intent: 'primary', size: 'md' })}
          data-testid="submit-task"
          disabled={taskForm.submitting}
        >
          {taskForm.submitting.value ? 'Creating...' : 'Create Task'}
        </button>
      </div>
    </form>
  );
}
