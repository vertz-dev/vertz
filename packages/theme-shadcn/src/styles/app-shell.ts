import type { CSSOutput } from '@vertz/ui';
import { css, token } from '@vertz/ui';

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
    shellRoot: { display: 'flex', minHeight: '100vh', backgroundColor: token.color.background },
    shellSidebar: {
      width: token.spacing[56],
      backgroundColor: token.color.card,
      borderRightWidth: '1',
      borderColor: token.color.border,
      padding: token.spacing[4],
      display: 'flex',
      flexDirection: 'column',
    },
    shellBrand: {
      fontSize: token.font.size.lg,
      fontWeight: token.font.weight.bold,
      color: token.color.foreground,
      marginBottom: token.spacing[6],
    },
    shellNav: {
      display: 'flex',
      flexDirection: 'column',
      gap: token.spacing[1],
      marginBottom: 'auto',
    },
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
    shellNavItemActive: { color: token.color.foreground, backgroundColor: token.color.accent },
    shellContent: { flex: '1 1 0%' },
    shellUser: {
      marginTop: 'auto',
      paddingTop: token.spacing[4],
      borderTopWidth: '1',
      borderColor: token.color.border,
      display: 'flex',
      alignItems: 'center',
      gap: token.spacing[2],
    },
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
