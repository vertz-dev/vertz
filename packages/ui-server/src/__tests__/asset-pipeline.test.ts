import { describe, expect, it } from 'vitest';
import { renderAssetTags } from '../asset-pipeline';

describe('renderAssetTags', () => {
  it('renders a script tag', () => {
    const html = renderAssetTags([{ type: 'script', src: '/app.js' }]);
    expect(html).toBe('<script src="/app.js"></script>');
  });

  it('renders a script tag with async', () => {
    const html = renderAssetTags([{ type: 'script', src: '/app.js', async: true }]);
    expect(html).toBe('<script src="/app.js" async></script>');
  });

  it('renders a script tag with defer', () => {
    const html = renderAssetTags([{ type: 'script', src: '/app.js', defer: true }]);
    expect(html).toBe('<script src="/app.js" defer></script>');
  });

  it('renders a stylesheet link tag', () => {
    const html = renderAssetTags([{ type: 'stylesheet', src: '/style.css' }]);
    expect(html).toBe('<link rel="stylesheet" href="/style.css">');
  });

  it('renders multiple assets', () => {
    const html = renderAssetTags([
      { type: 'stylesheet', src: '/a.css' },
      { type: 'script', src: '/b.js', defer: true },
    ]);
    expect(html).toBe('<link rel="stylesheet" href="/a.css">\n<script src="/b.js" defer></script>');
  });

  it('returns empty string for empty array', () => {
    expect(renderAssetTags([])).toBe('');
  });
});
