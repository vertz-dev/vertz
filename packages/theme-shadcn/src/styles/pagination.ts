import type { CSSOutput, RawDeclaration, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

type PaginationBlocks = {
  nav: StyleEntry[];
  list: StyleEntry[];
  item: StyleEntry[];
  link: StyleEntry[];
  linkActive: StyleEntry[];
  ellipsis: StyleEntry[];
};

const focusRing: Record<string, (string | RawDeclaration)[]> = {
  '&:focus-visible': [
    'outline-none',
    {
      property: 'outline',
      value: '3px solid color-mix(in oklch, var(--color-ring) 50%, transparent)',
    },
    { property: 'outline-offset', value: '2px' },
  ],
};

/** Create pagination css() styles. */
export function createPaginationStyles(): CSSOutput<PaginationBlocks> {
  const s = css({
    paginationNav: [],
    paginationList: ['flex', 'flex-wrap', 'items:center', 'gap:1'],
    paginationItem: [],
    paginationLink: [
      'inline-flex',
      'items:center',
      'justify:center',
      'rounded:md',
      'text:sm',
      'font:medium',
      'h:9',
      'w:9',
      'border:1',
      'border:input',
      'bg:background',
      'cursor:pointer',
      'transition:colors',
      focusRing,
      { '&:hover': ['bg:accent', 'text:accent-foreground'] },
      { '&:disabled': ['pointer-events-none', 'opacity:0.5'] },
    ],
    paginationLinkActive: [
      'inline-flex',
      'items:center',
      'justify:center',
      'rounded:md',
      'text:sm',
      'font:medium',
      'h:9',
      'w:9',
      'bg:primary',
      'text:primary-foreground',
      'border:1',
      'border:primary',
      focusRing,
    ],
    paginationEllipsis: ['inline-flex', 'items:center', 'justify:center', 'h:9', 'w:9', 'text:sm'],
  });
  return {
    nav: s.paginationNav,
    list: s.paginationList,
    item: s.paginationItem,
    link: s.paginationLink,
    linkActive: s.paginationLinkActive,
    ellipsis: s.paginationEllipsis,
    css: s.css,
  } as CSSOutput<PaginationBlocks>;
}
