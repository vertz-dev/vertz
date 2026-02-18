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

  describe('XSS protection', () => {
    it('escapes HTML in title', async () => {
      const vnode = createVNode(['Hello']);
      const response = renderPage(vnode, { title: '<script>alert("XSS")</script>' });
      const html = await response.text();
      expect(html).toContain('<title>&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;</title>');
      expect(html).not.toContain('<title><script>alert("XSS")</script></title>');
    });

    it('escapes HTML in description', async () => {
      const vnode = createVNode(['Hello']);
      const response = renderPage(vnode, { description: '<script>alert("XSS")</script>' });
      const html = await response.text();
      expect(html).toContain('content="&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;"');
      expect(html).not.toContain('content="<script>alert("XSS")</script>"');
    });

    it('escapes quotes in meta tag attributes', async () => {
      const vnode = createVNode(['Hello']);
      const response = renderPage(vnode, {
        title: 'Test "quotes" & ampersands',
        description: 'Has "quotes" too',
      });
      const html = await response.text();
      expect(html).toContain('<title>Test &quot;quotes&quot; &amp; ampersands</title>');
      expect(html).toContain('content="Has &quot;quotes&quot; too"');
    });

    it('escapes HTML in lang attribute', async () => {
      const vnode = createVNode(['Hello']);
      const response = renderPage(vnode, { lang: 'en" onclick="alert(\'XSS\')"' });
      const html = await response.text();
      expect(html).toContain('<html lang="en&quot; onclick=&quot;alert(&#x27;XSS&#x27;)&quot;">');
      expect(html).not.toContain('<html lang="en" onclick="alert(\'XSS\')"">');
    });

    it('escapes HTML in script src attributes', async () => {
      const vnode = createVNode(['Hello']);
      const response = renderPage(vnode, {
        scripts: ['/app.js" onload="alert(\'XSS\')'],
      });
      const html = await response.text();
      expect(html).toContain('src="/app.js&quot; onload=&quot;alert(&#x27;XSS&#x27;)');
      expect(html).not.toContain('src="/app.js" onload="alert(\'XSS\')"');
    });

    it('escapes ampersands in all contexts', async () => {
      const vnode = createVNode(['Hello']);
      const response = renderPage(vnode, {
        title: 'Q&A Section',
        description: 'Questions & Answers',
        lang: 'en&test',
      });
      const html = await response.text();
      expect(html).toContain('<title>Q&amp;A Section</title>');
      expect(html).toContain('content="Questions &amp; Answers"');
      expect(html).toContain('lang="en&amp;test"');
    });

    it('escapes OG tags with XSS attempts', async () => {
      const vnode = createVNode(['Hello']);
      const response = renderPage(vnode, {
        og: {
          title: '<script>alert("XSS")</script>',
          description: 'Test" onclick="alert(\'XSS\')"',
          image: '/img.png" onerror="alert(\'XSS\')"',
          url: 'https://example.com" onclick="alert(\'XSS\')"',
        },
      });
      const html = await response.text();
      expect(html).not.toContain('<script>alert("XSS")</script>');
      expect(html).not.toContain('onclick="alert(\'XSS\')"');
      expect(html).not.toContain('onerror="alert(\'XSS\')"');
    });

    it('escapes Twitter card meta tags', async () => {
      const vnode = createVNode(['Hello']);
      const response = renderPage(vnode, {
        twitter: {
          card: 'summary" onclick="alert(\'XSS\')"',
          site: '@test" onclick="alert(\'XSS\')"',
        },
      });
      const html = await response.text();
      expect(html).not.toContain('onclick="alert(\'XSS\')"');
    });
  });
});
