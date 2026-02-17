import { describe, expect, it } from 'vitest';
import { renderPage } from '../render-page';
import type { VNode } from '../types';

describe('renderPage', () => {
  // Helper to create a simple VNode with content
  const createVNode = (children: (VNode | string)[]): VNode => ({
    tag: 'div',
    attrs: { id: 'app' },
    children,
  });

  it('returns a Response with status 200 by default', async () => {
    const vnode = createVNode(['Hello']);
    const response = renderPage(vnode);
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
  });

  it('includes doctype and html structure', async () => {
    const vnode = createVNode(['Hello']);
    const response = renderPage(vnode);
    const html = await response.text();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<meta name="viewport"');
  });

  it('sets title from options', async () => {
    const vnode = createVNode(['Hello']);
    const response = renderPage(vnode, { title: 'My App' });
    const html = await response.text();
    expect(html).toContain('<title>My App</title>');
  });

  it('sets custom status code', async () => {
    const vnode = createVNode(['Hello']);
    const response = renderPage(vnode, { status: 404 });
    expect(response.status).toBe(404);
  });

  it('includes OG tags with fallback to title/description', async () => {
    const vnode = createVNode(['Hello']);
    const response = renderPage(vnode, {
      title: 'My App',
      description: 'Hello',
      og: { image: '/og.png' },
    });
    const html = await response.text();
    expect(html).toContain('og:title" content="My App"');
    expect(html).toContain('og:description" content="Hello"');
    expect(html).toContain('og:image" content="/og.png"');
  });

  it('includes favicon', async () => {
    const vnode = createVNode(['Hello']);
    const response = renderPage(vnode, { favicon: '/favicon.ico' });
    const html = await response.text();
    expect(html).toContain('<link rel="icon" href="/favicon.ico">');
  });

  it('includes scripts at end of body', async () => {
    const vnode = createVNode(['Hello']);
    const response = renderPage(vnode, { scripts: ['/app.js'] });
    const html = await response.text();
    expect(html).toContain('<script type="module" src="/app.js"></script>');
    // script should be before </body>
    const scriptPos = html.indexOf('<script type="module"');
    const bodyEndPos = html.indexOf('</body>');
    expect(scriptPos).toBeLessThan(bodyEndPos);
  });

  it('includes styles in head', async () => {
    const vnode = createVNode(['Hello']);
    const response = renderPage(vnode, { styles: ['/app.css'] });
    const html = await response.text();
    expect(html).toContain('<link rel="stylesheet" href="/app.css">');
  });

  it('includes head escape hatch', async () => {
    const vnode = createVNode(['Hello']);
    const response = renderPage(vnode, {
      head: '<link rel="preconnect" href="https://fonts.googleapis.com">',
    });
    const html = await response.text();
    expect(html).toContain('<link rel="preconnect" href="https://fonts.googleapis.com">');
  });

  it('renders component content in body', async () => {
    const vnode: VNode = {
      tag: 'div',
      attrs: { id: 'app' },
      children: [{ tag: 'h1', attrs: {}, children: ['Hello'] }],
    };
    const response = renderPage(vnode);
    const html = await response.text();
    expect(html).toContain('<h1>Hello</h1>');
  });

  it('sets custom lang attribute', async () => {
    const vnode = createVNode(['Hello']);
    const response = renderPage(vnode, { lang: 'pt-BR' });
    const html = await response.text();
    expect(html).toContain('<html lang="pt-BR">');
  });

  it('includes Twitter card meta tags', async () => {
    const vnode = createVNode(['Hello']);
    const response = renderPage(vnode, {
      title: 'My App',
      twitter: { card: 'summary_large_image', site: '@vertzdev' },
    });
    const html = await response.text();
    expect(html).toContain('twitter:card" content="summary_large_image"');
    expect(html).toContain('twitter:site" content="@vertzdev"');
  });

  it('includes description meta tag', async () => {
    const vnode = createVNode(['Hello']);
    const response = renderPage(vnode, { description: 'A great app' });
    const html = await response.text();
    expect(html).toContain('name="description" content="A great app"');
  });

  it('OG title falls back to title when not provided', async () => {
    const vnode = createVNode(['Hello']);
    const response = renderPage(vnode, { title: 'My App' });
    const html = await response.text();
    expect(html).toContain('og:title" content="My App"');
  });

  it('OG description falls back to description when not provided', async () => {
    const vnode = createVNode(['Hello']);
    const response = renderPage(vnode, { description: 'My description' });
    const html = await response.text();
    expect(html).toContain('og:description" content="My description"');
  });
});
