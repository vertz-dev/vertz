import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css, token } from '@vertz/ui';
import { animationDecl } from './_helpers';

type SheetBlocks = {
  overlay: StyleEntry[];
  panelLeft: StyleEntry[];
  panelRight: StyleEntry[];
  panelTop: StyleEntry[];
  panelBottom: StyleEntry[];
  title: StyleEntry[];
  description: StyleEntry[];
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
  fontSize: token.font.size.sm,
};

/** Create sheet css() styles. */
export function createSheetStyles(): CSSOutput<SheetBlocks> {
  const s = css({
    sheetOverlay: {
      position: 'fixed',
      inset: token.spacing[0],
      zIndex: '50',
      '&': {
        backgroundColor: 'oklch(0 0 0 / 10%)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      },
      '&[data-state="open"]': animationDecl('vz-fade-in 100ms ease-out forwards'),
      '&[data-state="closed"]': {
        ...animationDecl('vz-fade-out 100ms ease-out forwards'),
        pointerEvents: 'none',
      },
    },
    sheetPanelLeft: {
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
      },
      '&:not([open]):not([data-state="open"])': { display: 'none' },
      '&::backdrop': {
        backgroundColor: 'oklch(0 0 0 / 10%)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      },
      '&[data-state="open"]::backdrop': { animation: 'vz-fade-in 100ms ease-out forwards' },
      '&[data-state="closed"]::backdrop': { animation: 'vz-fade-out 300ms ease-out forwards' },
      '&[data-state="open"]': animationDecl('vz-slide-in-from-left 300ms ease-out forwards'),
      '&[data-state="closed"]': animationDecl('vz-slide-out-to-left 300ms ease-out forwards'),
    },
    sheetPanelRight: {
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
      },
      '&:not([open]):not([data-state="open"])': { display: 'none' },
      '&::backdrop': {
        backgroundColor: 'oklch(0 0 0 / 10%)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      },
      '&[data-state="open"]::backdrop': { animation: 'vz-fade-in 100ms ease-out forwards' },
      '&[data-state="closed"]::backdrop': { animation: 'vz-fade-out 300ms ease-out forwards' },
      '&[data-state="open"]': animationDecl('vz-slide-in-from-right 300ms ease-out forwards'),
      '&[data-state="closed"]': animationDecl('vz-slide-out-to-right 300ms ease-out forwards'),
    },
    sheetPanelTop: {
      borderBottomWidth: '1px',
      ...PANEL_BASE,
      '&': {
        inset: '0 0 auto 0',
        width: '100dvw',
        maxWidth: 'none',
        margin: '0',
        outline: 'none',
        border: 'none',
      },
      '&:not([open]):not([data-state="open"])': { display: 'none' },
      '&::backdrop': {
        backgroundColor: 'oklch(0 0 0 / 10%)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      },
      '&[data-state="open"]::backdrop': { animation: 'vz-fade-in 100ms ease-out forwards' },
      '&[data-state="closed"]::backdrop': { animation: 'vz-fade-out 300ms ease-out forwards' },
      '&[data-state="open"]': animationDecl('vz-slide-in-from-top 300ms ease-out forwards'),
      '&[data-state="closed"]': animationDecl('vz-slide-out-to-top 300ms ease-out forwards'),
    },
    sheetPanelBottom: {
      borderTopWidth: '1px',
      ...PANEL_BASE,
      '&': {
        inset: 'auto 0 0 0',
        width: '100dvw',
        maxWidth: 'none',
        margin: '0',
        outline: 'none',
        border: 'none',
      },
      '&:not([open]):not([data-state="open"])': { display: 'none' },
      '&::backdrop': {
        backgroundColor: 'oklch(0 0 0 / 10%)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      },
      '&[data-state="open"]::backdrop': { animation: 'vz-fade-in 100ms ease-out forwards' },
      '&[data-state="closed"]::backdrop': { animation: 'vz-fade-out 300ms ease-out forwards' },
      '&[data-state="open"]': animationDecl('vz-slide-in-from-bottom 300ms ease-out forwards'),
      '&[data-state="closed"]': animationDecl('vz-slide-out-to-bottom 300ms ease-out forwards'),
    },
    sheetTitle: {
      fontSize: token.font.size.base,
      fontWeight: token.font.weight.medium,
      color: token.color.foreground,
    },
    sheetDescription: { fontSize: token.font.size.sm, color: token.color['muted-foreground'] },
    sheetClose: {
      position: 'absolute',
      borderRadius: token.radius.xs,
      cursor: 'pointer',
      '&': {
        top: '0.75rem',
        right: '0.75rem',
        opacity: '0.7',
        transition: 'opacity 150ms',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '1rem',
        height: '1rem',
        background: 'none',
        border: 'none',
        color: 'currentColor',
        padding: '0',
      },
      '&:hover': { opacity: '1' },
      ...focusRing,
    },
  });
  return {
    overlay: s.sheetOverlay,
    panelLeft: s.sheetPanelLeft,
    panelRight: s.sheetPanelRight,
    panelTop: s.sheetPanelTop,
    panelBottom: s.sheetPanelBottom,
    title: s.sheetTitle,
    description: s.sheetDescription,
    close: s.sheetClose,
    css: s.css,
  } as CSSOutput<SheetBlocks>;
}
