import { afterEach, beforeEach, describe, expect, test, mock } from '@vertz/test';
import { resetInjectedStyles } from '../css/css';
import type { Theme } from '../css/theme';
import { mount } from '../mount';

describe('mount()', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    root.id = 'app';
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
    const handle = mount(app);

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
    mount(app, { theme });

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
    mount(app, { styles: ['body { margin: 0; }', '.hidden { display: none; }'] });

    // Global styles are injected via adoptedStyleSheets
    const allText = Array.from(document.adoptedStyleSheets)
      .flatMap((sheet) => Array.from(sheet.cssRules).map((r) => r.cssText))
      .join('\n');
    expect(allText).toContain('margin: 0');
    expect(allText).toContain('display: none');
  });

  // Test 4: mount throws when #app root not found
  test('mount throws when #app root not found', () => {
    const app = () => document.createElement('div');

    // Remove the #app element so mount can't find it
    document.body.removeChild(root);
    try {
      expect(() => {
        mount(app);
      }).toThrow('mount(): root element "#app" not found');
    } finally {
      // Re-add so afterEach cleanup doesn't fail
      document.body.appendChild(root);
    }
  });

  // Test 5: unmount clears root content
  test('unmount clears root content', () => {
    const app = () => document.createElement('div');
    const handle = mount(app);

    expect(root.children.length).toBe(1);

    handle.unmount();

    expect(root.children.length).toBe(0);
    expect(root.textContent).toBe('');
  });

  // Test 6: mount renders fresh content on empty root (CSR)
  test('mount renders fresh content on empty root', () => {
    // Empty root — no SSR content to hydrate, direct CSR render
    expect(root.children.length).toBe(0);

    const app = () => {
      const el = document.createElement('div');
      el.textContent = 'fresh';
      return el;
    };
    mount(app);

    expect(root.children.length).toBe(1);
    expect(root.textContent).toBe('fresh');
  });

  // Test 7: second mount() on same root returns existing handle (HMR guard)
  test('second mount on same root returns existing handle without re-running app', () => {
    const app = mock(() => document.createElement('div'));

    const handle1 = mount(app);
    expect(app).toHaveBeenCalledTimes(1);
    expect(root.children.length).toBe(1);

    // Second mount on same root — should return existing handle, NOT re-run app
    const handle2 = mount(app);
    expect(app).toHaveBeenCalledTimes(1); // NOT called again
    expect(handle2).toBe(handle1);
    expect(root.children.length).toBe(1); // DOM unchanged
  });

  // Test 8: unmount clears HMR guard so re-mount is possible
  test('unmount clears HMR guard allowing re-mount', () => {
    const app = mock(() => document.createElement('div'));

    const handle1 = mount(app);
    handle1.unmount();
    expect(root.children.length).toBe(0);

    // After unmount, mount() should work again on the same root
    const handle2 = mount(app);
    expect(app).toHaveBeenCalledTimes(2);
    expect(handle2).not.toBe(handle1);
    expect(root.children.length).toBe(1);
  });

  // Test 9: mount calls onMount callback after mounting
  test('mount calls onMount callback after mounting', () => {
    const app = () => document.createElement('div');
    const onMount = mock();

    mount(app, { onMount });

    expect(onMount).toHaveBeenCalledTimes(1);
    expect(onMount).toHaveBeenCalledWith(root);
  });
});
