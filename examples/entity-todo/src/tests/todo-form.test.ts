/**
 * UI component tests for TodoForm.
 *
 * Demonstrates:
 * - renderTest() for form component testing
 * - findByTestId() for locating form elements
 * - click() for simulating interactions
 * - waitFor() for async validation assertions
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { renderTest, waitFor } from '@vertz/ui/test';
import { resetMockData } from '../api/mock-data';
import { TodoForm } from '../components/todo-form';

describe('TodoForm', () => {
  beforeEach(() => {
    resetMockData();
  });

  test('renders form with testid', () => {
    const { findByTestId, unmount } = renderTest(TodoForm({ onSuccess: () => {} }));
    const form = findByTestId('create-todo-form');
    expect(form).toBeDefined();
    expect(form.tagName).toBe('FORM');
    unmount();
  });

  test('renders title input with placeholder', () => {
    const { findByTestId, unmount } = renderTest(TodoForm({ onSuccess: () => {} }));
    const input = findByTestId('todo-title-input') as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.getAttribute('placeholder')).toBe('What needs to be done?');
    unmount();
  });

  test('renders submit button', () => {
    const { findByTestId, unmount } = renderTest(TodoForm({ onSuccess: () => {} }));
    const btn = findByTestId('submit-todo') as HTMLButtonElement;
    expect(btn).toBeDefined();
    expect(btn.textContent).toContain('Add Todo');
    unmount();
  });

  test('has progressive enhancement attributes', () => {
    const { findByTestId, unmount } = renderTest(TodoForm({ onSuccess: () => {} }));
    const form = findByTestId('create-todo-form');
    expect(form.getAttribute('action')).toBe('/api/todos');
    expect(form.getAttribute('method')).toBe('POST');
    unmount();
  });

  test('empty submission passes client-side validation (type-only schema)', async () => {
    // Auto-generated schema uses s.string() which accepts empty strings.
    // Constraint-level validation (min length) is handled server-side.
    let created = false;
    const { findByTestId, unmount } = renderTest(
      TodoForm({
        onSuccess: () => {
          created = true;
        },
      }),
    );

    const form = findByTestId('create-todo-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => {
      expect(created).toBe(true);
    });

    // No client-side validation error for empty string
    const error = findByTestId('title-error');
    expect(error.textContent).toBe('');

    unmount();
  });

  test('calls onSuccess after valid submission', async () => {
    let created = false;
    const { findByTestId, type, unmount } = renderTest(
      TodoForm({
        onSuccess: () => {
          created = true;
        },
      }),
    );

    const input = findByTestId('todo-title-input') as HTMLInputElement;
    await type(input, 'New todo item');

    const form = findByTestId('create-todo-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => {
      expect(created).toBe(true);
    });

    unmount();
  });
});
