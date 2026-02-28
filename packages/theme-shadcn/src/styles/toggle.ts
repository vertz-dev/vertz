import type { CSSOutput, RawDeclaration, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

type ToggleBlocks = {
  root: StyleEntry[];
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
      { '&:hover': ['bg:muted', 'text:muted-foreground'] },
      { '&:disabled': ['pointer-events-none', 'opacity:0.5'] },
      {
        '&[data-state="on"]': ['bg:accent', 'text:accent-foreground'],
      },
    ],
  });
  return {
    root: s.toggleRoot,
    css: s.css,
  } as CSSOutput<ToggleBlocks>;
}
