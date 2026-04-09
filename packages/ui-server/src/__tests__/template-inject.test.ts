import { describe, expect, it } from '@vertz/test';
import { injectHtmlAttributes, injectIntoTemplate } from '../template-inject';

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
      appHtml:
        '<div data-testid="app-root"><div class="shell"><nav><div class="nav-title">App</div></nav><main data-testid="main-content"><p>New SSR</p></main></div></div>',
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

describe('injectHtmlAttributes', () => {
  it('returns template unchanged when attrs is empty', () => {
    const tpl = '<!doctype html><html lang="en"><head></head><body></body></html>';
    expect(injectHtmlAttributes(tpl, {})).toBe(tpl);
  });

  it('injects a single attribute onto <html>', () => {
    const tpl = '<!doctype html><html lang="en"><head></head><body></body></html>';
    const result = injectHtmlAttributes(tpl, { 'data-theme': 'dark' });
    expect(result).toContain('lang="en"');
    expect(result).toContain('data-theme="dark"');
  });

  it('injects multiple attributes', () => {
    const tpl = '<!doctype html><html lang="en"><head></head><body></body></html>';
    const result = injectHtmlAttributes(tpl, { 'data-theme': 'dark', dir: 'rtl' });
    expect(result).toContain('data-theme="dark"');
    expect(result).toContain('dir="rtl"');
    expect(result).toContain('lang="en"');
  });

  it('overrides existing template attribute with callback value', () => {
    const tpl = '<!doctype html><html lang="en"><head></head><body></body></html>';
    const result = injectHtmlAttributes(tpl, { lang: 'pt-BR' });
    expect(result).toContain('lang="pt-BR"');
    expect(result).not.toContain('lang="en"');
  });

  it('merges: overrides some, adds new', () => {
    const tpl = '<!doctype html><html lang="en" class="no-js"><head></head><body></body></html>';
    const result = injectHtmlAttributes(tpl, { lang: 'pt-BR', 'data-theme': 'dark' });
    expect(result).toContain('lang="pt-BR"');
    expect(result).toContain('class="no-js"');
    expect(result).toContain('data-theme="dark"');
    expect(result).not.toContain('lang="en"');
  });

  it('escapes attribute values to prevent XSS', () => {
    const tpl = '<!doctype html><html lang="en"><head></head><body></body></html>';
    const result = injectHtmlAttributes(tpl, { 'data-theme': '"><script>alert(1)</script>' });
    expect(result).toContain('data-theme="&quot;>');
    expect(result).not.toContain('data-theme="">');
  });

  it('throws on invalid attribute key with spaces', () => {
    const tpl = '<!doctype html><html lang="en"><head></head><body></body></html>';
    expect(() => injectHtmlAttributes(tpl, { 'on load="alert(1)" x': 'y' })).toThrow(
      'Invalid HTML attribute key',
    );
  });

  it('throws on empty attribute key', () => {
    const tpl = '<!doctype html><html lang="en"><head></head><body></body></html>';
    expect(() => injectHtmlAttributes(tpl, { '': 'value' })).toThrow('Invalid HTML attribute key');
  });

  it('returns template unchanged when no <html tag found', () => {
    const tpl = '<!doctype html><head></head><body></body>';
    expect(injectHtmlAttributes(tpl, { 'data-theme': 'dark' })).toBe(tpl);
  });

  it('handles case-insensitive <HTML> tag and preserves casing', () => {
    const tpl = '<!doctype html><HTML lang="en"><head></head><body></body></HTML>';
    const result = injectHtmlAttributes(tpl, { 'data-theme': 'dark' });
    expect(result).toContain('data-theme="dark"');
    expect(result).toContain('lang="en"');
    // Preserves original uppercase casing
    expect(result).toContain('<HTML');
    expect(result).not.toContain('<html');
  });

  it('handles <html> with no existing attributes', () => {
    const tpl = '<!doctype html><html><head></head><body></body></html>';
    const result = injectHtmlAttributes(tpl, { 'data-theme': 'dark' });
    expect(result).toContain('<html data-theme="dark">');
  });

  it('handles multiline <html> tag', () => {
    const tpl =
      '<!doctype html>\n<html\n  lang="en"\n  class="no-js"\n><head></head><body></body></html>';
    const result = injectHtmlAttributes(tpl, { 'data-theme': 'dark' });
    expect(result).toContain('data-theme="dark"');
    expect(result).toContain('lang="en"');
    expect(result).toContain('class="no-js"');
  });

  it('preserves boolean attributes as bare attributes (no ="")', () => {
    const tpl = '<!doctype html><html lang="en" hidden><head></head><body></body></html>';
    const result = injectHtmlAttributes(tpl, { 'data-theme': 'dark' });
    expect(result).toMatch(/ hidden[ >]/);
    expect(result).not.toContain('hidden=""');
    expect(result).toContain('data-theme="dark"');
    expect(result).toContain('lang="en"');
  });

  it('handles single-quoted attributes in template', () => {
    const tpl = "<!doctype html><html lang='en'><head></head><body></body></html>";
    const result = injectHtmlAttributes(tpl, { 'data-theme': 'dark' });
    // Single quotes normalized to double quotes on output
    expect(result).toContain('lang="en"');
    expect(result).toContain('data-theme="dark"');
  });
});
