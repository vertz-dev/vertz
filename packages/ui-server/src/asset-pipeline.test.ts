import { describe, expect, it } from 'vitest';
import { renderAssetTags } from './asset-pipeline';
import type { AssetDescriptor } from './types';

describe('renderAssetTags', () => {
  it('returns empty string for no assets', () => {
    expect(renderAssetTags([])).toBe('');
  });

  it('renders a stylesheet link', () => {
    const assets: AssetDescriptor[] = [{ type: 'stylesheet', src: '/styles.css' }];
    expect(renderAssetTags(assets)).toBe('<link rel="stylesheet" href="/styles.css">');
  });

  it('renders a script tag', () => {
    const assets: AssetDescriptor[] = [{ type: 'script', src: '/app.js' }];
    expect(renderAssetTags(assets)).toBe('<script src="/app.js"></script>');
  });

  it('renders script with async attribute', () => {
    const assets: AssetDescriptor[] = [{ type: 'script', src: '/app.js', async: true }];
    expect(renderAssetTags(assets)).toBe('<script src="/app.js" async></script>');
  });

  it('renders script with defer attribute', () => {
    const assets: AssetDescriptor[] = [{ type: 'script', src: '/app.js', defer: true }];
    expect(renderAssetTags(assets)).toBe('<script src="/app.js" defer></script>');
  });

  it('escapes src attribute values to prevent injection', () => {
    const assets: AssetDescriptor[] = [{ type: 'script', src: '"><script>alert(1)</script>' }];
    const html = renderAssetTags(assets);
    expect(html).toContain('&quot;');
    expect(html).not.toContain('"><script>alert(1)');
  });

  it('escapes stylesheet href to prevent injection', () => {
    const assets: AssetDescriptor[] = [{ type: 'stylesheet', src: '"><script>alert(1)</script>' }];
    const html = renderAssetTags(assets);
    expect(html).toContain('&quot;');
    expect(html).not.toContain('"><script>alert(1)');
  });

  it('escapes ampersands in src values', () => {
    const assets: AssetDescriptor[] = [{ type: 'script', src: '/app.js?v=1&t=2' }];
    const html = renderAssetTags(assets);
    expect(html).toContain('&amp;');
    expect(html).toBe('<script src="/app.js?v=1&amp;t=2"></script>');
  });

  it('renders multiple assets separated by newlines', () => {
    const assets: AssetDescriptor[] = [
      { type: 'stylesheet', src: '/a.css' },
      { type: 'script', src: '/b.js' },
    ];
    const html = renderAssetTags(assets);
    expect(html).toBe('<link rel="stylesheet" href="/a.css">\n<script src="/b.js"></script>');
  });
});
