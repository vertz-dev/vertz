import type { CSSOutput, StyleEntry, StyleValue } from '@vertz/ui';
import { css, token } from '@vertz/ui';

type PaginationBlocks = {
  nav: StyleEntry[];
  list: StyleEntry[];
  item: StyleEntry[];
  link: StyleEntry[];
  linkActive: StyleEntry[];
  navButton: StyleEntry[];
  ellipsis: StyleEntry[];
};

const focusRing: Record<string, StyleValue[]> = {
  '&:focus-visible': [
    'outline-none',
    {
      outline: '3px solid color-mix(in oklch, var(--color-ring) 50%, transparent)',
    },
    { 'outline-offset': '2px' },
  ],
};

/** Create pagination css() styles. */
export function createPaginationStyles(): CSSOutput<PaginationBlocks> {
  const s = css({
    /* nav: mx-auto flex w-full justify-center */
    paginationNav: [
      'flex',
      'justify:center',
      {
        '&': {
          'margin-left': 'auto',
          'margin-right': 'auto',
          width: '100%',
        },
      },
    ],
    /* ul: flex items-center gap-0.5 */
    paginationList: [
      'flex',
      'items:center',
      {
        '&': {
          gap: '0.125rem',
          'list-style': 'none',
          margin: '0',
          padding: '0',
        },
      },
    ],
    paginationItem: [],
    /* PaginationLink: ghost variant, size=icon (size-8 = 2rem) */
    paginationLink: [
      'inline-flex',
      'items:center',
      'justify:center',
      'rounded:lg',
      'text:sm',
      'font:medium',
      'bg:transparent',
      'cursor:pointer',
      'transition:all',
      focusRing,
      {
        '&': {
          height: '2rem',
          width: '2rem',
          border: '1px solid transparent',
          'white-space': 'nowrap',
        },
      },
      { '&:hover': { backgroundColor: token.color.muted, color: token.color.foreground } },
      { '&:disabled': { pointerEvents: 'none', opacity: '0.5' } },
    ],
    /* PaginationLink isActive: outline variant, size=icon (size-8 = 2rem) */
    paginationLinkActive: [
      'inline-flex',
      'items:center',
      'justify:center',
      'rounded:lg',
      'text:sm',
      'font:medium',
      'border:1',
      'border:border',
      'bg:background',
      'text:foreground',
      'cursor:pointer',
      focusRing,
      {
        '&': {
          height: '2rem',
          width: '2rem',
        },
      },
      { '&:hover': { backgroundColor: token.color.muted, color: token.color.foreground } },
    ],
    /* PaginationPrevious/Next: ghost variant, size=default (h-8 px-2.5 gap-1.5) with pl-1.5!/pr-1.5! */
    paginationNavButton: [
      'inline-flex',
      'items:center',
      'justify:center',
      'rounded:lg',
      'text:sm',
      'font:medium',
      'bg:transparent',
      'cursor:pointer',
      'transition:all',
      focusRing,
      {
        '&': {
          height: '2rem',
          border: '1px solid transparent',
          'white-space': 'nowrap',
          gap: '0.375rem',
          'padding-left': '0.375rem',
          'padding-right': '0.625rem',
        },
      },
      { '&:hover': { backgroundColor: token.color.muted, color: token.color.foreground } },
      { '&:disabled': { pointerEvents: 'none', opacity: '0.5' } },
    ],
    /* PaginationEllipsis: size-8 = 2rem */
    paginationEllipsis: [
      'inline-flex',
      'items:center',
      'justify:center',
      {
        '&': {
          height: '2rem',
          width: '2rem',
        },
        '& svg:not([class*="size-"])': {
          width: '1rem',
          height: '1rem',
        },
      },
    ],
  });
  return {
    nav: s.paginationNav,
    list: s.paginationList,
    item: s.paginationItem,
    link: s.paginationLink,
    linkActive: s.paginationLinkActive,
    navButton: s.paginationNavButton,
    ellipsis: s.paginationEllipsis,
    css: s.css,
  } as CSSOutput<PaginationBlocks>;
}
