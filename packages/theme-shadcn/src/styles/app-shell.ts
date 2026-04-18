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
      borderRightWidth: '1px',
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
    shellNavItem: {
      display: 'flex',
      alignItems: 'center',
      gap: token.spacing[2],
      fontSize: token.font.size.sm,
      color: token.color['muted-foreground'],
      paddingBlock: token.spacing['1.5'],
      paddingInline: token.spacing[2],
      borderRadius: token.radius.md,
      transition:
        'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
      '&:hover': { color: token.color.foreground, backgroundColor: token.color.accent },
      '&': { textDecoration: 'none' },
    },
    shellNavItemActive: { color: token.color.foreground, backgroundColor: token.color.accent },
    shellContent: { flex: '1 1 0%' },
    shellUser: {
      marginTop: 'auto',
      paddingTop: token.spacing[4],
      borderTopWidth: '1px',
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
