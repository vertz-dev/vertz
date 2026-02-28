import type { CSSOutput, RawDeclaration, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

type ToggleGroupBlocks = {
  root: StyleEntry[];
  item: StyleEntry[];
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

/** Create toggle group css() styles. */
export function createToggleGroupStyles(): CSSOutput<ToggleGroupBlocks> {
  const s = css({
    toggleGroupRoot: ['inline-flex', 'items:center', 'gap:1', 'rounded:md'],
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
      { '&:hover': ['bg:muted', 'text:muted-foreground'] },
      { '&:disabled': ['pointer-events-none', 'opacity:0.5'] },
      {
        '&[data-state="on"]': ['bg:accent', 'text:accent-foreground'],
      },
    ],
  });
  return {
    root: s.toggleGroupRoot,
    item: s.toggleGroupItem,
    css: s.css,
  } as CSSOutput<ToggleGroupBlocks>;
}
