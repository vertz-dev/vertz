import { __append, __element, __staticText } from '../internals';
import type { TuiElement } from '../tui-element';

export interface KeyValueEntry {
  key: string;
  value: string;
}

export interface KeyValueProps {
  entries: KeyValueEntry[];
  separator?: string;
  keyBold?: boolean;
}

export function KeyValue({ entries, separator = ': ', keyBold = true }: KeyValueProps): TuiElement {
  const maxKeyLen = entries.reduce((max, e) => Math.max(max, e.key.length), 0);
  const box = __element('Box', 'direction', 'column');

  for (const entry of entries) {
    const paddedKey = entry.key.padStart(maxKeyLen);
    const row = __element('Box', 'direction', 'row');

    const keyAttrs: unknown[] = [];
    if (keyBold) keyAttrs.push('bold', true);
    const keyEl = __element('Text', ...keyAttrs);
    __append(keyEl, __staticText(paddedKey));

    const sepEl = __element('Text', 'dim', true);
    __append(sepEl, __staticText(separator));

    const valEl = __element('Text');
    __append(valEl, __staticText(entry.value));

    __append(row, keyEl);
    __append(row, sepEl);
    __append(row, valEl);
    __append(box, row);
  }

  return box;
}
