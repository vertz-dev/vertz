import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css, token } from '@vertz/ui';
import { animationDecl } from './_helpers';

type MenubarBlocks = {
  root: StyleEntry[];
  trigger: StyleEntry[];
  content: StyleEntry[];
  item: StyleEntry[];
  separator: StyleEntry[];
  label: StyleEntry[];
};

/** Create menubar css() styles. */
export function createMenubarStyles(): CSSOutput<MenubarBlocks> {
  const s = css({
    mbRoot: {
      display: 'flex',
      height: token.spacing[9],
      alignItems: 'center',
      borderRadius: token.radius.md,
      borderWidth: '1px',
      borderColor: token.color.border,
      backgroundColor: token.color.background,
      color: token.color.foreground,
      padding: token.spacing[1],
      '&': { columnGap: '0.25rem' },
    },
    mbTrigger: {
      display: 'flex',
      alignItems: 'center',
      borderRadius: token.radius.sm,
      paddingInline: token.spacing[3],
      paddingBlock: token.spacing[1],
      fontSize: token.font.size.sm,
      fontWeight: token.font.weight.medium,
      cursor: 'pointer',
      outline: 'none',
      '&:hover': { backgroundColor: token.color.accent, color: token.color['accent-foreground'] },
      '&:focus': { backgroundColor: token.color.accent, color: token.color['accent-foreground'] },
      '&[data-state="open"]': {
        backgroundColor: token.color.accent,
        color: token.color['accent-foreground'],
      },
    },
    mbContent: {
      zIndex: '50',
      overflow: 'hidden',
      borderRadius: token.radius.md,
      borderWidth: '1px',
      borderColor: token.color.border,
      backgroundColor: token.color.popover,
      color: token.color['popover-foreground'],
      padding: token.spacing[1],
      boxShadow: token.shadow.md,
      '&[data-state="open"]': animationDecl('vz-zoom-in 150ms ease-out forwards'),
      '&[data-state="closed"]': animationDecl('vz-zoom-out 150ms ease-out forwards'),
    },
    mbItem: {
      display: 'flex',
      alignItems: 'center',
      borderRadius: token.radius.sm,
      paddingInline: token.spacing[2],
      paddingBlock: token.spacing['1.5'],
      fontSize: token.font.size.sm,
      cursor: 'pointer',
      outline: 'none',
      '&:hover': { backgroundColor: token.color.accent, color: token.color['accent-foreground'] },
      '&:focus': { backgroundColor: token.color.accent, color: token.color['accent-foreground'] },
      '&[data-disabled]': { pointerEvents: 'none', opacity: '0.5' },
    },
    mbSeparator: {
      marginInline: token.spacing[1],
      marginBlock: token.spacing[1],
      borderTopWidth: '1px',
      borderColor: token.color.muted,
      '&': { height: '1px' },
    },
    mbLabel: {
      paddingInline: token.spacing[2],
      paddingBlock: token.spacing['1.5'],
      fontSize: token.font.size.xs,
      fontWeight: token.font.weight.semibold,
      color: token.color['muted-foreground'],
    },
  });
  return {
    root: s.mbRoot,
    trigger: s.mbTrigger,
    content: s.mbContent,
    item: s.mbItem,
    separator: s.mbSeparator,
    label: s.mbLabel,
    css: s.css,
  } as CSSOutput<MenubarBlocks>;
}
