import { describe, expect, it } from 'vitest';
import { HeadCollector, renderHeadToHtml } from '../head';

describe('HeadCollector', () => {
  it('collects title entries', () => {
    const collector = new HeadCollector();
    collector.addTitle('My Page');
    expect(collector.getEntries()).toEqual([{ tag: 'title', textContent: 'My Page' }]);
  });

  it('collects meta entries', () => {
    const collector = new HeadCollector();
    collector.addMeta({ name: 'description', content: 'A test page' });
    expect(collector.getEntries()).toEqual([
      { tag: 'meta', attrs: { name: 'description', content: 'A test page' } },
    ]);
  });

  it('collects link entries', () => {
    const collector = new HeadCollector();
    collector.addLink({ rel: 'stylesheet', href: '/style.css' });
    expect(collector.getEntries()).toEqual([
      { tag: 'link', attrs: { rel: 'stylesheet', href: '/style.css' } },
    ]);
  });

  it('collects multiple entries in order', () => {
    const collector = new HeadCollector();
    collector.addTitle('Page');
    collector.addMeta({ charset: 'utf-8' });
    collector.addLink({ rel: 'icon', href: '/favicon.ico' });
    expect(collector.getEntries()).toHaveLength(3);
    expect(collector.getEntries()[0]?.tag).toBe('title');
    expect(collector.getEntries()[1]?.tag).toBe('meta');
    expect(collector.getEntries()[2]?.tag).toBe('link');
  });

  it('clears all entries', () => {
    const collector = new HeadCollector();
    collector.addTitle('Page');
    collector.clear();
    expect(collector.getEntries()).toEqual([]);
  });
});

describe('renderHeadToHtml', () => {
  it('renders title tag', () => {
    const html = renderHeadToHtml([{ tag: 'title', textContent: 'My App' }]);
    expect(html).toBe('<title>My App</title>');
  });

  it('renders meta tag as void element', () => {
    const html = renderHeadToHtml([
      { tag: 'meta', attrs: { name: 'viewport', content: 'width=device-width' } },
    ]);
    expect(html).toBe('<meta name="viewport" content="width=device-width">');
  });

  it('renders link tag as void element', () => {
    const html = renderHeadToHtml([
      { tag: 'link', attrs: { rel: 'stylesheet', href: '/app.css' } },
    ]);
    expect(html).toBe('<link rel="stylesheet" href="/app.css">');
  });

  it('renders multiple head entries', () => {
    const html = renderHeadToHtml([
      { tag: 'title', textContent: 'Test' },
      { tag: 'meta', attrs: { charset: 'utf-8' } },
      { tag: 'link', attrs: { rel: 'icon', href: '/icon.png' } },
    ]);
    expect(html).toBe(
      '<title>Test</title>\n<meta charset="utf-8">\n<link rel="icon" href="/icon.png">',
    );
  });

  it('returns empty string for empty entries', () => {
    expect(renderHeadToHtml([])).toBe('');
  });

  it('escapes HTML entities in title text', () => {
    const html = renderHeadToHtml([{ tag: 'title', textContent: '<script>xss</script>' }]);
    expect(html).toBe('<title>&lt;script&gt;xss&lt;/script&gt;</title>');
  });
});
