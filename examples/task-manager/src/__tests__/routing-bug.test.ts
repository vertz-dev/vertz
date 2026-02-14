/**
 * Test to reproduce routing bug found in PR #262 review.
 * 
 * Issue: The router isn't matching routes in SSR because window.location.pathname
 * isn't updated correctly between renders when modules are cached.
 */

import { describe, expect, test } from 'bun:test';

describe('Routing bug reproduction (PR #262)', () => {
  test('/ route should match TaskListPage, not 404', async () => {
    const { renderToString } = await import('../entry-server');
    const html = await renderToString('/');

    // Should render the task list page
    expect(html).toContain('data-testid="task-list-page"');
    // Should NOT render the 404 page
    expect(html).not.toContain('data-testid="not-found"');
    expect(html).not.toContain('Page not found');
  });

  test('/settings route should match SettingsPage', async () => {
    const { renderToString } = await import('../entry-server');
    const html = await renderToString('/settings');

    // Should render the settings page
    expect(html).toContain('data-testid="settings-page"');
    // Should NOT render the 404 page
    expect(html).not.toContain('data-testid="not-found"');
  });

  test('/tasks/new route should match CreateTaskPage', async () => {
    const { renderToString } = await import('../entry-server');
    const html = await renderToString('/tasks/new');

    // Should render the create task page
    expect(html).toContain('data-testid="create-task-page"');
    // Should NOT render the 404 page
    expect(html).not.toContain('data-testid="not-found"');
  });

  test('debug: log router state during initialization', async () => {
    const { renderToString } = await import('../entry-server');
    
    // This test helps us see what's happening during router init
    console.log('\n=== Debug: Rendering / ===');
    const html = await renderToString('/');
    console.log('Result contains task-list-page:', html.includes('data-testid="task-list-page"'));
    console.log('Result contains not-found:', html.includes('data-testid="not-found"'));
  });
});
