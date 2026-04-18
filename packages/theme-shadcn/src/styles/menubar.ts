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
    mbRoot: [
      'flex',
      'h:9',
      'items:center',
      'rounded:md',
      'border:1',
      'border:border',
      'bg:background',
      'text:foreground',
      'p:1',
      { '&': { 'column-gap': '0.25rem' } },
    ],
    mbTrigger: [
      'flex',
      'items:center',
      'rounded:sm',
      'px:3',
      'py:1',
      'text:sm',
      'font:medium',
      'cursor:pointer',
      'outline-none',
      {
        '&:hover': { backgroundColor: token.color.accent, color: token.color['accent-foreground'] },
      },
      {
        '&:focus': { backgroundColor: token.color.accent, color: token.color['accent-foreground'] },
      },
      {
        '&[data-state="open"]': {
          backgroundColor: token.color.accent,
          color: token.color['accent-foreground'],
        },
      },
    ],
    mbContent: [
      'z:50',
      'overflow-hidden',
      'rounded:md',
      'border:1',
      'border:border',
      'bg:popover',
      'text:popover-foreground',
      'p:1',
      'shadow:md',
      {
        '&[data-state="open"]': [animationDecl('vz-zoom-in 150ms ease-out forwards')],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-zoom-out 150ms ease-out forwards')],
      },
    ],
    mbItem: [
      'flex',
      'items:center',
      'rounded:sm',
      'px:2',
      'py:1.5',
      'text:sm',
      'cursor:pointer',
      'outline-none',
      {
        '&:hover': { backgroundColor: token.color.accent, color: token.color['accent-foreground'] },
      },
      {
        '&:focus': { backgroundColor: token.color.accent, color: token.color['accent-foreground'] },
      },
      { '&[data-disabled]': { pointerEvents: 'none', opacity: '0.5' } },
    ],
    mbSeparator: ['mx:1', 'my:1', 'border-t:1', 'border:muted', { '&': { height: '1px' } }],
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
