import { describe, expect, it } from 'vitest';
import { inlineCriticalCss } from '../critical-css';

describe('inlineCriticalCss', () => {
  it('wraps CSS in a style tag', () => {
    const html = inlineCriticalCss('body { margin: 0; }');
    expect(html).toBe('<style>body { margin: 0; }</style>');
  });

  it('returns empty string for empty CSS', () => {
    expect(inlineCriticalCss('')).toBe('');
  });

  it('preserves CSS content exactly', () => {
    const css =
      '.container { max-width: 1200px; margin: 0 auto; }\n@media (max-width: 768px) { .container { padding: 0 1rem; } }';
    const html = inlineCriticalCss(css);
    expect(html).toBe(`<style>${css}</style>`);
  });

  it('escapes closing style tags in CSS content', () => {
    const css = 'div::after { content: "</style>"; }';
    const html = inlineCriticalCss(css);
    // The inner CSS should have </style> escaped
    const innerCss = html.slice('<style>'.length, html.lastIndexOf('</style>'));
    expect(innerCss).not.toContain('</style>');
    expect(innerCss).toContain('<\\/style>');
    // The outer wrapper should still be a valid <style> element
    expect(html).toMatch(/^<style>.*<\/style>$/s);
  });
});
