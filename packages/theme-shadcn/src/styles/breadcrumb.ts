import type { CSSOutput, StyleBlock } from '@vertz/ui';
import { css, token } from '@vertz/ui';

type BreadcrumbBlocks = {
  nav: StyleBlock;
  list: StyleBlock;
  item: StyleBlock;
  link: StyleBlock;
  page: StyleBlock;
  separator: StyleBlock;
};

/** Create breadcrumb css() styles. */
export function createBreadcrumbStyles(): CSSOutput<BreadcrumbBlocks> {
  const s = css({
    breadcrumbNav: {},
    breadcrumbList: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: token.spacing['1.5'],
      fontSize: token.font.size.sm,
      color: token.color['muted-foreground'],
      '&': { listStyle: 'none', margin: '0', padding: '0' },
    },
    breadcrumbItem: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: token.spacing['1.5'],
      '&:first-child > [role="presentation"]': { display: 'none' },
    },
    breadcrumbLink: {
      transition:
        'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
      color: token.color.foreground,
      '&:hover': { color: token.color.foreground },
    },
    breadcrumbPage: { fontWeight: token.font.weight.normal, color: token.color.foreground },
    breadcrumbSeparator: {},
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
