import type { CSSOutput, GlobalCSSOutput, StyleBlock } from '@vertz/ui';
import { css, globalCss, injectCSS, token } from '@vertz/ui';
import { animationDecl } from './_helpers';

type DialogBlocks = {
  overlay: StyleBlock;
  panel: StyleBlock;
  header: StyleBlock;
  title: StyleBlock;
  description: StyleBlock;
  close: StyleBlock;
  footer: StyleBlock;
};

const focusRing: StyleBlock = {
  '&:focus-visible': {
    outline: '3px solid color-mix(in oklch, var(--color-ring) 50%, transparent)',
    outlineOffset: '2px',
  },
};

/** Create dialog css() styles matching shadcn v4 Nova theme. */
export function createDialogStyles(): CSSOutput<DialogBlocks> {
  const s = css({
    dialogOverlay: {
      position: 'fixed',
      inset: token.spacing[0],
      zIndex: '50',
      '&': {
        backgroundColor: 'oklch(0 0 0 / 10%)',
        backdropFilter: 'blur(4px)',
        '-webkit-backdrop-filter': 'blur(4px)',
      },
      '&[data-state="open"]': animationDecl('vz-fade-in 100ms ease-out forwards'),
      '&[data-state="closed"]': animationDecl('vz-fade-out 100ms ease-out forwards'),
    },
    dialogPanel: {
      backgroundColor: token.color.background,
      color: token.color.foreground,
      gap: token.spacing[4],
      '&': {
        display: 'grid',
        width: 'calc(100vw - 2rem)',
        maxWidth: 'calc(100vw - 2rem)',
        boxShadow: '0 0 0 1px color-mix(in oklch, var(--color-foreground) 10%, transparent)',
        borderRadius: 'calc(var(--radius) * 2)',
        padding: '1rem',
        fontSize: '0.875rem',
        height: 'fit-content',
        outline: 'none',
        border: 'none',
        containerType: 'inline-size',
      },
      '&:not([open]):not([data-state="open"])': { display: 'none' },
      '&::backdrop': {
        backgroundColor: 'oklch(0 0 0 / 10%)',
        backdropFilter: 'blur(4px)',
        '-webkit-backdrop-filter': 'blur(4px)',
      },
      '&[data-state="open"]::backdrop': { animation: 'vz-fade-in 100ms ease-out forwards' },
      '&[data-state="closed"]::backdrop': { animation: 'vz-fade-out 100ms ease-out forwards' },
      '@media (min-width: 640px)': { maxWidth: '24rem' },
      '&[data-state="open"]': animationDecl('vz-zoom-in 100ms ease-out forwards'),
      '&[data-state="closed"]': animationDecl('vz-zoom-out 100ms ease-out forwards'),
    },
    dialogHeader: {
      display: 'flex',
      flexDirection: 'column',
      gap: token.spacing[2],
      '@media (min-width: 640px)': { textAlign: 'left' },
    },
    dialogTitle: {
      color: token.color.foreground,
      '&': { fontSize: '1rem', lineHeight: '1', fontWeight: '500' },
    },
    dialogDescription: { fontSize: token.font.size.sm, color: token.color['muted-foreground'] },
    dialogClose: {
      position: 'absolute',
      borderRadius: token.radius.xs,
      cursor: 'pointer',
      '&': {
        top: '0.5rem',
        right: '0.5rem',
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
      '&:disabled': { pointerEvents: 'none' },
      ...focusRing,
    },
    dialogFooter: {
      display: 'flex',
      gap: token.spacing[2],
      '&': {
        flexDirection: 'column-reverse',
        backgroundColor: 'color-mix(in oklch, var(--color-muted) 50%, transparent)',
        margin: '0 -1rem -1rem -1rem',
        borderRadius: '0 0 calc(var(--radius) * 2) calc(var(--radius) * 2)',
        borderTop: '1px solid var(--color-border)',
        padding: '1rem',
      },
      '@container (min-width: 20rem)': { flexDirection: 'row', justifyContent: 'flex-end' },
    },
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

/**
 * Global CSS for stack-rendered dialogs.
 *
 * The DialogStack in @vertz/ui renders `<dialog data-dialog-wrapper>` with
 * `<div data-part="panel">` inside. These styles target the data attributes
 * rather than class names, since the stack creates elements imperatively.
 */
export function createDialogGlobalStyles(): GlobalCSSOutput {
  const output = globalCss({
    // ── Dialog wrapper (native <dialog>) ──
    // Fill the viewport and center the panel via flexbox.
    // Without explicit sizing + centering the browser's UA dialog centering
    // breaks because theme overrides (border: none, padding: 0) remove the
    // constraints the UA stylesheet relies on.
    'dialog[data-dialog-wrapper]': {
      background: 'transparent',
      border: 'none',
      padding: '0',
      margin: 'auto',
      maxWidth: '100vw',
      maxHeight: '100vh',
      overflow: 'visible',
    },
    'dialog[data-dialog-wrapper]::backdrop': {
      backgroundColor: 'oklch(0 0 0 / 10%)',
      backdropFilter: 'blur(4px)',
      WebkitBackdropFilter: 'blur(4px)',
    },
    'dialog[data-dialog-wrapper][data-state="open"]::backdrop': {
      animation: 'vz-fade-in 100ms ease-out forwards',
    },
    'dialog[data-dialog-wrapper][data-state="closed"]::backdrop': {
      animation: 'vz-fade-out 100ms ease-out forwards',
    },
    // ── Panel ──
    'dialog[data-dialog-wrapper] > [data-part="panel"]': {
      position: 'relative',
      display: 'grid',
      gap: '1rem',
      width: 'min(28rem, calc(100vw - 2rem))',
      boxShadow: '0 0 0 1px color-mix(in oklch, var(--color-foreground) 10%, transparent)',
      borderRadius: 'calc(var(--radius) * 2)',
      padding: '1rem',
      fontSize: '0.875rem',
      height: 'fit-content',
      outline: 'none',
      containerType: 'inline-size',
      backgroundColor: 'var(--color-background)',
    },
    // ── Panel open/close animations ──
    'dialog[data-dialog-wrapper][data-state="open"] > [data-part="panel"]': {
      animation: 'vz-zoom-in 100ms ease-out forwards',
    },
    'dialog[data-dialog-wrapper][data-state="closed"] > [data-part="panel"]': {
      animation: 'vz-zoom-out 100ms ease-out forwards',
    },
    // ── Sub-component parts ──
    'dialog[data-dialog-wrapper] [data-part="header"]': {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
    },
    'dialog[data-dialog-wrapper] [data-part="title"]': {
      fontSize: '1rem',
      lineHeight: '1',
      fontWeight: '500',
    },
    'dialog[data-dialog-wrapper] [data-part="description"]': {
      fontSize: '0.875rem',
      color: 'var(--color-muted-foreground)',
    },
    'dialog[data-dialog-wrapper] [data-part="body"]': {
      overflow: 'auto',
    },
    'dialog[data-dialog-wrapper] [data-part="footer"]': {
      display: 'flex',
      gap: '0.5rem',
      flexDirection: 'column-reverse',
      backgroundColor: 'color-mix(in oklch, var(--color-muted) 50%, transparent)',
      margin: '0 -1rem -1rem -1rem',
      borderRadius: '0 0 calc(var(--radius) * 2) calc(var(--radius) * 2)',
      borderTop: '1px solid var(--color-border)',
      padding: '1rem',
    },
    'dialog[data-dialog-wrapper] [data-part="close"]': {
      position: 'absolute',
      top: '0.5rem',
      right: '0.5rem',
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
      cursor: 'pointer',
      borderRadius: 'calc(var(--radius) * 0.33)',
    },
    'dialog[data-dialog-wrapper] [data-part="close"]:hover': {
      opacity: '1',
    },
    'dialog[data-dialog-wrapper] [data-part="cancel"]': {
      background: 'none',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius)',
      padding: '0.5rem 1rem',
      cursor: 'pointer',
      fontSize: '0.875rem',
      color: 'var(--color-foreground)',
    },
    // ── Confirm dialog buttons ──
    'dialog[data-dialog-wrapper] [data-part="confirm-cancel"]': {
      background: 'none',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius)',
      padding: '0.5rem 1rem',
      cursor: 'pointer',
      fontSize: '0.875rem',
      color: 'var(--color-foreground)',
    },
    'dialog[data-dialog-wrapper] [data-part="confirm-action"]': {
      border: 'none',
      borderRadius: 'var(--radius)',
      padding: '0.5rem 1rem',
      cursor: 'pointer',
      fontSize: '0.875rem',
      fontWeight: '500',
      color: 'var(--color-primary-foreground)',
      backgroundColor: 'var(--color-primary)',
    },
    'dialog[data-dialog-wrapper] [data-part="confirm-action"][data-intent="danger"]': {
      color: 'var(--color-destructive-foreground)',
      backgroundColor: 'var(--color-destructive)',
    },
  });

  // Responsive and container queries — globalCss() only supports flat selector maps,
  // so inject @media/@container rules directly.
  injectCSS(
    `
@media (min-width: 640px) {
  dialog[data-dialog-wrapper] > [data-part="panel"] {
    max-width: 24rem;
  }
}
@container (min-width: 20rem) {
  dialog[data-dialog-wrapper] [data-part="footer"] {
    flex-direction: row;
    justify-content: flex-end;
  }
}
  `.trim(),
  );

  return output;
}
