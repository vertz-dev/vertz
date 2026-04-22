import { describe, expect, it } from '@vertz/test';
import {
  injectHeadingAnchors,
  markExternalLinks,
  wrapTables,
} from '../../../scripts/compile-blog-posts';

describe('Feature: injectHeadingAnchors', () => {
  describe('Given an h2 with an id', () => {
    describe('When injectHeadingAnchors runs', () => {
      it('then a heading-anchor link is appended inside the h2', () => {
        const out = injectHeadingAnchors('<h2 id="hello">Hello</h2>');
        expect(out).toContain('<a class="heading-anchor" href="#hello"');
        expect(out).toContain('Hello<a class="heading-anchor"');
      });
    });
  });

  describe('Given an h2 with an id that already has an anchor', () => {
    describe('When injectHeadingAnchors runs', () => {
      it('then no duplicate anchor is added', () => {
        const input = '<h2 id="hello">Hello<a class="heading-anchor" href="#hello">#</a></h2>';
        expect(injectHeadingAnchors(input).match(/heading-anchor/g)?.length).toBe(1);
      });
    });
  });

  describe('Given an h2 without an id', () => {
    describe('When injectHeadingAnchors runs', () => {
      it('then no anchor is injected (injectHeadingIds runs first)', () => {
        expect(injectHeadingAnchors('<h2>No id here</h2>')).toBe('<h2>No id here</h2>');
      });
    });
  });
});

describe('Feature: markExternalLinks', () => {
  describe('Given an anchor pointing to an external domain', () => {
    describe('When markExternalLinks runs', () => {
      it('then target=_blank + rel=noopener noreferrer are added', () => {
        const out = markExternalLinks('<a href="https://example.com">Ex</a>');
        expect(out).toContain('target="_blank"');
        expect(out).toContain('rel="noopener noreferrer"');
        expect(out).toContain('data-external="true"');
      });

      it('then a ↗ glyph is appended inside the anchor', () => {
        const out = markExternalLinks('<a href="https://example.com">Ex</a>');
        expect(out).toContain('↗');
        expect(out).toContain('external-link-icon');
      });
    });
  });

  describe('Given an anchor pointing to vertz.dev', () => {
    describe('When markExternalLinks runs', () => {
      it('then the anchor is treated as internal (no target, no glyph)', () => {
        const out = markExternalLinks('<a href="https://vertz.dev/docs">Docs</a>');
        expect(out).not.toContain('target="_blank"');
        expect(out).not.toContain('external-link-icon');
      });
    });
  });

  describe('Given an anchor with a relative href', () => {
    describe('When markExternalLinks runs', () => {
      it('then the anchor is treated as internal', () => {
        const out = markExternalLinks('<a href="/blog/foo">Foo</a>');
        expect(out).not.toContain('target="_blank"');
      });
    });
  });

  describe('Given an external anchor that already has target', () => {
    describe('When markExternalLinks runs', () => {
      it('then target is not duplicated', () => {
        const out = markExternalLinks('<a href="https://example.com" target="_self">Ex</a>');
        expect(out.match(/target=/g)?.length).toBe(1);
      });
    });
  });
});

describe('Feature: wrapTables', () => {
  describe('Given a table', () => {
    describe('When wrapTables runs', () => {
      it('then it is wrapped in a div.table-scroll', () => {
        const out = wrapTables('<table><tr><td>A</td></tr></table>');
        expect(out).toBe('<div class="table-scroll"><table><tr><td>A</td></tr></table></div>');
      });
    });
  });

  describe('Given two tables', () => {
    describe('When wrapTables runs', () => {
      it('then each one gets its own wrapper', () => {
        const out = wrapTables('<table>A</table> and <table>B</table>');
        expect(out.match(/table-scroll/g)?.length).toBe(2);
      });
    });
  });

  describe('Given content with no tables', () => {
    describe('When wrapTables runs', () => {
      it('then the input is returned unchanged', () => {
        expect(wrapTables('<p>Hello</p>')).toBe('<p>Hello</p>');
      });
    });
  });
});
