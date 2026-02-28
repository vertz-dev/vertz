import type { CSSOutput, RawDeclaration, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';
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

/** Create sheet css() styles. */
export function createSheetStyles(): CSSOutput<SheetBlocks> {
  const s = css({
    sheetOverlay: [
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
    sheetPanelLeft: [
      ...PANEL_BASE,
      'border-r:1',
      {
        '&': [
          { property: 'inset', value: '0 auto 0 0' },
          { property: 'width', value: '75%' },
          { property: 'max-width', value: '24rem' },
        ],
      },
      {
        '&[data-state="open"]': [animationDecl('vz-slide-in-from-left 300ms ease-out forwards')],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-slide-out-to-left 300ms ease-out forwards')],
      },
    ],
    sheetPanelRight: [
      ...PANEL_BASE,
      'border-l:1',
      {
        '&': [
          { property: 'inset', value: '0 0 0 auto' },
          { property: 'width', value: '75%' },
          { property: 'max-width', value: '24rem' },
        ],
      },
      {
        '&[data-state="open"]': [animationDecl('vz-slide-in-from-right 300ms ease-out forwards')],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-slide-out-to-right 300ms ease-out forwards')],
      },
    ],
    sheetPanelTop: [
      ...PANEL_BASE,
      'border-b:1',
      {
        '&': [{ property: 'inset', value: '0 0 auto 0' }],
      },
      {
        '&[data-state="open"]': [animationDecl('vz-slide-in-from-top 300ms ease-out forwards')],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-slide-out-to-top 300ms ease-out forwards')],
      },
    ],
    sheetPanelBottom: [
      ...PANEL_BASE,
      'border-t:1',
      {
        '&': [{ property: 'inset', value: 'auto 0 0 0' }],
      },
      {
        '&[data-state="open"]': [animationDecl('vz-slide-in-from-bottom 300ms ease-out forwards')],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-slide-out-to-bottom 300ms ease-out forwards')],
      },
    ],
    sheetTitle: ['text:lg', 'font:semibold', 'leading:none', 'tracking:tight'],
    sheetDescription: ['text:sm', 'text:muted-foreground'],
    sheetClose: [
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
