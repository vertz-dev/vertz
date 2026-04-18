import type { CSSOutput, StyleEntry, StyleValue } from '@vertz/ui';
import { css, token } from '@vertz/ui';

type ToggleGroupBlocks = {
  root: StyleEntry[];
  item: StyleEntry[];
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

/** Create toggle group css() styles. */
export function createToggleGroupStyles(): CSSOutput<ToggleGroupBlocks> {
  const s = css({
    toggleGroupRoot: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: token.spacing[1],
      borderRadius: token.radius.md,
    },
    toggleGroupItem: [
      'inline-flex',
      'items:center',
      'justify:center',
      'rounded:md',
      'text:sm',
      'font:medium',
      'h:9',
      'w:9',
      'bg:transparent',
      'cursor:pointer',
      'transition:colors',
      focusRing,
      { '&:hover': { backgroundColor: token.color.muted, color: token.color['muted-foreground'] } },
      { '&:disabled': { pointerEvents: 'none', opacity: '0.5' } },
      {
        '&[data-state="on"]': {
          backgroundColor: token.color.accent,
          color: token.color['accent-foreground'],
        },
      },
    ],
  });
  return {
    root: s.toggleGroupRoot,
    item: s.toggleGroupItem,
    css: s.css,
  } as CSSOutput<ToggleGroupBlocks>;
}
