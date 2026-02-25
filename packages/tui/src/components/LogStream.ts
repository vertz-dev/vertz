import { __append, __element } from '../internals';
import type { TuiChild, TuiElement } from '../tui-element';

export interface LogStreamProps<T> {
  /** Log entries to display. */
  entries: T[];
  /** Render function for each entry. */
  children: (entry: T) => TuiChild;
  /** Maximum number of entries to keep visible. Older entries are trimmed. */
  maxLines?: number;
}

/**
 * LogStream — scrollable log output for CLI tools.
 *
 * Renders a list of entries in a column layout. When `maxLines` is set,
 * only the most recent entries are shown (tail behavior).
 */
export function LogStream<T>({
  entries,
  children: renderEntry,
  maxLines,
}: LogStreamProps<T>): TuiElement {
  const box = __element('Box', 'direction', 'column');

  const visible = maxLines ? entries.slice(-maxLines) : entries;

  for (const entry of visible) {
    __append(box, renderEntry(entry));
  }

  return box;
}
