import type { CSSOutput, StyleEntry, StyleValue } from '@vertz/ui';
import { css } from '@vertz/ui';
import { animationDecl } from './_helpers';

type AlertDialogBlocks = {
  overlay: StyleEntry[];
  panel: StyleEntry[];
  title: StyleEntry[];
  description: StyleEntry[];
  footer: StyleEntry[];
  cancel: StyleEntry[];
  action: StyleEntry[];
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

/** Create alert-dialog css() styles matching shadcn v4 Nova theme. */
export function createAlertDialogStyles(): CSSOutput<AlertDialogBlocks> {
  const s = css({
    alertDialogOverlay: [
      'fixed',
      'inset:0',
      'z:50',
      {
        // Nova: bg-black/10 + backdrop-blur-xs
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
        '&[data-state="closed"]': [animationDecl('vz-fade-out 100ms ease-out forwards')],
      },
    ],
    alertDialogPanel: [
      'bg:background',
      'text:foreground',
      'gap:4',
      {
        // Native <dialog> uses showModal() for top-layer rendering.
        '&': {
          display: 'grid',
          width: '100%',
          'max-width': 'calc(100% - 2rem)',
          'box-shadow': '0 0 0 1px color-mix(in oklch, var(--color-foreground) 10%, transparent)',
          'border-radius': '0.75rem',
          padding: '1rem',
          margin: 'auto',
          height: 'fit-content',
          outline: 'none',
          border: 'none',
          'container-type': 'inline-size',
        },
        // Ensure closed dialog is hidden (theme display:grid overrides UA dialog:not([open])).
        // Also exclude [data-state="open"] so non-native <div role="dialog"> elements
        // using panel styles remain visible when opened via data-state.
        '&:not([open]):not([data-state="open"])': { display: 'none' },
        // Style the native ::backdrop
        '&::backdrop': {
          'background-color': 'oklch(0 0 0 / 10%)',
          'backdrop-filter': 'blur(4px)',
          '-webkit-backdrop-filter': 'blur(4px)',
        },
        '&[data-state="open"]::backdrop': {
          animation: 'vz-fade-in 100ms ease-out forwards',
        },
        '&[data-state="closed"]::backdrop': {
          animation: 'vz-fade-out 100ms ease-out forwards',
        },
        '@media (min-width: 640px)': { 'max-width': '24rem' },
      },
      {
        '&[data-state="open"]': [animationDecl('vz-zoom-in 100ms ease-out forwards')],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-zoom-out 100ms ease-out forwards')],
      },
    ],
    alertDialogTitle: [
      'text:foreground',
      {
        // Nova: text-base font-medium
        '&': {
          'font-size': '1rem',
          'font-weight': '500',
        },
      },
    ],
    alertDialogDescription: ['text:sm', 'text:muted-foreground'],
    alertDialogFooter: [
      'flex',
      'gap:2',
      {
        '&': {
          'flex-direction': 'column-reverse',
          // Nova: bg-muted/50 -mx-4 -mb-4 rounded-b-xl border-t p-4
          'background-color': 'color-mix(in oklch, var(--color-muted) 50%, transparent)',
          margin: '0 -1rem -1rem -1rem',
          'border-radius': '0 0 0.75rem 0.75rem',
          'border-top': '1px solid var(--color-border)',
          padding: '1rem',
        },
        '@container (min-width: 20rem)': {
          'flex-direction': 'row',
          'justify-content': 'flex-end',
        },
      },
    ],
    alertDialogCancel: [
      'inline-flex',
      'items:center',
      'justify:center',
      'rounded:md',
      'border:1',
      'border:input',
      'bg:background',
      'text:foreground',
      'px:4',
      'py:2',
      'text:sm',
      'font:medium',
      'cursor:pointer',
      'transition:colors',
      { '&:hover': ['bg:accent', 'text:accent-foreground'] },
      focusRing,
    ],
    alertDialogAction: [
      'inline-flex',
      'items:center',
      'justify:center',
      'rounded:md',
      'bg:primary',
      'text:primary-foreground',
      'px:4',
      'py:2',
      'text:sm',
      'font:medium',
      'cursor:pointer',
      'transition:colors',
      { '&:hover': [{ opacity: '0.9' }] },
      focusRing,
    ],
  });
  return {
    overlay: s.alertDialogOverlay,
    panel: s.alertDialogPanel,
    title: s.alertDialogTitle,
    description: s.alertDialogDescription,
    footer: s.alertDialogFooter,
    cancel: s.alertDialogCancel,
    action: s.alertDialogAction,
    css: s.css,
  } as CSSOutput<AlertDialogBlocks>;
}
