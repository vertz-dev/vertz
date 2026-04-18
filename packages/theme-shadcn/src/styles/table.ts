import type { CSSOutput, StyleBlock } from '@vertz/ui';
import { css, token } from '@vertz/ui';
import { bgOpacity } from './_helpers';

type TableBlocks = {
  root: StyleBlock;
  header: StyleBlock;
  body: StyleBlock;
  row: StyleBlock;
  head: StyleBlock;
  cell: StyleBlock;
  caption: StyleBlock;
  footer: StyleBlock;
};

/** Create table css() styles. */
export function createTableStyles(): CSSOutput<TableBlocks> {
  const s = css({
    tableRoot: {
      width: '100%',
      fontSize: token.font.size.sm,
      '&': { captionSide: 'bottom', borderCollapse: 'collapse' },
    },
    tableHeader: { '& tr': { borderBottomWidth: '1px', borderColor: token.color.border } },
    tableBody: { '& tr:last-child': { borderBottom: '0' } },
    tableRow: {
      borderBottomWidth: '1px',
      borderColor: token.color.border,
      transition:
        'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
      '&:hover': bgOpacity('muted', 50),
      '&[data-state="selected"]': { backgroundColor: token.color.muted },
    },
    tableHead: {
      paddingInline: token.spacing[2],
      textAlign: 'left',
      fontWeight: token.font.weight.medium,
      color: token.color.foreground,
      whiteSpace: 'nowrap',
      '&': { verticalAlign: 'middle', height: '2.5rem' },
    },
    tableCell: {
      padding: token.spacing[2],
      whiteSpace: 'nowrap',
      '&': { verticalAlign: 'middle' },
    },
    tableCaption: {
      marginTop: token.spacing[4],
      fontSize: token.font.size.sm,
      color: token.color['muted-foreground'],
    },
    tableFooter: {
      borderTopWidth: '1px',
      borderColor: token.color.border,
      fontWeight: token.font.weight.medium,
      '&': bgOpacity('muted', 50),
      '&>tr:last-child': { borderBottom: '0' },
    },
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
