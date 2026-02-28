import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';
import { bgOpacity } from './_helpers';

type TableBlocks = {
  root: StyleEntry[];
  header: StyleEntry[];
  body: StyleEntry[];
  row: StyleEntry[];
  head: StyleEntry[];
  cell: StyleEntry[];
  caption: StyleEntry[];
  footer: StyleEntry[];
};

/** Create table css() styles. */
export function createTableStyles(): CSSOutput<TableBlocks> {
  const s = css({
    tableRoot: [
      'w:full',
      'text:sm',
      {
        '&': [
          { property: 'caption-side', value: 'bottom' },
          { property: 'border-collapse', value: 'collapse' },
        ],
      },
    ],
    tableHeader: [{ '& tr': ['border-b:1', 'border:border'] }],
    tableBody: [{ '& tr:last-child': [{ property: 'border-bottom', value: '0' }] }],
    tableRow: [
      'border-b:1',
      'border:border',
      'transition:colors',
      { '&:hover': [bgOpacity('muted', 50)] },
      { '&[data-state="selected"]': ['bg:muted'] },
    ],
    tableHead: [
      'px:2',
      'text:left',
      'font:medium',
      'text:foreground',
      'whitespace-nowrap',
      {
        '&': [
          { property: 'vertical-align', value: 'middle' },
          { property: 'height', value: '2.5rem' },
        ],
      },
    ],
    tableCell: [
      'p:2',
      'whitespace-nowrap',
      { '&': [{ property: 'vertical-align', value: 'middle' }] },
    ],
    tableCaption: ['mt:4', 'text:sm', 'text:muted-foreground'],
    tableFooter: [
      'border-t:1',
      'border:border',
      'font:medium',
      { '&': [bgOpacity('muted', 50)] },
      { '&>tr:last-child': [{ property: 'border-bottom', value: '0' }] },
    ],
  });
  return {
    root: s.tableRoot,
    header: s.tableHeader,
    body: s.tableBody,
    row: s.tableRow,
    head: s.tableHead,
    cell: s.tableCell,
    caption: s.tableCaption,
    footer: s.tableFooter,
    css: s.css,
  } as CSSOutput<TableBlocks>;
}
