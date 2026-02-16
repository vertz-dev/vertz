import type { HeadEntry } from './types';
/**
 * Collector for `<head>` metadata during SSR.
 *
 * Components call `addTitle`, `addMeta`, or `addLink` during render,
 * and the collected entries are serialized into the HTML `<head>` section.
 */
export declare class HeadCollector {
  private entries;
  /** Add a `<title>` entry. */
  addTitle(text: string): void;
  /** Add a `<meta>` entry. */
  addMeta(attrs: Record<string, string>): void;
  /** Add a `<link>` entry. */
  addLink(attrs: Record<string, string>): void;
  /** Get all collected entries. */
  getEntries(): HeadEntry[];
  /** Clear all collected entries. */
  clear(): void;
}
/**
 * Render head entries to an HTML string.
 *
 * - `<title>` renders as `<title>text</title>`
 * - `<meta>` and `<link>` render as void elements
 */
export declare function renderHeadToHtml(entries: HeadEntry[]): string;
//# sourceMappingURL=head.d.ts.map
