import { describe, expect, it } from 'vitest';
import { HeadCollector, renderHeadToHtml } from './head';
import type { HeadEntry } from './types';

describe('HeadCollector', () => {
  it('collects title entries', () => {
    const head = new HeadCollector();
    head.addTitle('Hello');
    expect(head.getEntries()).toEqual([{ tag: 'title', textContent: 'Hello' }]);
  });

  it('collects meta entries', () => {
    const head = new HeadCollector();
    head.addMeta({ name: 'description', content: 'A page' });
    expect(head.getEntries()).toEqual([
      { tag: 'meta', attrs: { name: 'description', content: 'A page' } },
    ]);
  });

  it('collects link entries', () => {
    const head = new HeadCollector();
    head.addLink({ rel: 'stylesheet', href: '/styles.css' });
    expect(head.getEntries()).toEqual([
      { tag: 'link', attrs: { rel: 'stylesheet', href: '/styles.css' } },
    ]);
  });

  it('returns a copy of entries', () => {
    const head = new HeadCollector();
    head.addTitle('Test');
    const entries = head.getEntries();
    entries.push({ tag: 'title', textContent: 'Extra' });
    expect(head.getEntries()).toHaveLength(1);
  });

  it('clears all entries', () => {
    const head = new HeadCollector();
    head.addTitle('Test');
    head.clear();
    expect(head.getEntries()).toEqual([]);
  });
});

describe('renderHeadToHtml', () => {
  it('returns empty string for no entries', () => {
    expect(renderHeadToHtml([])).toBe('');
  });

  it('renders title with escaped HTML', () => {
    const entries: HeadEntry[] = [{ tag: 'title', textContent: '<script>alert(1)</script>' }];
    const html = renderHeadToHtml(entries);
    expect(html).toBe('<title>&lt;script&gt;alert(1)&lt;/script&gt;</title>');
  });

  it('renders meta tags', () => {
    const entries: HeadEntry[] = [{ tag: 'meta', attrs: { charset: 'utf-8' } }];
    const html = renderHeadToHtml(entries);
    expect(html).toBe('<meta charset="utf-8">');
  });

  it('escapes attribute values to prevent XSS', () => {
    const entries: HeadEntry[] = [
      { tag: 'meta', attrs: { name: 'desc', content: '"><script>alert(1)</script>' } },
    ];
    const html = renderHeadToHtml(entries);
    // escapeAttr escapes & and " — the " escaping prevents breaking out of the attribute
    expect(html).toContain('&quot;');
    expect(html).not.toContain('content="">');
    expect(html).toBe('<meta name="desc" content="&quot;><script>alert(1)</script>">');
  });

  it('escapes ampersands in attribute values', () => {
    const entries: HeadEntry[] = [
      { tag: 'link', attrs: { rel: 'canonical', href: '/page?a=1&b=2' } },
    ];
    const html = renderHeadToHtml(entries);
    expect(html).toContain('&amp;');
    expect(html).toBe('<link rel="canonical" href="/page?a=1&amp;b=2">');
  });
});
