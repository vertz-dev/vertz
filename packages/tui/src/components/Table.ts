import { jsx } from '../jsx-runtime/index';
import type { TuiNode } from '../nodes/types';

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

export function Table<T extends Record<string, unknown>>(props: TableProps<T>): TuiNode {
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

  const children: TuiNode[] = [];

  // Header row
  const headerCells = columns.map((col, i) =>
    padCell(col.header, widths[i] ?? col.header.length, col.align),
  );
  children.push(jsx('Text', { bold: true, children: headerCells.join('  ') }));

  // Separator
  const separator = widths.map((w) => '\u2500'.repeat(w)).join('\u2500\u2500');
  children.push(jsx('Text', { dim: true, children: separator }));

  // Data rows
  for (const row of data) {
    const cells = columns.map((col, i) => {
      const val = String(row[col.key] ?? '');
      return padCell(val, widths[i] ?? val.length, col.align);
    });
    children.push(jsx('Text', { children: cells.join('  ') }));
  }

  return jsx('Box', { direction: 'column', children });
}
