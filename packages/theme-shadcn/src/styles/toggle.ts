import type { CSSOutput, StyleBlock } from '@vertz/ui';
import { css, token } from '@vertz/ui';

type ToggleBlocks = {
  root: StyleBlock;
};

const focusRing: StyleBlock = {
  '&:focus-visible': {
    outline: '3px solid color-mix(in oklch, var(--color-ring) 50%, transparent)',
    outlineOffset: '2px',
  },
};

/** Create toggle css() styles. */
export function createToggleStyles(): CSSOutput<ToggleBlocks> {
  const s = css({
    toggleRoot: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: token.radius.md,
      fontSize: token.font.size.sm,
      fontWeight: token.font.weight.medium,
      transition:
        'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
      backgroundColor: 'transparent',
      gap: token.spacing[2],
      paddingInline: token.spacing[3],
      height: token.spacing[9],
      ...focusRing,
      '&:hover': { backgroundColor: token.color.muted, color: token.color['muted-foreground'] },
      '&:disabled': { pointerEvents: 'none', opacity: '0.5' },
      '&[data-state="on"]': {
        backgroundColor: token.color.accent,
        color: token.color['accent-foreground'],
      },
    },
  });
  return {
    root: s.toggleRoot,
    css: s.css,
  } as CSSOutput<ToggleBlocks>;
}
