import { describe, expect, test } from 'vitest';
import { createDevServer, generateSSRHtml } from '../dev-server';

describe('generateSSRHtml', () => {
  test('produces valid HTML structure with doctype, head, body', () => {
    const result = generateSSRHtml({
      appHtml: '<h1>Hello</h1>',
      css: '',
      ssrData: [],
      clientEntry: '/src/entry-client.ts',
    });

    expect(result).toContain('<!doctype html>');
    expect(result).toContain('<html lang="en">');
    expect(result).toContain('<head>');
    expect(result).toContain('</head>');
    expect(result).toContain('<body>');
    expect(result).toContain('</body>');
    expect(result).toContain('</html>');
    expect(result).toContain('<div id="app"><h1>Hello</h1></div>');
  });

  test('CSS is injected into head', () => {
    const css = '<style data-vertz-css>.root { color: red; }</style>';
    const result = generateSSRHtml({
      appHtml: '<div>App</div>',
      css,
      ssrData: [],
      clientEntry: '/src/entry-client.ts',
    });

    const headStart = result.indexOf('<head>');
    const headEnd = result.indexOf('</head>');
    const cssPos = result.indexOf(css);

    expect(cssPos).toBeGreaterThan(headStart);
    expect(cssPos).toBeLessThan(headEnd);
  });

  test('SSR data script is present when ssrData is non-empty', () => {
    const ssrData = [{ key: 'tasks', data: [{ id: 1, title: 'Test' }] }];
    const result = generateSSRHtml({
      appHtml: '<div>App</div>',
      css: '',
      ssrData,
      clientEntry: '/src/entry-client.ts',
    });

    expect(result).toContain('window.__VERTZ_SSR_DATA__');
    expect(result).toContain(JSON.stringify(ssrData));
  });

  test('SSR data script is absent when ssrData is empty', () => {
    const result = generateSSRHtml({
      appHtml: '<div>App</div>',
      css: '',
      ssrData: [],
      clientEntry: '/src/entry-client.ts',
    });

    expect(result).not.toContain('__VERTZ_SSR_DATA__');
    expect(result).not.toContain('<script>window.');
  });

  test('client entry script tag has correct src', () => {
    const result = generateSSRHtml({
      appHtml: '<div>App</div>',
      css: '',
      ssrData: [],
      clientEntry: '/src/my-client.ts',
    });

    expect(result).toContain('<script type="module" src="/src/my-client.ts"></script>');
  });

  test('custom title is used', () => {
    const result = generateSSRHtml({
      appHtml: '<div>App</div>',
      css: '',
      ssrData: [],
      clientEntry: '/src/entry-client.ts',
      title: 'My Custom App',
    });

    expect(result).toContain('<title>My Custom App</title>');
    expect(result).not.toContain('Vertz App');
  });

  test('default title is Vertz App', () => {
    const result = generateSSRHtml({
      appHtml: '<div>App</div>',
      css: '',
      ssrData: [],
      clientEntry: '/src/entry-client.ts',
    });

    expect(result).toContain('<title>Vertz App</title>');
  });
});

describe('createDevServer ssrModule option', () => {
  test('accepts ssrModule option without error', () => {
    const server = createDevServer({
      entry: '/src/app.tsx',
      ssrModule: true,
      clientEntry: '/src/entry-client.ts',
      title: 'My App',
    });

    expect(server).toBeDefined();
    expect(typeof server.listen).toBe('function');
    expect(typeof server.close).toBe('function');
  });

  test('backward compat: ssrModule false works as before', () => {
    const server = createDevServer({
      entry: '/src/entry-server.ts',
      ssrModule: false,
    });

    expect(server).toBeDefined();
    expect(typeof server.listen).toBe('function');
    expect(typeof server.close).toBe('function');
  });
});
