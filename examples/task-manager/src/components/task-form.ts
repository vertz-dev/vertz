/**
 * TaskForm component — create-task form with validation.
 *
 * Demonstrates:
 * - form() with schema validation
 * - SdkMethod metadata for progressive enhancement
 * - Reactive submitting state
 * - Field-level error display via form.error()
 * - effect() for reactive UI updates
 */

import { effect, form, signal } from '@vertz/ui';
import type { FormInstance, FormSchema, SdkMethod } from '@vertz/ui';
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

  // Build the form element
  const formEl = document.createElement('form');
  formEl.setAttribute('action', formAttrs.action);
  formEl.setAttribute('method', formAttrs.method);
  formEl.setAttribute('data-testid', 'create-task-form');

  // ── Title field ──────────────────────────────────

  const titleGroup = document.createElement('div');
  titleGroup.className = formStyles.classNames.formGroup;

  const titleLabel = document.createElement('label');
  titleLabel.className = formStyles.classNames.label;
  titleLabel.textContent = 'Title';
  titleLabel.setAttribute('for', 'task-title');

  const titleInput = document.createElement('input');
  titleInput.className = formStyles.classNames.input;
  titleInput.id = 'task-title';
  titleInput.name = 'title';
  titleInput.type = 'text';
  titleInput.placeholder = 'What needs to be done?';

  const titleError = document.createElement('span');
  titleError.className = formStyles.classNames.error;
  titleError.setAttribute('data-testid', 'title-error');

  titleGroup.appendChild(titleLabel);
  titleGroup.appendChild(titleInput);
  titleGroup.appendChild(titleError);

  // ── Description field ────────────────────────────

  const descGroup = document.createElement('div');
  descGroup.className = formStyles.classNames.formGroup;

  const descLabel = document.createElement('label');
  descLabel.className = formStyles.classNames.label;
  descLabel.textContent = 'Description';
  descLabel.setAttribute('for', 'task-description');

  const descTextarea = document.createElement('textarea');
  descTextarea.className = formStyles.classNames.textarea;
  descTextarea.id = 'task-description';
  descTextarea.name = 'description';
  descTextarea.placeholder = 'Describe the task in detail...';

  const descError = document.createElement('span');
  descError.className = formStyles.classNames.error;
  descError.setAttribute('data-testid', 'description-error');

  descGroup.appendChild(descLabel);
  descGroup.appendChild(descTextarea);
  descGroup.appendChild(descError);

  // ── Priority field ───────────────────────────────

  const priorityGroup = document.createElement('div');
  priorityGroup.className = formStyles.classNames.formGroup;

  const priorityLabel = document.createElement('label');
  priorityLabel.className = formStyles.classNames.label;
  priorityLabel.textContent = 'Priority';
  priorityLabel.setAttribute('for', 'task-priority');

  const prioritySelect = document.createElement('select');
  prioritySelect.className = formStyles.classNames.select;
  prioritySelect.id = 'task-priority';
  prioritySelect.name = 'priority';

  for (const priority of ['low', 'medium', 'high', 'urgent'] as const) {
    const option = document.createElement('option');
    option.value = priority;
    option.textContent = priority.charAt(0).toUpperCase() + priority.slice(1);
    if (priority === 'medium') option.selected = true;
    prioritySelect.appendChild(option);
  }

  const priorityError = document.createElement('span');
  priorityError.className = formStyles.classNames.error;
  priorityError.setAttribute('data-testid', 'priority-error');

  priorityGroup.appendChild(priorityLabel);
  priorityGroup.appendChild(prioritySelect);
  priorityGroup.appendChild(priorityError);

  // ── Actions ──────────────────────────────────────

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '0.5rem';
  actions.style.justifyContent = 'flex-end';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = button({ intent: 'secondary', size: 'md' });
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', onCancel);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = button({ intent: 'primary', size: 'md' });
  submitBtn.textContent = 'Create Task';
  submitBtn.setAttribute('data-testid', 'submit-task');

  actions.appendChild(cancelBtn);
  actions.appendChild(submitBtn);

  // ── Assemble form ────────────────────────────────

  formEl.appendChild(titleGroup);
  formEl.appendChild(descGroup);
  formEl.appendChild(priorityGroup);
  formEl.appendChild(actions);

  // ── Reactive error display ───────────────────────

  // effect() re-runs whenever the form's error signals change
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

  // ── Submit handler ───────────────────────────────

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
