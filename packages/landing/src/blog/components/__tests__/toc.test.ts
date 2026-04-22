import { describe, expect, it } from '@vertz/test';
import { extractHeadingsFromHtml, slugify } from '../toc';

describe('Feature: TOC heading extractor', () => {
  describe('Given HTML with h2 and h3 headings', () => {
    describe('When extractHeadingsFromHtml runs', () => {
      it('then it returns a flat list with the right depth for each heading', () => {
        const html = `
          <h2>First section</h2>
          <p>Body.</p>
          <h3>A sub-heading</h3>
          <p>More body.</p>
          <h2>Second section</h2>
        `;
        const out = extractHeadingsFromHtml(html);
        expect(out).toEqual([
          { level: 2, text: 'First section', id: 'first-section' },
          { level: 3, text: 'A sub-heading', id: 'a-sub-heading' },
          { level: 2, text: 'Second section', id: 'second-section' },
        ]);
      });
    });
  });

  describe('Given HTML with an h4 (out of scope for TOC)', () => {
    describe('When extractHeadingsFromHtml runs', () => {
      it('then h4 is skipped', () => {
        const html = '<h2>Top</h2><h4>Deep</h4><h3>Mid</h3>';
        const out = extractHeadingsFromHtml(html);
        expect(out.map((h) => h.level)).toEqual([2, 3]);
      });
    });
  });

  describe('Given an h2 with an explicit id attribute', () => {
    describe('When extractHeadingsFromHtml runs', () => {
      it('then the explicit id wins over the slugified text', () => {
        const html = '<h2 id="custom-id">Not the slug</h2>';
        const out = extractHeadingsFromHtml(html);
        expect(out[0]).toEqual({ level: 2, text: 'Not the slug', id: 'custom-id' });
      });
    });
  });

  describe('Given duplicate heading text', () => {
    describe('When extractHeadingsFromHtml runs', () => {
      it('then ids are disambiguated with a numeric suffix', () => {
        const html = '<h2>Setup</h2><h2>Setup</h2><h2>Setup</h2>';
        const out = extractHeadingsFromHtml(html);
        expect(out.map((h) => h.id)).toEqual(['setup', 'setup-2', 'setup-3']);
      });
    });
  });

  describe('Given a heading with inline markup', () => {
    describe('When extractHeadingsFromHtml runs', () => {
      it('then inner tags are stripped from the text', () => {
        const html = '<h2>Why <code>@vertz/mdx</code> is cool</h2>';
        const out = extractHeadingsFromHtml(html);
        expect(out[0]?.text).toBe('Why @vertz/mdx is cool');
      });
    });
  });
});

describe('Feature: slugify', () => {
  describe('Given a heading with non-ASCII characters', () => {
    describe('When slugify runs', () => {
      it('then diacritics are collapsed and spaces become dashes', () => {
        expect(slugify('Why é cool')).toBe('why-e-cool');
        expect(slugify('Über alles')).toBe('uber-alles');
      });
    });
  });

  describe('Given a heading with punctuation', () => {
    describe('When slugify runs', () => {
      it('then punctuation is dropped', () => {
        expect(slugify('Let us talk: feature flags!')).toBe('let-us-talk-feature-flags');
      });
    });
  });

  describe('Given a heading with surrounding whitespace', () => {
    describe('When slugify runs', () => {
      it('then leading/trailing dashes are trimmed', () => {
        expect(slugify('  -Hello-  ')).toBe('hello');
      });
    });
  });
});
