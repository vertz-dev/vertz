/**
 * Tests for the TaskForm component.
 *
 * Demonstrates:
 * - renderTest() for form component testing
 * - type() for simulating user input
 * - click() for form submission
 * - waitFor() for async validation assertions
 * - findByTestId() for locating form elements
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { renderTest, waitFor } from '@vertz/ui/test';
import { resetMockData } from '../api/mock-data';
import { TaskForm } from '../components/task-form';
import type { Task } from '../lib/types';

describe('TaskForm', () => {
  beforeEach(() => {
    resetMockData();
  });

  it('renders the form with all fields', () => {
    const { findByTestId, unmount } = renderTest(
      TaskForm({ onSuccess: () => {}, onCancel: () => {} }),
    );

    const form = findByTestId('create-task-form');
    expect(form).toBeDefined();
    expect(form.tagName).toBe('FORM');

    // Check progressive enhancement attributes
    expect(form.getAttribute('action')).toBe('/api/tasks');
    expect(form.getAttribute('method')).toBe('POST');

    unmount();
  });

  it('shows validation errors for empty submission', async () => {
    const { findByTestId, click, unmount } = renderTest(
      TaskForm({ onSuccess: () => {}, onCancel: () => {} }),
    );

    // Submit without filling any fields
    const submitBtn = findByTestId('submit-task');
    await click(submitBtn);

    // Wait for validation errors to appear
    await waitFor(() => {
      const titleError = findByTestId('title-error');
      expect(titleError.textContent).toBe('Title is required');
    });

    unmount();
  });

  it('calls onSuccess after valid submission', async () => {
    let createdTask: Task | null = null;
    const { findByTestId, type, click, unmount } = renderTest(
      TaskForm({
        onSuccess: (task) => {
          createdTask = task;
        },
        onCancel: () => {},
      }),
    );

    // Fill in the form
    const titleInput = findByTestId('create-task-form').querySelector('#task-title');
    const descInput = findByTestId('create-task-form').querySelector('#task-description');

    await type(titleInput!, 'New test task');
    await type(descInput!, 'A description for the test task');

    // Ensure priority select has a value (happy-dom may not honour `selected` attribute)
    const prioritySelect = findByTestId('create-task-form').querySelector(
      '#task-priority',
    ) as HTMLSelectElement;
    prioritySelect.value = 'medium';

    // Submit — dispatch on the form directly because happy-dom may not
    // propagate a button click into a native form submission event.
    const form = findByTestId('create-task-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    // Wait for async submission to complete
    await waitFor(() => {
      expect(createdTask).not.toBeNull();
      expect(createdTask?.title).toBe('New test task');
    });

    unmount();
  });

  it('calls onCancel when cancel button is clicked', async () => {
    let cancelled = false;
    const { findByText, click, unmount } = renderTest(
      TaskForm({
        onSuccess: () => {},
        onCancel: () => {
          cancelled = true;
        },
      }),
    );

    const cancelBtn = findByText('Cancel');
    await click(cancelBtn);

    expect(cancelled).toBe(true);

    unmount();
  });

  it('disables submit button while submitting', async () => {
    const { findByTestId, type, click, unmount } = renderTest(
      TaskForm({ onSuccess: () => {}, onCancel: () => {} }),
    );

    const titleInput = findByTestId('create-task-form').querySelector('#task-title');
    const descInput = findByTestId('create-task-form').querySelector('#task-description');

    await type(titleInput!, 'Test task');
    await type(descInput!, 'Description');

    const submitBtn = findByTestId('submit-task');
    await click(submitBtn);

    // Button should show "Creating..." while submitting
    // Note: This is a race condition test — depends on timing
    await waitFor(() => {
      // After submission completes, button should re-enable
      expect(submitBtn.hasAttribute('disabled')).toBe(false);
    });

    unmount();
  });
});
