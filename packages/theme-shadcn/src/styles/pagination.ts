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
    paginationNav: {
      display: 'flex',
      justifyContent: 'center',
      '&': { marginLeft: 'auto', marginRight: 'auto', width: '100%' },
    },
    /* ul: flex items-center gap-0.5 */
    paginationList: {
      display: 'flex',
      alignItems: 'center',
      '&': { gap: '0.125rem', listStyle: 'none', margin: '0', padding: '0' },
    },
    paginationItem: [],
    /* PaginationLink: ghost variant, size=icon (size-8 = 2rem) */
    paginationLink: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: token.radius.lg,
      fontSize: token.font.size.sm,
      fontWeight: token.font.weight.medium,
      backgroundColor: 'transparent',
      cursor: 'pointer',
      transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
      ...focusRing,
      '&': { height: '2rem', width: '2rem', border: '1px solid transparent', whiteSpace: 'nowrap' },
      '&:hover': { backgroundColor: token.color.muted, color: token.color.foreground },
      '&:disabled': { pointerEvents: 'none', opacity: '0.5' },
    },
    /* PaginationLink isActive: outline variant, size=icon (size-8 = 2rem) */
    paginationLinkActive: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: token.radius.lg,
      fontSize: token.font.size.sm,
      fontWeight: token.font.weight.medium,
      borderWidth: '1px',
      borderColor: token.color.border,
      backgroundColor: token.color.background,
      color: token.color.foreground,
      cursor: 'pointer',
      ...focusRing,
      '&': { height: '2rem', width: '2rem' },
      '&:hover': { backgroundColor: token.color.muted, color: token.color.foreground },
    },
    /* PaginationPrevious/Next: ghost variant, size=default (h-8 px-2.5 gap-1.5) with pl-1.5!/pr-1.5! */
    paginationNavButton: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: token.radius.lg,
      fontSize: token.font.size.sm,
      fontWeight: token.font.weight.medium,
      backgroundColor: 'transparent',
      cursor: 'pointer',
      transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
      ...focusRing,
      '&': {
        height: '2rem',
        border: '1px solid transparent',
        whiteSpace: 'nowrap',
        gap: '0.375rem',
        paddingLeft: '0.375rem',
        paddingRight: '0.625rem',
      },
      '&:hover': { backgroundColor: token.color.muted, color: token.color.foreground },
      '&:disabled': { pointerEvents: 'none', opacity: '0.5' },
    },
    /* PaginationEllipsis: size-8 = 2rem */
    paginationEllipsis: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      '&': { height: '2rem', width: '2rem' },
      '& svg:not([class*="size-"])': { width: '1rem', height: '1rem' },
    },
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
