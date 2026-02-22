/**
 * Tests for the Task List page.
 *
 * Demonstrates @vertz/ui/test utilities:
 * - renderTest() for mounting components
 * - findByText / findByTestId for querying
 * - click() for interaction simulation
 * - waitFor() for async assertions
 * - RouterContext.Provider for page context
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { createRouter, defineRoutes, RouterContext } from '@vertz/ui';
import { renderTest, waitFor } from '@vertz/ui/test';
import { resetMockData } from '../api/mock-data';
import { TaskListPage } from '../pages/task-list';

const testRoutes = defineRoutes({
  '/': { component: () => document.createElement('div') },
  '/tasks/new': { component: () => document.createElement('div') },
});

function renderTaskListPage(initialPath = '/') {
  const router = createRouter(testRoutes, initialPath);
  let page: Element | undefined;
  RouterContext.Provider(router, () => {
    page = TaskListPage() as Element;
  });
  return { page: page as Element, router };
}

describe('TaskListPage', () => {
  beforeEach(() => {
    resetMockData();
  });

  it('shows loading state initially', () => {
    const { page, router } = renderTaskListPage();
    const { findByTestId, unmount } = renderTest(page);

    const loading = findByTestId('loading');
    expect(loading.textContent).toBe('Loading tasks...');

    unmount();
    router.dispose();
  });

  it('renders task cards after loading', async () => {
    const { page, router } = renderTaskListPage();
    const { queryByText, unmount } = renderTest(page);

    // Wait for the mock tasks to load and render
    await waitFor(() => {
      expect(queryByText('Set up CI/CD pipeline')).not.toBeNull();
      expect(queryByText('Implement user authentication')).not.toBeNull();
    });

    unmount();
    router.dispose();
  });

  it('navigates to create task page on button click', async () => {
    const { page, router } = renderTaskListPage();
    const { findByTestId: find, click, unmount } = renderTest(page);

    const createBtn = find('create-task-btn');
    await click(createBtn);

    expect(router.current.value?.route.pattern).toBe('/tasks/new');

    unmount();
    router.dispose();
  });

  it.skip('filters tasks by status', async () => {
    const { page, router } = renderTaskListPage();
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
    router.dispose();
  });
});
