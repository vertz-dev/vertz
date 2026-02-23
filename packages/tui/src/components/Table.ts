import { __append, __element, __staticText } from '../internals';
import type { TuiElement } from '../tui-element';

export interface TableColumn<T> {
  key: keyof T & string;
  header: string;
  width?: number;
  align?: 'left' | 'right' | 'center';
}

export interface TableProps<T extends Record<string, unknown>> {
  data: T[];
  columns: TableColumn<T>[];
}

function padCell(text: string, width: number, align: 'left' | 'right' | 'center' = 'left'): string {
  if (text.length >= width) return text.slice(0, width);
  const padding = width - text.length;
  if (align === 'right') return ' '.repeat(padding) + text;
  if (align === 'center') {
    const left = Math.floor(padding / 2);
    return ' '.repeat(left) + text + ' '.repeat(padding - left);
  }
  return text + ' '.repeat(padding);
}

export function Table<T extends Record<string, unknown>>(props: TableProps<T>): TuiElement {
  const { data, columns } = props;

  // Calculate column widths: max of header length, data values, or explicit width
  const widths = columns.map((col) => {
    if (col.width) return col.width;
    let max = col.header.length;
    for (const row of data) {
      const val = String(row[col.key] ?? '');
      if (val.length > max) max = val.length;
    }
    return max;
  });

  const box = __element('Box', 'direction', 'column');

  // Header row
  const headerCells = columns.map((col, i) =>
    padCell(col.header, widths[i] ?? col.header.length, col.align),
  );
  const headerEl = __element('Text', 'bold', true);
  __append(headerEl, __staticText(headerCells.join('  ')));
  __append(box, headerEl);

  // Separator
  const separator = widths.map((w) => '\u2500'.repeat(w)).join('\u2500\u2500');
  const sepEl = __element('Text', 'dim', true);
  __append(sepEl, __staticText(separator));
  __append(box, sepEl);

  // Data rows
  for (const row of data) {
    const cells = columns.map((col, i) => {
      const val = String(row[col.key] ?? '');
      return padCell(val, widths[i] ?? val.length, col.align);
    });
    const rowEl = __element('Text');
    __append(rowEl, __staticText(cells.join('  ')));
    __append(box, rowEl);
  }

  return box;
}
