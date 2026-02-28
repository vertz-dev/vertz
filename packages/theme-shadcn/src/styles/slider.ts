import type { CSSOutput, RawDeclaration, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

type SliderBlocks = {
  root: StyleEntry[];
  track: StyleEntry[];
  range: StyleEntry[];
  thumb: StyleEntry[];
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

/** Create slider css() styles following shadcn conventions. */
export function createSliderStyles(): CSSOutput<SliderBlocks> {
  const s = css({
    sliderRoot: [
      'relative',
      'flex',
      'w:full',
      'items:center',
      {
        '&': [
          { property: 'touch-action', value: 'none' },
          { property: 'user-select', value: 'none' },
        ],
      },
    ],
    sliderTrack: ['relative', 'h:1.5', 'w:full', 'overflow-hidden', 'rounded:full', 'bg:secondary'],
    sliderRange: ['absolute', 'h:full', 'bg:primary'],
    sliderThumb: [
      'block',
      'h:5',
      'w:5',
      'rounded:full',
      'border:2',
      'border:primary',
      'bg:background',
      'shadow:sm',
      'cursor:pointer',
      focusRing,
      { '&:disabled': ['pointer-events-none', 'opacity:0.5'] },
    ],
  });
  return {
    root: s.sliderRoot,
    track: s.sliderTrack,
    range: s.sliderRange,
    thumb: s.sliderThumb,
    css: s.css,
  } as CSSOutput<SliderBlocks>;
}
