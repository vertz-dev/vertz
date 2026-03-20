import type { CSSOutput, StyleEntry, StyleValue } from '@vertz/ui';
import { css } from '@vertz/ui';
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

const focusRing: Record<string, StyleValue[]> = {
  '&:focus-visible': [
    'outline-none',
    {
      outline: '3px solid color-mix(in oklch, var(--color-ring) 50%, transparent)',
    },
    { 'outline-offset': '2px' },
  ],
};

const PANEL_BASE = [
  'fixed',
  'z:50',
  'bg:background',
  'text:foreground',
  'border:border',
  'shadow:lg',
  'p:6',
  'gap:4',
] as const;

/** Create drawer css() styles. */
export function createDrawerStyles(): CSSOutput<DrawerBlocks> {
  const s = css({
    drawerOverlay: [
      'fixed',
      'inset:0',
      'z:50',
      {
        '&': { 'background-color': 'oklch(0 0 0 / 50%)' },
      },
      {
        '&[data-state="open"]': [animationDecl('vz-fade-in 150ms ease-out forwards')],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-fade-out 150ms ease-out forwards')],
      },
    ],
    drawerPanelLeft: [
      ...PANEL_BASE,
      'border-r:1',
      {
        '&': {
          inset: '0 auto 0 0',
          width: '75%',
          'max-width': '24rem',
          height: '100dvh',
          'max-height': 'none',
          margin: '0',
          outline: 'none',
          border: 'none',
          'border-radius': '0 0.75rem 0.75rem 0',
        },
        '&:not([open]):not([data-state="open"])': { display: 'none' },
        '&::backdrop': {
          'background-color': 'oklch(0 0 0 / 50%)',
        },
        '&[data-state="open"]::backdrop': {
          animation: 'vz-fade-in 150ms ease-out forwards',
        },
        '&[data-state="closed"]::backdrop': {
          animation: 'vz-fade-out 300ms ease-out forwards',
        },
      },
      {
        '&[data-state="open"]': [animationDecl('vz-slide-in-from-left 300ms ease-out forwards')],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-slide-out-to-left 300ms ease-out forwards')],
      },
    ],
    drawerPanelRight: [
      ...PANEL_BASE,
      'border-l:1',
      {
        '&': {
          inset: '0 0 0 auto',
          width: '75%',
          'max-width': '24rem',
          height: '100dvh',
          'max-height': 'none',
          margin: '0',
          outline: 'none',
          border: 'none',
          'border-radius': '0.75rem 0 0 0.75rem',
        },
        '&:not([open]):not([data-state="open"])': { display: 'none' },
        '&::backdrop': {
          'background-color': 'oklch(0 0 0 / 50%)',
        },
        '&[data-state="open"]::backdrop': {
          animation: 'vz-fade-in 150ms ease-out forwards',
        },
        '&[data-state="closed"]::backdrop': {
          animation: 'vz-fade-out 300ms ease-out forwards',
        },
      },
      {
        '&[data-state="open"]': [animationDecl('vz-slide-in-from-right 300ms ease-out forwards')],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-slide-out-to-right 300ms ease-out forwards')],
      },
    ],
    drawerPanelTop: [
      ...PANEL_BASE,
      'border-b:1',
      {
        '&': {
          inset: '0 0 auto 0',
          width: '100dvw',
          'max-width': 'none',
          margin: '0',
          outline: 'none',
          border: 'none',
          'border-radius': '0 0 0.75rem 0.75rem',
        },
        '&:not([open]):not([data-state="open"])': { display: 'none' },
        '&::backdrop': {
          'background-color': 'oklch(0 0 0 / 50%)',
        },
        '&[data-state="open"]::backdrop': {
          animation: 'vz-fade-in 150ms ease-out forwards',
        },
        '&[data-state="closed"]::backdrop': {
          animation: 'vz-fade-out 300ms ease-out forwards',
        },
      },
      {
        '&[data-state="open"]': [animationDecl('vz-slide-in-from-top 300ms ease-out forwards')],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-slide-out-to-top 300ms ease-out forwards')],
      },
    ],
    drawerPanelBottom: [
      ...PANEL_BASE,
      'border-t:1',
      {
        '&': {
          inset: 'auto 0 0 0',
          width: '100dvw',
          'max-width': 'none',
          margin: '0',
          outline: 'none',
          border: 'none',
          'border-radius': '0.75rem 0.75rem 0 0',
        },
        '&:not([open]):not([data-state="open"])': { display: 'none' },
        '&::backdrop': {
          'background-color': 'oklch(0 0 0 / 50%)',
        },
        '&[data-state="open"]::backdrop': {
          animation: 'vz-fade-in 150ms ease-out forwards',
        },
        '&[data-state="closed"]::backdrop': {
          animation: 'vz-fade-out 300ms ease-out forwards',
        },
      },
      {
        '&[data-state="open"]': [animationDecl('vz-slide-in-from-bottom 300ms ease-out forwards')],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-slide-out-to-bottom 300ms ease-out forwards')],
      },
    ],
    drawerHeader: ['flex', 'flex-col', 'gap:1.5'],
    drawerTitle: ['text:lg', 'font:semibold', 'leading:none', 'tracking:tight'],
    drawerDescription: ['text:sm', 'text:muted-foreground'],
    drawerFooter: [
      'flex',
      'gap:2',
      {
        '&': {
          'flex-direction': 'column-reverse',
        },
        '@media (min-width: 640px)': {
          'flex-direction': 'row',
          'justify-content': 'flex-end',
        },
      },
    ],
    drawerHandle: [
      {
        '&': {
          'margin-left': 'auto',
          'margin-right': 'auto',
          'margin-top': '1rem',
          height: '0.5rem',
          width: '100px',
          'border-radius': '9999px',
          'background-color': 'var(--color-muted)',
        },
      },
    ],
    drawerClose: [
      'absolute',
      'rounded:sm',
      'opacity:0.7',
      'cursor:pointer',
      'transition:colors',
      { '&:hover': ['opacity:1'] },
      focusRing,
    ],
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
