import { afterEach, beforeEach, describe, expect, test, vi } from 'bun:test';
import { resetInjectedStyles } from '../css/css';
import type { Theme } from '../css/theme';
import { mount } from '../mount';

describe('mount()', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    resetInjectedStyles();
  });

  afterEach(() => {
    document.body.removeChild(root);
    resetInjectedStyles();
  });

  // Test 1: mount with minimal args mounts app to root
  test('mount with minimal args mounts app to root', () => {
    const app = () => document.createElement('div');
    const handle = mount(app, root);

    expect(root.children.length).toBe(1);
    expect(handle.root).toBe(root);
  });

  // Test 2: mount with theme injects theme CSS
  test('mount with theme injects theme CSS', () => {
    const theme: Theme = {
      colors: {
        primary: { 500: '#3b82f6' },
        background: { DEFAULT: 'white', _dark: '#111827' },
      },
    };

    // We need to test that compileTheme is called and injectCSS receives the CSS

    // Since injectCSS is imported in mount.ts, we'll verify by checking
    // that styles are actually injected (we can check document head)
    const app = () => document.createElement('div');
    mount(app, root, { theme });

    // The theme CSS should be injected
    const styleEl = document.querySelector('style[data-vertz-css]');
    expect(styleEl?.textContent).toContain('--color-primary-500');
    expect(styleEl?.textContent).toContain('--color-background');
  });

  // Test 3: mount with styles injects global styles
  test('mount with styles injects global styles', () => {
    const app = () => document.createElement('div');
    mount(app, root, { styles: ['body { margin: 0; }', '.hidden { display: none; }'] });

    // Check that global styles are injected
    const styles = document.querySelectorAll('style[data-vertz-css]');
    const allText = Array.from(styles)
      .map((s) => s.textContent)
      .join('\n');
    expect(allText).toContain('body { margin: 0; }');
    expect(allText).toContain('.hidden { display: none; }');
  });

  // Test 4: mount with string selector finds root element
  test('mount with string selector finds root element', () => {
    root.id = 'root'; // Add id so querySelector can find it
    const app = () => document.createElement('div');
    const handle = mount(app, '#root');

    expect(handle.root).toBe(root);
    expect(root.children.length).toBe(1);
  });

  // Test 5: mount with HTMLElement selector uses it directly
  test('mount with HTMLElement selector uses it directly', () => {
    const customRoot = document.createElement('div');
    customRoot.id = 'custom-root';
    document.body.appendChild(customRoot);

    try {
      const app = () => document.createElement('div');
      const handle = mount(app, customRoot);

      expect(handle.root).toBe(customRoot);
      expect(customRoot.children.length).toBe(1);
    } finally {
      document.body.removeChild(customRoot);
    }
  });

  // Test 6: mount throws when root not found
  test('mount throws when root not found', () => {
    const app = () => document.createElement('div');

    expect(() => {
      mount(app, '#non-existent-element');
    }).toThrow('mount(): root element "#non-existent-element" not found');
  });

  // Test 7: mount throws when selector is invalid type
  test('mount throws when selector is invalid type', () => {
    const app = () => document.createElement('div');

    // @ts-expect-error - intentional invalid type for testing
    expect(() => mount(app, 123)).toThrow(
      'mount(): selector must be a string or HTMLElement, got number',
    );

    // @ts-expect-error - intentional invalid type for testing
    expect(() => mount(app, null)).toThrow(
      'mount(): selector must be a string or HTMLElement, got object',
    );
  });

  // Test 8: unmount clears root content
  test('unmount clears root content', () => {
    const app = () => document.createElement('div');
    const handle = mount(app, root);

    expect(root.children.length).toBe(1);

    handle.unmount();

    expect(root.children.length).toBe(0);
    expect(root.textContent).toBe('');
  });

  // Test 9: mount renders fresh content on empty root (CSR)
  test('mount renders fresh content on empty root', () => {
    // Empty root — no SSR content to hydrate, direct CSR render
    expect(root.children.length).toBe(0);

    const app = () => {
      const el = document.createElement('div');
      el.textContent = 'fresh';
      return el;
    };
    mount(app, root);

    expect(root.children.length).toBe(1);
    expect(root.textContent).toBe('fresh');
  });

  // Test 10: mount calls onMount callback after mounting
  test('mount calls onMount callback after mounting', () => {
    const app = () => document.createElement('div');
    const onMount = vi.fn();

    mount(app, root, { onMount });

    expect(onMount).toHaveBeenCalledTimes(1);
    expect(onMount).toHaveBeenCalledWith(root);
  });
});
