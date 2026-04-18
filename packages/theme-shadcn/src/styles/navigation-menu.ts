import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css, token } from '@vertz/ui';
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
    navRoot: { position: 'relative', zIndex: '10' },
    navList: { display: 'flex', alignItems: 'center', gap: token.spacing[1] },
    navTrigger: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: token.radius.md,
      paddingInline: token.spacing[4],
      paddingBlock: token.spacing[2],
      fontSize: token.font.size.sm,
      fontWeight: token.font.weight.medium,
      cursor: 'pointer',
      transition:
        'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
      '&:hover': { backgroundColor: token.color.accent, color: token.color['accent-foreground'] },
      '&[data-state="open"]': bgOpacity('accent', 50),
    },
    navContent: {
      position: 'absolute',
      width: '100%',
      borderRadius: token.radius.md,
      borderWidth: '1px',
      borderColor: token.color.border,
      backgroundColor: token.color.popover,
      padding: token.spacing[4],
      boxShadow: token.shadow.lg,
      color: token.color['popover-foreground'],
      '&': { left: '0', top: '100%' },
      '&[data-state="open"]': animationDecl('vz-fade-in 150ms ease-out forwards'),
      '&[data-state="closed"]': animationDecl('vz-fade-out 150ms ease-out forwards'),
    },
    navLink: {
      display: 'block',
      borderRadius: token.radius.md,
      padding: token.spacing[3],
      fontSize: token.font.size.sm,
      lineHeight: token.font.lineHeight.none,
      '&': { textDecorationLine: 'none' },
      '&:hover': { backgroundColor: token.color.accent, color: token.color['accent-foreground'] },
    },
    navViewport: { position: 'absolute', width: '100%', '&': { left: '0', top: '100%' } },
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
