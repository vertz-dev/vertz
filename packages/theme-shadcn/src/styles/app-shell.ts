import type { CSSOutput } from '@vertz/ui';
import { css } from '@vertz/ui';

type AppShellBlocks = {
  root: string[];
  sidebar: string[];
  brand: string[];
  nav: string[];
  navItem: string[];
  navItemActive: string[];
  content: string[];
  user: string[];
};

/** Create AppShell css() styles. */
export function createAppShell(): CSSOutput<AppShellBlocks> {
  const s = css({
    shellRoot: ['flex', 'min-h:screen', 'bg:background'],
    shellSidebar: ['w:56', 'bg:card', 'border-r:1', 'border:border', 'p:4', 'flex', 'flex-col'],
    shellBrand: ['font:lg', 'font:bold', 'text:foreground', 'mb:6'],
    shellNav: ['flex', 'flex-col', 'gap:1', 'mb:auto'],
    shellNavItem: [
      'flex',
      'items:center',
      'gap:2',
      'text:sm',
      'text:muted-foreground',
      'py:1.5',
      'px:2',
      'rounded:md',
      'transition:colors',
      'hover:text:foreground',
      'hover:bg:accent',
      { '&': { 'text-decoration': 'none' } },
    ],
    shellNavItemActive: ['text:foreground', 'bg:accent'],
    shellContent: ['flex-1'],
    shellUser: ['mt:auto', 'pt:4', 'border-t:1', 'border:border', 'flex', 'items:center', 'gap:2'],
  });
  return {
    root: s.shellRoot,
    sidebar: s.shellSidebar,
    brand: s.shellBrand,
    nav: s.shellNav,
    navItem: s.shellNavItem,
    navItemActive: s.shellNavItemActive,
    content: s.shellContent,
    user: s.shellUser,
    css: s.css,
  } as CSSOutput<AppShellBlocks>;
}
