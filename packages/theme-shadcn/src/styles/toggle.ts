import type { CSSOutput, StyleEntry, StyleValue } from '@vertz/ui';
import { css, token } from '@vertz/ui';

type ToggleBlocks = {
  root: StyleEntry[];
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

/** Create toggle css() styles. */
export function createToggleStyles(): CSSOutput<ToggleBlocks> {
  const s = css({
    toggleRoot: [
      'inline-flex',
      'items:center',
      'justify:center',
      'rounded:md',
      'text:sm',
      'font:medium',
      'transition:colors',
      'bg:transparent',
      'gap:2',
      'px:3',
      'h:9',
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
    root: s.toggleRoot,
    css: s.css,
  } as CSSOutput<ToggleBlocks>;
}
