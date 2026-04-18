import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css, token } from '@vertz/ui';
import { animationDecl } from './_helpers';

type DrawerBlocks = {
  overlay: StyleEntry[];
  panelLeft: StyleEntry[];
  panelRight: StyleEntry[];
  panelTop: StyleEntry[];
  panelBottom: StyleEntry[];
  header: StyleEntry[];
  title: StyleEntry[];
  description: StyleEntry[];
  footer: StyleEntry[];
  handle: StyleEntry[];
  close: StyleEntry[];
};

const focusRing = {
  '&:focus-visible': {
    outline: '3px solid color-mix(in oklch, var(--color-ring) 50%, transparent)',
    outlineOffset: '2px',
  },
};

const PANEL_BASE = {
  position: 'fixed',
  zIndex: '50',
  backgroundColor: token.color.background,
  color: token.color.foreground,
  borderColor: token.color.border,
  boxShadow: token.shadow.lg,
  padding: token.spacing[6],
  gap: token.spacing[4],
};

/** Create drawer css() styles. */
export function createDrawerStyles(): CSSOutput<DrawerBlocks> {
  const s = css({
    drawerOverlay: {
      position: 'fixed',
      inset: token.spacing[0],
      zIndex: '50',
      '&': { backgroundColor: 'oklch(0 0 0 / 50%)' },
      '&[data-state="open"]': animationDecl('vz-fade-in 150ms ease-out forwards'),
      '&[data-state="closed"]': animationDecl('vz-fade-out 150ms ease-out forwards'),
    },
    drawerPanelLeft: {
      borderRightWidth: '1px',
      ...PANEL_BASE,
      '&': {
        inset: '0 auto 0 0',
        width: '75%',
        maxWidth: '24rem',
        height: '100dvh',
        maxHeight: 'none',
        margin: '0',
        outline: 'none',
        border: 'none',
        borderRadius: '0 calc(var(--radius) * 2) calc(var(--radius) * 2) 0',
      },
      '&:not([open]):not([data-state="open"])': { display: 'none' },
      '&::backdrop': { backgroundColor: 'oklch(0 0 0 / 50%)' },
      '&[data-state="open"]::backdrop': { animation: 'vz-fade-in 150ms ease-out forwards' },
      '&[data-state="closed"]::backdrop': { animation: 'vz-fade-out 300ms ease-out forwards' },
      '&[data-state="open"]': animationDecl('vz-slide-in-from-left 300ms ease-out forwards'),
      '&[data-state="closed"]': animationDecl('vz-slide-out-to-left 300ms ease-out forwards'),
    },
    drawerPanelRight: {
      borderLeftWidth: '1px',
      ...PANEL_BASE,
      '&': {
        inset: '0 0 0 auto',
        width: '75%',
        maxWidth: '24rem',
        height: '100dvh',
        maxHeight: 'none',
        margin: '0',
        outline: 'none',
        border: 'none',
        borderRadius: 'calc(var(--radius) * 2) 0 0 calc(var(--radius) * 2)',
      },
      '&:not([open]):not([data-state="open"])': { display: 'none' },
      '&::backdrop': { backgroundColor: 'oklch(0 0 0 / 50%)' },
      '&[data-state="open"]::backdrop': { animation: 'vz-fade-in 150ms ease-out forwards' },
      '&[data-state="closed"]::backdrop': { animation: 'vz-fade-out 300ms ease-out forwards' },
      '&[data-state="open"]': animationDecl('vz-slide-in-from-right 300ms ease-out forwards'),
      '&[data-state="closed"]': animationDecl('vz-slide-out-to-right 300ms ease-out forwards'),
    },
    drawerPanelTop: {
      borderBottomWidth: '1px',
      ...PANEL_BASE,
      '&': {
        inset: '0 0 auto 0',
        width: '100dvw',
        maxWidth: 'none',
        margin: '0',
        outline: 'none',
        border: 'none',
        borderRadius: '0 0 calc(var(--radius) * 2) calc(var(--radius) * 2)',
      },
      '&:not([open]):not([data-state="open"])': { display: 'none' },
      '&::backdrop': { backgroundColor: 'oklch(0 0 0 / 50%)' },
      '&[data-state="open"]::backdrop': { animation: 'vz-fade-in 150ms ease-out forwards' },
      '&[data-state="closed"]::backdrop': { animation: 'vz-fade-out 300ms ease-out forwards' },
      '&[data-state="open"]': animationDecl('vz-slide-in-from-top 300ms ease-out forwards'),
      '&[data-state="closed"]': animationDecl('vz-slide-out-to-top 300ms ease-out forwards'),
    },
    drawerPanelBottom: {
      borderTopWidth: '1px',
      ...PANEL_BASE,
      '&': {
        inset: 'auto 0 0 0',
        width: '100dvw',
        maxWidth: 'none',
        margin: '0',
        outline: 'none',
        border: 'none',
        borderRadius: 'calc(var(--radius) * 2) calc(var(--radius) * 2) 0 0',
      },
      '&:not([open]):not([data-state="open"])': { display: 'none' },
      '&::backdrop': { backgroundColor: 'oklch(0 0 0 / 50%)' },
      '&[data-state="open"]::backdrop': { animation: 'vz-fade-in 150ms ease-out forwards' },
      '&[data-state="closed"]::backdrop': { animation: 'vz-fade-out 300ms ease-out forwards' },
      '&[data-state="open"]': animationDecl('vz-slide-in-from-bottom 300ms ease-out forwards'),
      '&[data-state="closed"]': animationDecl('vz-slide-out-to-bottom 300ms ease-out forwards'),
    },
    drawerHeader: { display: 'flex', flexDirection: 'column', gap: token.spacing['1.5'] },
    drawerTitle: {
      fontSize: token.font.size.lg,
      fontWeight: token.font.weight.semibold,
      lineHeight: token.font.lineHeight.none,
      letterSpacing: '-0.025em',
    },
    drawerDescription: { fontSize: token.font.size.sm, color: token.color['muted-foreground'] },
    drawerFooter: {
      display: 'flex',
      gap: token.spacing[2],
      '&': { flexDirection: 'column-reverse' },
      '@media (min-width: 640px)': { flexDirection: 'row', justifyContent: 'flex-end' },
    },
    drawerHandle: {
      '&': {
        marginLeft: 'auto',
        marginRight: 'auto',
        marginTop: '1rem',
        height: '0.5rem',
        width: '100px',
        borderRadius: '9999px',
        backgroundColor: token.color.muted,
      },
    },
    drawerClose: {
      position: 'absolute',
      borderRadius: token.radius.sm,
      opacity: '0.7',
      cursor: 'pointer',
      transition:
        'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
      '&:hover': { opacity: '1' },
      ...focusRing,
    },
  });
  return {
    overlay: s.drawerOverlay,
    panelLeft: s.drawerPanelLeft,
    panelRight: s.drawerPanelRight,
    panelTop: s.drawerPanelTop,
    panelBottom: s.drawerPanelBottom,
    header: s.drawerHeader,
    title: s.drawerTitle,
    description: s.drawerDescription,
    footer: s.drawerFooter,
    handle: s.drawerHandle,
    close: s.drawerClose,
    css: s.css,
  } as CSSOutput<DrawerBlocks>;
}
