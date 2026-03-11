import { describe, expect, it } from 'bun:test';
import { buildCssInjection, CSS_INLINE_THRESHOLD, type CssSource } from './build-css-injection';

describe('buildCssInjection()', () => {
  describe('Given CSS sources under threshold', () => {
    describe('When building CSS injection HTML', () => {
      it('Then returns <style> tags with the CSS content', () => {
        const result = buildCssInjection([
          { content: '.foo { color: red; }', href: '/assets/vertz.css' },
        ]);

        expect(result.html).toContain('<style data-vertz-css>.foo { color: red; }</style>');
      });

      it('Then marks tags with data-vertz-css attribute', () => {
        const result = buildCssInjection([
          { content: '.bar { display: flex; }', href: '/assets/bar.css' },
        ]);

        expect(result.html).toMatch(/data-vertz-css/);
      });

      it('Then returns no files to write', () => {
        const result = buildCssInjection([
          { content: '.foo { color: red; }', href: '/assets/vertz.css' },
        ]);

        expect(result.filesToWrite).toEqual([]);
      });
    });
  });

  describe('Given CSS sources over threshold', () => {
    const largeCss = 'x'.repeat(CSS_INLINE_THRESHOLD + 1);

    describe('When building CSS injection HTML', () => {
      it('Then returns <link> tags referencing the file paths', () => {
        const result = buildCssInjection([{ content: largeCss, href: '/assets/large.css' }]);

        expect(result.html).toContain('<link rel="stylesheet" href="/assets/large.css" />');
        expect(result.html).not.toContain('<style');
      });

      it('Then returns the file to write', () => {
        const result = buildCssInjection([{ content: largeCss, href: '/assets/large.css' }]);

        expect(result.filesToWrite).toEqual([{ path: '/assets/large.css', content: largeCss }]);
      });
    });
  });

  describe('Given a mix of small and large CSS sources', () => {
    const smallCss = '.small { color: blue; }';
    const largeCss = 'x'.repeat(CSS_INLINE_THRESHOLD + 1);

    describe('When building CSS injection HTML', () => {
      it('Then inlines the small ones and links the large ones', () => {
        const sources: CssSource[] = [
          { content: smallCss, href: '/assets/small.css' },
          { content: largeCss, href: '/assets/large.css' },
        ];
        const result = buildCssInjection(sources);

        expect(result.html).toContain(`<style data-vertz-css>${smallCss}</style>`);
        expect(result.html).toContain('<link rel="stylesheet" href="/assets/large.css" />');
        expect(result.filesToWrite).toHaveLength(1);
        expect(result.filesToWrite[0].path).toBe('/assets/large.css');
      });
    });
  });

  describe('Given no CSS sources', () => {
    describe('When building CSS injection HTML', () => {
      it('Then returns empty html and no files', () => {
        const result = buildCssInjection([]);

        expect(result.html).toBe('');
        expect(result.filesToWrite).toEqual([]);
      });
    });
  });

  describe('Given CSS content exactly at threshold', () => {
    describe('When building CSS injection HTML', () => {
      it('Then inlines it (threshold is inclusive)', () => {
        const content = 'x'.repeat(100);
        const result = buildCssInjection([{ content, href: '/assets/exact.css' }], 100);

        expect(result.html).toContain('<style data-vertz-css>');
        expect(result.filesToWrite).toEqual([]);
      });
    });
  });

  describe('Given CSS content containing </style>', () => {
    describe('When building CSS injection HTML', () => {
      it('Then escapes the closing tag to prevent premature element closure', () => {
        const content = '.foo { content: "</style><script>alert(1)</script>"; }';
        const result = buildCssInjection([{ content, href: '/assets/xss.css' }]);

        expect(result.html).not.toContain('</style><script>');
        expect(result.html).toContain('<\\/style>');
      });
    });
  });

  describe('Given a custom threshold', () => {
    describe('When CSS exceeds the custom threshold', () => {
      it('Then links instead of inlining', () => {
        const result = buildCssInjection(
          [{ content: '.foo { color: red; }', href: '/assets/foo.css' }],
          5, // 5 bytes threshold
        );

        expect(result.html).toContain('<link rel="stylesheet"');
        expect(result.html).not.toContain('<style');
      });
    });
  });
});
