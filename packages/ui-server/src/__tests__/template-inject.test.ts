import { describe, expect, it } from 'bun:test';
import { injectIntoTemplate } from '../template-inject';

const template = `<!doctype html>
<html>
  <head>
    <title>Test</title>
    <link rel="stylesheet" href="/assets/vertz.css">
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/assets/entry.js"></script>
  </body>
</html>`;

describe('injectIntoTemplate', () => {
  it('injects app HTML into <div id="app">', () => {
    const result = injectIntoTemplate({
      template,
      appHtml: '<p>Hello</p>',
      appCss: '',
      ssrData: [],
    });
    expect(result).toContain('<div id="app"><p>Hello</p></div>');
  });

  it('injects app HTML into <!--ssr-outlet--> when present', () => {
    const outletTemplate = `<!doctype html>
<html>
  <head><title>Test</title></head>
  <body>
    <div id="app"><!--ssr-outlet--></div>
  </body>
</html>`;
    const result = injectIntoTemplate({
      template: outletTemplate,
      appHtml: '<p>SSR Content</p>',
      appCss: '',
      ssrData: [],
    });
    expect(result).toContain('<p>SSR Content</p>');
    expect(result).not.toContain('<!--ssr-outlet-->');
  });

  it('replaces pre-rendered content inside <div id="app"> with deeply nested divs', () => {
    // Simulates a real pre-rendered template where </div> tags appear inside
    // nested layout components (sidebar nav) before the main content area.
    // The non-greedy regex [\s\S]*? would stop at the first </div> inside
    // the nav, orphaning the rest of the layout including main-content.
    const preRenderedTemplate = `<!doctype html>
<html>
  <head><title>Test</title></head>
  <body>
    <div id="app"><div data-testid="app-root"><div class="shell"><nav><div class="nav-title">App</div><div class="nav-list"><div class="nav-item">Link</div></div></nav><main data-testid="main-content"><p>Old SSR</p></main></div></div></div>
    <script type="module" src="/assets/entry.js"></script>
  </body>
</html>`;
    const result = injectIntoTemplate({
      template: preRenderedTemplate,
      appHtml: '<div data-testid="app-root"><div class="shell"><nav><div class="nav-title">App</div></nav><main data-testid="main-content"><p>New SSR</p></main></div></div>',
      appCss: '',
      ssrData: [],
    });
    // New SSR content should fully replace old — no orphaned HTML
    expect(result).toContain('New SSR');
    expect(result).not.toContain('Old SSR');
    // Only one main-content should exist
    const mainCount = (result.match(/data-testid="main-content"/g) || []).length;
    expect(mainCount).toBe(1);
  });

  it('injects CSS before </head>', () => {
    const css = '<style data-vertz-css>body { margin: 0; }</style>';
    const result = injectIntoTemplate({
      template,
      appHtml: '<p>Hello</p>',
      appCss: css,
      ssrData: [],
    });
    expect(result).toContain(css);
  });

  it('injects SSR data before </body>', () => {
    const result = injectIntoTemplate({
      template,
      appHtml: '<p>Hello</p>',
      appCss: '',
      ssrData: [{ key: 'test', data: { id: 1 } }],
    });
    expect(result).toContain('window.__VERTZ_SSR_DATA__=');
  });

  it('converts linked stylesheets to async when inline CSS is injected', () => {
    const css = '<style data-vertz-css>body { margin: 0; }</style>';
    const result = injectIntoTemplate({
      template,
      appHtml: '<p>Hello</p>',
      appCss: css,
      ssrData: [],
    });

    // The linked stylesheet should use the async loading pattern
    expect(result).toContain(
      '<link rel="stylesheet" href="/assets/vertz.css" media="print" onload="this.media=\'all\'">',
    );
    // A noscript fallback should be present for non-JS environments
    expect(result).toContain(
      '<noscript><link rel="stylesheet" href="/assets/vertz.css"></noscript>',
    );
    // The original render-blocking link should NOT appear outside noscript
    const withoutNoscript = result.replace(/<noscript>[\s\S]*?<\/noscript>/g, '');
    expect(withoutNoscript).not.toContain('<link rel="stylesheet" href="/assets/vertz.css">');
  });

  it('keeps linked stylesheets render-blocking when no inline CSS is injected', () => {
    const result = injectIntoTemplate({
      template,
      appHtml: '<p>Hello</p>',
      appCss: '',
      ssrData: [],
    });

    // No inline CSS → linked CSS must stay render-blocking
    expect(result).toContain('<link rel="stylesheet" href="/assets/vertz.css">');
    expect(result).not.toContain('media="print"');
  });

  it('injects sessionScript before </body> when provided', () => {
    const sessionScript =
      '<script>window.__VERTZ_SESSION__={"user":{"id":"u1"},"expiresAt":999}</script>';
    const result = injectIntoTemplate({
      template,
      appHtml: '<p>Hello</p>',
      appCss: '',
      ssrData: [{ key: 'test', data: { id: 1 } }],
      sessionScript,
    });

    expect(result).toContain('__VERTZ_SESSION__');
    // Session script should come before ssrData
    const sessionIdx = result.indexOf('__VERTZ_SESSION__');
    const ssrDataIdx = result.indexOf('__VERTZ_SSR_DATA__');
    expect(sessionIdx).toBeLessThan(ssrDataIdx);
  });

  it('omits sessionScript when not provided', () => {
    const result = injectIntoTemplate({
      template,
      appHtml: '<p>Hello</p>',
      appCss: '',
      ssrData: [],
    });

    expect(result).not.toContain('__VERTZ_SESSION__');
  });

  it('includes both sessionScript and ssrData when both provided', () => {
    const sessionScript =
      '<script>window.__VERTZ_SESSION__={"user":{"id":"u1"},"expiresAt":999}</script>' +
      '\n<script>window.__VERTZ_ACCESS_SET__={"entitlements":{},"flags":{},"plan":null,"computedAt":"now"}</script>';
    const result = injectIntoTemplate({
      template,
      appHtml: '',
      appCss: '',
      ssrData: [{ key: 'q', data: {} }],
      sessionScript,
    });

    expect(result).toContain('__VERTZ_SESSION__');
    expect(result).toContain('__VERTZ_ACCESS_SET__');
    expect(result).toContain('__VERTZ_SSR_DATA__');
  });
});
