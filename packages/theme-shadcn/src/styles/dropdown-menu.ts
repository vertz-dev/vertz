import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';
import { animationDecl } from './_helpers';

type DropdownMenuBlocks = {
  content: StyleEntry[];
  item: StyleEntry[];
  group: StyleEntry[];
  label: StyleEntry[];
  separator: StyleEntry[];
};

/** Create dropdown-menu css() styles. */
export function createDropdownMenuStyles(): CSSOutput<DropdownMenuBlocks> {
  const s = css({
    dmContent: [
      'z:50',
      'overflow-hidden',
      'bg:popover',
      'text:popover-foreground',
      'rounded:md',
      'border:1',
      'border:border',
      'shadow:md',
      'py:1',
      {
        '&[data-state="open"]': [animationDecl('vz-zoom-in 150ms ease-out forwards')],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-zoom-out 150ms ease-out forwards')],
      },
    ],
    dmItem: [
      'flex',
      'items:center',
      'px:2',
      'py:1.5',
      'text:sm',
      'cursor:pointer',
      'rounded:sm',
      'outline-none',
      { '&:focus': ['bg:accent', 'text:accent-foreground'] },
      { '&[data-disabled]': ['pointer-events-none', 'opacity:0.5'] },
    ],
    dmGroup: ['py:1'],
    dmLabel: ['px:2', 'py:1.5', 'text:xs', 'font:semibold', 'text:muted-foreground'],
    dmSeparator: [
      'mx:1',
      'my:1',
      'border-t:1',
      'border:muted',
      { '&': [{ property: 'height', value: '1px' }] },
    ],
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
