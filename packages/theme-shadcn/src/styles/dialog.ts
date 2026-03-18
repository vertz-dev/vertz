import type { CSSOutput, StyleEntry, StyleValue } from '@vertz/ui';
import { css } from '@vertz/ui';
import { animationDecl } from './_helpers';

type DialogBlocks = {
  overlay: StyleEntry[];
  panel: StyleEntry[];
  header: StyleEntry[];
  title: StyleEntry[];
  description: StyleEntry[];
  close: StyleEntry[];
  footer: StyleEntry[];
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

/** Create dialog css() styles matching shadcn v4 Nova theme. */
export function createDialogStyles(): CSSOutput<DialogBlocks> {
  const s = css({
    dialogOverlay: [
      'fixed',
      'inset:0',
      'z:50',
      {
        // Nova: bg-black/10 + backdrop-blur-xs (lighter overlay with blur)
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
    dialogPanel: [
      'bg:background',
      'gap:4',
      {
        // Native <dialog> uses showModal() for top-layer rendering.
        // No fixed/z-index/inset needed — the browser handles positioning.
        '&': {
          display: 'grid',
          width: '100%',
          'max-width': 'calc(100% - 2rem)',
          'box-shadow': '0 0 0 1px color-mix(in oklch, var(--color-foreground) 10%, transparent)',
          'border-radius': '0.75rem',
          padding: '1rem',
          'font-size': '0.875rem',
          margin: 'auto',
          height: 'fit-content',
          outline: 'none',
          border: 'none',
          'container-type': 'inline-size',
        },
        // Ensure closed dialog is hidden (theme display:grid overrides UA dialog:not([open]))
        '&:not([open])': { display: 'none' },
        // Style the native ::backdrop (replaces the overlay div)
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
    dialogHeader: [
      'flex',
      'flex-col',
      'gap:2',
      {
        '@media (min-width: 640px)': { 'text-align': 'left' },
      },
    ],
    dialogTitle: [
      {
        // Nova: text-base font-medium (smaller/lighter than base text-lg font-semibold)
        '&': {
          'font-size': '1rem',
          'line-height': '1',
          'font-weight': '500',
        },
      },
    ],
    dialogDescription: ['text:sm', 'text:muted-foreground'],
    dialogClose: [
      'absolute',
      'rounded:xs',
      'cursor:pointer',
      {
        '&': {
          // Nova: top-2 right-2 (closer to corner)
          top: '0.5rem',
          right: '0.5rem',
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
        '&:hover': { opacity: '1' },
        '&:disabled': { 'pointer-events': 'none' },
      },
      focusRing,
    ],
    dialogFooter: [
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
  });
  return {
    overlay: s.dialogOverlay,
    panel: s.dialogPanel,
    header: s.dialogHeader,
    title: s.dialogTitle,
    description: s.dialogDescription,
    close: s.dialogClose,
    footer: s.dialogFooter,
    css: s.css,
  } as CSSOutput<DialogBlocks>;
}
