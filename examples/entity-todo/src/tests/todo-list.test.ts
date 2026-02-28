/**
 * UI component tests for TodoListPage.
 *
 * Demonstrates:
 * - renderTest() for component testing with DOM utilities
 * - findByTestId() for locating elements
 * - waitFor() for async assertions
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { renderTest, waitFor } from '@vertz/ui/test';
import { resetMockData } from '../api/mock-data';
import { TodoListPage } from '../pages/todo-list';

describe('TodoListPage', () => {
  beforeEach(() => {
    resetMockData();
  });

  test('renders page container with testid', () => {
    const { findByTestId, unmount } = renderTest(TodoListPage());
    const page = findByTestId('todo-list-page');
    expect(page).toBeDefined();
    unmount();
  });

  test('renders page header with title', () => {
    const { findByText, unmount } = renderTest(TodoListPage());
    const heading = findByText('Entity Todo');
    expect(heading).toBeDefined();
    unmount();
  });

  test('renders create todo form', () => {
    const { findByTestId, unmount } = renderTest(TodoListPage());
    const form = findByTestId('create-todo-form');
    expect(form).toBeDefined();
    unmount();
  });

  test('shows loading state initially', () => {
    const { findByTestId, unmount } = renderTest(TodoListPage());
    const loading = findByTestId('loading');
    expect(loading).toBeDefined();
    expect(loading.textContent).toContain('Loading todos');
    unmount();
  });

  test('renders todo list container', async () => {
    const { findByTestId, unmount } = renderTest(TodoListPage());
    await waitFor(() => {
      const list = findByTestId('todo-list');
      expect(list).toBeDefined();
    });
    unmount();
  });

  test('loads and displays todos after fetch', async () => {
    const { findByTestId, unmount } = renderTest(TodoListPage());

    await waitFor(() => {
      const item1 = findByTestId('todo-item-1');
      expect(item1).toBeDefined();
    });

    unmount();
  });
});
