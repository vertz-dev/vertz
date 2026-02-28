import type { CSSOutput, RawDeclaration, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

type SliderBlocks = {
  root: StyleEntry[];
  track: StyleEntry[];
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
          { property: 'height', value: '20px' },
          { property: 'cursor', value: 'pointer' },
        ],
      },
    ],
    sliderTrack: [
      'relative',
      'h:1.5',
      'w:full',
      'rounded:full',
      'bg:secondary',
      {
        '&': [{ property: 'overflow', value: 'visible' }],
      },
    ],
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
      {
        '&': [
          { property: 'top', value: '50%' },
          { property: 'margin-top', value: '-10px' },
        ],
      },
    ],
  });
  return {
    root: s.sliderRoot,
    track: s.sliderTrack,
    thumb: s.sliderThumb,
    css: s.css,
  } as CSSOutput<SliderBlocks>;
}
