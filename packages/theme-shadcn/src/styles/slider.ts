import type { CSSOutput, RawDeclaration, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

type SliderBlocks = {
  root: StyleEntry[];
  track: StyleEntry[];
  range: StyleEntry[];
  thumb: StyleEntry[];
};

const ringStyle: RawDeclaration = {
  property: 'box-shadow',
  value: '0 0 0 3px color-mix(in oklch, var(--color-ring) 50%, transparent)',
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
      'w:full',
      'rounded:full',
      'bg:muted',
      {
        '&': [
          { property: 'height', value: '0.25rem' },
          { property: 'overflow', value: 'visible' },
        ],
      },
    ],
    sliderRange: ['bg:primary'],
    sliderThumb: [
      'block',
      'h:3',
      'w:3',
      'rounded:full',
      'border:1',
      'border:ring',
      'cursor:pointer',
      {
        '&': [
          { property: 'background', value: 'white' },
          { property: 'transition', value: 'color 150ms, box-shadow 150ms' },
          { property: 'position', value: 'relative' },
        ],
      },
      {
        '&::after': [
          { property: 'content', value: '""' },
          { property: 'position', value: 'absolute' },
          { property: 'inset', value: '-0.5rem' },
        ],
      },
      {
        '&:hover': ['outline-none', ringStyle],
      },
      {
        '&:focus-visible': ['outline-none', ringStyle],
      },
      {
        '&:active': [ringStyle],
      },
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
