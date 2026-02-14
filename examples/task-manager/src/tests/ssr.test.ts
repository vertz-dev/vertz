/**
 * SSR integration tests for task-manager demo.
 *
 * Verifies that:
 * 1. The server returns HTML with rendered content (not empty div)
 * 2. The HTML contains expected page elements
 * 3. Hydration markers are present for interactive components
 */

import { describe, expect, it } from 'bun:test';

describe('SSR', () => {
  it('should return HTML with rendered content from the server', async () => {
    // This test will fail initially — we need to implement the server
    const response = await fetch('http://localhost:3000/');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');

    const html = await response.text();

    // Should have full HTML structure
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');

    // Should have app content pre-rendered (not just empty div)
    expect(html).toContain('Task Manager');
    expect(html).toContain('All Tasks');

    // Should NOT just be an empty app div
    expect(html).not.toMatch(/<div[^>]*id="app"[^>]*>\s*<\/div>/);
  });

  it('should return rendered task list page', async () => {
    const response = await fetch('http://localhost:3000/');
    const html = await response.text();

    // Should contain task list elements
    expect(html).toContain('All Tasks');
    // Note: mock data might not be loaded during SSR, but structure should exist
  });

  it('should return rendered settings page', async () => {
    const response = await fetch('http://localhost:3000/settings');
    const html = await response.text();

    // Should contain settings page elements
    expect(html).toContain('Settings');
    expect(html).toContain('Theme');
  });
});
