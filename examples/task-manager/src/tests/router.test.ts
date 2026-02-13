/**
 * Tests for the app router.
 *
 * Demonstrates:
 * - createTestRouter() for testing route definitions
 * - Navigation between routes
 * - Route param extraction
 * - Loader execution
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { createTestRouter, renderTest, waitFor } from '@vertz/ui/test';
import { resetMockData } from '../api/mock-data';

describe('App Router', () => {
  beforeEach(() => {
    resetMockData();
  });

  it('renders the home page at /', async () => {
    const { component, router } = await createTestRouter(
      {
        '/': {
          component: () => {
            const el = document.createElement('div');
            el.textContent = 'Task List';
            el.setAttribute('data-testid', 'home');
            return el;
          },
        },
        '/settings': {
          component: () => {
            const el = document.createElement('div');
            el.textContent = 'Settings';
            el.setAttribute('data-testid', 'settings');
            return el;
          },
        },
      },
      { initialPath: '/' },
    );

    const { findByTestId, unmount } = renderTest(component);
    const home = findByTestId('home');
    expect(home.textContent).toBe('Task List');

    // Verify router state
    expect(router.current.value).not.toBeNull();
    expect(router.current.value?.params).toEqual({});

    unmount();
    router.dispose();
  });

  it('navigates between routes', async () => {
    const { component, navigate, router } = await createTestRouter(
      {
        '/': {
          component: () => {
            const el = document.createElement('div');
            el.textContent = 'Home';
            el.setAttribute('data-testid', 'home');
            return el;
          },
        },
        '/settings': {
          component: () => {
            const el = document.createElement('div');
            el.textContent = 'Settings Page';
            el.setAttribute('data-testid', 'settings');
            return el;
          },
        },
      },
      { initialPath: '/' },
    );

    const { findByTestId, queryByTestId, unmount } = renderTest(component);

    // Initially on home
    expect(findByTestId('home')).toBeDefined();

    // Navigate to settings
    await navigate('/settings');

    // Settings page should render
    const settingsEl = findByTestId('settings');
    expect(settingsEl.textContent).toBe('Settings Page');

    unmount();
    router.dispose();
  });

  it('extracts route params', async () => {
    let capturedId = '';

    const { component, navigate, router } = await createTestRouter(
      {
        '/tasks/:id': {
          component: () => {
            const match = router.current.value;
            capturedId = match?.params.id ?? '';
            const el = document.createElement('div');
            el.textContent = `Task ${capturedId}`;
            el.setAttribute('data-testid', 'task-detail');
            return el;
          },
        },
      },
      { initialPath: '/tasks/42' },
    );

    const { findByTestId, unmount } = renderTest(component);
    const detail = findByTestId('task-detail');

    expect(detail.textContent).toBe('Task 42');
    expect(capturedId).toBe('42');

    unmount();
    router.dispose();
  });

  it('executes loaders before rendering', async () => {
    let loaderCalled = false;

    const { component, router } = await createTestRouter(
      {
        '/': {
          component: () => {
            const el = document.createElement('div');
            el.textContent = 'With Loader';
            el.setAttribute('data-testid', 'loaded');
            return el;
          },
          loader: async () => {
            loaderCalled = true;
            return { loaded: true };
          },
        },
      },
      { initialPath: '/' },
    );

    const { findByTestId, unmount } = renderTest(component);

    findByTestId('loaded');

    // Loader should have been invoked
    await waitFor(() => {
      expect(loaderCalled).toBe(true);
    });

    unmount();
    router.dispose();
  });
});
