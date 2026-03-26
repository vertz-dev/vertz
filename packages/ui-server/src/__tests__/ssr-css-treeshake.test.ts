/**
 * Integration tests for CSS tree-shaking in SSR responses.
 *
 * Verifies that the render-scoped cssTracker only includes CSS
 * injected during the current request, not globally accumulated CSS.
 *
 * @see https://github.com/vertz-dev/vertz/issues/1912
 */
import { afterEach, describe, expect, it } from 'bun:test';
import { injectCSS, resetInjectedStyles } from '@vertz/ui';
import { installDomShim } from '../dom-shim';
import { ssrRenderToString } from '../ssr-render';

// Install DOM shim for SSR rendering
installDomShim();

afterEach(() => {
  resetInjectedStyles();
});

describe('SSR CSS tree-shaking (#1912)', () => {
  it('only includes CSS injected during the render, not pre-existing CSS', async () => {
    // Pre-inject CSS outside of any render — simulates module-level css() from
    // components that were loaded but not rendered in this request.
    injectCSS('.unused-component { display: grid; }');

    const module = {
      default: () => {
        // Only this CSS should appear in the response
        injectCSS('.rendered-button { background: blue; }');
        const el = document.createElement('div');
        el.textContent = 'Button Page';
        return el;
      },
    };

    const result = await ssrRenderToString(module, '/button-page');

    expect(result.html).toContain('Button Page');
    expect(result.css).toContain('.rendered-button { background: blue; }');
    // CSS injected outside this render must NOT appear
    expect(result.css).not.toContain('.unused-component');
  });

  it('different routes produce different CSS based on what is rendered', async () => {
    const moduleA = {
      default: () => {
        injectCSS('.input-styles { border: 1px solid; }');
        const el = document.createElement('input');
        return el;
      },
    };

    const moduleB = {
      default: () => {
        injectCSS('.card-styles { border-radius: 8px; }');
        const el = document.createElement('div');
        el.textContent = 'Card Page';
        return el;
      },
    };

    const resultA = await ssrRenderToString(moduleA, '/input-page');
    const resultB = await ssrRenderToString(moduleB, '/card-page');

    // Each result should contain only its own CSS
    expect(resultA.css).toContain('.input-styles');
    expect(resultA.css).not.toContain('.card-styles');

    expect(resultB.css).toContain('.card-styles');
    expect(resultB.css).not.toContain('.input-styles');
  });

  it('concurrent SSR renders have isolated CSS trackers', async () => {
    const moduleButton = {
      default: () => {
        injectCSS('.btn-primary { background: blue; }');
        const el = document.createElement('button');
        el.textContent = 'Click';
        return el;
      },
    };

    const moduleLabel = {
      default: () => {
        injectCSS('.label-base { font-weight: 600; }');
        const el = document.createElement('label');
        el.textContent = 'Name';
        return el;
      },
    };

    // Run both renders concurrently — each has its own AsyncLocalStorage context
    const [resultButton, resultLabel] = await Promise.all([
      ssrRenderToString(moduleButton, '/btn'),
      ssrRenderToString(moduleLabel, '/lbl'),
    ]);

    // Button page should only have button CSS
    expect(resultButton.css).toContain('.btn-primary');
    expect(resultButton.css).not.toContain('.label-base');

    // Label page should only have label CSS
    expect(resultLabel.css).toContain('.label-base');
    expect(resultLabel.css).not.toContain('.btn-primary');
  });

  it('re-injected CSS appears in new request tracker (lazy getter pattern)', async () => {
    // Simulate the lazy configureTheme pattern: CSS is injected once (cached),
    // then re-injected on subsequent accesses so the per-request tracker captures it.
    const cachedCSS = '.cached-variant { padding: 8px; }';

    // First request — CSS injected for the first time
    const module1 = {
      default: () => {
        injectCSS(cachedCSS);
        const el = document.createElement('div');
        el.textContent = 'Request 1';
        return el;
      },
    };

    const result1 = await ssrRenderToString(module1, '/req1');
    expect(result1.css).toContain(cachedCSS);

    // Second request — same CSS re-injected (like a lazy getter re-injecting cached CSS).
    // The global Set already has it, but the per-request tracker is fresh.
    const module2 = {
      default: () => {
        injectCSS(cachedCSS);
        const el = document.createElement('div');
        el.textContent = 'Request 2';
        return el;
      },
    };

    const result2 = await ssrRenderToString(module2, '/req2');
    // Must still appear despite global dedup — cssTracker is per-request
    expect(result2.css).toContain(cachedCSS);
  });

  it('module.styles (global CSS) is still included alongside tracked CSS', async () => {
    const module = {
      default: () => {
        injectCSS('.component-x { color: red; }');
        const el = document.createElement('div');
        el.textContent = 'Styled';
        return el;
      },
      styles: ['body { margin: 0; }', '* { box-sizing: border-box; }'],
    };

    const result = await ssrRenderToString(module, '/global');

    // Both global styles and component CSS should be present
    expect(result.css).toContain('body { margin: 0; }');
    expect(result.css).toContain('box-sizing: border-box');
    expect(result.css).toContain('.component-x { color: red; }');
  });

  it('empty render produces no component CSS tag', async () => {
    const module = {
      default: () => {
        // No injectCSS calls — pure HTML
        const el = document.createElement('div');
        el.textContent = 'Bare Page';
        return el;
      },
    };

    const result = await ssrRenderToString(module, '/bare');

    expect(result.html).toContain('Bare Page');
    // No component CSS was injected, so there should be no component <style> tag.
    // (Theme CSS may still be present if module.theme is set, but we didn't set it.)
    expect(result.css).toBe('');
  });
});
