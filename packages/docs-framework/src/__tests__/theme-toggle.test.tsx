import { afterEach, describe, expect, it } from 'bun:test';
import { renderTest } from '@vertz/ui/test';
import { ThemeToggle } from '../layout/theme-toggle';

describe('ThemeToggle', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('renders a toggle button', () => {
    const { container, unmount } = renderTest(ThemeToggle({}));
    const button = container.querySelector('button');
    expect(button).not.toBeNull();
    expect(button?.getAttribute('aria-label')).toContain('theme');

    unmount();
  });

  it('toggles theme on click', () => {
    const { container, unmount } = renderTest(ThemeToggle({}));
    const button = container.querySelector('button');
    expect(button).not.toBeNull();

    // Click to toggle from default (light) to dark
    button?.click();
    const theme = document.documentElement.getAttribute('data-theme');
    expect(theme).toBe('dark');

    // Click again to toggle back
    button?.click();
    const theme2 = document.documentElement.getAttribute('data-theme');
    expect(theme2).toBe('light');

    unmount();
  });
});
