import { escapeHtml } from './html-serializer';
import type { HeadEntry } from './types';

/**
 * Collector for `<head>` metadata during SSR.
 *
 * Components call `addTitle`, `addMeta`, or `addLink` during render,
 * and the collected entries are serialized into the HTML `<head>` section.
 */
export class HeadCollector {
  private entries: HeadEntry[] = [];

  /** Add a `<title>` entry. */
  addTitle(text: string): void {
    this.entries.push({ tag: 'title', textContent: text });
  }

  /** Add a `<meta>` entry. */
  addMeta(attrs: Record<string, string>): void {
    this.entries.push({ tag: 'meta', attrs });
  }

  /** Add a `<link>` entry. */
  addLink(attrs: Record<string, string>): void {
    this.entries.push({ tag: 'link', attrs });
  }

  /** Get all collected entries. */
  getEntries(): HeadEntry[] {
    return [...this.entries];
  }

  /** Clear all collected entries. */
  clear(): void {
    this.entries = [];
  }
}

/**
 * Render head entries to an HTML string.
 *
 * - `<title>` renders as `<title>text</title>`
 * - `<meta>` and `<link>` render as void elements
 */
export function renderHeadToHtml(entries: HeadEntry[]): string {
  if (entries.length === 0) return '';

  return entries
    .map((entry) => {
      if (entry.tag === 'title') {
        return `<title>${escapeHtml(entry.textContent ?? '')}</title>`;
      }

      // meta and link are void elements
      const attrs = entry.attrs ?? {};
      const attrStr = Object.entries(attrs)
        .map(([k, v]) => ` ${k}="${v}"`)
        .join('');
      return `<${entry.tag}${attrStr}>`;
    })
    .join('\n');
}
