import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';
import { animationDecl, bgOpacity } from './_helpers';

type NavigationMenuBlocks = {
  root: StyleEntry[];
  list: StyleEntry[];
  trigger: StyleEntry[];
  content: StyleEntry[];
  link: StyleEntry[];
  viewport: StyleEntry[];
};

/** Create navigation menu css() styles. */
export function createNavigationMenuStyles(): CSSOutput<NavigationMenuBlocks> {
  const s = css({
    navRoot: ['relative', 'z:10'],
    navList: ['flex', 'items:center', 'gap:1'],
    navTrigger: [
      'inline-flex',
      'items:center',
      'justify:center',
      'rounded:md',
      'px:4',
      'py:2',
      'text:sm',
      'font:medium',
      'cursor:pointer',
      'transition:colors',
      { '&:hover': ['bg:accent', 'text:accent-foreground'] },
      { '&[data-state="open"]': [bgOpacity('accent', 50)] },
    ],
    navContent: [
      'absolute',
      'w:full',
      'rounded:md',
      'border:1',
      'border:border',
      'bg:popover',
      'p:4',
      'shadow:lg',
      'text:popover-foreground',
      {
        '&': [
          { property: 'left', value: '0' },
          { property: 'top', value: '100%' },
        ],
      },
      {
        '&[data-state="open"]': [animationDecl('vz-fade-in 150ms ease-out forwards')],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-fade-out 150ms ease-out forwards')],
      },
    ],
    navLink: [
      'block',
      'rounded:md',
      'p:3',
      'text:sm',
      'leading:none',
      {
        '&': [{ property: 'text-decoration-line', value: 'none' }],
      },
      { '&:hover': ['bg:accent', 'text:accent-foreground'] },
    ],
    navViewport: [
      'absolute',
      'w:full',
      {
        '&': [
          { property: 'left', value: '0' },
          { property: 'top', value: '100%' },
        ],
      },
    ],
  });
  return {
    root: s.navRoot,
    list: s.navList,
    trigger: s.navTrigger,
    content: s.navContent,
    link: s.navLink,
    viewport: s.navViewport,
    css: s.css,
  } as CSSOutput<NavigationMenuBlocks>;
}
