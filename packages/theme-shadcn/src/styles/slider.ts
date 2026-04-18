import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css, token } from '@vertz/ui';

type SliderBlocks = {
  root: StyleEntry[];
  track: StyleEntry[];
  range: StyleEntry[];
  thumb: StyleEntry[];
};

const ringStyle = {
  'box-shadow': '0 0 0 3px color-mix(in oklch, var(--color-ring) 50%, transparent)',
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
        '&': {
          'touch-action': 'none',
          'user-select': 'none',
          height: '20px',
          cursor: 'pointer',
        },
      },
    ],
    sliderTrack: [
      'relative',
      'w:full',
      'rounded:full',
      'bg:muted',
      {
        '&': {
          height: '0.25rem',
          overflow: 'visible',
        },
      },
    ],
    sliderRange: { backgroundColor: token.color.primary },
    sliderThumb: [
      'block',
      'h:3',
      'w:3',
      'rounded:full',
      'border:1',
      'border:ring',
      'cursor:pointer',
      {
        '&': {
          background: 'white',
          transition: 'color 150ms, box-shadow 150ms',
          top: '50%',
        },
      },
      {
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: '-0.5rem',
        },
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
      { '&:disabled': { pointerEvents: 'none', opacity: '0.5' } },
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
