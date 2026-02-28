import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';
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
      'p:1',
      { '&': [{ property: 'column-gap', value: '0.25rem' }] },
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
      { '&:focus': ['bg:accent', 'text:accent-foreground'] },
      {
        '&[data-state="open"]': ['bg:accent', 'text:accent-foreground'],
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
      { '&:focus': ['bg:accent', 'text:accent-foreground'] },
      { '&[data-disabled]': ['pointer-events-none', 'opacity:0.5'] },
    ],
    mbSeparator: [
      'mx:1',
      'my:1',
      'border-t:1',
      'border:muted',
      { '&': [{ property: 'height', value: '1px' }] },
    ],
    mbLabel: ['px:2', 'py:1.5', 'text:xs', 'font:semibold', 'text:muted-foreground'],
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
