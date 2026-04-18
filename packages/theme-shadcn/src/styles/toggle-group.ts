import type { CSSOutput, StyleBlock } from '@vertz/ui';
import { css, token } from '@vertz/ui';

type ToggleGroupBlocks = {
  root: StyleBlock;
  item: StyleBlock;
};

const focusRing: StyleBlock = {
  '&:focus-visible': {
    outline: '3px solid color-mix(in oklch, var(--color-ring) 50%, transparent)',
    outlineOffset: '2px',
  },
};

/** Create toggle group css() styles. */
export function createToggleGroupStyles(): CSSOutput<ToggleGroupBlocks> {
  const s = css({
    toggleGroupRoot: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: token.spacing[1],
      borderRadius: token.radius.md,
    },
    toggleGroupItem: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: token.radius.md,
      fontSize: token.font.size.sm,
      fontWeight: token.font.weight.medium,
      height: token.spacing[9],
      width: token.spacing[9],
      backgroundColor: 'transparent',
      cursor: 'pointer',
      transition:
        'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
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
    root: s.toggleGroupRoot,
    item: s.toggleGroupItem,
    css: s.css,
  } as CSSOutput<ToggleGroupBlocks>;
}
