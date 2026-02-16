import { escapeAttr, escapeHtml } from './html-serializer';
/**
 * Collector for `<head>` metadata during SSR.
 *
 * Components call `addTitle`, `addMeta`, or `addLink` during render,
 * and the collected entries are serialized into the HTML `<head>` section.
 */
export class HeadCollector {
  entries = [];
  /** Add a `<title>` entry. */
  addTitle(text) {
    this.entries.push({ tag: 'title', textContent: text });
  }
  /** Add a `<meta>` entry. */
  addMeta(attrs) {
    this.entries.push({ tag: 'meta', attrs });
  }
  /** Add a `<link>` entry. */
  addLink(attrs) {
    this.entries.push({ tag: 'link', attrs });
  }
  /** Get all collected entries. */
  getEntries() {
    return [...this.entries];
  }
  /** Clear all collected entries. */
  clear() {
    this.entries = [];
  }
}
/**
 * Render head entries to an HTML string.
 *
 * - `<title>` renders as `<title>text</title>`
 * - `<meta>` and `<link>` render as void elements
 */
export function renderHeadToHtml(entries) {
  if (entries.length === 0) return '';
  return entries
    .map((entry) => {
      if (entry.tag === 'title') {
        return `<title>${escapeHtml(entry.textContent ?? '')}</title>`;
      }
      // meta and link are void elements
      const attrs = entry.attrs ?? {};
      const attrStr = Object.entries(attrs)
        .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
        .join('');
      return `<${entry.tag}${attrStr}>`;
    })
    .join('\n');
}
//# sourceMappingURL=head.js.map
