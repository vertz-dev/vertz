import type { CSSOutput, StyleEntry, StyleValue } from '@vertz/ui';
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
  'text:sm',
] as const;

/** Create sheet css() styles. */
export function createSheetStyles(): CSSOutput<SheetBlocks> {
  const s = css({
    sheetOverlay: [
      'fixed',
      'inset:0',
      'z:50',
      {
        '&': {
          'background-color': 'oklch(0 0 0 / 10%)',
          'backdrop-filter': 'blur(4px)',
          '-webkit-backdrop-filter': 'blur(4px)',
        },
      },
      {
        '&[data-state="open"]': [animationDecl('vz-fade-in 100ms ease-out forwards')],
      },
      {
        '&[data-state="closed"]': [
          animationDecl('vz-fade-out 100ms ease-out forwards'),
          { 'pointer-events': 'none' },
        ],
      },
    ],
    sheetPanelLeft: [
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
        },
        '&:not([open]):not([data-state="open"])': { display: 'none' },
        '&::backdrop': {
          'background-color': 'oklch(0 0 0 / 10%)',
          'backdrop-filter': 'blur(4px)',
          '-webkit-backdrop-filter': 'blur(4px)',
        },
        '&[data-state="open"]::backdrop': {
          animation: 'vz-fade-in 100ms ease-out forwards',
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
    sheetPanelRight: [
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
        },
        '&:not([open]):not([data-state="open"])': { display: 'none' },
        '&::backdrop': {
          'background-color': 'oklch(0 0 0 / 10%)',
          'backdrop-filter': 'blur(4px)',
          '-webkit-backdrop-filter': 'blur(4px)',
        },
        '&[data-state="open"]::backdrop': {
          animation: 'vz-fade-in 100ms ease-out forwards',
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
    sheetPanelTop: [
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
        },
        '&:not([open]):not([data-state="open"])': { display: 'none' },
        '&::backdrop': {
          'background-color': 'oklch(0 0 0 / 10%)',
          'backdrop-filter': 'blur(4px)',
          '-webkit-backdrop-filter': 'blur(4px)',
        },
        '&[data-state="open"]::backdrop': {
          animation: 'vz-fade-in 100ms ease-out forwards',
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
    sheetPanelBottom: [
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
        },
        '&:not([open]):not([data-state="open"])': { display: 'none' },
        '&::backdrop': {
          'background-color': 'oklch(0 0 0 / 10%)',
          'backdrop-filter': 'blur(4px)',
          '-webkit-backdrop-filter': 'blur(4px)',
        },
        '&[data-state="open"]::backdrop': {
          animation: 'vz-fade-in 100ms ease-out forwards',
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
    sheetTitle: ['text:base', 'font:medium', 'text:foreground'],
    sheetDescription: ['text:sm', 'text:muted-foreground'],
    sheetClose: [
      'absolute',
      'rounded:xs',
      'cursor:pointer',
      {
        '&': {
          top: '0.75rem',
          right: '0.75rem',
          opacity: '0.7',
          transition: 'opacity 150ms',
          display: 'inline-flex',
          'align-items': 'center',
          'justify-content': 'center',
          width: '1rem',
          height: '1rem',
          background: 'none',
          border: 'none',
          color: 'currentColor',
          padding: '0',
        },
      },
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
