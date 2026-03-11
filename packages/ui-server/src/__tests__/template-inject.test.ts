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
    const result = injectIntoTemplate(template, '<p>Hello</p>', '', []);
    expect(result).toContain('<div id="app"><p>Hello</p></div>');
  });

  it('injects CSS before </head>', () => {
    const css = '<style data-vertz-css>body { margin: 0; }</style>';
    const result = injectIntoTemplate(template, '<p>Hello</p>', css, []);
    expect(result).toContain(css);
  });

  it('injects SSR data before </body>', () => {
    const result = injectIntoTemplate(template, '<p>Hello</p>', '', [
      { key: 'test', data: { id: 1 } },
    ]);
    expect(result).toContain('window.__VERTZ_SSR_DATA__=');
  });

  it('converts linked stylesheets to async when inline CSS is injected', () => {
    const css = '<style data-vertz-css>body { margin: 0; }</style>';
    const result = injectIntoTemplate(template, '<p>Hello</p>', css, []);

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
    const result = injectIntoTemplate(template, '<p>Hello</p>', '', []);

    // No inline CSS → linked CSS must stay render-blocking
    expect(result).toContain('<link rel="stylesheet" href="/assets/vertz.css">');
    expect(result).not.toContain('media="print"');
  });
});
