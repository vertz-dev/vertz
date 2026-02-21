import { describe, expect, it, vi } from 'vitest';
import { defineTheme } from '@vertz/ui';
import { renderToHTML, type RenderToHTMLOptions } from '../render-to-html';
import type { VNode } from '../types';

describe('renderToHTML', () => {
  // Helper to create a simple VNode
  const createApp = (): VNode => ({
    tag: 'div',
    attrs: { id: 'app' },
    children: ['Hello World'],
  });

  it('returns HTML string', async () => {
    const html = await renderToHTML(createApp, { url: '/' });
    expect(typeof html).toBe('string');
    expect(html).toContain('<html');
  });

  it('includes title in head', async () => {
    const html = await renderToHTML(createApp, {
      url: '/',
      head: { title: 'My App' },
    });
    expect(html).toContain('<title>My App</title>');
  });

  it('includes theme CSS in head', async () => {
    const theme = defineTheme({
      colors: {
        primary: { DEFAULT: '#3b82f6' },
        background: { DEFAULT: '#ffffff', _dark: '#111827' },
      },
    });

    const html = await renderToHTML(createApp, {
      url: '/',
      theme,
    });

    expect(html).toContain('<style>');
    expect(html).toContain('--color-primary');
    expect(html).toContain('--color-background');
  });

  it('includes global styles in head', async () => {
    const html = await renderToHTML(createApp, {
      url: '/',
      styles: ['body { margin: 0; }', 'h1 { color: red; }'],
    });

    expect(html).toContain('<style>');
    expect(html).toContain('body { margin: 0; }');
    expect(html).toContain('h1 { color: red; }');
  });

  it('sets and cleans up __SSR_URL__', async () => {
    // Before call - should not have __SSR_URL__ (or be undefined)
    expect((globalThis as any).__SSR_URL__).toBeUndefined();

    // During call - need to verify it's set. We'll do this by checking
    // that render works with a URL (which requires the global to be set)
    const html = await renderToHTML(createApp, { url: '/test-url' });
    expect(html).toContain('Hello World');

    // After call - should be cleaned up
    const afterSSR = (globalThis as any).__SSR_URL__;
    expect(afterSSR).toBeUndefined();
  });

  it('works with minimal options', async () => {
    const html = await renderToHTML(createApp, { url: '/simple' });
    expect(html).toContain('<html');
    expect(html).toContain('Hello World');
  });

  it('combines theme and styles', async () => {
    const theme = defineTheme({
      colors: {
        primary: { DEFAULT: '#3b82f6' },
      },
    });

    const html = await renderToHTML(createApp, {
      url: '/',
      theme,
      styles: ['body { font-family: system-ui; }'],
    });

    expect(html).toContain('--color-primary');
    expect(html).toContain('font-family: system-ui');
  });

  it('includes link tags in head', async () => {
    const html = await renderToHTML(createApp, {
      url: '/',
      head: {
        links: [
          { rel: 'stylesheet', href: '/styles/main.css' },
          { rel: 'icon', href: '/favicon.ico' },
        ],
      },
    });

    expect(html).toContain('<link rel="stylesheet" href="/styles/main.css">');
    expect(html).toContain('<link rel="icon" href="/favicon.ico">');
  });

  it('cleans up even if render throws', async () => {
    const failingApp = () => {
      throw new Error('Render failed');
    };

    // Expect the render to throw
    await expect(renderToHTML(failingApp, { url: '/' })).rejects.toThrow(
      'Render failed'
    );

    // Verify cleanup happened - __SSR_URL__ should be undefined
    expect((globalThis as any).__SSR_URL__).toBeUndefined();

    // Verify globals are cleaned up (document should be undefined)
    expect((globalThis as any).document).toBeUndefined();
  });
});
