/**
 * Tests for the Task List page.
 *
 * Demonstrates @vertz/ui/test utilities:
 * - renderTest() for mounting components
 * - findByText / findByTestId for querying
 * - click() for interaction simulation
 * - waitFor() for async assertions
 * - createTestRouter() for route testing
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { findByTestId, renderTest, waitFor } from '@vertz/ui/test';
import { resetMockData } from '../api/mock-data';
import { TaskListPage } from '../pages/task-list';

describe('TaskListPage', () => {
  beforeEach(() => {
    resetMockData();
  });

  it('shows loading state initially', () => {
    const navigateCalls: string[] = [];
    const page = TaskListPage({ navigate: (url) => navigateCalls.push(url) });
    const { findByTestId, unmount } = renderTest(page);

    const loading = findByTestId('loading');
    expect(loading.textContent).toBe('Loading tasks...');

    unmount();
  });

  it('renders task cards after loading', async () => {
    const navigateCalls: string[] = [];
    const page = TaskListPage({ navigate: (url) => navigateCalls.push(url) });
    const { findByTestId: find, queryByText, unmount } = renderTest(page);

    // Wait for the mock tasks to load and render
    await waitFor(() => {
      expect(queryByText('Set up CI/CD pipeline')).not.toBeNull();
      expect(queryByText('Implement user authentication')).not.toBeNull();
    });

    unmount();
  });

  it('navigates to create task page on button click', async () => {
    const navigateCalls: string[] = [];
    const page = TaskListPage({ navigate: (url) => navigateCalls.push(url) });
    const { findByTestId: find, click, unmount } = renderTest(page);

    const createBtn = find('create-task-btn');
    await click(createBtn);

    expect(navigateCalls).toContain('/tasks/new');

    unmount();
  });

  it('filters tasks by status', async () => {
    const navigateCalls: string[] = [];
    const page = TaskListPage({ navigate: (url) => navigateCalls.push(url) });
    const { findByTestId: find, click, queryByText, unmount } = renderTest(page);

    // Wait for tasks to load
    await waitFor(() => {
      const list = find('task-list');
      expect(list.style.display).not.toBe('none');
    });

    // Click "Done" filter
    const doneFilter = find('filter-done');
    await click(doneFilter);

    // Should show only completed tasks
    await waitFor(() => {
      expect(queryByText('Set up CI/CD pipeline')).not.toBeNull();
      // "Implement user authentication" is in-progress, should not be shown
      expect(queryByText('Implement user authentication')).toBeNull();
    });

    unmount();
  });
});
