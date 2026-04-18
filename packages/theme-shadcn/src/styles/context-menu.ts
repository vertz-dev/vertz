import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css, token } from '@vertz/ui';
import { animationDecl } from './_helpers';

type ContextMenuBlocks = {
  content: StyleEntry[];
  item: StyleEntry[];
  group: StyleEntry[];
  label: StyleEntry[];
  separator: StyleEntry[];
};

/** Create context-menu css() styles. */
export function createContextMenuStyles(): CSSOutput<ContextMenuBlocks> {
  const s = css({
    cmContent: {
      zIndex: '50',
      overflow: 'hidden',
      backgroundColor: token.color.popover,
      color: token.color['popover-foreground'],
      borderRadius: token.radius.lg,
      width: 'fit-content',
      padding: token.spacing[1],
      '&': {
        boxShadow:
          '0 0 0 1px color-mix(in oklch, var(--color-foreground) 10%, transparent), 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        minWidth: '8rem',
      },
      '&[data-state="open"]': animationDecl('vz-zoom-in 150ms ease-out forwards'),
      '&[data-state="closed"]': animationDecl('vz-zoom-out 150ms ease-out forwards'),
    },
    cmItem: {
      display: 'flex',
      alignItems: 'center',
      gap: token.spacing['1.5'],
      paddingInline: token.spacing['1.5'],
      paddingBlock: token.spacing[1],
      fontSize: token.font.size.sm,
      cursor: 'pointer',
      borderRadius: token.radius.md,
      outline: 'none',
      '&:hover': { backgroundColor: token.color.accent, color: token.color['accent-foreground'] },
      '&:focus': { backgroundColor: token.color.accent, color: token.color['accent-foreground'] },
      '&[data-disabled]': { pointerEvents: 'none', opacity: '0.5' },
    },
    cmGroup: { paddingBlock: token.spacing[1] },
    cmLabel: {
      paddingInline: token.spacing['1.5'],
      paddingBlock: token.spacing[1],
      fontSize: token.font.size.xs,
      fontWeight: token.font.weight.medium,
      color: token.color['muted-foreground'],
    },
    cmSeparator: {
      marginBlock: token.spacing[1],
      backgroundColor: token.color.border,
      '&': { marginLeft: '-0.25rem', marginRight: '-0.25rem', height: '1px' },
    },
  });
  return {
    content: s.cmContent,
    item: s.cmItem,
    group: s.cmGroup,
    label: s.cmLabel,
    separator: s.cmSeparator,
    css: s.css,
  } as CSSOutput<ContextMenuBlocks>;
}
