import type { CSSOutput, RawDeclaration, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';
import { animationDecl } from './_helpers';

type DrawerBlocks = {
  overlay: StyleEntry[];
  panelLeft: StyleEntry[];
  panelRight: StyleEntry[];
  panelTop: StyleEntry[];
  panelBottom: StyleEntry[];
  title: StyleEntry[];
  description: StyleEntry[];
  handle: StyleEntry[];
  close: StyleEntry[];
};

const focusRing: Record<string, (string | RawDeclaration)[]> = {
  '&:focus-visible': [
    'outline-none',
    {
      property: 'outline',
      value: '3px solid color-mix(in oklch, var(--color-ring) 50%, transparent)',
    },
    { property: 'outline-offset', value: '2px' },
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
        '&': [{ property: 'background-color', value: 'oklch(0 0 0 / 50%)' }],
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
        '&': [
          { property: 'inset', value: '0 auto 0 0' },
          { property: 'width', value: '75%' },
          { property: 'max-width', value: '24rem' },
          { property: 'border-radius', value: '0 0.75rem 0.75rem 0' },
        ],
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
        '&': [
          { property: 'inset', value: '0 0 0 auto' },
          { property: 'width', value: '75%' },
          { property: 'max-width', value: '24rem' },
          { property: 'border-radius', value: '0.75rem 0 0 0.75rem' },
        ],
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
        '&': [
          { property: 'inset', value: '0 0 auto 0' },
          { property: 'border-radius', value: '0 0 0.75rem 0.75rem' },
        ],
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
        '&': [
          { property: 'inset', value: 'auto 0 0 0' },
          { property: 'border-radius', value: '0.75rem 0.75rem 0 0' },
        ],
      },
      {
        '&[data-state="open"]': [animationDecl('vz-slide-in-from-bottom 300ms ease-out forwards')],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-slide-out-to-bottom 300ms ease-out forwards')],
      },
    ],
    drawerTitle: ['text:lg', 'font:semibold', 'leading:none', 'tracking:tight'],
    drawerDescription: ['text:sm', 'text:muted-foreground'],
    drawerHandle: [
      {
        '&': [
          { property: 'margin-left', value: 'auto' },
          { property: 'margin-right', value: 'auto' },
          { property: 'margin-top', value: '1rem' },
          { property: 'height', value: '0.5rem' },
          { property: 'width', value: '100px' },
          { property: 'border-radius', value: '9999px' },
          { property: 'background-color', value: 'var(--color-muted)' },
        ],
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
    title: s.drawerTitle,
    description: s.drawerDescription,
    handle: s.drawerHandle,
    close: s.drawerClose,
    css: s.css,
  } as CSSOutput<DrawerBlocks>;
}
