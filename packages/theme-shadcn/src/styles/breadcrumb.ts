import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

type BreadcrumbBlocks = {
  nav: StyleEntry[];
  list: StyleEntry[];
  item: StyleEntry[];
  link: StyleEntry[];
  page: StyleEntry[];
  separator: StyleEntry[];
};

/** Create breadcrumb css() styles. */
export function createBreadcrumbStyles(): CSSOutput<BreadcrumbBlocks> {
  const s = css({
    breadcrumbNav: [],
    breadcrumbList: [
      'flex',
      'flex-wrap',
      'items:center',
      'gap:1.5',
      'text:sm',
      'text:muted-foreground',
      {
        '&': {
          'list-style': 'none',
          margin: '0',
          padding: '0',
        },
      },
    ],
    breadcrumbItem: [
      'inline-flex',
      'items:center',
      'gap:1.5',
      { '&:first-child > [role="presentation"]': { display: 'none' } },
    ],
    breadcrumbLink: ['transition:colors', 'text:foreground', { '&:hover': ['text:foreground'] }],
    breadcrumbPage: ['font:normal', 'text:foreground'],
    breadcrumbSeparator: [],
  });
  return {
    nav: s.breadcrumbNav,
    list: s.breadcrumbList,
    item: s.breadcrumbItem,
    link: s.breadcrumbLink,
    page: s.breadcrumbPage,
    separator: s.breadcrumbSeparator,
    css: s.css,
  } as CSSOutput<BreadcrumbBlocks>;
}
