import type { CSSOutput, StyleBlock } from '@vertz/ui';
import { css, token } from '@vertz/ui';
import { animationDecl } from './_helpers';

type DropdownMenuBlocks = {
  content: StyleBlock;
  item: StyleBlock;
  group: StyleBlock;
  label: StyleBlock;
  separator: StyleBlock;
};

/** Create dropdown-menu css() styles. */
export function createDropdownMenuStyles(): CSSOutput<DropdownMenuBlocks> {
  const s = css({
    dmContent: {
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
      '&[data-state="open"]': animationDecl('vz-zoom-in 100ms ease-out forwards'),
      '&[data-state="closed"]': animationDecl('vz-zoom-out 100ms ease-out forwards'),
    },
    // Nova: gap-1.5 rounded-md px-1.5 py-1 text-sm
    dmItem: {
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
    dmGroup: { paddingBlock: token.spacing[1] },
    // Nova: px-1.5 py-1 text-xs font-medium
    dmLabel: {
      paddingInline: token.spacing['1.5'],
      paddingBlock: token.spacing[1],
      fontSize: token.font.size.xs,
      fontWeight: token.font.weight.medium,
      color: token.color['muted-foreground'],
    },
    // Nova: bg-border -mx-1 my-1 h-px
    dmSeparator: {
      marginBlock: token.spacing[1],
      backgroundColor: token.color.border,
      '&': { marginLeft: '-0.25rem', marginRight: '-0.25rem', height: '1px' },
    },
  });
  return {
    content: s.dmContent,
    item: s.dmItem,
    group: s.dmGroup,
    label: s.dmLabel,
    separator: s.dmSeparator,
    css: s.css,
  } as CSSOutput<DropdownMenuBlocks>;
}
