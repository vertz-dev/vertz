import { describe, expect, it } from '@vertz/test';
import { splitTemplate } from '../template-split';

describe('splitTemplate', () => {
  describe('Given an HTML template with <!--ssr-outlet-->', () => {
    const template =
      '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><!--ssr-outlet--></body></html>';

    it('returns headTemplate ending at the outlet marker', () => {
      const { headTemplate } = splitTemplate(template);
      expect(headTemplate).toBe('<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>');
    });

    it('returns tailTemplate starting after the outlet marker', () => {
      const { tailTemplate } = splitTemplate(template);
      expect(tailTemplate).toBe('</body></html>');
    });
  });

  describe('Given an HTML template with <div id="app">', () => {
    const template = '<!DOCTYPE html><html><head></head><body><div id="app"></div></body></html>';

    it('returns headTemplate ending after the div opening tag', () => {
      const { headTemplate } = splitTemplate(template);
      expect(headTemplate).toBe('<!DOCTYPE html><html><head></head><body><div id="app">');
    });

    it('returns tailTemplate starting with </div>', () => {
      const { tailTemplate } = splitTemplate(template);
      expect(tailTemplate).toBe('</div></body></html>');
    });
  });

  describe('Given a template with <div id="app"> and existing content inside', () => {
    const template =
      '<!DOCTYPE html><html><head></head><body><div id="app"><div>old content</div></div></body></html>';

    it('returns tailTemplate starting at the matching </div> for app div', () => {
      const { headTemplate, tailTemplate } = splitTemplate(template);
      expect(headTemplate).toBe('<!DOCTYPE html><html><head></head><body><div id="app">');
      expect(tailTemplate).toBe('</div></body></html>');
    });
  });

  describe('Given a template with <div id="app"> containing non-div HTML tags', () => {
    const template =
      '<!DOCTYPE html><html><head></head><body><div id="app"><span>inner</span><p>text</p></div></body></html>';

    it('walks past non-div tags and finds the correct closing div', () => {
      const { headTemplate, tailTemplate } = splitTemplate(template);
      expect(headTemplate).toBe('<!DOCTYPE html><html><head></head><body><div id="app">');
      expect(tailTemplate).toBe('</div></body></html>');
    });
  });

  describe('Given a template with <div id="app"> but no matching </div>', () => {
    const template = '<!DOCTYPE html><html><head></head><body><div id="app">unclosed';

    it('falls back to empty tailTemplate (end of string)', () => {
      const { headTemplate, tailTemplate } = splitTemplate(template);
      expect(headTemplate).toBe('<!DOCTYPE html><html><head></head><body><div id="app">');
      expect(tailTemplate).toBe('');
    });
  });

  describe('Given a template with neither ssr-outlet nor div#app', () => {
    const template = '<!DOCTYPE html><html><head></head><body></body></html>';

    it('throws a descriptive error', () => {
      expect(() => splitTemplate(template)).toThrow(
        'Could not find <!--ssr-outlet--> or <div id="app"> in the HTML template',
      );
    });
  });

  describe('Given inlineCSS options', () => {
    const template = [
      '<!DOCTYPE html><html><head>',
      '<link rel="stylesheet" href="/assets/style.css">',
      '</head><body><!--ssr-outlet--></body></html>',
    ].join('');

    it('replaces link tags in headTemplate with inline styles', () => {
      const { headTemplate } = splitTemplate(template, {
        inlineCSS: { '/assets/style.css': 'body { margin: 0; }' },
      });
      expect(headTemplate).toContain('<style data-vertz-css>body { margin: 0; }</style>');
      expect(headTemplate).not.toContain('href="/assets/style.css"');
    });

    it('converts remaining (non-inlined) stylesheet links to async loading', () => {
      const templateWithTwo = [
        '<!DOCTYPE html><html><head>',
        '<link rel="stylesheet" href="/assets/style.css">',
        '<link rel="stylesheet" href="/assets/other.css">',
        '</head><body><!--ssr-outlet--></body></html>',
      ].join('');

      const { headTemplate } = splitTemplate(templateWithTwo, {
        inlineCSS: { '/assets/style.css': 'body { margin: 0; }' },
      });
      // style.css should be inlined
      expect(headTemplate).toContain('<style data-vertz-css>body { margin: 0; }</style>');
      // other.css should be converted to async loading
      expect(headTemplate).toContain('href="/assets/other.css"');
      expect(headTemplate).toContain('media="print"');
      expect(headTemplate).toContain('onload="this.media=\'all\'"');
      expect(headTemplate).toContain('<noscript>');
    });
  });

  describe('Given CSS content with </ sequences', () => {
    const template =
      '<!DOCTYPE html><html><head><link rel="stylesheet" href="/a.css"></head><body><!--ssr-outlet--></body></html>';

    it('escapes </ in inline CSS to prevent script injection', () => {
      const { headTemplate } = splitTemplate(template, {
        inlineCSS: { '/a.css': 'content: "</script>"' },
      });
      expect(headTemplate).toContain('<\\/script>');
      expect(headTemplate).not.toContain('</script>');
    });
  });
});
