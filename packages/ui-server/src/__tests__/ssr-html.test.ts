import { describe, expect, it } from 'vitest';
import { generateSSRHtml } from '../ssr-html';

describe('generateSSRHtml', () => {
  it('generates a complete HTML document with app content', () => {
    const html = generateSSRHtml({
      appHtml: '<h1>Hello</h1>',
      css: '<style>.app { color: red; }</style>',
      ssrData: [],
      clientEntry: '/src/app.tsx',
    });

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<div id="app"><h1>Hello</h1></div>');
    expect(html).toContain('<style>.app { color: red; }</style>');
    expect(html).toContain('<script type="module" src="/src/app.tsx"></script>');
  });

  it('uses default title when none provided', () => {
    const html = generateSSRHtml({
      appHtml: '',
      css: '',
      ssrData: [],
      clientEntry: '/app.js',
    });

    expect(html).toContain('<title>Vertz App</title>');
  });

  it('uses custom title when provided', () => {
    const html = generateSSRHtml({
      appHtml: '',
      css: '',
      ssrData: [],
      clientEntry: '/app.js',
      title: 'My Custom App',
    });

    expect(html).toContain('<title>My Custom App</title>');
  });

  it('injects SSR data script when ssrData is non-empty', () => {
    const html = generateSSRHtml({
      appHtml: '<p>Content</p>',
      css: '',
      ssrData: [{ key: 'users', data: [{ id: 1 }] }],
      clientEntry: '/app.js',
    });

    expect(html).toContain('window.__VERTZ_SSR_DATA__');
    expect(html).toContain('"key":"users"');
    expect(html).toContain('"data":[{"id":1}]');
  });

  it('omits SSR data script when ssrData is empty', () => {
    const html = generateSSRHtml({
      appHtml: '<p>Content</p>',
      css: '',
      ssrData: [],
      clientEntry: '/app.js',
    });

    expect(html).not.toContain('__VERTZ_SSR_DATA__');
  });

  it('includes viewport meta tag', () => {
    const html = generateSSRHtml({
      appHtml: '',
      css: '',
      ssrData: [],
      clientEntry: '/app.js',
    });

    expect(html).toContain('width=device-width, initial-scale=1.0');
    expect(html).toContain('charset="UTF-8"');
    expect(html).toContain('lang="en"');
  });

  describe('XSS escaping', () => {
    it('escapes title to prevent tag injection', () => {
      const html = generateSSRHtml({
        appHtml: '',
        css: '',
        ssrData: [],
        clientEntry: '/app.js',
        title: '</title><script>alert(1)</script>',
      });

      // The raw </title> breakout must not appear in output
      expect(html).not.toContain('</title><script>');
      // The escaped version should be present inside <title>
      expect(html).toContain('&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('escapes clientEntry to prevent attribute injection', () => {
      const html = generateSSRHtml({
        appHtml: '',
        css: '',
        ssrData: [],
        clientEntry: '" onload="alert(1)',
      });

      // The raw double-quote must not break out of the src attribute
      expect(html).not.toContain('src="" onload="alert(1)"');
      // The escaped version should be present
      expect(html).toContain('src="&quot; onload=&quot;alert(1)"');
    });
  });
});
