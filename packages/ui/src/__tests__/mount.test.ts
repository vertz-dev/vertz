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

    const app = () => document.createElement('div');
    mount(app, root, { theme });

    // Theme CSS is injected via adoptedStyleSheets
    const allText = Array.from(document.adoptedStyleSheets)
      .flatMap((sheet) => Array.from(sheet.cssRules).map((r) => r.cssText))
      .join('\n');
    expect(allText).toContain('--color-primary-500');
    expect(allText).toContain('--color-background');
  });

  // Test 3: mount with styles injects global styles
  test('mount with styles injects global styles', () => {
    const app = () => document.createElement('div');
    mount(app, root, { styles: ['body { margin: 0; }', '.hidden { display: none; }'] });

    // Global styles are injected via adoptedStyleSheets
    const allText = Array.from(document.adoptedStyleSheets)
      .flatMap((sheet) => Array.from(sheet.cssRules).map((r) => r.cssText))
      .join('\n');
    expect(allText).toContain('margin: 0');
    expect(allText).toContain('display: none');
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

  // Test 10: second mount() on same root returns existing handle (HMR guard)
  test('second mount on same root returns existing handle without re-running app', () => {
    const app = vi.fn(() => document.createElement('div'));

    const handle1 = mount(app, root);
    expect(app).toHaveBeenCalledTimes(1);
    expect(root.children.length).toBe(1);

    // Second mount on same root — should return existing handle, NOT re-run app
    const handle2 = mount(app, root);
    expect(app).toHaveBeenCalledTimes(1); // NOT called again
    expect(handle2).toBe(handle1);
    expect(root.children.length).toBe(1); // DOM unchanged
  });

  // Test 11: unmount clears HMR guard so re-mount is possible
  test('unmount clears HMR guard allowing re-mount', () => {
    const app = vi.fn(() => document.createElement('div'));

    const handle1 = mount(app, root);
    handle1.unmount();
    expect(root.children.length).toBe(0);

    // After unmount, mount() should work again on the same root
    const handle2 = mount(app, root);
    expect(app).toHaveBeenCalledTimes(2);
    expect(handle2).not.toBe(handle1);
    expect(root.children.length).toBe(1);
  });

  // Test 12: mount calls onMount callback after mounting
  test('mount calls onMount callback after mounting', () => {
    const app = () => document.createElement('div');
    const onMount = vi.fn();

    mount(app, root, { onMount });

    expect(onMount).toHaveBeenCalledTimes(1);
    expect(onMount).toHaveBeenCalledWith(root);
  });
});
