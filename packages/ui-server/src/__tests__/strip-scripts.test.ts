import { describe, expect, it } from 'bun:test';
import { stripScriptsFromStaticHTML } from '../prerender';

describe('stripScriptsFromStaticHTML', () => {
  describe('Given HTML without island or hydration markers', () => {
    it('strips <script> tags', () => {
      const html =
        '<html><head></head><body><div>Hello</div><script type="module" src="/assets/entry.js"></script></body></html>';
      const result = stripScriptsFromStaticHTML(html);
      expect(result).not.toContain('<script');
      expect(result).toContain('<div>Hello</div>');
    });

    it('strips <link rel="modulepreload"> tags', () => {
      const html =
        '<html><head><link rel="modulepreload" href="/assets/chunk.js"><link rel="stylesheet" href="/assets/style.css"></head><body><div>Hello</div></body></html>';
      const result = stripScriptsFromStaticHTML(html);
      expect(result).not.toContain('modulepreload');
      expect(result).toContain('stylesheet');
    });

    it('strips multiple scripts and modulepreload links', () => {
      const html = [
        '<html><head>',
        '<link rel="modulepreload" href="/assets/chunk-a.js">',
        '<link rel="modulepreload" href="/assets/chunk-b.js">',
        '<link rel="stylesheet" href="/assets/style.css">',
        '</head><body>',
        '<div>Content</div>',
        '<script type="module" src="/assets/entry.js"></script>',
        '<script>console.log("inline")</script>',
        '</body></html>',
      ].join('');
      const result = stripScriptsFromStaticHTML(html);
      expect(result).not.toContain('<script');
      expect(result).not.toContain('modulepreload');
      expect(result).toContain('stylesheet');
      expect(result).toContain('<div>Content</div>');
    });
  });

  describe('Given HTML with data-v-island markers', () => {
    it('preserves all scripts and links', () => {
      const html =
        '<html><head><link rel="modulepreload" href="/assets/chunk.js"></head><body><div data-v-island="CopyButton"><script data-v-island-props="" type="application/json">{}</script><button>Copy</button></div><script type="module" src="/assets/entry.js"></script></body></html>';
      const result = stripScriptsFromStaticHTML(html);
      expect(result).toBe(html);
    });
  });

  describe('Given HTML with data-v-id markers', () => {
    it('preserves all scripts and links', () => {
      const html =
        '<html><head></head><body><div data-v-id="MyComponent"><span>Hello</span></div><script type="module" src="/assets/entry.js"></script></body></html>';
      const result = stripScriptsFromStaticHTML(html);
      expect(result).toBe(html);
    });
  });

  describe('Given HTML with island-props scripts only', () => {
    it('strips only non-island scripts when no data-v-island marker present', () => {
      // Edge case: a JSON script without the island container should still be stripped
      const html =
        '<html><head></head><body><div>Static</div><script type="application/json">{"data":true}</script><script type="module" src="/assets/entry.js"></script></body></html>';
      const result = stripScriptsFromStaticHTML(html);
      expect(result).not.toContain('<script');
    });
  });
});
